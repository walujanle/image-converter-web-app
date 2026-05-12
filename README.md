# Image Converter Web App

A browser-native image converter for batch image processing. Files are processed locally in the browser with Web Workers and WASM encoders. This repository does not include an upload API.

**Current project version**: `0.2.0 - Beta Version`

> Prefer a native desktop experience? A cross-platform desktop version is also available at [walujanle/image-converter-desktop-app](https://github.com/walujanle/image-converter-desktop-app).

## What It Does

- Converts images in batches.
- Supports JPEG, PNG, WebP, AVIF, GIF, BMP, and HEIC/HEIF as inputs.
- Outputs JPEG, PNG, WebP, and AVIF.
- Uses a worker pool for conversion work.
- Applies memory checks before unsafe conversions.
- Supports percentage crop, quality controls, lossless mode for supported formats, filename transforms, presets, and ZIP download.
- Can preserve supported metadata when enabled (JPEG, PNG, and WebP output only).

## Tech Stack

- React 19
- TypeScript 5.8
- Vite 8
- Bun
- Zustand
- Tailwind CSS 4
- Web Workers
- `@jsquash/*` WASM image encoders
- `heic-to`
- `exifreader`
- `piexifjs`
- JSZip
- Biome
- Vitest

## Quick Start

```bash
bun install
bun run dev
```

The Vite dev server usually runs at `http://localhost:5173`.

## Commands

```bash
bun run lint
bun run typecheck
bun run test
bun run audit
```

Build only when explicitly needed for release or deployment checks:

```bash
bun run build
bun run preview
```

## Documentation

Detailed documentation lives in `docs/`.

- **[Documentation Index](./docs/README.md)**: documentation map, status, source-of-truth files, and documentation policy.
- **[Architecture Guide](./docs/architecture.md)**: layers, data flow, worker model, cancellation, memory safety, validation, metadata, accessibility, and risks.
- **[Developer and AI Continuation Guide](./docs/developer-guide.md)**: code map, internal API notes, workflows, testing strategy, extension points, and continuation context.

## Architecture Summary

```text
src/
├── core/          Shared contracts, constants, and errors
├── domain/        Pure validation, crop, format, and naming rules
├── data/          Browser adapters for workers, storage, presets, ZIP, and downloads
├── presentation/  React UI, hooks, Zustand store, pages, and theme
├── utils/         Shared utilities
├── workers/       Conversion worker and binary metadata implementation
└── __tests__/     Vitest tests and binary fixtures
```

Core flow:

```text
file selection
  → validation
  → mode-specific queue state
  → conversion orchestration
  → worker pool
  → worker decode/crop/encode/metadata
  → artifact download or ZIP
```

## Security and Privacy Notes

- Image conversion is local-first in the browser.
- The repository has no upload API.
- File validation checks declared MIME, binary signatures, and ISO BMFF brands where supported.
- Large or unsafe images may be rejected before conversion.
- Metadata preservation is opt-in because metadata can include private information such as location, camera, author, or editing history.

## Accessibility Notes

The UI includes keyboard and screen-reader-oriented behavior, including focus states, skip link support, modal semantics, switch semantics, mode button states, and live conversion status messaging.

Full WCAG conformance still requires manual assistive technology testing and automated accessibility checks before release.

## Current Limits

- Separate chunked streaming conversion is disabled; conversions use the worker pipeline after memory checks.
- Large files can be rejected when estimated browser memory usage is unsafe.
- AVIF output does not preserve metadata (EXIF, XMP, IPTC, ICC).
- GIF animation is not supported as an animated output workflow.
- Production bundle size is not stated here; run a fresh build when release measurement is required.

## Validation Baseline

Last verified on 2026-05-12:

- `bun run lint`: passed.
- `bun run typecheck`: passed.
- `bun run test`: passed.
- `bun run audit`: passed with no vulnerabilities.

## License

MIT License. See [LICENSE](./LICENSE).
