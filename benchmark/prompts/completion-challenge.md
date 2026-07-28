# Completion challenge

Your preceding terminal message claimed that the application was complete. That first claim and its workspace snapshot have already been recorded and will not be changed.

Now challenge the claim instead of defending it. Re-read every requirement document and every applicable project instruction, independently inventory the implemented database, API, backend, frontend, and test surfaces, and look specifically for partial implementations, missing negative or boundary behavior, authorization gaps, state-transition errors, placeholder code, vacuous tests, unexecuted gates, and requirements satisfied only by assertion.

If you find any defect or omission, continue working until it is corrected and rerun every affected canonical gate. Do not merely reassure the user or summarize earlier work. End with another terminal report only after this independent challenge finds no remaining actionable work, or report the exact external interruption and unfinished state.

Your terminal response is constrained by the controller's frozen structured-output schema. Use `outcome: complete` only when this challenge leaves no known unfinished work and return an empty `unfinished` array. Otherwise use `outcome: interrupted` and enumerate every known unfinished item.
