# Evidence Overall Final

Run these gates in order:

1. format
2. root build
3. lint
4. database preparation
5. tests
6. UI review
7. browser journeys
8. live checks

If formatting or a gate changes output or exposes a defect, fix the owner and repeat the complete whole-project Evidence review before rerunning every affected gate. Finish only when every requirement is implemented, no `@todo` remains, every citation is verified, Evidence reports no diagnostic, and every gate passes.
