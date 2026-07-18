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
│   │   │   ├── ai.ts             # AIConfig, ThinkingLevel
│   │   │   ├── fetch.ts          # FetchConfig
│   │   │   ├── analyzer.ts       # AnalyzerConfig
│   │   │   ├── data.ts           # DataConfig
│   │   │   └── log.ts            # LogConfig
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
│   │   │   ├── state-types.ts     # AnalysisStateV1 durable state contract
│   │   │   ├── state-validator.ts # Runtime state boundary validation
│   │   │   ├── state-transitions.ts # Pure raw/analyzed provenance transitions
│   │   │   └── __tests__/        # Canonicalization and hash contract tests
│   │   │
│   │   └── ai/              # [Complete] AI integration module
│   │       ├── index.ts         # Public API exports
│   │       ├── config.ts        # AI model constants
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
│   │       │   └── gemini.ts        # Google Gemini provider
│   │       ├── parser/          # Response parsing & validation
│   │       │   ├── index.ts         # parseResponse()
│   │       │   └── validator.ts     # Lenient response validator
│   │       └── utils/           # Shared utilities
│   │           ├── index.ts         # Re-exports utilities
│   │           ├── api-key.ts       # API key resolution
│   │           └── retry.ts         # Retry with exponential backoff
│   │
│   └── infra/                # [Infrastructure Layer] External adapters
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
│       │   ├── paths.ts      # User data dir/file path resolution
│       │   ├── reader.ts     # JSON file reading
│       │   ├── writer.ts     # Atomic JSON replacement (auto-mkdir, 0600 temp file)
│       │   ├── analysis-state.ts # Validated sidecar reads and protected updates
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
- Transient fields outside semantic identity: capture time, daily ranking, item order, reply display time, and normalized reply-time drift.
- `computeAnalysisConfigHash(config)` → Identity of inactivity and TopN settings; content chunk limits remain operational settings.
- `computeAnalysisFingerprint(input)` → Combined semantic data identity, Analyzer schema version, and semantic configuration identity.
- `computePayloadHash(output)` → Complete Analyzer output identity for provenance and turn diagnostics.
- `computeProviderStateKey(input)` → Delivery-state identity across provider, model, system prompt, thinking level, and logical session.
- `checkAnalyzedProvenance(state, output, config)` → Validation of raw identity, Analyzer schema, semantic configuration, payload identity, and capture quality before delivery.
- `hasProviderReceivedAnalysis(state, providerKey, fingerprint)` → Provider-target duplicate detection.
- `recordProviderDelivery(state, input)` → Provider hashes and a fresh current result with `change` or `resend` delivery mode after result persistence.
- `AnalysisStateV1` → Raw identity, analyzed identity, current-result freshness, and provider delivery hashes.
- `isAnalysisStateV1(value)` → Parsed-state validation before workflow access to nested provenance fields.
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
- `v2er ai <username>` → Generate user profile via Gemini (result.json)
- `v2er show <username>` → Structure display of results (OCEAN bars, risk icons)
- `v2er config show [group]` → View config (with apiKey masking)
- `v2er config set <path> <value>` → Set config via dot-path (e.g. `ai.model`)
- `v2er config reset [group]` → Reset to defaults
- `v2er config proxy <url>` → Manage proxy settings

**Main Command Options** (`v2er <username>`):

- `--force` → Force re-fetch from scratch
- `--model [name]` → Specify AI model (optional value)
- `--thinking-level [level]` → Specify thinking level (optional value)
- `--resend` → Force resend complete analyzed data
- `-v, --verbose` → Show debug output

