# @dsar/cli

[GitHub stars](https://github.com/inthhq/dsar)
[CI](https://github.com/inthhq/dsar/actions/workflows/ci.yml)
[License](https://github.com/inthhq/dsar/blob/main/LICENSE.md)
[Discord](https://c15t.link/discord)
[npm version](https://www.npmjs.com/package/@c15t/react)
[Top Language](https://github.com/inthhq/dsar)
[Last Commit](https://github.com/inthhq/dsar/commits/main)
[Open Issues](https://github.com/inthhq/dsar/issues)

Command-line interface for DSAR APIs with endpoint parity coverage.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Available Commands](#available-commands)
- [Global Flags](#global-flags)
- [Exit Codes](#exit-codes)
- [Support](#support)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Installation

```sh
bun add @dsar/cli
```

## Usage

1. Run locally: `dsar --help`
2. Interactive mode (no args): `dsar` opens a wizard to choose command domain + command, prompt for params/payloads, and show review with execute/edit/cancel.
3. Configuration: same auth/env as Node SDK — `DSAR_API_URL` (required unless `--api-url`), `DSAR_API_TOKEN` (optional). Treat `DSAR_API_TOKEN` / `--token` as a bearer token for machine-to-machine authentication, not for browser-distributed subject credentials. Global flags: `--api-url`, `--token`, `--idempotency-key`, `--output text|json`, `--json '<payload>'`. `--help` prints help and does not start the wizard.
4. Output: --output text for readable; --output json for envelope { ok, data|error, meta }.
5. Commands mirror backend: init, status; subjects get; policies list|upgrades ...; requests ... (capture, clock explain, verification, delivery, manifest, appeals, audit); tenants retention get|put. See docs/developer/cli.md for full mapping.
6. npx dsar works only after package publishing; in-workspace use local install or workspace scripts.

## Available Commands

- `dsar --help`: Print help (does not start interactive wizard).
- `dsar <command> --help`: Print command-specific help.
- `dsar`: Start interactive command wizard when no arguments provided.
- `dsar doctor`: Run CLI diagnostics for API URL config, runtime status, authenticated request reachability, migration freshness, and adapter health.
  Use `--output json` for the structured diagnostic envelope.

## Global Flags

- `--api-url <url>`: API base URL override.
- `--token <token>`: DSAR API bearer token for machine access. Defaults to `DSAR_API_TOKEN` when set.
- `--idempotency-key <key>`: Idempotency key for mutations.
- `--output text|json`: Output format.
- `--json '<payload>'`: POST/PUT payload for JSON body.

## Exit Codes

- `0`: command completed successfully. `doctor` may still report warnings for degraded adapters or skipped checks when optional diagnostics are unavailable.
- `1`: command failed, an unknown command was requested, or `doctor` found one or more failed checks.

## Support

- Join our [Discord community](https://c15t.link/discord)
- Open an issue on our [GitHub repository](https://github.com/inthhq/dsar/issues)
- Visit [inth.com](https://inth.com) and use the chat widget
- Contact our support team via email [support@inth.com](mailto:support@inth.com)

## Contributing

- We're open to all community contributions!
- Read our [Contribution Guidelines](https://c15t.com/docs/oss/contributing)
- Review our [Code of Conduct](https://c15t.com/docs/oss/code-of-conduct)
- Fork the repository
- Create a new branch for your feature
- Submit a pull request
- **All contributions, big or small, are welcome and appreciated!**

## Security

If you believe you have found a security vulnerability in c15t, we encourage you to **_responsibly disclose this and NOT open a public issue_**. We will investigate all legitimate reports.

Our preference is that you make use of GitHub's private vulnerability reporting feature to disclose potential security vulnerabilities in our Open Source Software. To do this, please visit [https://github.com/inthhq/dsar/security](https://github.com/inthhq/dsar/security) and click the "Report a vulnerability" button.

### Security Policy

- Please do not share security vulnerabilities in public forums, issues, or pull requests
- Provide detailed information about the potential vulnerability
- Allow reasonable time for us to address the issue before any public disclosure
- We are committed to addressing security concerns promptly and transparently

## License

[Apache License 2.0](https://github.com/inthhq/dsar/blob/main/LICENSE.md)

---

**Built with 💛 by the [inth.com](https://www.inth.com?utm_source=github&utm_medium=repopage_%40dsar%2Fcli) team**
