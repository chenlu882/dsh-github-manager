# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.2.x | Yes |
| < 0.2.0 | No |

## Reporting a vulnerability

Please do not open a public issue for security problems. Report privately to
the repository maintainer, including:

- affected version
- steps to reproduce
- impact
- any suggested fix

## Local service model

Version 0.2.1 uses the existing DSH Connection RPC carrier. It opens no
independent HTTP listener and contains no shared authentication token.
Every plugin endpoint requires an authenticated owner peer. Non-owner peers
are rejected even if they have access to another DSH capability.

Commands use executable/argument arrays without a shell. npm is started via
its npm-cli.js entry point. Updates require a recent, single-use check ticket;
npm installs the reviewed version, while Git revalidates the branch and both
commit identities before a fast-forward merge of the reviewed commit.

DSH bundle updates do not remove the old bundle first. They rely on the
host package manager's installation and failure-recovery behavior.

The tool can run local package-manager commands and, when the user confirms,
install Git through winget. Treat installed third-party plugins and npm
packages as code you trust.
