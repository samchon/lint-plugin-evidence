# Evidence Backend Final

Run these gates in order:

1. `build:prisma`
2. `prepare:database`
3. `build:api`
4. `build:main`
5. `build:sdk`
6. `build:test`
7. lint
8. tests
9. live-server checks

If a gate changes generated output or exposes a defect, fix the owner and repeat the complete backend Evidence review before rerunning the gates. Finish only when every backend requirement is implemented, no backend or API `@todo` remains, Evidence reports no diagnostic, and every backend gate passes.
