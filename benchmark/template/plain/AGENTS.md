# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Campaign Review

`.agents/skills/campaign/SKILL.md` defines the exhaustive completeness review, and `.agents/skills/review/SKILL.md` defines its semantic comparison. Read both in full only when the current instruction is a backend, frontend, or overall review.

Start objectives implement the complete first version and do not perform campaign review. Final objectives verify that the preceding review actually met its instruction; they do not start a substitute review unless they return you to that review objective.
