# Architecture Guide

## Purpose

Image Converter Web App is a browser-native batch image converter. The system is designed to process selected image files locally in the browser with React UI orchestration, Web Worker execution, WASM encoders, strict input validation, memory guards, and optional metadata preservation.

This document explains how the project is structured, where the important decisions live, and which constraints must be respected when adding features or fixes.

## Architectural Goals

- **Local-first processing**: files are processed in the browser; this repository does not implement an upload API.
- **Mode-safe UI state**: simple and advanced mode queues must not receive stale updates from old conversion runs.
- **Memory safety**: reject unsafe work before worker conversion whenever possible.
- **Predictable conversion path**: separate chunked streaming conversion is disabled; conversion uses the worker pipeline after memory checks.
- **Defensive validation**: do not trust filename extensions or `File.type` alone.
- **Accessible UI by default**: keyboard, screen reader, focus, and semantic states are part of component behavior.
- **Clean boundaries**: domain logic remains pure; data and worker layers isolate browser APIs and heavy processing.

## Layer Map

```text
src/
├── core/          Shared contracts, constants, and typed errors
├── domain/        Pure validation, naming, crop, and format rules
├── data/          Browser I/O adapters for workers, storage, presets, ZIP, and downloads
├── presentation/  React components, hooks, state store, theme, and pages
├── utils/         Shared utility functions
├── workers/       Conversion worker and binary metadata implementation
└── __tests__/     Vitest tests and binary fixtures
```

## Dependency Rules

- **`core/`** has no app-layer dependencies.
- **`domain/`** depends only on `core/`.
- **`data/`** may depend on `core/`, `domain/`, and `utils/`.
- **`presentation/`** may depend on `core/`, `domain/`, `data/`, and `utils/`.
- **`workers/`** may depend on `core/`, `domain/`, worker-local constants, and worker-safe utilities.
- **`utils/`** should stay generic and avoid importing project layers.

If a change breaks these rules, either the abstraction belongs in a lower layer or the feature needs a new adapter boundary.

## Runtime Flow

```text
File selection
  ↓
useImageDrop validates accepted files
  ↓
converterStore stores SourceFile objects in the active mode queue
  ↓
useConverter snapshots active mode, settings, active item IDs, and run token
  ↓
ConcurrencyQueue limits scheduling pressure
  ↓
WorkerPool assigns tasks to ConverterWorker instances
  ↓
converter.worker decodes, crops, encodes, optionally preserves metadata
  ↓
Progress and completion messages update active batch items only
  ↓
useBatchDownload downloads one artifact directly or multiple artifacts as ZIP
```

## State Model

`src/presentation/store/converterStore.ts` owns app-level state:

- `settings`
- `simpleItems`
- `advancedItems`
- `isRunning`
- `mode`

Important invariants:

- `settings` must pass `validateSettings()` before persistence.
- `simpleItems` and `advancedItems` are separate queues.
- `updateItem()` updates matching IDs in the active mode queue only (simple or advanced, not both).
- Batch files are not persisted.
- Settings and presets use localStorage adapters and must degrade safely when storage is unavailable.

## Conversion Orchestration

`src/presentation/hooks/useConverter.ts` is the main conversion coordinator.

Responsibilities:

- Snapshot current mode items and settings at batch start.
- Build unique output names using domain naming rules.
- Estimate memory before worker execution.
- Mark active items as processing, done, failed, or cancelled.
- Prevent stale state writes after mode switches or cancellation.
- Own batch cancellation through `AbortController`.

High-risk areas:

- Any async callback that updates item state must respect active run identity.
- Any settings used for an artifact must come from the batch snapshot, not an accidentally updated closure.
- Any new conversion path must preserve cancellation and memory-guard behavior.

## Worker Pool and Cancellation

`src/data/workerPool.ts` manages pooled conversion work.

Key behavior:

- FIFO queue for pending tasks.
- Dynamic worker creation up to configured limits.
- Worker recycling after the configured task count.
- Abort handling for queued tasks before worker execution.
- Pool termination cleans queued tasks and worker instances.

`src/data/workerClient.ts` wraps a single Web Worker.

Key behavior:

- Promise-based conversion requests.
- Progress callback dispatch.
- Message validation by request ID.
- Worker restart on cancellation or failure where required.

Cancellation invariants:

- Cancelling a batch must prevent queued work from starting.
- Active worker work must not later update stale UI items.
- Worker restart is safer than trusting a long-running image operation to stop synchronously.

## Worker Execution Pipeline

`src/workers/converter.worker.ts` performs heavy processing:

```text
input bytes
  ↓
MIME normalization for HEIC/HEIF cases
  ↓
decode with heic-to or createImageBitmap
  ↓
dimension guard
  ↓
compute crop rectangle
  ↓
draw to OffscreenCanvas
  ↓
encode using @jsquash or Canvas path
  ↓
optional metadata preservation
  ↓
metadata integrity warnings where supported
  ↓
WorkerResponse done/error/progress
```

