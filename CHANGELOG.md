# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Email inbox monitoring now supports Outlook/Microsoft accounts in addition to
  Gmail, with the IMAP server auto-detected from the email domain.
- Integrated Vite dev server: `bun run dev` serves the API and the dashboard
  with hot module reload from a single port.
- Per-account appeal timeline in the dashboard, including the submitted appeal
  message and Roblox's response.
- Automatic dashboard port fallback when the configured port is already in use.
- Optional dashboard password protection (`dashboard.require_password`,
  disabled by default) with sessions that persist across restarts.
- `CHANGELOG.md`.

### Changed

- Renamed the account `gmail_app_password` field to `app_password` (the old name
  still works as a deprecated alias).
- Moved the optional proxy list from `input/proxies.txt` to `config/proxies.txt`
  (the old location is still read as a fallback).
- The dashboard bind host is now set only via `DASHBOARD_HOST` (removed
  `dashboard.host` from `config.json`).
- Replaced the React/Vite dashboard SPA with a server-rendered dashboard (a small
  inlined vanilla-JS client) and removed the frontend build toolchain (React, Vite).
- Rebranded the dashboard and docs to "RoAppeal OSS — Enforcement Ban Tool".
- Redesigned the dashboard UI with the RoAppeal color palette.
- Simplified the login screen; the brand mark links to the GitHub repository.

### Fixed

- `tsconfig.json` referenced the legacy `bun-types`; now uses `@types/bun`
  (`"types": ["bun"]`).

## [2.0.0] - 2025-01-01

- Initial public release: self-hosted Roblox enforcement-ban appeal tool with a
  local dashboard, IMAP response monitoring, SQLite history, AI-assisted appeal
  drafting, optional CAPTCHA/proxy/Discord integrations, and a single-file build.

[Unreleased]: https://github.com/RoAppeal/rbx-enforcement-ban-tool/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/RoAppeal/rbx-enforcement-ban-tool/releases/tag/v2.0.0
