---
"dsar": major
---

# Remove unsupported `dsar/adapter-c15t` export

Remove the unsupported `dsar/adapter-c15t` export from the umbrella package.

The repo no longer ships the private `@dsar/adapter-c15t` workspace package, and
the example runtime config now uses the inbound stub until a supported inbound
integration is configured.
