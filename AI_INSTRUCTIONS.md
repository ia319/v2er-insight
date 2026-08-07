# V2ER Insight - Project Context

This file documents the project structure and file purposes for AI assistants to understand the context quickly.

## Project Overview

**V2ER Insight** is a TypeScript CLI tool designed to fetch, parse, and analyze V2EX user data (topics and replies).
It uses a modular architecture separating generic logic (Fetcher) from business logic (V2EX specifics).

## Tech Stack

- **Language**: TypeScript (Node.js >= 20.18.1)
- **Module System**: CommonJS (target ES2020)
- **Path Aliases**: `@/` → `src/` (via `tsconfig.json` paths + `tsc-alias`)
- **Build**: `pnpm run build` (`build:compile` + `build:assets`)
- **Release Build**: `pnpm run build:release` (clean `dist`, compile, copy runtime assets, prune maps)
- **Linting**: ESLint (Flat Config) + Prettier + Husky
- **Testing**: Vitest (`vi.mock` for network calls, `@/` alias in `vitest.config.ts`)
- **HTTP**: Axios
- **HTML Parsing**: Cheerio

## Build & Packaging Notes

- `scripts/copy-dist-assets.cjs`: Copies runtime non-code assets into `dist` (currently `src/core/ai/prompt/system-prompt.md`) for packaged runtime access.
- `scripts/prune-dist-maps.cjs`: Removes `*.map` from `dist` before packaging, reducing tarball size and local build path metadata exposure.
- `pack:check`: Verifies published files through `pnpm pack --dry-run --json`.

## Directory Structure & File Purposes

```text
root
├── eslint.config.mjs         # ESLint Flat Config (v9+)
├── package.json              # Dependencies & npm scripts
├── tsconfig.json             # TypeScript compiler config
├── tsconfig.build.json       # Build-only TS config (exclude tests/fixtures)
├── scripts/                  # Build/package helper scripts
│   ├── copy-dist-assets.cjs  # Copy runtime assets into dist
│   └── prune-dist-maps.cjs   # Remove sourcemaps before packing
├── vitest.config.ts          # Vitest test runner config
├── task2.md                  # V2EX page structure analysis doc
├── vitest-env.d.ts           # Vitest global type declarations
├── docs/                     # Documentation & Specifications
│   ├── prompt.md             # AI system prompt template (copy)
│   ├── data-lifecycle.md     # Source-data retention, cleanup, and recovery
│   ├── ai-conversations.md   # Provider session persistence and history behavior
│   ├── codex-app-server-integration.md # Codex local-provider architecture
│   ├── analyzer-output/      # [Analyzer -> AI] Input data schema
│   │   ├── output-schema.md      # Field-level specification
│   │   └── output-types.ts      # Reference type definitions
│   └── ai-result/            # [AI -> User] Analysis result schema
│       ├── result-schema.md      # Field-level specification
│       └── result-types.ts      # Final result type definition
├── src/
│   ├── cli/                  # [Complete] Command-line interface
│   │   ├── index.ts          # CLI entry point (commander setup)
│   │   ├── types.ts          # CLI option types (CommandOptions suffix)
│   │   ├── utils.ts          # CLI shared utilities (events/progress logs)
│   │   ├── utils/            # CLI utility submodules
│   │   │   └── error.ts      # Shared error detail extraction
│   │   ├── commands/         # Command handlers
│   │       ├── index.ts      # Re-exports commands
│   │       ├── fetch.ts      # runFetch: Fetch user data
│   │       ├── analyze.ts    # runAnalyze: Process raw data
│   │       ├── ai.ts         # runAi: AI profiling
│   │       ├── show.ts       # runShow: Format and display report
│   │       ├── config.ts     # Config management (show/set/reset/proxy)
│   │       └── run.ts        # runPipeline: Main command entry
│   │   ├── workflow/         # Workflow orchestration
│   │   │   ├── types.ts      # StepRunResult, WorkflowStep, RunOutcome
│   │   │   ├── state.ts      # detectWorkflowState, buildExecutionPlan
│   │   │   ├── recovery.ts   # ReasonCode -> RecoveryAction mapping
│   │   │   ├── notices.ts    # Structured user-notice rendering
│   │   │   ├── data-retention-notices.ts # Cleanup notice builders
│   │   │   ├── result-state-notices.ts # Stale and partial result warnings
│   │   │   └── orchestrator.ts # runWorkflow: Step dispatch & state machine
│   │
│   ├── config/               # [Shared] Configuration management
│   │   ├── index.ts          # Public exports
│   │   ├── types/            # Modular config type definitions
│   │   │   ├── index.ts          # Re-exports all types + V2erConfig
│   │   │   ├── ai.ts             # Provider IDs and provider-specific settings
│   │   │   ├── fetch.ts          # FetchConfig
│   │   │   ├── analyzer.ts       # AnalyzerConfig
│   │   │   ├── data.ts           # DataConfig
│   │   │   └── log.ts            # LogConfig
│   │   ├── ai.ts             # Gemini config resolution and legacy fallback
│   │   ├── defaults.ts       # DEFAULT_CONFIG + ResolvedConfig type
│   │   ├── path.ts           # Config dir/file path (~/.v2er-insight/)
│   │   ├── storage.ts        # Read/write/merge config (deepMerge)
│   │   └── proxy.ts          # Proxy URL resolution + native fetch proxy init
│   │
│   ├── core/                 # [Domain Layer] Business logic
│   │   ├── v2ex/             # [Complete] V2EX domain logic
│   │   │   ├── index.ts      # Public API exports (types, urls, parsers)
│   │   │   ├── types/        # Type definitions
│   │   │   │   ├── index.ts      # Re-exports all types
│   │   │   │   ├── entities.ts   # V2exReply, V2exTopicDetail
│   │   │   │   └── parse-result.ts # Page parse result types
│   │   │   ├── urls/         # URL generators
│   │   │   ├── parsers/      # HTML parsers (using Cheerio)
│   │   │   │   ├── __tests__/        # Parser unit tests
│   │   │   │   ├── selectors/        # DOM selectors
│   │   │   │   ├── utils/            # Shared utilities
│   │   │   │   └── index.ts
│   │   │   └── use-cases/    # [Complete] Use case layer (orchestration)
│   │   │       ├── index.ts      # Public API exports
│   │   │       ├── types.ts      # ServiceOptions, PagedResult types
│   │   │       ├── user/         # User-related use cases
│   │   │       │   ├── profile.ts    # User profile fetcher
│   │   │       │   ├── replies.ts    # User replies fetcher (paginated)
│   │   │       │   ├── topic-urls.ts # User topic URLs fetcher (paginated)
│   │   │       │   └── topics-detail.ts # User topics content fetcher
│   │   │       └── utils/        # Shared utilities
│   │   │           └── page-orchestrator.ts # Generic pagination logic
│   │   │
│   │   ├── snapshot/         # [Complete] Versioned raw snapshot contract
│   │   │   ├── index.ts          # Public API exports
│   │   │   ├── types.ts          # RawSnapshotV2 and collection types
│   │   │   ├── builder.ts        # Fetch result to snapshot builder
│   │   │   ├── reply-time.ts     # V2EX reply time normalization
│   │   │   └── __tests__/        # Snapshot contract tests
│   │   │
│   │   ├── analyzer/         # [Complete] Data analysis for AI input
│   │   │   ├── index.ts          # Public Analyzer APIs
│   │   │   ├── builder.ts        # Snapshot and internal output builders
│   │   │   ├── validator.ts      # Persisted AnalyzerOutput V2 validation
│   │   │   ├── adapters/         # Raw snapshot to Analyzer input mapping
│   │   │   ├── types/            # Type definitions
│   │   │   ├── utils/            # Utility functions (date-parser, stats)
│   │   │   ├── periods/          # Active period detection
│   │   │   ├── stats/            # Statistics calculation
│   │   │   └── content/          # Content processing
│   │
│   │   ├── provenance/       # [Domain] Canonical hashing and provenance identities
│   │   │   ├── index.ts          # Public provenance exports
│   │   │   ├── canonical-json.ts # Recursive key ordering and SHA-256 hashing
│   │   │   ├── semantic-hash.ts  # Raw Snapshot semantic identity
│   │   │   ├── analysis-hash.ts  # Analysis config, fingerprint, and payload hashes
│   │   │   ├── provider-state-key.ts # Stable provider delivery target identity
│   │   │   ├── ai-delivery.ts    # Analyzed verification and delivery state transitions
│   │   │   ├── state-types.ts     # AnalysisStateV1 migration and V2 durable contracts
│   │   │   ├── state-validator.ts # Runtime state boundary validation
│   │   │   ├── state-transitions.ts # Pure raw/analyzed provenance transitions
│   │   │   └── __tests__/        # Canonicalization and hash contract tests
│   │   │
│   │   ├── result-version/    # [Domain] Saved AI result version contracts
│   │   │   ├── index.ts          # Public result-version exports
│   │   │   ├── types.ts          # Version metadata, envelope, and index types
│   │   │   ├── identifiers.ts    # Canonical version and delivery identifiers
│   │   │   ├── validator.ts      # Metadata, envelope, and index validation
│   │   │   └── __tests__/        # Identifier and validator contract tests
│   │   │
│   │   └── ai/              # [Complete] AI integration module
│   │       ├── index.ts         # Public API exports
│   │       ├── config.ts        # AI model constants
│   │       ├── result-validator.ts # Persisted AIAnalysisResult validation
│   │       ├── types/           # Type definitions
│   │       │   ├── index.ts         # Re-exports all types
│   │       │   ├── options.ts       # AIAnalysisInput, AnalysisOptions
│   │       │   ├── result.ts        # AIAnalysisResult
│   │       │   └── provider.ts      # IAIProvider interface
│   │       ├── prompt/          # System prompt & message builder
│   │       │   ├── index.ts         # buildAnalysisRequest()
│   │       │   └── system-prompt.md # AI system prompt template
│   │       ├── providers/       # AI provider adapters
│   │       │   ├── index.ts         # Re-exports providers
│   │       │   ├── gemini.ts        # Google Gemini provider
│   │       │   └── codex/           # Codex model resolution and provider components
│   │       ├── sessions/        # Durable provider-session contracts
│   │       │   ├── __tests__/       # Session identifier, summary, and validator tests
│   │       │   ├── identifiers.ts   # Canonical local session ID validation
│   │       │   ├── index.ts         # Public session contract exports
│   │       │   ├── summary.ts       # Provider state to index summary projection
│   │       │   ├── types.ts         # Session index and provider state types
│   │       │   └── validator.ts     # Cross-session and history validation
│   │       ├── parser/          # Response parsing & validation
│   │       │   ├── index.ts         # parseResponse()
│   │       │   └── validator.ts     # Lenient response validator
│   │       └── utils/           # Shared utilities
│   │           ├── index.ts         # Re-exports utilities
│   │           ├── api-key.ts       # API key resolution
│   │           └── retry.ts         # Retry with exponential backoff
│   │
│   └── infra/                # [Infrastructure Layer] External adapters
│       ├── codex/            # Local Codex integration infrastructure
│       │   ├── index.ts      # Public API exports
│       │   ├── app-server/   # JSONL protocol, request client, and owned process lifecycle
│       │   └── executable/   # CLI discovery, signature trust, probing, and launch
│       ├── fetcher/          # [Complete] Generic HTTP fetcher
│       │   ├── index.ts      # Public API exports
│       │   ├── fetcher.ts    # SequentialStrategy & Fetcher class (transport retry)
│       │   ├── types.ts      # FetchOptions, FetchResult, FetchEvents
│       │   ├── retryable.ts  # isRetryable() + parseRetryAfter()
│       │   └── agent.ts      # Proxy agent creation
│       ├── retry/            # [Complete] Generic retry utility
│       │   ├── index.ts      # Public API exports
│       │   ├── retry.ts      # withRetry() — exponential backoff + jitter
│       │   └── types.ts      # RetryOptions (maxRetries, baseDelay, maxDelay, onRetry)
│       ├── storage/          # [Complete] User data persistence
│       │   ├── index.ts      # Public API exports
│       │   ├── types.ts      # DataFileType, WriteOptions
│       │   ├── paths.ts      # Shared data root and user file path resolution
│       │   ├── reader.ts     # JSON file reading
│       │   ├── writer.ts     # Atomic JSON replacement and compensating rollback
│       │   ├── analysis-state.ts # Validated sidecar reads and protected updates
│       │   ├── result-version-paths.ts # Saved result directory and file paths
│       │   ├── result-version-files.ts # Validated index and immutable version files
│       │   ├── result-version-lock.ts # Per-user result version write serialization
│       │   ├── save-result-version.ts # Idempotent result save and recovery
│       │   ├── sessions/        # AI session paths and validated atomic files
│       │   └── cleaner.ts    # Expired data cleanup
│       └── logger/           # [Complete] Global logger
│           ├── index.ts      # Public API exports
│           ├── colors.ts     # Shared ANSI color constants
│           └── logger.ts     # Level-based logging (error/warn/info/debug)
```

