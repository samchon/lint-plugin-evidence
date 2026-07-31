---
name: review
description: Defines the human integrity review of Evidence acknowledgement reasons while compilation owns structural checks. Read only for a review objective.
---

# Review

The compiler owns target resolution, host eligibility, overlap, and coverage. Do not repeat those structural checks.

For every `@evidence`, decide whether the reason specifically and truthfully explains why the current host implements, represents, or proves the cited target.

For every `@evidenceExclude`, decide whether the reason specifically and truthfully names the non-applicability, actual owner or observable alternative, and concrete condition that would invalidate the exclusion.

Read the reason, host, and target meaning. Fix an inaccurate reason or the artifact that makes it false, then wait for the compiler gate. Complete when every reason in the active phase is precise and truthful and the current build is clean.
