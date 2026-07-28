---
name: frontend
description: Indexes the frontend conventions and states the rules that cross all of them: the stack, reading the SDK first, building a product rather than an endpoint list, and what done means. Use before any frontend work, then read the linked topic document.
---

# Frontend

The frontend is where a requirement becomes something a user can actually do. An operation nobody can reach from a screen is a requirement that was built and never delivered.

Read this file first, then the topic document for what you are about to touch.

## Topics

- [sdk.md](sdk.md): consuming the generated SDK, authentication and connections, and the simulation-first development flow that closes with live integration. Read before writing any data call.
- [architecture.md](architecture.md): layering, how far SDK types are allowed to reach, view models, hooks, and query keys. Read before adding a route, a data path, or shared state.
- [screens.md](screens.md): screen structure, the states every screen owes, and how a screen traces to a requirement. Read before building a screen.
- [verification.md](verification.md): what proves the frontend works, and the record that proof leaves. Read before claiming anything is finished.

## Stack

TypeScript with Vite, React Router for routing, Tailwind with a small set of local primitives for styling, a query library for client-side query and mutation orchestration, and Playwright for browser verification.

The API host, the simulation flag, and any bootstrap identifiers come from environment variables with documented defaults, recorded in an example environment file. Never hardcode a host.

Add a library only when it solves a problem you have already met, and explain any departure from the stack above rather than making it silently.

## Read The SDK Before Designing Anything

The generated SDK is the contract and the source of truth for what the product can do.

Read `packages/api/src/**/*.ts` before laying out a single screen, JSDoc included. The types, their comments, and their value constraints tell you what each field means, which values are legal, and which operations exist at all. Map the operations, the DTOs, and the constraints first.

A screen designed before reading the contract gets rebuilt after reading it.

## Build The Product, Not The Endpoint List

Do not turn every operation into a feature. Prefer a coherent product over exhaustive coverage, and leave out operations that are diagnostic, redundant, or that expose backend mechanics no user benefits from.

Record every deliberate omission with its reason in the project's notes, the way a real project keeps an omissions log:

```markdown
## Omitted On Purpose

- Review, question, answer, and comment surfaces
- Deep seller operations such as raw SKU authoring and inventory updates
- Manual payment vendor selection

## Why

- The product goal is a coherent buyer flow plus practical operator tooling.
- The omitted areas add operational complexity, duplicate an existing path,
  or expose backend mechanics that do not help a shopper.
```

An unrecorded omission is indistinguishable from an oversight. The next reader re-derives the decision, or reverses it by accident.

Never invent a feature the SDK does not support. If a requirement needs behavior the contract does not expose, that is a finding against the API, not an invitation to build a frontend-only path.

## Done Means The Product Works

The frontend is not finished when it compiles, and a green build says nothing about whether a control does anything.

Done means the application starts, the core flows work when a person performs them, the interface is coherent at every width, deliberate omissions are recorded, and the verification document reflects what was actually run against a real backend. The verification topic owns what that requires.