## Modules

### 1. Fetcher Module (Complete)

- **Role**: Pure HTTP fetching with automatic transport-level retry.
- **Design**: Strategy Pattern (`IFetchStrategy`).
- **Implementation**: `SequentialStrategy` (rate-limit safe).
- **Events**: `onStart`, `onSuccess`, `onError`, `onRetry` callbacks.
- **Retry**: Exponential backoff for network errors, 5xx, and 429 (respects `Retry-After` header). 4xx errors are not retried.
- **Config**: `maxRetries` (default 3), `baseDelay` (1000ms), `maxDelay` (8000ms) via `FetchConfig`.

### 2. V2EX Module (Complete)

- **Role**: V2EX-specific business logic.

**Types** (`types/`):

- `V2exReply`: Reply data with nullable `topicId` and `topicReplyCount` parsed from the source topic link
- `V2exTopicDetail`: Topic detail with stable `topicId` and canonical `sourceUrl`
- `*ParseResult`: Page parse results with pagination and explicit topic visibility/identity diagnostics

**URL Generators** (`urls/`):

- `getUserProfileUrl(username)` → User profile page
- `getUserRepliesUrl(username, page?)` → User replies list
- `getUserTopicsUrl(username, page?)` → User topics list
- `getTopicUrl(topicIdOrPath)` → Single topic page (supports ID or path; throws on invalid)
- `extractTopicIdFromPath(path)` → Stable topic ID from a relative or absolute topic URL
- `extractTopicReplyCountFromPath(path)` → Current topic reply count encoded by a `#replyN` anchor

**Parsers** (`parsers/`):

- `parseUserProfile(html)` → Daily ranking, join date
- `parseRepliesPage(html)` → Replies list, pagination
- `parseTopicsListPage(html)` → Topic URLs, hidden detection
- `parseTopicDetail(html)` → Topic content, stats

**Implementation Specifics**:

- **Parsers Breakdown**:
  - `src/core/v2ex/parsers/replies-page.ts`: Handles nested reply content (traverses `.inner` wrappers).
  - Member reply entries for the same topic can share one `#replyN` anchor; the anchor value is topic reply-count metadata.
  - `src/core/v2ex/parsers/topics-list-page.ts`: Deduplicates links by topic ID and reports invalid identity counts.
  - `src/core/v2ex/parsers/utils/pagination.ts`: Robust pagination parser using `.first()` to handle dual pagination bars.
