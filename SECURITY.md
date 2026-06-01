# Security Policy

## Reporting a Vulnerability

Please report security issues through GitHub private vulnerability reporting or by opening a draft private security advisory for this repository. If neither option is available, open a public issue asking for a private security contact, but do not include exploit details or secrets in that issue.

Include:

- A short description of the issue
- Steps to reproduce
- Affected versions or commits
- Any relevant logs with secrets removed

## Secret Handling

This project uses email credentials, API keys, proxy credentials, and Discord webhook URLs. Treat all of them as secrets.

If a secret was committed to Git history, rotate it immediately. Deleting the file in a later commit is not enough because the value remains recoverable from history.

Before making a repository public, scan the full Git history for secrets and remove any committed credentials from history or publish from a fresh clean repository.

## Supported Versions

Security fixes are targeted at the default branch unless a release branch is explicitly maintained.
