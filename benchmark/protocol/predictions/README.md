# Prediction registry

Prediction history is append-only. A later correction never rewrites or deletes an earlier review; the active prior is the ordered chain whose final leaf matches every frozen experimental input.

The canonical current-freeze chain is:

1. `current-freeze-all-subjects.md`, review `4801252166`, freezes the four-subject scale and all numeric priors but historically assumes Fast/priority.
2. `current-freeze-standard-tier.md`, review `4801307464`, replaces only tier-dependent configuration and wall-time rows with Standard values while inheriting every named non-time prior.
3. `current-freeze-standard-null-tier-addendum.md`, review `4801340185`, replaces only the wire representation with omitted `serviceTier` and effective null.
4. `current-freeze-cache-write-rate-addendum.md`, review `4801447410`, withdraws the unsupported ChatGPT cache-write credit rate and makes monetary totals unavailable until directly sourced.
5. `current-freeze-token-safety-cost-amendment.md`, review `4801470216`, keeps monetary results unavailable but replaces the launch consequence and monetary stop with paired observed-token and hard-deadline safety controls.
6. `current-freeze-subject-manifest-addendum.md`, review `4801516000`, corrects Todo and Reddit byte counts and binds all four corpora to an independently recomputed freeze manifest.
7. `current-freeze-block-safety-addendum.md`, review `4801568652`, adds a durable block-global token and deadline guard to the arm-equal cell guards.

The active leaf is `current-freeze-block-safety-addendum.md`. Together these seven immutable records form one canonical prior for the current inputs. `todo-reddit.md` and `shopping-erp.md` are older historical priors and cannot be used for current-freeze inference.

No prediction file receives observed data. A change to corpus bytes, model, effort, tier, method bundle, prompt, price sheet, or grading contract requires a new file and formal COMMENT review before a paid request.

`safety-candidates.md` is a non-authorizing sensitivity note. Its rejected first-pass numbers are not part of the active prior and cannot fill execution pins without a later independent audit and formal checkpoint.
