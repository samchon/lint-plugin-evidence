# Evidence Backend Final

Run the database, API, backend, SDK, test-build, lint, test, and live-server gates in dependency order.

If a gate changes generated output or exposes a defect, fix the owner and repeat the complete backend Evidence review before rerunning the gates. Finish only when every backend requirement is implemented, no backend or API `@todo` remains, Evidence reports no diagnostic, and every backend gate passes.