Important limits:

- `MAX_FILE_SIZE_BYTES`: 256 MB.
- `MEMORY_LIMITS.MAX_SAFE_ARRAY_BUFFER_SIZE`: 256 MB.
- `MEMORY_LIMITS.MAX_IMAGE_DIMENSION`: 16384 px.
- `MEMORY_LIMITS.LARGE_FILE_WARNING_THRESHOLD`: 30 MB.
- Worker recycling threshold: 100 tasks.

## Streaming Decision

`src/data/streamingConverter.ts` remains as a memory-estimation facade.

- `shouldUseStreaming()` intentionally returns `false`.
- `estimateMemoryUsage()` estimates peak memory and returns `normal`, `caution`, or `reject`.
- Large files are not routed into a separate chunked conversion path.

Reason: one consistent conversion path is easier to validate, cancel, test, and reason about than two behaviorally different paths.

## File Validation Security

`src/domain/validation.ts` validates files before adding them to the queue.

Validation combines:

- File size checks.
- Accepted declared MIME type checks.
- Magic byte checks for JPEG, PNG, GIF, and BMP.
- RIFF/WebP structure checks.
- ISO BMFF brand detection for AVIF and HEIC/HEIF.
- Declared MIME and detected content compatibility.

Critical rule: never trust extension or `File.type` as the only source of truth.

## Metadata Architecture

`src/workers/metadata.ts` handles binary metadata extraction and injection.

Supported metadata concepts:

- EXIF
- XMP
- IPTC
- ICC

Supported output behavior is format-specific. Metadata preservation is supported for JPEG, WebP, and PNG output when the source provides compatible metadata. It is not supported for AVIF output. Do not assume all metadata can be preserved equally across formats.

Security and privacy risks:

- Metadata can contain GPS location, device identifiers, author fields, timestamps, and editing history.
- `keepMetadata` must remain opt-in.
- UI copy should explain the privacy tradeoff clearly.

## Download and ZIP Model

`src/data/download.ts` triggers browser downloads using Blob URLs and temporary anchors.

`src/data/zip.ts` uses JSZip:

- DEFLATE compression.
- Compression level 6.
- Progress callback support.
- `streamFiles: true` for memory behavior inside JSZip.

Do not document native ZIP internals unless the implementation changes back to a custom ZIP writer.

## Accessibility Architecture

Accessibility is implemented in component behavior, not only visual styles.

Current important behavior:

- `HomePage` has a skip-link target and live conversion status region.
- Mode buttons use `aria-pressed`.
- `Modal` has unique title IDs and Escape close behavior.
- `Toggle` uses native button behavior with `role="switch"` and `aria-checked`.
- Icon-only buttons need accessible names.
- Focus states must remain visible in light and dark themes.

Limit: full WCAG conformance still requires manual assistive technology testing and automated accessibility checks.

## Security and Deployment

Runtime security choices:

- No upload API in this repository.
- Content validation before conversion.
- Filename sanitization before downloads.
- Worker isolation for CPU-heavy work.
- Deployment headers in `public/_headers` (Netlify/Cloudflare-style header file).

Compliance note:

Source code can support privacy and secure defaults, but cannot by itself certify GDPR, CCPA, HIPAA, SOC 2, or ISO 27001 compliance. Those require deployment, access-control, logging, retention, legal, operational, vendor, and incident-response controls.

## Extension Points

Good places to add features:

- **New validation rule**: `src/domain/validation.ts` plus domain tests.
- **New output format**: `src/core/constants.ts`, `src/domain/formats.ts`, worker encoder path, tests, UI select options, docs.
- **New preset setting**: `src/core/types.ts`, `DEFAULT_SETTINGS`, validation, storage parsing, UI controls, tests.
- **New download mode**: `src/data/download.ts` or `src/data/zip.ts`, then `useBatchDownload()`.
- **New UI control**: reusable primitive in `src/presentation/components/ui/` when broadly useful.
- **New metadata behavior**: `src/workers/metadata.ts` plus binary fixtures and worker tests.

## High-Risk Changes

Treat these as high risk and add focused regression tests:

- Worker message protocol changes.
- Cancellation behavior.
- Batch mode state writes.
- File validation and MIME compatibility.
- Metadata injection/parsing.
- Filename sanitization.
- Storage schema changes.
- Header changes.
- Accessibility primitive changes.

## Validation Baseline

Latest verified commands from the audit-fix pass:

```bash
bun run lint
bun run typecheck
bun run test
bun run audit
```

Latest known test result: 24 test files and 289 tests passing.

Do not run `bun run build` unless a build/release check is explicitly requested.
