# 설계 결정

## 겹치는 claim의 선언 귀속

결정: 한 파일이 여러 claim glob에 걸려도 선언을 모든 claim에 무조건 복제하지 않는다. 선언은 target이 해당 reference scope에 들어오고 자신의 host kind가 claim selector와 교차하는 obligation에만 참여한다. mixed TypeScript host는 실제로 가진 여러 kind 각각에 참여할 수 있다. 어디에도 적격인 claim이 없는 선언만 모든 관련 obligation을 이름 붙인 out-of-scope 진단 한 건을 낸다. `packages/evidence/native/graph.go:392`, `packages/evidence/native/graph.go:490`

이유: DTO type과 property는 같은 파일에 존재하므로 type/model claim과 property/column claim의 glob이 겹치는 것이 정상이다. 물리적 파일 일치만 귀속으로 사용하면 type의 aggregate citation이 column obligation의 scope에도 resolve되어 거짓 out-of-scope를 만든다. positive, negative, mixed-host 경계는 `packages/evidence/native/graph_attributes_overlapping_claims_test.go:18`부터 고정한다.

비용: 어떤 선언이 한 적격 obligation에 참여하면 같은 물리 파일을 고른 다른 비적격 claim 때문에 별도 경고를 내지 않는다. 이는 selector overlap을 구성의 정상 합성으로 본 대가이며, 각 obligation의 missing coverage는 독립적으로 남으므로 실제로 필요한 citation이 사라지지는 않는다.

## resolve됐지만 아무 obligation에도 참여하지 않는 태그

결정: 전역 target table에서 resolve된 선언이라도 자신을 소유한 claim의 어떤 reference에도 들어가지 않으면 `Non-participating` 진단을 낸다. `@evidenceExclude`도 동일하다. loader failure 때문에 참여 여부가 불명확한 사이클에서는 이 파생 진단을 보류한다. `packages/evidence/native/graph.go:502`, `packages/evidence/native/graph_attributes_overlapping_claims_test.go:143`

이유: target table은 여러 claim이 같은 source를 공유하도록 전역으로 구성되므로 다른 claim만 노출한 target도 resolve될 수 있다. 이전에는 reference coverage loop가 이를 조용히 건너뛰어, 태그가 존재하지만 graph edge를 하나도 만들지 않는 녹색 빌드가 가능했다.

비용: 공유하고 싶은 source를 claim reference에 빠뜨린 기존 구성은 새 오류를 받는다. 이는 우연한 전역 resolve를 호환성으로 보존하지 않고 명시적인 claim-reference 관계를 요구하는 비용이다.

## loader 실패와 빈 population의 분리

결정: inventory와 population walk는 `LoadFailed` 건강 상태를 전달한다. 불완전한 claim이나 reference에서는 `matched no files`, `materialized no selected units`, missing coverage와 ghost 같은 완전성을 전제로 한 파생 진단을 내지 않으며, 독립적인 건강한 obligation은 계속 평가한다. `packages/evidence/native/model.go:169`, `packages/evidence/native/health.go:27`, `packages/evidence/native/graph_suppresses_derivatives_of_loader_failures_test.go:19`

이유: 읽기·파싱·normalization 실패 뒤의 빈 unit 집합은 실제 빈 문서가 아니다. 이를 같은 상태로 취급하면 직접적인 loader 오류 위에 잘못된 selector 조언과 대량 missing 진단이 연쇄된다.

비용: 하나의 obligation population이 부분적으로만 읽힌 동안에는 읽힌 일부 unit의 missing도 잠시 보류된다. denominator가 완전하지 않은 상태에서 정확한 coverage를 주장하지 않는 대가이며, loader를 고친 다음 사이클에서 전체 진단이 복구된다.

## documented 구성 오류의 사이클 단위 중복 제거

결정: `evidence/graph`는 Program마다 `graphCycleState`를 게시하고 `evidence/documented`는 이 상태의 동기화 gate를 통해 같은 구성 오류를 한 번만 보고한다. watch rebuild는 새 프로젝트 상태를 만들기 때문에 여전히 잘못된 옵션은 다음 사이클에서 다시 한 번 보고되고, 수정된 옵션은 통과한다. `packages/evidence/native/hints.go:39`, `packages/evidence/native/documented.go:90`, `packages/evidence/native/documented_names_its_own_rule_in_configuration_test.go:139`

이유: `evidence/documented`는 파일 규칙이라 같은 전역 옵션을 source file마다 decode한다. 프로세스 전역 once/cache는 다른 project와 watch rebuild를 오염시키므로, host가 보장하는 project-state 수명만 공유 경계로 쓸 수 있다.

비용: graph가 꺼져 있거나 선언되지 않은 채 documented만 쓰는 구성에는 공유할 project cycle state가 없어 기존처럼 파일별로 오류를 보고한다. 오류를 영구히 숨기는 fallback보다 안전하지만 완전한 해결은 아니며, upstream lifecycle API 또는 contributor project companion이 필요하다. `.wiki/references/ttsc.md`

## Markdown과 TypeScript citation 방향

결정: TypeScript evidence는 import scope가 있는 TypeScript claim만 `{@link}`로 인용한다. Markdown claim은 다른 Markdown, Prisma, Swagger처럼 path-addressed evidence만 인용하며, 문서와 코드의 관계가 필요하면 TypeScript가 문서를 인용하도록 방향을 뒤집는다. `README.md:390`, `README.md:397`

이유: Markdown에는 import scope가 없어 plain symbol name을 저장소 전역에서 대조해야 하고, 서로 무관한 두 module의 동명 export가 citation을 모호하게 만든다.

비용: “문서가 코드를 증명한다”는 방향은 표현하지 못한다. 반대 방향의 obligation은 의미가 같지 않지만, production symbol rename을 lint target uniqueness에 종속시키지 않는 쪽을 선택한다.

## 열린 질문

- `@ttsc/lint`가 contributor file rule에 안정적인 Program lifecycle identity를 노출하거나 contributor file/project companion을 허용할 것인가? 가능해지면 graph 비활성 구성의 `evidence/documented` 중복 진단도 같은 사이클 gate로 합쳐야 한다.
- TypeScript package entry traversal 중 하위 re-export 파일 하나만 읽지 못한 경우, 현재 entry 자체 실패처럼 정확한 partial-population 진단을 낼 수 있도록 loader가 traversal dependency와 실패를 함께 반환해야 하는가?