The `ai` subcommand also accepts `--model`, `--thinking-level`, and `--resend`.

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
- Unchanged delivery reuse requires the same target fingerprint and a matching fresh `result.json`.
- `--resend` bypasses reuse and records `currentResult.deliveryMode = 'resend'`.
- Partial-capture analysis produces a warning before provider delivery.
- `result.json` persistence precedes provider last-sent state updates; provider, parse, and result-write failures retain the previous delivery state.
- The protected state update rechecks analyzed provenance before intermediate-file cleanup.
- `runShow()` derives stale and partial notices from valid current-result provenance. Legacy results with absent sidecars remain displayable with unknown provenance.
- stdout carries JSON report content; stderr carries command and workflow notices.

### 6. Config Module (Complete)

- **Role**: Persistent configuration management.
- **Config path**: `~/.v2er-insight/config.json`

**Structure**:

- `types/` → Modular config types (AIConfig, FetchConfig, AnalyzerConfig, DataConfig, LogConfig)
- `defaults.ts` → `DEFAULT_CONFIG` with all module defaults; `ResolvedConfig` utility type
- `path.ts` → Config dir/file path resolution (`~/.v2er-insight/`)
- `storage.ts` → Read/write config, `getConfig()` merges defaults with user settings via `deepMerge`
- `proxy.ts` → Get proxy URL (priority: config > HTTPS_PROXY > HTTP_PROXY)

**CLI Config Paths** (`CONFIG_PATHS` in `config.ts`):

| Path                            | Type    | Notes                                 |
| ------------------------------- | ------- | ------------------------------------- |
| `proxy`                         | string  |                                       |
| `ai.provider`                   | enum    | `gemini`                              |
| `ai.apiKey`                     | string  |                                       |
| `ai.model`                      | string  |                                       |
| `ai.thinkingLevel`              | enum    | `minimal` / `low` / `medium` / `high` |
| `ai.timeout`                    | number  |                                       |
| `ai.maxRetries`                 | number  |                                       |
| `ai.baseDelay`                  | number  |                                       |
| `ai.maxDelay`                   | number  |                                       |
| `fetch.timeout`                 | number  |                                       |
| `fetch.maxRetries`              | number  |                                       |
| `fetch.baseDelay`               | number  |                                       |
| `fetch.maxDelay`                | number  |                                       |
| `analyzer.inactivityThreshold`  | number  |                                       |
| `analyzer.chunkMaxTopics`       | number  |                                       |
| `analyzer.chunkMaxReplies`      | number  |                                       |
| `analyzer.nodeDistributionTopN` | number  |                                       |
| `data.keepRaw`                  | boolean |                                       |
| `data.rawRetention`             | number  |                                       |
| `log.level`                     | enum    | `error` / `warn` / `info` / `debug`   |

### 7. Analyzer Module (Complete)

- **Role**: Adapt validated raw snapshots into structured AI input (located in `src/core/analyzer`).

**Public API**:

- `buildAnalyzerOutputFromSnapshot(snapshot)` → Consumes normalized snapshot reply occurrences and returns `AnalyzerOutput`
- `isAnalyzerOutput(value)` → Validates persisted AnalyzerOutput V2 before provider use
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

**Data Quality Contract**:

- Every `AnalyzerOutput` contains `schemaVersion: 2` and `dataQuality`.
- `dataQuality` projects `capturedAt`, status, expected count, fetched count, and failed count from each snapshot collection.
- `complete`: complete captured fact set.
- `partial` and `not_requested`: missing record state unknown.

### 8. AI Module (Complete)

- **Role**: Integrate with Google Gemini to generate deep user insights from analyzer output.

**Public API** (`index.ts`):

- `analyzeUser(input, options?)` → `AIAnalysisResult`

**Sub-modules**:

- **Prompt** (`prompt/`):
  - `buildAnalysisRequest(input)` → Constructs one compact AnalyzerOutput JSON payload with the system prompt.
  - `system-prompt.md` → Markdown-based system prompt template.
- **Providers** (`providers/`):
  - `GeminiProvider` → Google Gemini API adapter with multi-turn chat support.
  - `GeminiProvider.createSession(systemPrompt, options?)` supports
    `SessionOptions` (`thinkingLevel?: ThinkingLevel`).
