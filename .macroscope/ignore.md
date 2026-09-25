# Macroscope review exclusions
# Source: https://docs.macroscope.com/bug-detection-and-fixes#default-ignore-patterns
# Defaults copied 2026-09-25. This file replaces the built-in defaults.
# Keep one glob per line, without Markdown lists or code fences.

# Markdown and MDX at any depth, including executable MDX components.
*.md
*.mdx

# === Vendored / dependency directories ===
**/.git/**
**/__pycache__/**
**/.pytest_cache/**
**/.mypy_cache/**
**/.ruff_cache/**
**/venv/**
**/.venv/**
**/node_modules/**
**/site-packages/**
**/.pnpm-store/**
**/__Snapshots__/**
**/__snapshots__/**
**/.agents/skills/**
**/.claude/skills/**
**/.github/skills/**
**/bower_components/**
**/jspm_packages/**
**/.next/**
**/.svelte-kit/**
**/.nuxt/**
**/.output/**
**/.vercel/**
**/.angular/**
**/vendor/**
**/_vendor/**
**/third_party/**
**/Pods/**
**/.bundle/**

# === Root-anchored ambiguous directories ===
build/**
out/**
env/**
ENV/**

# === Generated / build-output directories (match anywhere) ===
**/target/**
**/dist/**
**/generated/**
**/intermediates/**
**/generated_sources/**
**/generated-sources/**
**/generated-src/**
**/src/main/generated/**

# === Minified build output ===
**/*.min.js
**/*.min.css
**/*.bundle.js

# === Yarn PnP loader files ===
**/.pnp.cjs
**/.pnp.loader.mjs

# === Generated protobuf / codegen files ===
**/*_pb.d.ts
**/*_pb.js
**/*.pb.go
**/*_pb2.py
**/*_pb2_grpc.py
**/*_pb2.pyi
**/*.grpc.swift
**/*.pb.swift
**/*.sql.go
**/*.designer.cs
**/*.g.dart
**/*.pb.dart
**/*_pb.rb
**/*.d.ts
**/*.gen.ts
**/*.gen.tsx
**/*.gen.js
**/*.gen.jsx

# === Package manager files ===
**/go.mod
**/package.json
**/*.pbxproj
**/*.xcstrings
**/*.strings
**/*.properties
**/pom.xml
**/Package.swift
**/bun.lock
**/.eslintrc
**/.eslintignore

# === Lock / sum files ===
**/go.sum
**/package-lock.json
**/pnpm-lock.yaml
**/yarn.lock
**/Package.resolved

# === Images ===
**/*.jpg
**/*.jpeg
**/*.png
**/*.gif
**/*.svg
**/*.ico
**/*.webp
**/*.bmp
**/*.tiff

# === Fonts ===
**/*.woff
**/*.woff2
**/*.ttf
**/*.eot
**/*.otf

# === Media ===
**/*.mp3
**/*.mp4
**/*.wav
**/*.avi
**/*.mov
**/*.mkv
**/*.flac
**/*.ogg
**/*.srt

# === Archives ===
**/*.zip
**/*.tar
**/*.gz
**/*.rar
**/*.7z
**/*.bz2

# === Documents ===
**/*.pdf
**/*.doc
**/*.docx
**/*.xls
**/*.xlsx
**/*.ppt
**/*.pptx

# === Data / serialized ===
**/*.db
**/*.sqlite
**/*.sqlite3
**/*.parquet
**/*.avro
**/*.arrow
**/*.npy
**/*.pkl
**/*.jsonl

# === ML models ===
**/*.onnx
**/*.tflite
**/*.h5
**/*.safetensors

# === Compiled / binary ===
**/*.exe
**/*.dll
**/*.so
**/*.dylib
**/*.bin
**/*.pyc
**/*.class
**/*.o
**/*.a
**/*.wasm

# === Certificates / keys ===
**/*.cer
**/*.pem
**/*.p12