- **Date Handling**:
  - `src/core/snapshot/reply-time.ts`: Normalizes relative and Chinese calendar reply times against one snapshot `capturedAt` in the V2EX `+08:00` timezone.
  - `src/core/analyzer/utils/date-parser.ts`: Parses absolute topic timestamps; reply statistics consume normalized snapshot occurrences.
  - `src/core/analyzer/utils/stats.ts`: Implements `weekdayDistribution` returning full 7-day stats (sorted by frequency).

### 3. Use Case Layer (Complete)

- **Role**: Orchestration layer combining Fetcher + Parsers with auto-pagination (formerly Service Layer).

**Shared Types** (`types.ts`):

- `ServiceOptions`: timeout, headers, event callbacks
- `PagedResult<T>`: data, totalPages, fetchedPages, failedPages

**User Use Cases** (`user/`):

- `getUserProfile(username, options?)` → User profile or null
- `getAllUserReplies(username, options?)` → `UserRepliesResult` with nullable declared total and invalid topic metadata count
- `getAllUserTopicUrls(username, options?)` → Full URLs, hidden state, invalid identities, and hidden-state discard count
- `getAllUserTopicsDetail(username, options?)` → Identified topic contents with page and identity completeness metadata

A hidden signal from any fetched list page clears topic URLs collected from earlier pages. Discarded URLs contribute to failed topics; `invalidTopicCount` remains the stable-identity parse-failure count.

**Utils** (`utils/`):

- `fetchPagedData()` → Generic pagination orchestrator (probe + batch)
  - First page events use `total=-1` (unknown until parsed)
  - Triggers `onError` callback for both fetch and parse failures
  - Second-pass retry: collects failed pages and retries once after first round

### 4. Raw Snapshot Module (Complete)

- **Role**: Versioned boundary between V2EX fetch results and persisted analysis input.
- **Location**: `src/core/snapshot/`

**Public API**:

- `buildRawSnapshot(input)` → Returns `RawSnapshotV2`
- `isRawSnapshotV2(value)` → Validates parsed raw JSON and narrows it to `RawSnapshotV2`
- `RAW_SNAPSHOT_SCHEMA_VERSION` → Literal schema version `2`

**Data Contract**:

- Snapshot root: `username`, one ISO `capturedAt`, and profile data.
- Collection states: `complete`, `partial`, and `not_requested` for topics and replies.
- Collection diagnostics: expected, fetched, failed, failed-page, identity-failure, and duplicate-conflict counts.
- Count invariant: `failedCount >= identityFailureCount`.
- Declared/fetched count mismatch: `partial`, with the absolute reply-count difference in `failedCount`.
- Topic visibility: explicit state independent of collection size.
- Stable topic identity deduplication: fixed-field selection key independent of input order.
- Conflicting duplicate topic identities: `partial`, with each affected identity counted once.
- Member reply entries: distinct records whose shared topic anchors carry topic-level metadata.
- Deterministic ordering: topics by numeric topic ID; replies by nullable numeric topic ID and fixed semantic fields.
- Incomplete reply metadata: retained records and `partial` collection status through failure diagnostics.
- Reply `duplicateConflictCount`: `0`; reply records retain source multiplicity.
- Storage boundary validation: schema, topic identities, reply metadata, collection invariants, and unique topic IDs.
- Reply time: original display value plus normalized supported relative and Chinese calendar values against the shared `capturedAt`.
- Normalized reply time precision: `minute`, `hour`, or `day`; unsupported or invalid values use `null` with `unknown`.
- Calendar timezone: V2EX `+08:00`, independent of the runtime machine timezone.

**Provenance Hashing** (`src/core/provenance/`):

- `canonicalJsonStringify(value)` → Plain JSON serialization with recursively sorted object keys.
- `computeSemanticDataHash(snapshot)` → SHA-256 identity of stable Snapshot facts.
- Semantic hash inputs: topic identities, reply semantic facts with source multiplicity, content, interaction counts, visibility, and collection completeness diagnostics.
- Reply semantic sort keys are computed once before deterministic ordering.
- Transient fields outside semantic identity: capture time, daily ranking, item order, reply display time, and normalized reply-time drift.
- `computeAnalysisConfigHash(config)` → Identity of inactivity and TopN settings; content chunk limits remain operational settings.
- `computeAnalysisFingerprint(input)` → Combined semantic data identity, Analyzer schema version, and semantic configuration identity.
- `computePayloadHash(output)` → Complete Analyzer output identity for provenance and turn diagnostics.
- `computeProviderStateKey(input)` → Delivery-state identity across provider, model, system prompt, thinking level, and logical session.
- `checkAnalyzedProvenance(state, output, config)` → Validation of raw identity, Analyzer schema, semantic configuration, payload identity, and capture quality before delivery.
- `hasProviderReceivedAnalysis(state, providerKey, fingerprint)` → Provider-target duplicate detection.
- `prepareResultDelivery(state, target)` → Stable UUID preparation and reuse before provider access; a different target can replace only an uncommitted pending delivery.
- `matchesResultDeliveryTarget(pending, target)` → Reuse check across provider key, analyzed hashes, capture quality, and delivery mode.
- `matchesPendingResultDelivery(metadata, pending)` → Delivery, provider, analyzed input, mode, version, and capture-quality association check.
- `recordSavedResultVersion(state, metadata)` → Pending delivery and current-result association with one matching immutable version.
- `completeResultDelivery(state, deliveryId)` → Provider hash advancement and pending-state removal only with a matching non-null saved version association.
- `AnalysisStateV2` → Raw identity, analyzed identity, current-result version association, pending result delivery, and provider delivery hashes.
- `currentResult.resultVersionId` → Canonical saved result ID or `null` for a migrated current result without an established association.
- `pendingResultDelivery` → Stable delivery ID, canonical Gemini/Codex provider key, analyzed hashes, capture quality, delivery mode, and nullable committed result version.
- `AnalysisStateV1` → Legacy read contract accepted only for deterministic migration.
- `migrateAnalysisStateV1(state)` → In-memory v2 state without an invented result version ID or pending delivery.
- `isAnalysisStateV1(value)` and `isAnalysisStateV2(value)` → Schema-specific validation before workflow access.
- `recordRawProvenance(state, snapshot)` → Semantic identity, partial-capture status, and current-result freshness relative to the analyzed source.
- `recordAnalyzedProvenance(state, snapshot, output, config)` → Analyzer hashes and result freshness by analysis-fingerprint equality.
- Unsupported, non-finite, non-plain, and circular canonical inputs produce explicit errors.

### 5. CLI Module (Complete)

- **Role**: Command-line interface for user interaction and analysis pipeline.
- **Entry**: `src/cli/index.ts` (Subcommand architecture).

**Commands**:

- `v2er <username>` → One-click pipeline (fetch → analyze → ai → show)
- `v2er fetch <username>` → Fetch and save Raw Snapshot V2 with collection diagnostics (raw.json)
- `v2er analyze <username>` → Validate Raw Snapshot V2 and generate statistics (analyzed.json)
- `v2er ai <username>` → Generate a user profile and save `result.json` plus an immutable result version
- `v2er show <username>` → Structure display of results (OCEAN bars, risk icons)
- `v2er session check [username] [--provider gemini|codex]` → Run read-only provider diagnostics
- `v2er config show [group]` → View config (with apiKey masking)
- `v2er config set <path> <value>` → Set config via dot-path (e.g. `ai.model`)
- `v2er config reset [group]` → Reset to defaults
- `v2er config proxy <url>` → Manage proxy settings

