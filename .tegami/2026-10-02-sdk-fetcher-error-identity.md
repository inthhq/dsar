---
packages:
  dsar: patch
---

### Keep Node SDK failures on their catalog codes

Keep Node SDK HTTP and envelope failures on their catalog codes. The fetcher previously treated thrown `DsarSdkError` instances as transport failures because `isSdkError` only accepted plain objects.
