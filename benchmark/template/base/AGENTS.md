# AGENTS.md

`{{name}}` is a TypeScript monorepo that implements a documented requirement set as a NestJS backend, a generated SDK, and a React frontend. The requirement documents under `docs/analysis/` are the specification; everything under `packages/` exists to realize them.

## Attitude

Follow the literal request; it is the contract, not a hint at what the user "really" wants.

- **Scope is the user's to widen.** Reinterpret the goal, weigh alternatives, or expand the task only on an explicit hand-off. Take a confident, specific ask as given.
- **Fidelity binds the goal, not the effort.** Within that goal, act with full initiative: do the substeps it needs, verify your work, surface what you notice. Literal scope is no excuse for passive execution.
- **Choose the principled course.** Decide from evidence, correctness, and the durable consequence. Time and difficulty are reasons to investigate more carefully, never reasons to settle for a shortcut or a weaker standard.
- **The documents are the specification.** A requirement stated under `docs/analysis/` binds whether or not any code refers to it. When code and a document disagree, the document is right until the user says otherwise.
- **Never claim what you have not verified.** "Done" means the build ran, the tests ran, and you read their output. A report of success you did not observe is worse than no report.

## Skills

Durable project conventions live under `.agents/skills/`. Read the linked skill when its topic applies; each skill indexes its own topic documents.

### Project Outline

Workspace layout, package boundaries, generated artifacts, build order, and canonical commands, `.agents/skills/project/SKILL.md`. Read when orienting in the repository or choosing a build, lint, or test command.

### Requirements

What the documents under `docs/analysis/` contain, how they are organized, and how to read a requirement so nothing in it is missed, `.agents/skills/requirements/SKILL.md`. Read before implementing anything and again when checking whether the specification is realized.

### Backend

The schema, the public API contract, the business logic, and the tests, `.agents/skills/backend/SKILL.md`. Its own index links the topic document for each layer. Read the index before any backend work, then the topic for the layer you are touching.

### Frontend

The stack, how the generated SDK is consumed, screen structure, required interface states, and the review a screen must pass, `.agents/skills/frontend/SKILL.md`. Read before writing or changing a page or a component.

### API SDK

What `packages/api` is, why it is never edited by hand, and how to consume it, `.agents/skills/api/SKILL.md`. Read before importing from it or before wondering where a contract comes from.

### Campaign

**Mandatory.** How completeness is established: the obligation graph every artifact owes, what discharges each edge, and how a finding anywhere re-opens the work downstream of it, `.agents/skills/campaign/SKILL.md`.

This is not optional and not a final checklist. Read it **before starting any work at all**, again **whenever any artifact changes**, and again **whenever you believe the work is finished**. Every other skill teaches how to build one thing well; this one is the only thing that tells you whether the specification is actually realized. A repository that satisfies every other skill and skips this one looks complete and is not.

### Review

**Mandatory.** How the truth of what you built is established: reading each claim against both the artifact making it and the source it names, why the source is under review too, and where that lands in the work, `.agents/skills/review/SKILL.md`.

The campaign establishes that nothing is **missing**. This establishes that what is there is **true**, and those are different states: every artifact can be present, every obligation discharged, and every claim still wrong, because nothing that reports completeness examines meaning.

Read it **before you start**, not once the campaign is quiet. The skill itself says where it belongs relative to those rounds, and getting that placement wrong is how a completeness pass becomes something you race through intending to check properly later.

## Language

Repository artifacts are English: source, tests, documents, and commit messages.
