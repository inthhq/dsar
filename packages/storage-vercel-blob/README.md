# @dsar/storage-vercel-blob

[GitHub stars](https://github.com/inthhq/dsar)
[CI](https://github.com/inthhq/dsar/actions/workflows/ci.yml)
[License](https://github.com/inthhq/dsar/blob/main/LICENSE.md)
[Discord](https://c15t.link/discord)
[npm version](https://www.npmjs.com/package/@c15t/react)
[Top Language](https://github.com/inthhq/dsar)
[Last Commit](https://github.com/inthhq/dsar/commits/main)
[Open Issues](https://github.com/inthhq/dsar/issues)

Optional Vercel Blob-backed storage adapter for DSAR fulfillment artifacts.

## Key Features

- Effect-based StorageAdapterContract implementation.
- Deterministic key/reference mapping with manifest linkage metadata.
- putObject, getObject, headObject, deleteObject parity with storage contract.
- Normalized adapter errors and health diagnostics.

## Usage

```ts
import { dsarInstance } from "@dsar/backend";
import { makeVercelBlobStorageAdapter } from "@dsar/storage-vercel-blob";

const runtime = dsarInstance({
	adapters: {
		inbound: "stub",
		notifications: "stub",
		storage: makeVercelBlobStorageAdapter({
			readWriteToken: process.env.BLOB_READ_WRITE_TOKEN ?? "",
		}),
	},
});
```

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

**Built with 💛 by the [inth.com](https://www.inth.com?utm_source=github&utm_medium=repopage_%40dsar%2Fstorage-vercel-blob) team**
