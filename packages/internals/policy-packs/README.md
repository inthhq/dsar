<p align="center">
  <a href="https://dsar-sdk.dev?utm_source=github&utm_medium=repopage_%40dsar%2Fpolicy-packs" target="_blank" rel="noopener noreferrer">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/c15t-banner-readme-dark.svg" type="image/svg+xml">
      <img src="../../docs/assets/c15t-banner-readme-light.svg" alt="c15t Banner" type="image/svg+xml">
    </picture>
  </a>
  <br />
  <h1 align="center">@dsar/policy-packs</h1>
</p>

[![GitHub stars](https://img.shields.io/github/stars/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar)
[![CI](https://img.shields.io/github/actions/workflow/status/inthhq/dsar/ci.yml?style=flat-square)](https://github.com/inthhq/dsar/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square)](https://github.com/inthhq/dsar/blob/main/LICENSE.md)
[![Discord](https://img.shields.io/discord/1312171102268690493?style=flat-square)](https://c15t.link/discord)
[![npm version](https://img.shields.io/npm/v/%40c15t%2Freact?style=flat-square)](https://www.npmjs.com/package/@c15t/react)
[![Top Language](https://img.shields.io/github/languages/top/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar)
[![Last Commit](https://img.shields.io/github/last-commit/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar/commits/main)
[![Open Issues](https://img.shields.io/github/issues/inthhq/dsar?style=flat-square)](https://github.com/inthhq/dsar/issues)

Immutable policy pack version registry, tenant/workspace pinning, human-readable upgrade diffs, and explicit approve/apply governance with audit events.

## Table of Contents

- [Key Features](#key-features)
- [Usage](#usage)
- [Support](#support)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [Launch policy catalog](#launch-policy-catalog)

## Key Features

- Registry for publishing immutable policy pack versions.
- Pinning resolution for tenant and workspace scopes.
- Proposal lifecycle (proposed -> approved -> applied) with role checks.
- Upgrade diffs categorized by legal impact and capability flags.
- Audit records for publish, pin, propose, approve, and apply.

## Usage

1. Launch policy catalog: launch-uk (uk), launch-eu (eu), launch-us (us), launch-us-california (us-ca), launch-us-virginia (us-va), launch-us-colorado (us-co) — all 1.0.0 effective 2026-01-01.
2. Supported jurisdictions: UK and EU launch packs include one-month baseline clocks; US scope bounded to baseline US + CA CCPA + VA VCDPA + CO CPA. Additional US states are known gaps until dedicated packs.
3. Publish lifecycle: every publishPolicyPackVersion() validated for schema validity (PolicyPackSchema), checksum (sha256), version metadata (changelog, compatibilityNotes, releaseType), semver discipline.
4. Pack update workflow: 1) Author under src/packs/{uk,eu,us}; 2) Add changelog under src/changelogs; 3) createPolicyPackVersionRecord(); 4) publishPolicyPackVersion(); 5) Run fixture matrix in @dsar/policy-engine.
5. Custom policy (T13): registerCustomPolicyPack(), activateCustomPolicyPack(), deactivateCustomPolicyPack(), resolveActivePolicyPack(). UnmappedJurisdictionError guidance keys: subject_contact_admin, admin_register_policy_pack, admin_activate_policy_pack.

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

## Launch policy catalog

| Pack                 | Jurisdiction | Version | Effective date           |
| -------------------- | ------------ | ------- | ------------------------ |
| launch-uk            | uk           | 1.0.0   | 2026-01-01T00:00:00.000Z |
| launch-eu            | eu           | 1.0.0   | 2026-01-01T00:00:00.000Z |
| launch-us            | us           | 1.0.0   | 2026-01-01T00:00:00.000Z |
| launch-us-california | us-ca        | 1.0.0   | 2026-01-01T00:00:00.000Z |
| launch-us-virginia   | us-va        | 1.0.0   | 2026-01-01T00:00:00.000Z |
| launch-us-colorado   | us-co        | 1.0.0   | 2026-01-01T00:00:00.000Z |

---

**Built with 💛 by the [inth.com](https://www.inth.com?utm_source=github&utm_medium=repopage_%40dsar%2Fpolicy-packs) team**
