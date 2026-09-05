# Vite+ commands

- Let Vite+ select the pinned Node.js and pnpm versions. Do not invoke `node`,
  `npm`, `npx`, or `pnpm` directly during development.
- Install dependencies with `vp install` or its short form, `vp i`. Add and
  remove packages with `vp add` and `vp remove`.
- Run package scripts with `vp run`, Node.js entry points with `vp node`, and
  binaries from `node_modules/.bin` with `vp exec`.

# Agent test rules

Run active tests through the package script with `vp run test`. The script
invokes Vite+/Vitest with the root test configuration.

Use a focused file or Vitest's `-t` option while changing one behavior, for
example:

```sh
vp test tests/validation.test.ts -t "rejects duplicate stable ids"
```

Run `vp run check` and `vp run test` after the implementation is complete.
`vp run check` includes `vp check`, whose file length, function length, and
cyclomatic complexity warnings are design prompts. Address them when that
improves the code, or leave them with a brief explanation when it does not.
Automation must use `vp run check:ci`, which still fails on format, lint, and
type errors but does not print advisory warnings.

# Database migrations

- Give every Drizzle migration a semantic lowercase snake_case name.
- Generate migrations with `vp run db:generate --name <semantic_name>`.
- Do not accept Drizzle's generated word-pair name.