- **Parser** (`parser/`):
  - `parseResponse(text)` → Extracts JSON from AI response (prioritizes ```json blocks).
  - `validateResponse(data)` → Lenient validator with deep merge, score clamping (0-100), and warnings.
- **Utils** (`utils/`):
  - `resolveApiKey()` → API key resolution (explicit > config > GOOGLE_API_KEY > GEMINI_API_KEY).
  - `withRetry(fn, options)` → Re-export from `infra/retry`.

**Analysis Data Contract**:

- `AnalysisRequest` contains the system prompt and the normalized AnalyzerOutput payload.
- `AnalysisRequest.payload` is the compact JSON serialization of `schemaVersion`, `dataQuality`, `userOverview`, `summary`, and all `contents` entries.
- `result.json` stores the validated `AIAnalysisResult`.

**Defaults** (from `config/defaults.ts`):

- Model: `gemini-3.1-pro-preview` (via `getConfig().ai.model`)
- ThinkingLevel: `high` (via `getConfig().ai.thinkingLevel`)
- Source data retention: `data.keepRaw = true`; explicit `false` enables `data.rawRetention`
- `maxRetries: 3`, `baseDelay: 1000`, `maxDelay: 10_000`
- `runAi` resolves thinking level by priority:
  - CLI explicit value (e.g. `--thinking-level high`)
  - `config.ai.thinkingLevel` (defaults to `high` when not explicitly unset)
  - `undefined` (only if the config field is explicitly removed by the user)
- Invalid thinking level fails fast with reason code
  `AI_INVALID_THINKING_LEVEL` and skips provider calls.

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
| AI (request)        | `cli/commands/ai.ts`                       | `withRetry()` wrapping `provider.sendMessage()`            |
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
└── analysis-state.json # Durable provenance and provider delivery state
```

**Public API** (valid username pattern: `/^[a-zA-Z0-9_-]+$/`; other values throw Error):

- `getUserDataDir(username)` → User data directory path
- `getDataFilePath(username, type)` → Specific data file path
- `readDataFile<T>(username, type)` → Read `raw`, `analyzed`, `result`, or `analysisState` JSON (returns `null` on missing/invalid)
- `readDataFileResult(username, type)` → Typed `missing`, `invalid`, and parsed-success states for every `DataFileType`
- `writeDataFile(username, type, data, options?)` → Same-directory `0600` temporary write and atomic target replacement
- `readAnalysisState(username)` → Validated `analysis-state.json` with missing/invalid/valid distinctions
- `updateAnalysisState(username, updater)` → Validated existing and updated state with atomic persistence
- `cleanExpiredData(username)` → Cleanup enablement, retention, deleted files, and typed skip diagnostics

**Cleanup Strategy**:

- `data.keepRaw = true` → Permanent raw/analyzed retention (default)
- `data.keepRaw = false` → Age-based cleanup after `data.rawRetention` days (default retention: 1)
- `result.json` and `analysis-state.json` → Permanent retention
- Cleanup diagnostics distinguish disabled retention, missing files, unexpired files, unavailable metadata, and deletion failures.
- `docs/data-lifecycle.md` documents user-facing retention effects and recovery commands.

## Proxy Configuration

**Priority Order**:

1. Config file (`~/.v2er-insight/config.json`)
2. Environment variable `HTTPS_PROXY`
3. Environment variable `HTTP_PROXY`

If none are set, no proxy is used.

**Technical Details**:

- **Fetcher (Axios)**: Uses `https-proxy-agent` to create `httpsAgent`; Axios built-in proxy disabled (`proxy: false`)
- **AI (native fetch)**: Uses `undici` `ProxyAgent` + `setGlobalDispatcher` to proxy `@google/genai` requests
- Both mechanisms share the same `getProxyUrl()` resolution logic
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
