# Contributing to muse-maestro

## Development

muse-maestro is a native Muse plugin suite. It has no runtime dependencies and uses `node:test` only.

```bash
npm test
```

Requires Node.js 20 or newer (`engines.node >= 20`).

## Tests

- Run the full suite with `npm test`.
- Tests live in `tests/` and use `node --test`.
- Keep plugins fail-open: on any internal error, a hook should emit nothing and exit 0, so Maestro can never stall the agent.

## Pull requests

- Keep changes small and focused.
- Update the README where behaviour changes.
- Do not include secrets or real credentials in tests or examples.
- Run `npm test` before opening a PR.
