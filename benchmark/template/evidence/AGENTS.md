# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Evidence Graph

`.agents/skills/evidence/SKILL.md` defines the configured claims, automatic zero-host activation, tag placement, exclusions, and compiler gates. Read it for Evidence implementation and before handling a graph diagnostic.

### Evidence Review

`.agents/skills/review/SKILL.md` defines the human review of acknowledgement reasons. Read it only for a backend, frontend, or overall review objective. Final objectives run the prescribed compiler and runtime gates; they do not repeat the review.
