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

- `scripts/copy-dist-assets.cjs`: Copy runtime non-code assets into `dist` (currently `src/core/ai/prompt/system-prompt.md`) to avoid packaged runtime `ENOENT`.
- `scripts/prune-dist-maps.cjs`: Remove `*.map` from `dist` before packaging to reduce tarball size and avoid leaking local build path metadata.
- `pack:check` runs `pnpm pack --dry-run --json` and should be used to verify published files before release.

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

- `V2exReply`: Reply data with nullable `replyId`, `topicId`, and `replyNumber` parsed from the source anchor
- `V2exTopicDetail`: Topic detail with stable `topicId` and canonical `sourceUrl`
- `*ParseResult`: Page parse results with pagination and explicit topic visibility/identity diagnostics

**URL Generators** (`urls/`):

- `getUserProfileUrl(username)` → User profile page
- `getUserRepliesUrl(username, page?)` → User replies list
- `getUserTopicsUrl(username, page?)` → User topics list
- `getTopicUrl(topicIdOrPath)` → Single topic page (supports ID or path; throws on invalid)
- `extractTopicIdFromPath(path)` → Stable topic ID from a relative or absolute topic URL
- `extractReplyIdentityFromPath(path)` → Stable topic ID, reply number, and reply ID from a reply URL

**Parsers** (`parsers/`):

- `parseUserProfile(html)` → Daily ranking, join date
- `parseRepliesPage(html)` → Replies list, pagination
- `parseTopicsListPage(html)` → Topic URLs, hidden detection
- `parseTopicDetail(html)` → Topic content, stats

**Implementation Specifics**:

- **Parsers Breakdown**:
  - `src/core/v2ex/parsers/replies-page.ts`: Handles nested reply content (traverses `.inner` wrappers).
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
- `getAllUserReplies(username, options?)` → `UserRepliesResult` with nullable declared total and invalid identity count
- `getAllUserTopicUrls(username, options?)` → Full URLs, hidden state, invalid identities, and hidden-state discard count
- `getAllUserTopicsDetail(username, options?)` → Identified topic contents with page and identity completeness metadata

If any fetched list page reports hidden topics, discard topic URLs collected from earlier pages. Count those discarded URLs as failed topics while keeping `invalidTopicCount` limited to links without stable identities.

**Utils** (`utils/`):

- `fetchPagedData()` → Generic pagination orchestrator (probe + batch)
  - First page events use `total=-1` (unknown until parsed)
  - Triggers `onError` callback for both fetch and parse failures
  - Second-pass retry: collects failed pages and retries once after first round

### 4. Raw Snapshot Module (Complete)

- **Role**: Build the versioned boundary between V2EX fetch results and persisted analysis input.
- **Location**: `src/core/snapshot/`

**Public API**:

- `buildRawSnapshot(input)` → Returns `RawSnapshotV2`
- `isRawSnapshotV2(value)` → Validates parsed raw JSON and narrows it to `RawSnapshotV2`
- `RAW_SNAPSHOT_SCHEMA_VERSION` → Literal schema version `2`

**Data Contract**:

- Record `username`, one ISO `capturedAt`, and profile data at the snapshot root.
- Represent topics and replies as `complete`, `partial`, or `not_requested` collections.
- Record expected, fetched, failed, failed-page, identity-failure, and duplicate-conflict counts per collection.
- Keep `failedCount` at least as large as `identityFailureCount`.
- Mark declared and fetched count mismatches as `partial`; record the absolute reply-count difference in `failedCount`.
- Preserve explicit topic visibility independently from an empty topic collection.
- Deduplicate stable topic and reply identities with a fixed-field selection key that is independent of input order.
- Mark collections `partial` when duplicate identities contain conflicting semantic fields, and count each affected identity once.
- Ignore reply display-time drift when classifying duplicate content conflicts while still selecting one complete record deterministically.
- Sort topics by numeric topic ID and replies by topic ID, reply number, and reply ID.
- Exclude replies with missing or internally inconsistent stable identities.
- Validate schema, canonical identities, collection invariants, and unique IDs at the storage boundary.
- Preserve reply display time and normalize supported relative or Chinese calendar values against the shared `capturedAt`.
- Record normalized reply time precision as `minute`, `hour`, or `day`; retain `null` with `unknown` for unsupported or invalid values.
- Interpret calendar dates in the V2EX `+08:00` timezone independently from the runtime machine timezone.

**Provenance Hashing** (`src/core/provenance/`):