**Main Command Options** (`v2er <username>`):

- `--force` → Force re-fetch from scratch
- `--provider <provider>` → Select `gemini` or `codex`
- `--model [name]` → Specify the selected provider model (optional value)
- `--thinking-level [level]` → Specify Gemini thinking level (optional value)
- `--reasoning-effort <effort>` → Specify Codex reasoning effort
- `--new-thread` → Create a new session generation for the selected provider
- `--codex-project <path>` → Specify the Project path for a new Codex thread
- `--resend` → Force resend complete analyzed data
- `-v, --verbose` → Show debug output

The `ai` subcommand accepts `--provider`, `--model`, `--thinking-level`,
`--reasoning-effort`, `--new-thread`, `--codex-project`, `--resend`, and `--verbose`.

**Shared Logic** (`utils.ts` and `utils/error.ts`):

- `createFetchEvents(label)`: Centralized progress/error reporting for fetch/ai operations.
- `logFetchError(result)`: Unified error formatting with indentation alignment.
- `extractErrorDetails(error)`: Normalizes error message/raw detail extraction for CLI command and workflow error paths.

**User Notices** (`workflow/notices.ts` and `workflow/types.ts`):

- `UserNotice` carries a stable `NoticeCode`, severity, impact details, recovery actions, and an optional documentation path.
- `StepRunResult.notices` keeps non-fatal effects separate from failure `ReasonCode` values.
- `renderNotice()` and `renderNotices()` render stable notice codes and recovery details through stderr diagnostics.
- Current notice codes are `DATA_RETENTION_ENABLED`, `DATA_FILES_CLEANED`, `DATA_RESULT_STALE`, and `DATA_SNAPSHOT_PARTIAL`.
- Config changes and `config show data` emit `DATA_RETENTION_ENABLED` only while cleanup is enabled.
- Successful AI cleanup emits `DATA_FILES_CLEANED` only when source files were actually removed; subcommands and pipelines render the returned notice once.

**Fetch Provenance**:

- Cache-hit fetch results leave provenance unchanged.
- Invalid or unreadable `analysis-state.json` produces a state-validation failure before network access.
- Atomic `raw.json` persistence precedes semantic hash and capture-status recording in `analysis-state.json`.
- Raw persistence followed by a sidecar update failure returns `PROVENANCE_UPDATE_FAILED`.

**Analyze Provenance**:

- Raw Snapshot V2 files missing raw provenance are classified as legacy analysis input.
- Semantic hash and capture status are recomputed before analysis; mismatches produce provenance failure before `analyzed.json` persistence.
- Atomic `analyzed.json` persistence precedes config hash, analysis fingerprint, and payload hash recording.
- The protected state update rechecks raw provenance against the persisted source state.
- Current-result freshness equals analysis-fingerprint equality with the newly recorded Analyzer fingerprint.

**AI Delivery Provenance**:

- Persisted `AnalyzerOutput V2` validation covers raw, schema, config, fingerprint, payload, and capture-quality provenance before provider access.
- Gemini delivery identity consists of provider, model, system prompt, thinking level, and the default logical session.
- Unchanged delivery reuse requires the same target fingerprint and a fresh `result.json` that satisfies the complete `AIAnalysisResult` contract.
- `--resend` bypasses reuse and records `currentResult.deliveryMode = 'resend'`.
- Partial-capture analysis produces a warning for provider delivery and unchanged-result reuse.
- Gemini calls `ensureCodexSessionRegistry()` while `runAi()` holds the per-user execution lock and before session selection, result reuse, credential access, or provider access.
- Shared session-store initialization validates an existing store, migrates a valid legacy `codex-sessions.json` into Codex provider files and the shared index, or creates an empty shared index.
- After credential resolution, Gemini persists pending delivery before SDK Chat creation and AnalyzerOutput delivery.
- Gemini provider and parse failures retain the uncommitted pending delivery; a retry to the same target reuses its delivery ID.
- Analyzed provenance is revalidated immediately before Gemini result-version persistence.
- Successful Gemini output enters `saveResultVersion()` with actual model, thinking level, prompt hash, capture quality, warning count, and application version.
- Gemini records the saved version on pending/current state, appends the successful input/result pair to its provider session, publishes the session index, then advances provider hashes and clears pending state.
- Gemini result-write failures preserve the uncommitted pending delivery; post-save state or session failures preserve the immutable version for delivery-ID recovery without another provider request.
- Codex mirrors the App Server delivery ID into `analysis-state.json` after a parsed result and before result-version persistence.
- Successful Codex output enters `saveResultVersion()` with actual model, reasoning effort, local session ID, external thread ID, thread name, prompt hash, capture quality, and application version.
- Codex records the saved version on pending/current state, completes the accepted session turn, associates the version and analysis fingerprint with the provider file, publishes the shared index, then advances provider hashes and clears pending state.
- Saved Codex delivery recovery compares the pending identity with the owning session. A matching accepted turn reuses the saved result; a completed session advances provider provenance without another model request.
- An unresolved Codex delivery blocks Gemini execution and remains under the per-user Codex lock until session reconciliation.
- `runShow()` accepts complete `AIAnalysisResult` values and derives stale and partial notices from valid current-result provenance.
- Legacy results with absent sidecars retain unknown provenance; structurally invalid results produce `SHOW_RESULT_INVALID`.
- stdout carries JSON report content; stderr carries command and workflow notices.

### 6. Config Module (Complete)

- **Role**: Persistent configuration management.
- **Config path**: `~/.v2er-insight/config.json`

**Structure**:

- `types/` → Modular config types (AIConfig, FetchConfig, AnalyzerConfig, DataConfig, LogConfig)
- `AIConfig` → `gemini` and `codex` provider namespaces selected by the `gemini | codex` provider ID; legacy flat Gemini fields remain readable
- Codex default selectors use `app-default` for the App Server default model and `model-default` for that model's declared default reasoning effort
- `resolveGeminiConfig()` → Provider-specific Gemini values, legacy flat values, then current Gemini defaults; `runAi()` and API Key resolution share this order
- `resolveCodexConfig()` → Codex-only process, project, model, effort, and timeout settings; legacy Gemini fields are excluded
- Codex lifecycle defaults: 10-second startup/request timeout, 10-minute turn timeout, and 2-second shutdown grace
- `defaults.ts` → `DEFAULT_CONFIG` with all module defaults; `ResolvedConfig` utility type
- `path.ts` → Config dir/file path resolution (`~/.v2er-insight/`)
- `storage.ts` → Read/write config, `getConfig()` merges defaults with user settings via `deepMerge`
- `proxy.ts` → Get proxy URL (priority: config > HTTPS_PROXY > HTTP_PROXY)

**CLI Config Paths** (`CONFIG_PATHS` in `config.ts`):

