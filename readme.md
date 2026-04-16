<p align="center">
  <h1 align="center">DSAR</h1>
</p>

[![GitHub stars](https://img.shields.io/github/stars/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar)
[![CI](https://img.shields.io/github/actions/workflow/status/inthhq/dsar/ci.yml?style=flat-square)](https://github.com/inthhq/dsar/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square)](https://github.com/inthhq/dsar/blob/main/LICENSE.md)
[![Discord](https://img.shields.io/discord/1312171102268690493?style=flat-square)](https://c15t.link/discord)
[![npm version](https://img.shields.io/npm/v/%40c15t%2Freact?style=flat-square)](https://www.npmjs.com/package/@c15t/react)
[![Top Language](https://img.shields.io/github/languages/top/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar)
[![Last Commit](https://img.shields.io/github/last-commit/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar/commits/main)
[![Open Issues](https://img.shields.io/github/issues/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar/issues)

DSAR monorepo: developer-first Data Subject Access Request engine.

## Quick Start

```sh
bunx turbo run dev --filter=./examples/kitchen-sink
```

- `examples/kitchen-sink` shows the runtime-side auth wiring.

## Auth Model

DSAR separates authentication into two runtime lanes:

- Machine access: API keys / bearer tokens for CLI, SDK, automation, and service-to-service calls.
- Trusted host identity: host apps can authenticate the end user first, then project that identity into DSAR with `resolveTrustedRequestIdentity`.

This keeps end-user login in the host product while DSAR focuses on tenant scoping and route authorization.

See:

- `docs/architecture/auth-model.md`
- `docs/integrations/unkey.md`
- `docs/api/verification.md`

## Support

- Join our [Discord community](https://c15t.link/discord)
- Open an issue on our [GitHub repository](https://github.com/inthhq/dsar/issues)
- Visit [inth.com](https://inth.com) and use the chat widget
- Contact our support team via email [support@inth.com](mailto:support@inth.com)

## Contributing

- We're open to all community contributions!
- Read our [Contribution Guidelines](https://dsar-sdk.dev/docs/oss/contributing)
- Review our [Code of Conduct](https://dsar-sdk.dev/docs/oss/code-of-conduct)
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

**Built with 💛 by the [inth.com](https://www.inth.com?utm_source=github&utm_medium=repopage_dsar-workspace) team**
