---
name: frontend
description: Indexes the frontend conventions and states the rules that cross all of them: the stack, reading the SDK first, state and routing discipline, building a product rather than an endpoint list, and what done means. Use before any frontend work, then read the linked topic document.
---

# Frontend

The frontend is where a requirement becomes something a user can actually do. An operation nobody can reach from a screen is a requirement that was built and never delivered.

Begin this phase only after the Backend Layer Gate passes and the generated SDK reflects that gated contract.

Read this file first, then the topic document for what you are about to touch.

## Topics

- [sdk.md](sdk.md): consuming the generated SDK, authentication and connections, and the simulation-first development flow that closes with live integration. Read before writing any data call.
- [architecture.md](architecture.md): layering, how far SDK types are allowed to reach, view models, hooks, and query keys. Read before adding a route, a data path, or shared state.
- [state.md](state.md): the four kinds of state and their owners, cache freshness per data kind, derived state, optimistic updates, and races. Read before holding any value anywhere.
- [routes.md](routes.md): guarded layouts, returning after login, 403 versus 404, code splitting, and what a navigation owes. Read before touching the route table.
- [errors.md](errors.md): expected versus unexpected failure, boundaries at route seams, retry policy, and the one toast channel. Read before handling any failure.
- [components.md](components.md): when a component earns extraction, what it may know, controlled inputs, keys, and memoization. Read before extracting anything.
- [screens.md](screens.md): screen structure, the states every screen owes, and how a screen traces to a requirement. Read before building a screen.
- [forms.md](forms.md): validating against the DTO rather than a second schema, where a failure message lands, and what a submission owes at each outcome. Read before building any input a user submits.
- [lists.md](lists.md): search, filter, sort, and pagination built from the request contract, and the two different empty screens. Read before building any listing.
- [values.md](values.md): rendering what the contract carries, money with its scale and currency, an instant versus a calendar date, and what an absent value means. Read before displaying any value.
- [session.md](session.md): restoring and persisting the session, the three identity states, expiry as a refusal, and what sign-out must clear. Read before building anything identity-dependent.
- [design.md](design.md): how the interface looks, and the signatures that mark a screen as machine-generated. Read before styling anything.
- [verification.md](verification.md): what proves the frontend works, and the record that proof leaves. Read before claiming anything is finished.

## The Build Order

Each step consumes the previous one, which is why the order is not a preference. Every path below sits inside `packages/frontend/`; [architecture.md](architecture.md) owns the full folder layout.

1. Read the SDK and the requirement journeys, write the screen plan in `wiki/screen-plan.md`, and set the [design dials](design.md).
2. Pre-design the screens as stubs in `src/components/<domain>/`: each page component and its sub-components with their props enumerated, the contract JSDoc, an implementation-pending sentence naming what the screen still owes, and a placeholder body. The whole surface is declared before any screen works.
3. Build the primitives under `src/components/ui/`, the layout chrome in `src/components/app-frame.tsx`, and the composed providers in `src/components/providers/app-providers.tsx`.
4. Keep the scaffold's shared connection in `src/lib/client.ts`, then build each domain's view-model types, fixtures, and hooks with their keys under `src/lib/<domain>/`.
5. Lay the route table in `src/App.tsx` with its guarded layouts, over the stubs, so the whole surface navigates from the start of the frontend phase.
6. Crack the screens one by one against simulation, every state from the start, adding each screen's gallery rows as it lands and removing its implementation-pending sentence as it realizes. [screens.md](screens.md) owns the cracking discipline.
7. Write the journey specs under `tests/journeys/` mirroring the requirement journeys, still against simulation.
8. Close against the live backend: sessions, persistence, authorization, and the verification record in `wiki/verification.md`.

The gated SDK fixes the contract before frontend work begins: the frontend starts from a realized and tested backend contract rather than an unfinished stub contract. Cracking a screen is experimental work: run the app with simulation on for contract-generated success responses, use gallery fixtures for named UI states, and drive both through an available interactive browser tool while you build. What simulation cannot prove, the closing pass owns, and [verification.md](verification.md) owns both the preferred browser path and its fallback.

## Stack

TypeScript with Vite, React Router for routing, Tailwind with a small set of local primitives for styling, a query library for client-side query and mutation orchestration, and Playwright for browser verification.

The API host, the simulation flag, and any bootstrap identifiers come from environment variables with documented defaults, recorded in an example environment file. Never hardcode a host.

Add a library only when it solves a problem you have already met, and explain any departure from the stack above rather than making it silently.

## Read The SDK Before Designing Anything

The generated SDK is the contract and the source of truth for what the product can do.

Read `packages/api/src/**/*.ts` before laying out a single screen, JSDoc included. The types, their comments, and their value constraints tell you what each field means, which values are legal, and which operations exist at all. Map the operations, the DTOs, and the constraints first.

A screen designed before reading the contract gets rebuilt after reading it.

## Build The Product, Not The Endpoint List

Every user-visible requirement must be reachable and complete. Do not turn every operation into a separate screen, but do not omit a required capability merely because it is complex, operational, or less central to the main journey.

An SDK operation may be omitted from the interface only when it is infrastructure-only, genuinely redundant with another complete user path, or exposes backend mechanics no user can benefit from. Record every such decision with the exact requirement analysis, replacement path or non-user owner, and a condition that would invalidate the omission in `packages/frontend/wiki/omissions.md`:

```markdown
## Omitted On Purpose

- `/health`
- A dedicated session-introspection screen

## Why

- `/health` is an infrastructure probe and no requirement makes it user-facing.
- The authenticated application shell already presents every required session
  fact and state; add the screen if a requirement gives introspection its own
  user journey.
```

Cost, implementation difficulty, or a preference for a smaller product never justifies an omission. An unrecorded or unfalsifiable omission is indistinguishable from an oversight.

Never invent a feature the SDK does not support. If a requirement needs behavior the contract does not expose, that is a finding against the API, not an invitation to build a frontend-only path.

Return to the API or backend only when a named requirement, diagnostic, test, SDK contract failure, or live-integration failure proves a defect there. Record the trigger, repair the owning layer, regenerate the SDK, and re-pass the complete Backend Layer Gate before resuming frontend work. Do not switch layers speculatively.

## Frontend Layer Gate

The frontend is not finished when it compiles, and a green build says nothing about whether a control does anything.

Before accepting the gate, enumerate every current product-facing SDK operation and trace it to a screen and browser journey or to its requirement-backed entry in `packages/frontend/wiki/omissions.md`. Then walk backward from every screen data call to the generated accessor it uses. Perform this against the current SDK and screen files rather than a remembered plan; an unconsumed operation, an unrecorded omission, or a handwritten transport path is a finding in both benchmark arms.

This layer passes when the application starts, every requirement-backed user journey works when performed, the interface is coherent at every required width, deliberate omissions are recorded, and the verification document reflects what was actually run against a real backend.