| Path                            | Type    | Meaning                                                                   |
| ------------------------------- | ------- | ------------------------------------------------------------------------- |
| `proxy`                         | string  | Fetcher, Gemini, and Codex App Server proxy URL                           |
| `ai.provider`                   | enum    | Active provider: `gemini` / `codex`; default `gemini`                     |
| `ai.gemini.apiKey`              | string  | Gemini API credential; masked in config output                            |
| `ai.gemini.model`               | string  | Gemini model name; default `gemini-3.1-pro-preview`                       |
| `ai.gemini.thinkingLevel`       | enum    | `minimal` / `low` / `medium` / `high`; default `high`                     |
| `ai.gemini.timeout`             | number  | Gemini request timeout in milliseconds; default `60_000`                  |
| `ai.codex.executable`           | string  | Explicit ordinary CLI path; trusted native CLI discovery when absent      |
| `ai.codex.projectPath`          | string  | Project directory for new threads; shared data root when absent           |
| `ai.codex.model`                | string  | App Server `model` field; default `app-default`                           |
| `ai.codex.reasoningEffort`      | string  | Codex model reasoning effort; default `model-default`                     |
| `ai.codex.startupTimeout`       | number  | CLI probe, App Server startup, and ordinary RPC timeout; default `10_000` |
| `ai.codex.turnTimeout`          | number  | Turn completion timeout in milliseconds; default `600_000`                |
| `ai.codex.shutdownGrace`        | number  | Owned App Server shutdown grace in milliseconds; default `2_000`          |
| `ai.apiKey`                     | string  | Legacy fallback for `ai.gemini.apiKey`; masked in config output           |
| `ai.model`                      | string  | Legacy fallback for `ai.gemini.model`                                     |
| `ai.thinkingLevel`              | enum    | Legacy fallback for `ai.gemini.thinkingLevel`                             |
| `ai.timeout`                    | number  | Legacy fallback for `ai.gemini.timeout`                                   |
| `ai.maxRetries`                 | number  | Gemini request retry count; default `3`                                   |
| `ai.baseDelay`                  | number  | Gemini retry base delay in milliseconds; default `1_000`                  |
| `ai.maxDelay`                   | number  | Gemini retry delay cap in milliseconds; default `10_000`                  |
| `fetch.timeout`                 | number  | HTTP request timeout in milliseconds; default `30_000`                    |
| `fetch.maxRetries`              | number  | HTTP transport retry count; default `3`                                   |
| `fetch.baseDelay`               | number  | HTTP retry base delay in milliseconds; default `1_000`                    |
| `fetch.maxDelay`                | number  | HTTP retry delay cap in milliseconds; default `8_000`                     |
| `analyzer.inactivityThreshold`  | number  | Active-period split threshold in days; default `60`                       |
| `analyzer.chunkMaxTopics`       | number  | Topic limit per content chunk; default `20`                               |
| `analyzer.chunkMaxReplies`      | number  | Reply limit per content chunk; default `100`                              |
| `analyzer.nodeDistributionTopN` | number  | Node-distribution entry limit; default `3`                                |
| `data.keepRaw`                  | boolean | Permanent raw/analyzed retention; default `true`                          |
| `data.rawRetention`             | number  | Cleanup age in days when `data.keepRaw=false`; default `1`                |
| `log.level`                     | enum    | `error` / `warn` / `info` / `debug`; default `info`                       |

Provider and Gemini thinking enums use the exported runtime allowlists. Legacy and provider-specific Gemini API keys are masked by `config show` and config-set confirmation output.

Main and `ai` commands forward provider, model, Gemini thinking level, Codex reasoning effort, new-thread request, Codex Project override, and resend intent through the workflow boundary.

Provider option resolution validates the configured or CLI provider against `AI_PROVIDERS` before provider access. Gemini rejects Codex Project and reasoning-effort options; Codex rejects Gemini thinking-level options. Both providers accept `--new-thread`.

`v2er session check [username] [--provider gemini|codex]` uses the provider diagnostic RPC surface. Gemini output contains resolved model, thinking level, and API-key availability. Codex follows runtime priority for sequential candidate probing and retains candidate source, executable trust, version state, selected runtime/account metadata, the live visible model catalog, Project resolution, execution lock, registry summary, and one target thread summary when a user is supplied. Unvisited candidates retain a `not_checked` version state; model-configuration fallback reuses recorded version probes. Credential-store access remains inside the owned App Server.

Codex automatic launch is limited to signed Windows native candidates discovered from running Codex processes or the ChatGPT App bundle. The Authenticode signature must be valid and the publisher must match the OpenAI allowlist. PATH candidates remain diagnostic observations until configured through `ai.codex.executable`; an explicit path is user-authorized and still passes version, protocol, account, and model checks. Thread methods validate their responses during creation, resume, and delivery. An ordinary Codex CLI shares App login state and thread history only when both processes resolve the same `CODEX_HOME`.

Codex version and App Server processes inherit an allowlisted runtime environment from the v2er-insight parent process, covering Codex home, user/system/temp paths, locale, proxy, and certificate settings. The root `proxy` setting overrides HTTP and HTTPS proxy variables for App Server launches; version probes retain the inherited values. Native candidates exclude PATH; explicitly authorized command shims retain PATH and PATHEXT. `.cmd` launchers use a validated system command processor. API keys, access tokens, `NODE_OPTIONS`, `ComSpec`, and unrelated application variables remain outside the child environment. Proxy values may contain proxy credentials.

Codex thread config disables web search and stable execution, browser, app, plugin, hook, collaboration, skill-installation, and tool-discovery features on start and resume. An ephemeral thread discovers effective MCP server names with zero model turns. Persisted thread config disables each discovered server that exposes tools, and its MCP inventory contains zero tools before delivery. `runTurn()` subscribes to App Server item events before `turn/start`. Analysis-only item types enter result collection. Tool calls, other non-analysis actions, and unknown actions trigger `turn/interrupt` and `CodexUnexpectedTurnActionError` before analysis parsing and result persistence; immutable versions, `result.json`, result index, and delivery state remain unchanged. App Server reverse requests remain on the method-not-found boundary.

### 7. Analyzer Module (Complete)

- **Role**: Adapt validated raw snapshots into structured AI input (located in `src/core/analyzer`).

**Public API**:

- `buildAnalyzerOutputFromSnapshot(snapshot)` → Consumes normalized snapshot reply occurrences and returns `AnalyzerOutput`
- `isAnalyzerOutput(value)` → Validates persisted AnalyzerOutput V2 before provider use, including nullable replied-topic heat
- `ANALYZER_OUTPUT_SCHEMA_VERSION` → Literal Analyzer output version `2`
  - `userOverview` → User overview statistics
  - `summary` → All periods statistics summary
  - `contents` → Chunked content for AI consumption

**Sub-modules Hierarchy**:

- **Snapshot Adapter** (`adapters/snapshot.ts`): Maps versioned topic/reply fields and collection status into the Analyzer input model, converting canonical reply occurrence strings to `Date` values.
- **Content Processing** (`content/`):
  - `transformer.ts`: Converts raw V2EX entities to `ContentTopic`/`ContentReply`.
  - `chunker.ts`: Implements smart content splitting based on token/item counts.
- **Statistics** (`stats/`):
  - `user-overview.ts`: Aggregates global user metrics.
  - `topic-stats.ts`: Analyzes topic engagement and lifecycle.
  - `reply-stats.ts`: Calculates reply frequency, average replied-topic heat, node distribution, and full 7-day weekday distribution from normalized reply occurrences.
  - `utils/stats.ts`: Resolves TopN count ties by stable key and stores counts in a `Map`.
- **Period Detection** (`periods/`):
  - `detector.ts`: Identifies active periods based on 60-day inactivity threshold.
  - `splitter.ts`: Segments data into identified periods.

**Configuration** (`getConfig().analyzer`):

- `inactivityThreshold: 60` → Period split threshold
- `chunkMaxTopics: 20` → Max topics per chunk
- `chunkMaxReplies: 100` → Max replies per chunk
- `nodeDistributionTopN: 3` → Node distribution entry limit

**Overview Semantics**:

- `totalTopics`: `null` for hidden or unrequested topics.
- `totalReplies`: `null` for unrequested replies.
- `topicReplyRatio`: available for visible, requested topic and reply collections with at least one reply.
- `avgRepliedTopicHeat`: average of available topic reply-count metadata; `null` when a period has no valid samples.

**Data Quality Contract**:

