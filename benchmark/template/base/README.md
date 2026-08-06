# {{name}}

- Subject: {{subject}}
- Model: {{model}}
- Arm: {{arm}}

Built by an agent from the requirements under `docs/analysis/`.

## Commands

```bash
pnpm install
cp packages/backend/.env.example packages/backend/.env
pnpm build
pnpm schema:database
pnpm --filter {{frontendPackageName}} playwright:install
pnpm test
```
