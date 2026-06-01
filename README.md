# RoAppeal OSS

[![CI](https://github.com/RoAppeal/rbx-enforcement-ban-tool/actions/workflows/ci.yml/badge.svg)](https://github.com/RoAppeal/rbx-enforcement-ban-tool/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.3-black.svg)](https://bun.sh/)

RoAppeal OSS is a self-hosted Bun and TypeScript app for managing Roblox account appeal workflows from a local dashboard. It monitors appeal response emails, tracks appeal state in SQLite, generates appeal drafts, submits appeal requests, and can send Discord notifications.

RoAppeal OSS is not affiliated with, endorsed by, or sponsored by Roblox Corporation. "Roblox" is used only to identify the platform this tool works with.

> [!IMPORTANT]
> Use this only for legitimate appeals for accounts you own or are authorized to manage. Do not use it to spam support systems, submit dishonest appeals, evade platform rules, bypass access controls, or violate third-party terms. You are responsible for how you configure and run the software.

## Features

- Local TanStack Start dashboard with React, Vite, and Tailwind CSS
- IMAP response monitoring for Gmail and Outlook/Microsoft inboxes
- SQLite appeal history using Bun's `bun:sqlite`
- AI-assisted appeal draft generation through Vercel AI Gateway
- CAPTCHA solver support for `2captcha`, `cds`, and `funbypass`
- Optional proxy and Discord webhook support
- Config via JSON files or environment variables
- TypeScript, ESLint, Prettier, Bun tests, and CI

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- Vercel AI Gateway API key
- CAPTCHA provider API key
- IMAP app password for the inbox that receives Roblox support responses
- Optional: proxies in `config/proxies.txt`

## Quick Start

```bash
git clone https://github.com/RoAppeal/rbx-enforcement-ban-tool.git
cd rbx-enforcement-ban-tool
bun install
cp config/config.example.json config/config.json
cp config/proxies.example.txt config/proxies.txt
```

Set secrets in your shell:

```bash
export EMAIL_APP_PASSWORD="your-email-app-password"
export AI_GATEWAY_API_KEY="..."
export CAPTCHA_API_KEY="..."
export DASHBOARD_PASSWORD="use-a-long-random-password"
```

PowerShell:

```powershell
$env:EMAIL_APP_PASSWORD="your-email-app-password"
$env:AI_GATEWAY_API_KEY="..."
$env:CAPTCHA_API_KEY="..."
$env:DASHBOARD_PASSWORD="use-a-long-random-password"
```

Edit `config/config.json`, then run:

```bash
bun run dev
```

The dashboard runs at:

```text
http://127.0.0.1:3000
```

Password protection is off by default. Set `dashboard.require_password` to `true` and use `dashboard.password` or `DASHBOARD_PASSWORD` to require login.

## Test Mode

Use test mode to preview the dashboard without service credentials:

```bash
TEST_MODE=1 bun run dev
```

PowerShell:

```powershell
$env:TEST_MODE="1"
bun run dev
```

You can also set `"test_mode": true` in `config/config.json`. Test mode uses sample accounts and does not connect to IMAP, AI Gateway, CAPTCHA providers, Roblox, proxies, or Discord. If `DASHBOARD_REQUIRE_PASSWORD=1` is set in test mode, the default password is `test` unless `DASHBOARD_PASSWORD` is set.

## Configuration

Copy `config/config.example.json` to `config/config.json` and keep secrets in environment variables:

```json
{
  "$schema": "./config.schema.json",
  "accounts": [
    {
      "username": "YourRobloxUsername",
      "email": "your-email@gmail.com",
      "app_password": "env:EMAIL_APP_PASSWORD"
    }
  ],
  "captcha": {
    "provider": "cds",
    "api_key": "env:CAPTCHA_API_KEY"
  },
  "ai": {
    "model": "openai/gpt-4o-mini",
    "api_key": "env:AI_GATEWAY_API_KEY"
  },
  "dashboard": {
    "enabled": true,
    "port": 3000,
    "require_password": false,
    "password": "env:DASHBOARD_PASSWORD"
  }
}
```

The schema in `config/config.schema.json` is the source of truth for supported keys. Important notes:

- Gmail and Outlook/Microsoft IMAP hosts are auto-detected. Other email providers need `accounts[].imap_server`.
- `accounts[].app_password`, `captcha.api_key`, `ai.api_key`, and `dashboard.password` support `env:VARIABLE_NAME`.
- Recommended CAPTCHA solver: [2Captcha](https://2captcha.com/auth/register/?from=28003462).
- `dashboard.host` is intentionally not a config key. Use `DASHBOARD_HOST`; it defaults to `127.0.0.1`.
- Unsafe placeholder secrets such as `admin`, `change-me`, and sample API keys are rejected at startup.

Useful environment overrides:

| Variable                     | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `CONFIG_PATH`                | Use a config file outside `config/config.json`      |
| `CONFIG_JSON`                | Use an inline JSON config object                    |
| `ACCOUNTS_JSON`              | Replace `accounts` with a JSON array                |
| `AI_MODEL`                   | Override `ai.model`                                 |
| `AI_GATEWAY_API_KEY`         | AI Gateway API key                                  |
| `CAPTCHA_PROVIDER`           | Override `captcha.provider`                         |
| `CAPTCHA_API_KEY`            | CAPTCHA provider API key                            |
| `DASHBOARD_HOST`             | Dashboard bind host                                 |
| `DASHBOARD_PORT`             | Dashboard port                                      |
| `DASHBOARD_REQUIRE_PASSWORD` | Set to `1`, `true`, `yes`, or `on` to require login |
| `DASHBOARD_PASSWORD`         | Dashboard password                                  |
| `DISCORD_WEBHOOK_URL`        | Optional Discord webhook                            |
| `DATA_DIR`                   | Directory for `appeals.sqlite`                      |
| `TEST_MODE`                  | Run with sample data and no external service calls  |

## Proxies

Proxies are optional. Leave `config/proxies.txt` empty, or omit it, to submit from the local network.

Recommended provider: [LegionProxy](https://app.legionproxy.io/a?code=H8QYC5DDL5SZEVDS).

Supported formats:

```text
socks5://user:pass@host:port
http://user:pass@host:port
socks5://host:port:user:pass
```

## Docker

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Fill in `.env` and `config/config.json`, then run:

```bash
docker compose up --build
```

The Compose file publishes the dashboard on `127.0.0.1:3000`. Keep that binding unless you intentionally want to expose the dashboard beyond the local machine.

For a direct Docker run:

```bash
docker build -t roappeal/rbx-enforcement-ban-tool .
docker run --rm \
  --env-file .env \
  -e DASHBOARD_HOST=0.0.0.0 \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD/config/config.json:/app/config/config.json:ro" \
  -v "$PWD/config/proxies.txt:/app/config/proxies.txt:ro" \
  -v "$PWD/data:/app/data" \
  roappeal/rbx-enforcement-ban-tool
```

## Railway

This repository includes `railway.json` and a Dockerfile. Set service variables instead of committing `config/config.json`:

| Variable                     | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `ACCOUNTS_JSON`              | JSON array of account objects                        |
| `EMAIL_APP_PASSWORD`         | IMAP app password used by the example account config |
| `AI_GATEWAY_API_KEY`         | Vercel AI Gateway API key                            |
| `CAPTCHA_API_KEY`            | CAPTCHA provider API key                             |
| `DASHBOARD_REQUIRE_PASSWORD` | Set to `true`                                        |
| `DASHBOARD_PASSWORD`         | Long random dashboard password                       |
| `DISCORD_WEBHOOK_URL`        | Optional Discord webhook                             |

Attach a Railway volume at `/app/data` if you want appeal history to survive redeploys. Keep the service at one running instance when using SQLite.

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run format:check
bun test
bun run build
```

Use `bun run format` before opening a pull request.

The dashboard is a TanStack Start app. `src/routes/` contains app and API routes, `src/router.tsx` configures TanStack Router, `src/styles.css` imports Tailwind CSS, and `src/dashboard/components/` contains React dashboard components.

Production build and start:

```bash
bun run build
bun run start
```

Build artifacts are written to `.output/`. Standalone binaries are written to `dist/` when using `bun run build:binary`.

## Project Structure

```text
config/                 Runtime config and optional proxies.txt
data/                   Local runtime state, ignored by Git
scripts/                Build helper scripts
src/config.ts           Config loading and validation
src/server.ts           TanStack Start server entry and integrated worker startup
src/start/              Integrated worker and dashboard state
src/dashboard/          React dashboard components
src/routes/             TanStack Start app and API routes
src/modules/database.ts SQLite appeal history database
src/modules/emailMonitor.ts IMAP parsing and response classification
src/modules/submitter.ts Roblox support submission flow
```

## Security

Never commit `config/config.json`, `.env`, real proxy lists, database files, email passwords, API keys, or Discord webhook URLs. If a secret is committed, rotate it immediately.

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and [ACCEPTABLE_USE.md](./ACCEPTABLE_USE.md) before opening larger changes.

## License

MIT. See [LICENSE](./LICENSE).

The MIT license covers the source code. It does not grant rights to the RoAppeal or RoAppeal OSS names, logo, or other RoAppeal branding. If you publish a fork, rename and re-brand it so users do not confuse it with this project or the hosted RoAppeal product.