- Every `AnalyzerOutput` contains `schemaVersion: 2` and `dataQuality`.
- `dataQuality` projects `capturedAt`, status, expected count, fetched count, and failed count from each snapshot collection.
- `complete`: complete captured fact set.
- `partial` and `not_requested`: missing record state unknown.

### 8. AI Module (Complete)

- **Role**: Define the shared analysis request/result contract and the Gemini API adapter. CLI provider execution also supports Codex through the local App Server.

**Public API** (`index.ts`):

- `analyzeUser(input, options?)` → `AIAnalysisResult`

**Sub-modules**:

- **Prompt** (`prompt/`):
  - `buildAnalysisRequest(input)` → Constructs the LF-normalized system prompt, its SHA-256 hash, and one compact AnalyzerOutput JSON payload.
  - `system-prompt.md` → Markdown-based system prompt template.
- **Result Schema** (`result-schema.ts`) → Closed structured-output schema for every `AIAnalysisResult` field; every object requires its declared properties and rejects additional properties.
- **Providers** (`providers/`):
  - `GeminiProvider` → Google Gemini API adapter with multi-turn chat support.
  - `GeminiProvider.createSession(systemPrompt, options?)` supports
    `SessionOptions` (`thinkingLevel`, `timeout`, and completed provider-neutral `history`).
  - Gemini history is supplied once through `chats.create()`; only the new turn uses `sendMessage()`.
