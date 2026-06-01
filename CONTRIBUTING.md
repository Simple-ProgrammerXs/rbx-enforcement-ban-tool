# Contributing

Thank you for helping improve RoAppeal OSS.

## Development Setup

```bash
bun install
cp config/config.example.json config/config.json
```

Use environment variables for local secrets. Do not commit populated config files, `.env` files, proxy lists, databases, or generated binaries.

## Checks

Run these before opening a pull request:

```bash
bun run typecheck
bun run lint
bun test
```

## Pull Requests

- Keep changes focused.
- Update docs when behavior or configuration changes.
- Add tests for parsing, validation, persistence, and other pure logic.
- Avoid logging secrets, tokens, webhooks, proxy credentials, or email passwords.

## Responsible Use

Do not contribute changes intended to spam support systems, submit dishonest appeals, bypass access controls, evade platform rules, or hide abusive automation. See [ACCEPTABLE_USE.md](./ACCEPTABLE_USE.md).
