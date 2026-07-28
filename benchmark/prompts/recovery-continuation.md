# Disabled recovery continuation

This guard input must not be sent during a valid exact-token benchmark. Codex `0.145.0` does not re-enable experimental raw response events on `thread/resume`, so an app-server or controller-transport restart makes exact per-response usage incomplete.

If this input is ever delivered, do not continue implementation or claim completion. Report `outcome = interrupted`, state that raw-usage continuity was lost, list all unfinished work, and make no project change. The harness must seal this attempt as right-censored and use a new run ID and fresh workspace for any replacement.