- Use `canonicalJsonStringify(value)` to serialize plain JSON values with recursively sorted object keys.
- Use `computeSemanticDataHash(snapshot)` to calculate the SHA-256 identity of stable Snapshot facts.
- Include stable entities, content, interaction counts, visibility, and collection completeness diagnostics.
- Exclude capture time, daily ranking, item order, reply display time, and normalized reply-time drift.
- Use `computeAnalysisConfigHash(config)` to hash inactivity and TopN settings while excluding content chunk limits.
- Use `computeAnalysisFingerprint(input)` to combine semantic data identity, Analyzer schema version, and semantic configuration identity.
- Use `computePayloadHash(output)` to hash the complete Analyzer output for provenance and turn diagnostics.
- Use `computeProviderStateKey(input)` to isolate delivery state by provider, model, system prompt, thinking level, and logical session.
- Use `checkAnalyzedProvenance(state, output, config)` to verify raw identity, Analyzer schema, semantic configuration, payload identity, and capture quality before delivery.
- Use `hasProviderReceivedAnalysis(state, providerKey, fingerprint)` for provider-target duplicate detection.
- Use `recordProviderDelivery(state, input)` only after result persistence; it records provider hashes and a fresh current result with `change` or `resend` delivery mode.
- Use `AnalysisStateV1` to represent raw identity, analyzed identity, current-result freshness, and provider delivery hashes.
- Validate parsed state with `isAnalysisStateV1(value)` before workflow code consumes nested provenance fields.
- Use `recordRawProvenance(state, snapshot)` to derive semantic identity, treat any partial or unrequested collection as a partial capture, and mark the current result stale when raw identity diverges from its analyzed source.
- Use `recordAnalyzedProvenance(state, snapshot, output, config)` to record Analyzer hashes and set result freshness by analysis-fingerprint equality.
- Reject unsupported, non-finite, non-plain, and circular values instead of producing an ambiguous digest.

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
- `--resend` → Send unchanged analyzed data again
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

- Keep cache-hit fetches unchanged and skip provenance mutation with the cached command result.
- Stop before network access when `analysis-state.json` is invalid or unreadable.
- Atomically persist `raw.json` before recording its semantic hash and capture status in `analysis-state.json`.
- Return `PROVENANCE_UPDATE_FAILED` when raw persistence succeeds but the sidecar cannot be advanced.

**Analyze Provenance**:

- Reject Raw Snapshot V2 files without raw provenance as legacy analysis input.
- Recompute semantic hash and capture status before analysis and reject either mismatch before writing `analyzed.json`.
- Atomically persist `analyzed.json` before recording config hash, analysis fingerprint, and payload hash.
- Recheck raw provenance inside the protected state update so concurrent source changes cannot advance analyzed state.
- Mark the current result fresh only when its analysis fingerprint equals the newly recorded Analyzer fingerprint.

**AI Delivery Provenance**:

- Validate persisted `AnalyzerOutput V2` and its raw, schema, config, fingerprint, payload, and capture-quality provenance before provider access.
- Derive Gemini delivery identity from provider, model, system prompt, thinking level, and the default logical session.
- Reuse an unchanged delivery only when the same target received the fingerprint and a matching fresh `result.json` remains available.
- Let `--resend` bypass reuse and record `currentResult.deliveryMode = 'resend'`.
- Warn before sending analysis based on partial capture data.
- Persist `result.json` before updating provider last-sent state, and leave last-sent unchanged after provider, parse, or result-write failure.
- Recheck analyzed provenance during the protected state update before cleaning intermediate files.
- `runShow()` returns stale and partial notices from valid current-result provenance while continuing to display legacy results without sidecar assumptions.
- JSON report content remains on stdout; command and workflow entrypoints render result notices on stderr.

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
  - `reply-stats.ts`: Calculates reply frequency, average reply position, node distribution, and full 7-day weekday distribution from normalized reply occurrences.
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

- Keep `totalTopics` null when topics are hidden or were not requested.
- Keep `totalReplies` null when replies were not requested.
- Calculate `topicReplyRatio` only when topics are visible, both collections were requested, and replies exist.

**Data Quality Contract**:

- Add `schemaVersion: 2` and `dataQuality` to every `AnalyzerOutput`.
- Project `capturedAt`, status, expected count, fetched count, and failed count from each snapshot collection.
- Treat `complete` as a complete captured fact set.
- Treat `partial` and `not_requested` missing records as unknown, not deleted.

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

**Public API** (username must match `/^[a-zA-Z0-9_-]+$/`, otherwise throws Error):

- `getUserDataDir(username)` → User data directory path
- `getDataFilePath(username, type)` → Specific data file path
- `readDataFile<T>(username, type)` → Read `raw`, `analyzed`, `result`, or `analysisState` JSON (returns `null` on missing/invalid)
- `readDataFileResult(username, type)` → Preserve `missing`, `invalid`, and parsed-success states for every `DataFileType`
- `writeDataFile(username, type, data, options?)` → Write JSON through a same-directory `0600` temporary file and atomically rename it over the target
- `readAnalysisState(username)` → Validate `analysis-state.json` and preserve missing/invalid/valid distinctions
- `updateAnalysisState(username, updater)` → Reject invalid existing or updated state before atomic persistence
- `cleanExpiredData(username)` → Return cleanup enablement, retention, deleted files, and typed skip diagnostics

**Cleanup Strategy**:

- `data.keepRaw = true` → Never clean raw/analyzed source data (default)
- `data.keepRaw = false` → Delete files older than `data.rawRetention` days (default retention: 1)
- `result.json` and `analysis-state.json` are never cleaned
- Cleanup diagnostics distinguish disabled retention, missing files, unexpired files, unavailable metadata, and deletion failures.
- See `docs/data-lifecycle.md` for user-facing retention effects and recovery commands.

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
- Windows users should manually verify config file permissions
- Avoid storing proxy credentials in config file; use environment variables instead

## Testing Strategy

- **Structure**: Co-located tests in `__tests__/` folders within each module.
- **Language**: All test descriptions, data, and assertions in English; comments may be Chinese.
- **Fixtures**: Anonymized HTML snapshots for parser tests.
- **Network Mocking**: Use `vi.mock` for modules (Fetcher, parsers).
- **Coverage**: 450+ tests covering parsers, URL generators, services, CLI, config, analyzer, AI, and retry.