# === Platform-specific / non-reviewable ===
**/*.stringsdict
**/*.snap
**/*.adoc
**/*.arb
**/*.lock
**/*.po
**/*.fbx
**/*.log
**/*.xib
**/*.meta
**/*.kml
**/*.prefab
**/*.eml
**/*.csv
**/*.grpc.reflection
**/*.js.map

# === Go ===
**/*_test.go

# === TypeScript / JavaScript ===
**/*.test.ts
**/*.test.tsx
**/*.test.js
**/*.test.jsx
**/*.test.mjs
**/*.test.cjs
**/*.test.mts
**/*.test.cts
**/*.spec.ts
**/*.spec.tsx
**/*.spec.js
**/*.spec.jsx
**/*.spec.mjs
**/*.spec.cjs
**/*.spec.mts
**/*.spec.cts
**/*.e2e.ts
**/*.e2e.tsx
**/*.e2e.js
**/*.e2e.jsx
**/*.e2e.mjs
**/*.e2e.cjs
**/*.integration.ts
**/*.integration.tsx
**/*.integration.js
**/*.integration.jsx
**/*.integration.mjs
**/*.integration.cjs
**/__tests__/**

# === Python ===
**/test_*.py
**/*_test.py

# === Java / Kotlin ===
**/*Test.java
**/*Tests.java
**/*Spec.java
**/*IT.java
**/*ITCase.java
**/*Test.kt
**/*Tests.kt
**/*Spec.kt
**/*IT.kt
**/*ITCase.kt
**/src/test/java/**
**/src/test/kotlin/**
**/src/androidTest/**
**/src/integrationTest/**

# === Swift ===
**/*Tests.swift
**/*UITests.swift
**/*Tests/**
**/*UITests/**

# === Rust ===
**/tests/*.rs
**/*_test.rs
**/test_*.rs

# === Ruby ===
**/*_test.rb
**/*_spec.rb
**/test_*.rb

# === Generic test directories ===
**/test/**
**/tests/**
**/spec/**
**/specs/**
**/e2e/**

# Additional exclusions from .gitignore
**/node_modules
**/dist
**/coverage
**/coverage/**
**/.env
**/.env/**
**/*.lock/**
**/.turbo
**/.turbo/**
**/.DS_Store
**/.DS_Store/**
**/*.log/**
.repos/effect/**
packages/dsar/docs
packages/dsar/docs/**
examples/local-storage/.dsar-artifacts/**
examples/local-storage/.dsar-local.db
examples/local-storage/.dsar-local.db/**
examples/local-storage/.dsar-local.db-shm
examples/local-storage/.dsar-local.db-shm/**
examples/local-storage/.dsar-local.db-wal
examples/local-storage/.dsar-local.db-wal/**
examples/local-storage/.smoke-server.log
examples/local-storage/.smoke-server.log/**
examples/kitchen-sink/.dsar-kitchen-sink.db
examples/kitchen-sink/.dsar-kitchen-sink.db/**
examples/kitchen-sink/.dsar-kitchen-sink-artifacts
examples/kitchen-sink/.dsar-kitchen-sink-artifacts/**
# Narrow .env* rules to preserve the committed .env.example templates.
**/.env.local
**/.env.development
**/.env.test
**/.env.production
**/.env.staging
**/.env.preview
**/.env.*.local

# Additional exclusions from examples/kitchen-sink/.gitignore
examples/kitchen-sink/**/**.db
examples/kitchen-sink/**/**.db/**
examples/kitchen-sink/**/**.db-shm
examples/kitchen-sink/**/**.db-shm/**
examples/kitchen-sink/**/**.db-wal
examples/kitchen-sink/**/**.db-wal/**

# Keep repository exclusions in sync with the referenced .gitignore files.
# Macroscope does not document Git-style negation. Environment globs above
# preserve template exceptions. Copied defaults still exclude lockfiles,
# package manifests and dist output, including Git-tracked exceptions.
