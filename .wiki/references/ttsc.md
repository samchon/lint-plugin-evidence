# @ttsc/lint 프로젝트 수명주기

## 파일 규칙이 받는 상태

파일 규칙의 공개 `rule.Context`에는 현재 파일, checker, severity, options와 프로젝트 규칙 결과 reader만 있으며 Program의 `LifecycleID` 자체는 노출되지 않는다. Program 식별자는 프로젝트 규칙의 `ProjectIdentity`에만 있다. 따라서 contributor 파일 규칙이 프로세스 전역 캐시를 쓰지 않고 Program별로 협력하려면 같은 사이클의 프로젝트 규칙이 `SetState`로 게시한 값을 `ProjectResult`에서 읽어야 한다. `D:/github/samchon/ttsc/packages/lint/rule/rule.go:320`, `D:/github/samchon/ttsc/packages/lint/rule/rule.go:378`, `D:/github/samchon/ttsc/packages/lint/rule/project.go:13`, `D:/github/samchon/ttsc/packages/lint/rule/project.go:221`

`ProjectRuleResult`는 상태와 cycle-scoped reporter를 파일 dispatch 동안 전달하고, `ProjectResultReader`가 그 스냅샷을 파일 규칙에 제공한다. 이는 파일별 병렬 실행에서 같은 사이클의 작은 동기화 객체를 공유할 수 있다는 뜻이지만, 해당 프로젝트 규칙이 꺼져 있거나 선언되지 않으면 상태가 없다. `D:/github/samchon/ttsc/packages/lint/rule/project.go:51`, `D:/github/samchon/ttsc/packages/lint/rule/project.go:93`

## watch 복구

resident check는 매 요청 전에 이전 `projectCycle`을 버리고, 다음 lint cycle에서 프로젝트 규칙을 다시 평가한 뒤 그 결과를 파일 규칙에 넘긴다. 따라서 프로젝트 상태에 둔 deduplication gate는 다음 rebuild에 남지 않으며, 같은 오류가 여전히 존재하면 새 사이클에서 다시 보고되고 수정되면 사라진다. `D:/github/samchon/ttsc/packages/lint/linthost/check_serve.go:254`, `D:/github/samchon/ttsc/packages/lint/linthost/host.go:283`, `D:/github/samchon/ttsc/packages/lint/linthost/host.go:285`

## 확인된 API 한계

Contributor는 같은 공개 이름으로 파일 규칙과 프로젝트 규칙을 함께 등록할 수 없다. upstream은 이 결합을 자체 built-in companion에만 허용하며 contributor의 file/project 이름 충돌은 project 등록을 버린다. 그러므로 `evidence/documented` 자체가 현재 API에서 독립적인 project companion을 가질 수 없고, graph가 꺼진 구성에서 Program 단위 deduplication을 완결하려면 upstream이 파일 컨텍스트에 lifecycle identity를 제공하거나 contributor companion을 허용해야 한다. `D:/github/samchon/ttsc/packages/lint/linthost/project_rules.go:39`, `D:/github/samchon/ttsc/packages/lint/linthost/project_rules.go:60`
