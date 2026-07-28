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

Durable project conventions live under `.agents/skills/`. Read the linked skill when its topic applies.

### Project Outline

Workspace layout, package boundaries, generated artifacts, build order, and canonical commands, `.agents/skills/project/SKILL.md`. Read when orienting in the repository or choosing a build, lint, or test command.

### Requirements

What the documents under `docs/analysis/` contain, how they are organized, and how to read a requirement so nothing in it is missed, `.agents/skills/requirements/SKILL.md`. Read before implementing anything and again when checking whether the specification is realized.

### Database

Prisma schema organization, naming, the documentation-comment contract, and the snapshot, soft-delete, and materialization patterns, `.agents/skills/database/SKILL.md`. Read before adding or changing a model.

### API

DTO ownership, controller composition, authentication decorators, provider structure, pagination, errors, and the JSDoc contract that becomes the published documentation, `.agents/skills/api/SKILL.md`. Read before adding or changing an endpoint, a DTO, or a provider.

### Testing

End-to-end feature test structure, composition through the connection pool, and what a test must prove beyond its happy path, `.agents/skills/testing/SKILL.md`. Read before writing or changing a test.

### Frontend

The stack, the SDK adapter boundary, required interface states, testing through SDK simulation, and the review a screen must pass, `.agents/skills/frontend/SKILL.md`. Read before writing or changing a page or a component.

### Method

How to work the requirement set to completion and how to know when you are finished, `.agents/skills/method/SKILL.md`. Read before starting and again whenever you believe the work is done.

## Language

Repository artifacts are English: source, tests, documents, and commit messages.