- **Parser** (`parser/`):
  - `parseResponse(text)` → Extracts JSON from AI response (prioritizes ```json blocks).
  - `validateResponse(data)` → Lenient validator with deep merge, score clamping (0-100), and warnings.
- **Result Validation** (`result-validator.ts`): Complete persisted `AIAnalysisResult` shape, string-array, score-range, timeline, and risk-level validation.
- **Utils** (`utils/`):
  - `resolveApiKey()` → API key resolution (explicit > config > GOOGLE_API_KEY > GEMINI_API_KEY).
  - `withRetry(fn, options)` → Re-export from `infra/retry`.

**Analysis Data Contract**:

- `AnalysisRequest` contains the exact normalized system prompt used for delivery, its lowercase SHA-256 hash, and the AnalyzerOutput payload.
- `AnalysisRequest.payload` is the compact JSON serialization of `schemaVersion`, `dataQuality`, `userOverview`, `summary`, and all `contents` entries.
- `AI_ANALYSIS_RESULT_JSON_SCHEMA` preserves the persisted field names, OCEAN score range, and risk-level enum for structured provider output.
- `parseAIAnalysisResult()` accepts raw JSON only and requires the complete closed result contract; syntax, missing fields, invalid values, and additional fields fail without fallback data.
- `isAIAnalysisResult()` enforces exact keys at every object level as well as field value constraints.
- `result.json` stores the validated `AIAnalysisResult`.

**Saved Result Version Contract** (`src/core/result-version/`):

- `ResultVersionMetadata`, `StoredResultVersionV1`, and `ResultVersionIndexV1` define version metadata, stored result envelopes, and ordered index entries.
- `formatResultVersionId(sequence)` produces zero-padded identifiers such as `v000001`.
- `parseResultVersionId(versionId)` accepts canonical positive identifiers only.
- `createResultDeliveryId()` produces UUID v4 delivery identifiers.
- `isResultVersionMetadata(value)` enforces exact metadata keys and separates generated provenance from protected legacy or untracked results.
- `isStoredResultVersionV1(value)` requires a complete `AIAnalysisResult` and a matching canonical SHA-256 result hash.
- `isResultVersionIndexV1(value)` requires contiguous ordered sequences, a matching latest pointer, and unique non-null delivery IDs.
- Result-version path helpers resolve the per-user `results/` root, `versions/` directory, `index.json`, version file, and write lock.
- `getResultVersionFilePath(username, versionId)` rejects non-canonical version identifiers before path construction.
- Result-version file reads distinguish missing, invalid, and validated data.
- Index writes use same-directory private temporary files and atomic replacement.
- Immutable version writes publish through an exclusive hard link and reject an existing target.
- Candidate scans include canonical regular `vNNNNNN.json` files only and order them by numeric sequence.
- `withResultVersionLock(username, operation)` serializes synchronous writes for one user through a private `wx` lock.
- Lock release validates the persisted UUID token; ownership changes preserve the replacement lock and surface a release error.
- Existing valid or invalid locks fail immediately without waiting or automatic removal.
- `saveResultVersion(username, result, source)` validates every indexed envelope before changing current data.
- `recoverResultVersionDelivery(username, pending)` repairs an indexed or unindexed write from durable pending identity without the original result/source arguments.
- Existing current data without a saved version becomes `legacy`; externally changed current data becomes `untracked-current` before replacement.
- Generated writes use immutable version file, bare `result.json`, then index order.
- A repeated matching delivery ID returns its existing version; a missing current file is restored from that envelope.
- One valid unindexed candidate resumes only when its previous latest/current identities match; ambiguous, conflicting, corrupt, or divergent states remain unchanged.

**AI Session Contract** (`src/core/ai/sessions/`):

- `AISessionIndexV1` stores provider activity, session summaries, migration identity, and index update time.
- `BaseAISessionState` stores the local session identity, provider, generation, prompt and model identity, usage time, and nullable analysis-result association.
- `CodexSessionStateV1` preserves the complete recoverable Codex thread state and requires `externalThreadId` to match its thread ID.
- `GeminiSessionStateV1` stores one fixed system instruction and provider-neutral history containing paired user and model text messages.
- `prepareGeminiAnalysisSession()` selects a compatible active session or an unpersisted next generation.
- `completeGeminiAnalysisSession()` appends one deterministic user/model pair after result-version commit and publishes the active index last.
- `recoverGeminiAnalysisSession()` reconstructs or republishes session state from committed Gemini result metadata without another provider request.
- `isLocalSessionId(value)` accepts canonical UUID strings before file-path construction.
- Session validators require exact persisted keys, canonical timestamps and hashes, unique index identities, valid active-session references, paired Gemini roles, and all-or-null result association fields.

**Defaults** (from `config/defaults.ts`):

- Provider: `gemini`
- Gemini model: `gemini-3.1-pro-preview` (via resolved `ai.gemini.model`)
- Gemini ThinkingLevel: `high` (via resolved `ai.gemini.thinkingLevel`)
- Source data retention: `data.keepRaw = true`; explicit `false` enables `data.rawRetention`
- `maxRetries: 3`, `baseDelay: 1000`, `maxDelay: 10_000`
- `runAi` resolves thinking level by priority:
  - CLI explicit value (e.g. `--thinking-level high`)
  - `config.ai.thinkingLevel` (defaults to `high` when not explicitly unset)
  - `undefined` (only if the config field is explicitly removed by the user)
- Invalid thinking level fails fast with reason code
  `AI_INVALID_THINKING_LEVEL` and skips provider calls.

**CLI Provider Execution**:

- `runAi()` validates provider-specific options before credential and runtime access.
- Gemini execution resolves reuse, API credentials, durable pre-request delivery preparation, retry policy, response parsing, and delivery provenance in `cli/commands/ai/gemini.ts`.
- Codex execution states from `cli/commands/ai/codex.ts`: skipped, busy, or parsed result with delivery ID, local session ID, external thread ID, and thread name; no Gemini API key dependency.
- `inspectCodexResultDeliverySession()` → Exact pending-delivery comparison against the owning Codex session and `pending` or `completed` recovery status.
- `recoverCodexAnalysisSession()` → Pending-turn classification or idempotent Codex result association with provider-file-first index repair.
- Gemini and Codex save every successful result through `saveResultVersion()` and return `resultVersionId` in successful command metadata.
- Gemini recreates each SDK Chat from one fixed system instruction and the complete successful provider-neutral history; only the current AnalyzerOutput uses `sendMessage()`.
- Gemini session completion occurs after the immutable result version, current result, result index, and pending-version association are persisted. Recovery repairs a missing session or index publication from the committed version.
- Codex session completion occurs after the immutable version, `result.json`, result index, and pending-version association are persisted.
- Codex session completion failures preserve the saved version ID on pending analysis state for retry without another model request.
- Gemini and Codex analysis hold one per-user cross-process lock across session-store migration, provider execution, result/provenance persistence, session completion, and cleanup.
- Concurrent Codex commands return `AI_CODEX_BUSY`; concurrent Gemini commands return `SESSION_BUSY`.
- Gemini execution-lock, session persistence, and session-store corruption failures return `SESSION_PERSIST_FAILED`. Gemini legacy migration conflicts and migration-write failures return `SESSION_MIGRATION_CONFLICT` and `SESSION_MIGRATION_FAILED`.
- Codex session recovery or completion failures return `AI_CODEX_SESSION_UPDATE_FAILED`, except migration conflicts and migration-write failures retain `SESSION_MIGRATION_CONFLICT` and `SESSION_MIGRATION_FAILED`. Codex lock filesystem or ownership failures retain `AI_CODEX_LOCK_FAILED`.
- Typed Codex runtime, Project, protocol, timeout, thread, turn, output, and registry failures map to provider-specific reason codes and recovery actions at the CLI boundary. Unclassified errors retain the shared provider failure fallback.

### 9. Retry Module (Complete)

- **Role**: Generic retry utility with exponential backoff + jitter. Located in `src/infra/retry`.

**Public API**:

- `withRetry<T>(fn, options)` → Executes `fn` with automatic retry on failure

**RetryOptions**:

- `maxRetries: number` → Max retry attempts (0 = no retry)
- `baseDelay: number` → Initial delay in ms
- `maxDelay: number` → Delay cap in ms
- `onRetry?: (attempt, maxRetries, error, delay) => void` → Optional callback for logging

**Retry Strategy**:

- Delay formula: `min(baseDelay * 2^attempt, maxDelay) + 10% jitter`
- Negative `maxRetries` treated as 0
- Throws the last captured error when all retries are exhausted

**Integration Points**:

| Consumer            | Location                                   | Usage                                                      |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Fetcher (transport) | `infra/fetcher/fetcher.ts`                 | Inline retry loop per URL, own `onRetry` via `FetchEvents` |
| AI (request)        | `cli/commands/ai/gemini.ts`                | `withRetry()` wrapping `provider.sendMessage()`            |
| Use-Case (business) | `page-orchestrator.ts`, `topics-detail.ts` | Second-pass retry for failed pages/topics                  |

**CLI Logging**:

- Retry attempts logged at `warn` level (always visible)
- Error details logged at `debug` level (visible with `-v`)

### 10. Logger Module (Complete)

- **Role**: Global level-based logger for all layers. Located in `src/infra/logger`.

**Public API**:

- `logger.debug(msg)` → Only visible when level is `debug`
- `logger.info(msg)` → Normal output (default level)
- `logger.warn(msg)` → Warning with `[WARN]` label
- `logger.error(msg)` → Error with `[ERROR]` label
- `logger.setLevel(level)` → Set minimum log level
- `logger.getLevel()` → Get current level

**Design**:

- Zero external dependencies (ANSI escape codes for colors)
- Global singleton, set level once at program entry
- Level priority: `error > warn > info > debug`

### 11. Workflow Module (Complete)

- **Role**: One-click pipeline orchestration for `v2er <username>`. Located in `src/cli/workflow`.

**Public API** (`orchestrator.ts`):

- `runWorkflow(options)` → `RunOutcome` (overallStatus, exitCode, results)

**Sub-modules**:

- **Types** (`types.ts`): `StepRunResult`, `WorkflowStep`, `ReasonCode`, `RecoveryAction`, `RunOutcome`
- **State** (`state.ts`):
  - `detectWorkflowState(username)` → Checks `raw.json`/`analyzed.json`/`result.json` existence
  - `resolveEntryStep(state, force?)` → Determines which step to start from
  - `buildExecutionPlan(entryStep)` → Returns ordered step array via slice
- **Recovery** (`recovery.ts`): Maps `ReasonCode` → `RecoveryAction[]` with template rendering
  - Includes `AI_INVALID_THINKING_LEVEL` recovery guidance.
  - `AI_INVALID_PROVIDER_OPTIONS` identifies valid providers and each provider's CLI-only options.
- **Orchestrator** (`orchestrator.ts`):
  - Sequential step dispatch with `pipeline: true` flag
  - `failed` → immediate halt, `partial` → continue with exitCode=1
  - Unified failure output with recovery suggestions

### 12. Storage Module (Complete)

- **Role**: User data file persistence and lifecycle management. Located in `src/infra/storage`.

**Data Directory Structure**:

```text
~/.v2er-insight/data/{username}/
├── raw.json       # Raw data captured
├── analyzed.json   # Analyzer output
├── result.json     # AI analysis results
├── analysis-state.json # Durable provenance and provider delivery state
├── codex-sessions.json # Read-only legacy Codex migration source
├── results/
│   ├── index.json # Ordered result version metadata
│   ├── versions/ # Immutable vNNNNNN.json result envelopes
│   └── .write.lock # Per-user result version writer
├── sessions/
│   ├── index.json # Provider activity and session summaries
│   ├── codex/ # Provider-specific Codex session files
│   └── gemini/ # Provider-specific Gemini session files
└── .codex-execution.lock # Per-user AI analysis transaction owner
```

**Public API** (valid username pattern: `/^[a-zA-Z0-9_-]+$/`; other values throw Error):

- `getDataRootDir()` → Shared data root path
- `getUserDataDir(username)` → User data directory path
- `getDataFilePath(username, type)` → Specific data file path
- `getResultVersionsRootDir(username)` → Saved result directory path
- `getResultVersionFilesDir(username)` → Saved result version-file directory path
- `getResultVersionIndexPath(username)` → Saved result index path
- `getResultVersionFilePath(username, versionId)` → Canonical saved result file path
- `getResultVersionLockPath(username)` → Saved result write-lock path
- `readResultVersionIndex(username)` → Missing, invalid, or validated result version index
- `readStoredResultVersion(username, versionId)` → Missing, invalid, or validated immutable result version
- `listStoredResultVersionIds(username)` → Canonical regular version-file IDs in sequence order
- `writeResultVersionIndex(username, index)` → Validated atomic index replacement
- `writeStoredResultVersion(username, version)` → Validated immutable version publication without replacement
- `readResultVersionLock(username)` → Missing, invalid, or validated result version lock
- `withResultVersionLock(username, operation)` → Synchronous per-user write serialization with token-checked release
- `saveResultVersion(username, result, source)` → Idempotent result version save with current-result protection and candidate recovery
- `recoverResultVersionDelivery(username, pending)` → Pending-delivery recovery with result/current/index repair or an explicit missing state
- `getAISessionIndexPath(username)` → Per-user AI session index path
- `getAISessionFilePath(username, provider, localSessionId)` → Validated provider-session file path
- `readAISessionIndex(username)` → Missing, invalid, or validated AI session index
- `readAISessionState(username, provider, localSessionId)` → Missing, invalid, or identity-checked provider session
- `readAISessionStore(username)` → Validated index plus provider files with exact summary projection checks
- `writeAISessionIndex(username, index)` → Validated atomic session-index replacement
- `writeAISessionState(username, session)` → Validated atomic provider-session replacement
- `prepareGeminiAnalysisSession(options)` → Compatible active Gemini session or unpersisted next generation
- `completeGeminiAnalysisSession(options)` → Result-associated history append with provider-file-first publication
- `recoverGeminiAnalysisSession(options)` → Idempotent repair after result-version commit
- `recoverCodexAnalysisSession(options)` → Accepted-turn status and idempotent result association repair
- `ensureCodexSessionRegistry(username)` → Writable Codex registry projection with idempotent legacy migration; requires the caller to hold the per-user Codex execution lock
- `inspectCodexSessionStorage(username)` → Read-only new/legacy state and migration status with an unambiguous registry projection
- `updateCodexSessionRegistry(username, updater)` → Codex provider-file updates followed by session-index publication
- `readDataFile<T>(username, type)` → Read a registered data-file type (returns `null` on missing/invalid)
- `readDataFileResult(username, type)` → Single-read states where `ENOENT` is `missing` and parse or other read failures are `invalid`
- `writeDataFile(username, type, data, options?)` → Same-directory `0600` temporary write and atomic target replacement
- `readAnalysisState(username)` → Missing/invalid/valid distinctions with validated v1-to-v2 in-memory migration
- `updateAnalysisState(username, updater)` → Validated v2 update and atomic persistence; migrated v1 state writes only on update
- `readCodexThreadRegistry(username)` → Read-only legacy `codex-sessions.json` with missing/invalid/valid distinctions
- `readCodexExecutionLock(username)` → Missing, invalid, or validated owner state for the per-user Codex lock
- `withCodexExecutionLock(username, operation)` → `wx`-acquired `0600` cross-process lock with token-checked release
- `cleanExpiredData(username)` → Cleanup enablement, retention, deleted files, and typed skip diagnostics

**Cleanup Strategy**:

- `data.keepRaw = true` → Permanent raw/analyzed retention (default)
- `data.keepRaw = false` → Age-based cleanup after `data.rawRetention` days (default retention: 1)
- `result.json`, `analysis-state.json`, `codex-sessions.json`, `results/`, and `sessions/` → Permanent retention
- Codex writes to `sessions/`; a valid legacy registry migrates provider files before index publication and remains unchanged
- New and legacy stores require a matching migration source hash; missing or mismatched markers stop model execution
- `.codex-execution.lock` → AI analysis transaction lock shared by Gemini and Codex; abnormal termination retains owner metadata for diagnosis
- Cleanup diagnostics distinguish disabled retention, missing files, unexpired files, unavailable metadata, and deletion failures.
- `docs/data-lifecycle.md` documents user-facing retention effects and recovery commands.

### 13. Codex Local Provider

Detailed protocol and recovery reference: `docs/codex-app-server-integration.md`.

**Executable and Process Boundary**:

- **Location and discovery**: `src/infra/codex/executable` and `src/infra/codex/app-server`; explicit executable, running `codex.exe`, ChatGPT App bundle, PATH.
- **Windows boundary**: Read-only process query, case-insensitive path identity, native `shell: false`, fixed `.cmd` launcher arguments, validated system `cmd.exe` path.
- **Owned process lifecycle**: Pre-launch option validation, bounded stderr, constructor-failure cleanup, idempotent close, configured shutdown grace.
- **Account boundary**: Real `CODEX_HOME` credential-store access and automatic token refresh inside the owned App Server; `account/read(refreshToken: false)` for availability checks; account type and authentication availability in the v2er runtime projection.

**Protocol and Runtime Selection**:

- **JSONL boundary**: UTF-8 framing, monotonic request IDs, typed `unknown` decoding, deadlines, removable notification subscriptions; stable App Server methods only.
- **Model and MCP catalogs**: Maximum 100 pages, repeated-cursor rejection, exact model-field matching, server-declared reasoning efforts, and per-thread MCP server/tool names.
- **Dynamic defaults**: `app-default` from the unique live default model; `model-default` from that model's declared default effort.
- **Runtime acceptance**: Valid CLI version response, stable initialization, available account, valid model and effort.
- **Diagnostics**: Candidate attempts, live model catalog, Project state, registry consistency, thread and turn identifiers; the structured report excludes agent message text and credentials.

**Project and Thread Identity**:

- **Project identity**: CLI override, `ai.codex.projectPath`, shared data root; case-insensitive Windows comparison and case-sensitive non-Windows comparison.
- **Thread policy**: Persisted session, `serviceName: v2er-insight`, approval `never`, read-only sandbox, sandbox network access disabled, web search disabled, and stable execution features disabled; ordinary user prompt turn before the first complete AnalyzerOutput turn.
- **Tool boundary**: Ephemeral MCP discovery, thread-local server disables, persisted zero-MCP-tool verification, pre-turn event subscription, unexpected-action interruption, `runTurn()` rejection before result parsing and persistence, and method-not-found responses for server-to-client requests.
- **Identity and registry**: Thread ID recovery key, `<username>-insight` generation names, per-user session generations, accepted turn IDs, executable metadata, App Server instruction sources, pending delivery identity.

**Delivery and Recovery**:

- **Session choice and compatibility**: Explicit new generation, highest compatible pending generation, compatible active ready session; compatibility covers prompt hash, actual model, and Project path.
- **Delivery identity**: Stable delivery ID, provider key, analysis fingerprint, payload hash, capture-quality state, delivery mode, and reasoning effort.
- **Turn progression**: At most one external turn per advance; exhaustive prepared-action control flow; accepted turn ID persistence before completion wait.
- **Result boundary**: Completed terminal turn, final agent message selection, closed `AIAnalysisResult` parsing, immutable version and current-result persistence before session completion, provider-hash advancement after session completion.
- **Recovery boundary**: Exact thread and turn IDs, persisted pending identity, owning-session comparison for saved deliveries, saved-result reuse for accepted turns, busy state for active turns, explicit error for untracked acceptance.

## Proxy Configuration

**Fetcher and Gemini Priority Order**:

1. Config file (`~/.v2er-insight/config.json`)
2. Environment variable `HTTPS_PROXY`
3. Environment variable `HTTP_PROXY`

Codex App Server inherits the allowlisted `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY` values from the v2er-insight process. A configured `proxy` replaces the child HTTP and HTTPS values while retaining bypass, fallback, and certificate settings. POSIX children receive the corresponding lowercase HTTP and HTTPS aliases. Codex version probes use inherited values without the configured override.

If no proxy source is present, network clients use a direct connection.

**Technical Details**:

- **Fetcher (Axios)**: Uses `https-proxy-agent` to create `httpsAgent`; Axios built-in proxy disabled (`proxy: false`)
- **AI (native fetch)**: Uses `undici` `ProxyAgent` + `setGlobalDispatcher` to proxy `@google/genai` requests
- **Codex App Server**: Uses the bounded child environment with an optional configured proxy override
- Fetcher and Gemini share the same `getProxyUrl()` resolution logic
- `initFetchProxy()` is called once at CLI entry (`src/cli/index.ts`)
- Proxy URL format: `http://host:port` (e.g., `http://127.0.0.1:10808`)

**Security**:

- Config file uses `0600` permission (owner read/write only, Linux/Mac)
- Windows config permissions require manual verification
- Environment variables store proxy credentials

## Testing Strategy

- **Structure**: Co-located tests in `__tests__/` folders within each module.
- **Language**: All test descriptions, data, and assertions in English; comments may be Chinese.
- **Fixtures**: Anonymized HTML snapshots for parser tests.
- **Network Mocking**: `vi.mock` for Fetcher and parser modules.
- **Coverage**: 450+ tests covering parsers, URL generators, services, CLI, config, analyzer, AI, and retry.
