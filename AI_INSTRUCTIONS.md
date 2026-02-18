# V2ER Insight - Project Context

This file documents the project structure and file purposes for AI assistants to understand the context quickly.

## Project Overview

**V2ER Insight** is a TypeScript CLI tool designed to fetch, parse, and analyze V2EX user data (topics and replies).
It uses a modular architecture separating generic logic (Fetcher) from business logic (V2EX specifics).

## Tech Stack

- **Language**: TypeScript (Node.js >= 20.18.1)
- **Module System**: CommonJS (target ES2020)
- **Path Aliases**: `@/` â†?`src/` (via `tsconfig.json` paths + `tsc-alias`)
- **Build**: `pnpm run build` (`build:compile` + `build:assets`)
- **Release Build**: `pnpm run build:release` (clean `dist`, compile, copy runtime assets, prune maps)
- **Linting**: ESLint (Flat Config) + Prettier + Husky
- **Testing**: Vitest (`vi.mock` for network calls, `@/` alias in `vitest.config.ts`)
- **HTTP**: Axios
- **HTML Parsing**: Cheerio

## Build & Packaging Notes

- `scripts/copy-dist-assets.cjs`: Copy runtime non-code assets into `dist` (currently `src/core/ai/prompt/system-prompt.md`), preventing packaged runtime `ENOENT`.
- `scripts/prune-dist-maps.cjs`: Remove `*.map` files from `dist` before packaging to reduce tarball size and avoid leaking build path metadata.
- `pack:check` runs `pnpm pack --dry-run --json` and should be used to verify published files before release.

## Directory Structure & File Purposes

```
root
â”œâ”€â”€ eslint.config.mjs         # ESLint Flat Config (v9+)
â”œâ”€â”€ package.json              # Dependencies & npm scripts
â”œâ”€â”€ tsconfig.json             # TypeScript compiler config
â”œâ”€â”€ vitest.config.ts          # Vitest test runner config
â”œâ”€â”€ task2.md                  # V2EX page structure analysis doc
â”œâ”€â”€ vitest-env.d.ts           # Vitest global type declarations
â”œâ”€â”€ docs/                     # Documentation & Specifications
â”?  â”œâ”€â”€ prompt.md             # AI system prompt template (copy)
â”?  â”œâ”€â”€ analyzer-output/      # [Analyzer -> AI] Input data schema
â”?  â”?  â”œâ”€â”€ output-schema.md      # Field-level specification
â”?  â”?  â””â”€â”€ output-types.ts      # Reference type definitions
â”?  â””â”€â”€ ai-result/            # [AI -> User] Analysis result schema
â”?      â”œâ”€â”€ result-schema.md      # Field-level specification
â”?      â””â”€â”€ result-types.ts      # Final result type definition
â”œâ”€â”€ src/
â”?  â”œâ”€â”€ cli/                  # [Complete] Command-line interface
â”?  â”?  â”œâ”€â”€ index.ts          # CLI entry point (commander setup)
â”?  â”?  â”œâ”€â”€ types.ts          # CLI option types (CommandOptions suffix)
â”?  â”?  â”œâ”€â”€ utils.ts          # CLI shared utilities (events/error logs)
©¦   ©¦   ©À©¤©¤ utils/            # CLI utility submodules
©¦   ©¦   ©¦   ©¸©¤©¤ error.ts      # Shared error detail extraction
â”?  â”?  â””â”€â”€ commands/         # Command handlers
â”?  â”?      â”œâ”€â”€ index.ts      # Re-exports commands
â”?  â”?      â”œâ”€â”€ fetch.ts      # runFetch: Fetch user data
â”?  â”?      â”œâ”€â”€ analyze.ts    # runAnalyze: Process raw data
â”?  â”?      â”œâ”€â”€ ai.ts         # runAi: AI profiling
â”?  â”?      â”œâ”€â”€ show.ts       # runShow: Format and display report
â”?  â”?      â”œâ”€â”€ config.ts     # Config management (show/set/reset/proxy)
â”?  â”?      â””â”€â”€ run.ts        # runPipeline: Main command entry
â”?  â”?  â”œâ”€â”€ workflow/         # Workflow orchestration
â”?  â”?  â”?  â”œâ”€â”€ types.ts      # StepRunResult, WorkflowStep, RunOutcome
â”?  â”?  â”?  â”œâ”€â”€ state.ts      # detectWorkflowState, buildExecutionPlan
â”?  â”?  â”?  â”œâ”€â”€ recovery.ts   # ReasonCode -> RecoveryAction mapping
â”?  â”?  â”?  â””â”€â”€ orchestrator.ts # runWorkflow: Step dispatch & state machine
â”?  â”?â”?  â”œâ”€â”€ config/               # [Shared] Configuration management
â”?  â”?  â”œâ”€â”€ index.ts          # Public exports
â”?  â”?  â”œâ”€â”€ types/            # Modular config type definitions
â”?  â”?  â”?  â”œâ”€â”€ index.ts          # Re-exports all types + V2erConfig
â”?  â”?  â”?  â”œâ”€â”€ ai.ts             # AIConfig, ThinkingLevel
â”?  â”?  â”?  â”œâ”€â”€ fetch.ts          # FetchConfig
â”?  â”?  â”?  â”œâ”€â”€ analyzer.ts       # AnalyzerConfig
â”?  â”?  â”?  â”œâ”€â”€ data.ts           # DataConfig
â”?  â”?  â”?  â””â”€â”€ log.ts            # LogConfig
â”?  â”?  â”œâ”€â”€ defaults.ts       # DEFAULT_CONFIG + ResolvedConfig type
â”?  â”?  â”œâ”€â”€ path.ts           # Config dir/file path (~/.v2er-insight/)
â”?  â”?  â”œâ”€â”€ storage.ts        # Read/write/merge config (deepMerge)
â”?  â”?  â””â”€â”€ proxy.ts          # Proxy URL resolution + native fetch proxy init
â”?  â”?â”?  â”œâ”€â”€ core/                 # [Domain Layer] Business logic
â”?  â”?  â”œâ”€â”€ v2ex/             # [Complete] V2EX domain logic
â”?  â”?  â”?  â”œâ”€â”€ index.ts      # Public API exports (types, urls, parsers)
â”?  â”?  â”?  â”œâ”€â”€ types/        # Type definitions
â”?  â”?  â”?  â”?  â”œâ”€â”€ index.ts      # Re-exports all types
â”?  â”?  â”?  â”?  â”œâ”€â”€ entities.ts   # V2exReply, V2exTopicDetail
â”?  â”?  â”?  â”?  â””â”€â”€ parse-result.ts # Page parse result types
â”?  â”?  â”?  â”œâ”€â”€ urls/         # URL generators
â”?  â”?  â”?  â”œâ”€â”€ parsers/      # HTML parsers (using Cheerio)
â”?  â”?  â”?  â”?  â”œâ”€â”€ __tests__/        # Parser unit tests
â”?  â”?  â”?  â”?  â”œâ”€â”€ selectors/        # DOM selectors
â”?  â”?  â”?  â”?  â”œâ”€â”€ utils/            # Shared utilities
â”?  â”?  â”?  â”?  â””â”€â”€ index.ts
â”?  â”?  â”?  â””â”€â”€ use-cases/    # [Complete] Use case layer (orchestration)
â”?  â”?  â”?      â”œâ”€â”€ index.ts      # Public API exports
â”?  â”?  â”?      â”œâ”€â”€ types.ts      # ServiceOptions, PagedResult types
â”?  â”?  â”?      â”œâ”€â”€ user/         # User-related use cases
â”?  â”?  â”?      â”?  â”œâ”€â”€ profile.ts    # User profile fetcher
â”?  â”?  â”?      â”?  â”œâ”€â”€ replies.ts    # User replies fetcher (paginated)
â”?  â”?  â”?      â”?  â”œâ”€â”€ topic-urls.ts # User topic URLs fetcher (paginated)
â”?  â”?  â”?      â”?  â””â”€â”€ topics-detail.ts # User topics content fetcher
â”?  â”?  â”?      â””â”€â”€ utils/        # Shared utilities
â”?  â”?  â”?          â””â”€â”€ page-orchestrator.ts # Generic pagination logic
â”?  â”?  â”?â”?  â”?  â””â”€â”€ analyzer/         # [Complete] Data analysis for AI input
â”?  â”?      â”œâ”€â”€ index.ts          # Public API (buildAnalyzerOutput)
â”?  â”?      â”œâ”€â”€ builder.ts        # Output builder
â”?  â”?      â”œâ”€â”€ config.ts         # Analyzer constants
â”?  â”?      â”œâ”€â”€ types/            # Type definitions
â”?  â”?      â”œâ”€â”€ utils/            # Utility functions (date-parser, stats)
â”?  â”?      â”œâ”€â”€ periods/          # Active period detection
â”?  â”?      â”œâ”€â”€ stats/            # Statistics calculation
â”?  â”?      â””â”€â”€ content/          # Content processing
â”?  â”?â”?  â”?  â””â”€â”€ ai/              # [Complete] AI integration module
â”?  â”?      â”œâ”€â”€ index.ts         # Public API exports
â”?  â”?      â”œâ”€â”€ config.ts        # AI model constants
â”?  â”?      â”œâ”€â”€ types/           # Type definitions
â”?  â”?      â”?  â”œâ”€â”€ index.ts         # Re-exports all types
â”?  â”?      â”?  â”œâ”€â”€ options.ts       # AIAnalysisInput, AnalysisOptions
â”?  â”?      â”?  â”œâ”€â”€ result.ts        # AIAnalysisResult
â”?  â”?      â”?  â””â”€â”€ provider.ts      # IAIProvider interface
â”?  â”?      â”œâ”€â”€ prompt/          # System prompt & message builder
â”?  â”?      â”?  â”œâ”€â”€ index.ts         # buildMessageSequence()
â”?  â”?      â”?  â””â”€â”€ system-prompt.md # AI system prompt template
â”?  â”?      â”œâ”€â”€ providers/       # AI provider adapters
â”?  â”?      â”?  â”œâ”€â”€ index.ts         # Re-exports providers
â”?  â”?      â”?  â””â”€â”€ gemini.ts        # Google Gemini provider
â”?  â”?      â”œâ”€â”€ parser/          # Response parsing & validation
â”?  â”?      â”?  â”œâ”€â”€ index.ts         # parseResponse()
â”?  â”?      â”?  â””â”€â”€ validator.ts     # Lenient response validator
â”?  â”?      â””â”€â”€ utils/           # Shared utilities
â”?  â”?          â”œâ”€â”€ index.ts         # Re-exports utilities
â”?  â”?          â”œâ”€â”€ api-key.ts       # API key resolution
â”?  â”?          â””â”€â”€ retry.ts         # Retry with exponential backoff
â”?  â”?â”?  â””â”€â”€ infra/                # [Infrastructure Layer] External adapters
â”?      â”œâ”€â”€ fetcher/          # [Complete] Generic HTTP fetcher
â”?      â”?  â”œâ”€â”€ index.ts      # Public API exports
â”?      â”?  â”œâ”€â”€ fetcher.ts    # SequentialStrategy & Fetcher class
â”?      â”?  â”œâ”€â”€ types.ts      # FetchOptions, FetchResult
â”?      â”?  â””â”€â”€ agent.ts      # Proxy agent creation
â”?      â”œâ”€â”€ storage/          # [Complete] User data persistence
â”?      â”?  â”œâ”€â”€ index.ts      # Public API exports
â”?      â”?  â”œâ”€â”€ types.ts      # DataFileType, WriteOptions
â”?      â”?  â”œâ”€â”€ paths.ts      # User data dir/file path resolution
â”?      â”?  â”œâ”€â”€ reader.ts     # JSON file reading
â”?      â”?  â”œâ”€â”€ writer.ts     # JSON file writing (auto-mkdir)
â”?      â”?  â””â”€â”€ cleaner.ts    # Expired data cleanup
â”?      â””â”€â”€ logger/           # [Complete] Global logger
â”?          â”œâ”€â”€ index.ts      # Public API exports
â”?          â”œâ”€â”€ colors.ts     # Shared ANSI color constants
â”?          â””â”€â”€ logger.ts     # Level-based logging (error/warn/info/debug)
```

## Modules

### 1. Fetcher Module (Complete)

- **Role**: Pure HTTP fetching, no business logic.
- **Design**: Strategy Pattern (`IFetchStrategy`).
- **Implementation**: `SequentialStrategy` (rate-limit safe).
- **Events**: `onStart`, `onSuccess`, `onError` callbacks.

### 2. V2EX Module (Complete)

- **Role**: V2EX-specific business logic.

**Types** (`types/`):

- `V2exReply`: Single reply data structure
- `V2exTopicDetail`: Topic detail data structure
- `*ParseResult`: Page parse results with pagination

**URL Generators** (`urls/`):

- `getUserProfileUrl(username)` â†?User profile page
- `getUserRepliesUrl(username, page?)` â†?User replies list
- `getUserTopicsUrl(username, page?)` â†?User topics list
- `getTopicUrl(topicIdOrPath)` â†?Single topic page (supports ID or path; throws on invalid)

**Parsers** (`parsers/`):

- `parseUserProfile(html)` â†?Daily ranking, join date
- `parseRepliesPage(html)` â†?Replies list, pagination
- `parseTopicsListPage(html)` â†?Topic URLs, hidden detection
- `parseTopicDetail(html)` â†?Topic content, stats

**Implementation Specifics**:

- **Parsers Breakdown**:
  - `src/core/v2ex/parsers/replies-page.ts`: Handles nested reply content (traverses `.inner` wrappers).
  - `src/core/v2ex/parsers/utils/pagination.ts`: Robust pagination parser using `.first()` to handle dual pagination bars.
- **Date Handling**:
  - `src/core/analyzer/utils/date-parser.ts`: Supports V2EX's legacy Chinese date formats (YYYYå¹´MæœˆDæ—? alongside standard formats.
  - `src/core/analyzer/utils/stats.ts`: Implements `weekdayDistribution` returning full 7-day stats (sorted by frequency).

### 3. Use Case Layer (Complete)

- **Role**: Orchestration layer combining Fetcher + Parsers with auto-pagination (formerly Service Layer).

**Shared Types** (`types.ts`):

- `ServiceOptions`: timeout, headers, event callbacks
- `PagedResult<T>`: data, totalPages, fetchedPages, failedPages

**User Use Cases** (`user/`):

- `getUserProfile(username, options?)` â†?User profile or null
- `getAllUserReplies(username, options?)` â†?PagedResult<V2exReply>
- `getAllUserTopicUrls(username, options?)` â†?Full URLs + isHidden flag
- `getAllUserTopicsDetail(username, options?)` â†?All topic contents

**Utils** (`utils/`):

- `fetchPagedData()` â†?Generic pagination orchestrator (probe + batch)
  - First page events use `total=-1` (unknown until parsed)
  - Triggers `onError` callback for both fetch and parse failures

### 4. CLI Module (Complete)

- **Role**: Command-line interface for user interaction and analysis pipeline.
- **Entry**: `src/cli/index.ts` (Subcommand architecture).

**Commands**:

- `v2er <username>` â†?One-click pipeline (fetch â†?analyze â†?ai â†?show)
- `v2er fetch <username>` â†?Fetch and save raw user data (raw.json)
- `v2er analyze <username>` â†?Run statistics on raw data (analyzed.json)
- `v2er ai <username>` â†?Generate user profile via Gemini (result.json)
- `v2er show <username>` â†?Structure display of results (OCEAN bars, risk icons)
- `v2er config show [group]` â†?View config (with apiKey masking)
- `v2er config set <path> <value>` â†?Set config via dot-path (e.g. `ai.model`)
- `v2er config reset [group]` â†?Reset to defaults
- `v2er config proxy <url>` â†?Manage proxy settings

**Main Command Options** (`v2er <username>`):

- `--force` â†?Force re-fetch from scratch
- `--model [name]` â†?Specify AI model (optional value)
- `--thinking-level [level]` â†?Specify thinking level (optional value)
- `-v, --verbose` â†?Show debug output

**Shared Logic** (`utils.ts` and `utils/error.ts`):

- `createFetchEvents(label)`: Centralized progress/error reporting for fetch/ai operations.
- `logFetchError(result)`: Unified error formatting with indentation alignment.
- `extractErrorDetails(error)`: Normalizes error message/raw detail extraction for CLI command and workflow error paths.

### 5. Config Module (Complete)

- **Role**: Persistent configuration management.
- **Config path**: `~/.v2er-insight/config.json`

**Structure**:

- `types/` â†?Modular config types (AIConfig, FetchConfig, AnalyzerConfig, DataConfig, LogConfig)
- `defaults.ts` â†?`DEFAULT_CONFIG` with all module defaults; `ResolvedConfig` utility type
- `path.ts` â†?Config dir/file path resolution (`~/.v2er-insight/`)
- `storage.ts` â†?Read/write config, `getConfig()` merges defaults with user settings via `deepMerge`
- `proxy.ts` â†?Get proxy URL (priority: config > HTTPS_PROXY > HTTP_PROXY)

### 6. Analyzer Module (Complete)

- **Role**: Process raw user data into structured AI input (located in `src/core/analyzer`).

**Public API**:

- `buildAnalyzerOutput(rawData)` â†?Returns `AnalyzerOutput`
  - `userOverview` â†?User overview statistics
  - `summary` â†?All periods statistics summary
  - `contents` â†?Chunked content for AI consumption

**Sub-modules Hierarchy**:

- **Content Processing** (`content/`):
  - `transformer.ts`: Converts raw V2EX entities to `ContentTopic`/`ContentReply`.
  - `chunker.ts`: Implements smart content splitting based on token/item counts.
- **Statistics** (`stats/`):
  - `user-overview.ts`: Aggregates global user metrics.
  - `topic-stats.ts`: Analyzes topic engagement and lifecycle.
  - `reply-stats.ts`: Calculates reply frequency, node distribution, and full 7-day weekday distribution.
- **Period Detection** (`periods/`):
  - `detector.ts`: Identifies active periods based on 60-day inactivity threshold.
  - `splitter.ts`: Segments data into identified periods.

**Configuration** (`config.ts`):

- `INACTIVITY_THRESHOLD_DAYS: 60` â†?Period split threshold
- `CHUNK_MAX_TOPICS: 20` â†?Max topics per chunk
- `CHUNK_MAX_REPLIES: 100` â†?Max replies per chunk

### 7. AI Module (Complete)

- **Role**: Integrate with Google Gemini to generate deep user insights from analyzer output.

**Public API** (`index.ts`):

- `analyzeUser(input, options?)` â†?`AIAnalysisResult`

**Sub-modules**:

- **Prompt** (`prompt/`):
  - `buildMessageSequence(input)` â†?Constructs multi-turn message sequence from analyzer output.
  - `system-prompt.md` â†?Markdown-based system prompt template.
- **Providers** (`providers/`):
  - `GeminiProvider` â†?Google Gemini API adapter with multi-turn chat support.
  - `GeminiProvider.createSession(systemPrompt, options?)` supports
    `SessionOptions` (`thinkingLevel?: ThinkingLevel`).
- **Parser** (`parser/`):
  - `parseResponse(text)` â†?Extracts JSON from AI response (prioritizes ```json blocks).
  - `validateResponse(data)` â†?Lenient validator with deep merge, score clamping (0-100), and warnings.
- **Utils** (`utils/`):
  - `resolveApiKey()` â†?API key resolution (explicit > config > GOOGLE_API_KEY > GEMINI_API_KEY).
  - `withRetry(fn, options)` â†?Retry with exponential backoff and jitter.

**Defaults** (from `config/defaults.ts`):

- Model: `gemini-3-pro-preview` (via `getConfig().ai.model`)
- ThinkingLevel: `high` (via `getConfig().ai.thinkingLevel`)
- `maxRetries: 3`, `baseDelay: 1000`, `maxDelay: 10_000`
- `runAi` resolves thinking level by priority:
  - CLI explicit value (e.g. `--thinking-level high`)
  - `config.ai.thinkingLevel` (defaults to `high` when not explicitly unset)
  - `undefined` (only if the config field is explicitly removed by the user)
- Invalid thinking level fails fast with reason code
  `AI_INVALID_THINKING_LEVEL` and skips provider calls.

### 8. Logger Module (Complete)

- **Role**: Global level-based logger for all layers. Located in `src/infra/logger`.

**Public API**:

- `logger.debug(msg)` â†?Only visible when level is `debug`
- `logger.info(msg)` â†?Normal output (default level)
- `logger.warn(msg)` â†?Warning with `[WARN]` label
- `logger.error(msg)` â†?Error with `[ERROR]` label
- `logger.setLevel(level)` â†?Set minimum log level
- `logger.getLevel()` â†?Get current level

**Design**:

- Zero external dependencies (ANSI escape codes for colors)
- Global singleton, set level once at program entry
- Level priority: `error > warn > info > debug`

### 9. Workflow Module (Complete)

- **Role**: One-click pipeline orchestration for `v2er <username>`. Located in `src/cli/workflow`.

**Public API** (`orchestrator.ts`):

- `runWorkflow(options)` â†?`RunOutcome` (overallStatus, exitCode, results)

**Sub-modules**:

- **Types** (`types.ts`): `StepRunResult`, `WorkflowStep`, `ReasonCode`, `RecoveryAction`, `RunOutcome`
- **State** (`state.ts`):
  - `detectWorkflowState(username)` â†?Checks `raw.json`/`analyzed.json`/`result.json` existence
  - `resolveEntryStep(state, force?)` â†?Determines which step to start from
  - `buildExecutionPlan(entryStep)` â†?Returns ordered step array via slice
- **Recovery** (`recovery.ts`): Maps `ReasonCode` â†?`RecoveryAction[]` with template rendering
  - Includes `AI_INVALID_THINKING_LEVEL` recovery guidance.
- **Orchestrator** (`orchestrator.ts`):
  - Sequential step dispatch with `pipeline: true` flag
  - `failed` â†?immediate halt, `partial` â†?continue with exitCode=1
  - Unified failure output with recovery suggestions

### 10. Storage Module (Complete)

- **Role**: User data file persistence and lifecycle management. Located in `src/infra/storage`.

**Data Directory Structure**:

```text
~/.v2er-insight/data/{username}/
â”œâ”€â”€ raw.json       # Raw data captured
â”œâ”€â”€ analyzed.json   # Analyzer output
â””â”€â”€ result.json     # AI analysis results
```

**Public API** (username must match `/^[a-zA-Z0-9_-]+$/`, otherwise throws Error):

- `getUserDataDir(username)` â†?User data directory path
- `getDataFilePath(username, type)` â†?Specific data file path
- `readDataFile<T>(username, type)` â†?Read and parse JSON (returns `null` on missing/invalid)
- `writeDataFile(username, type, data, options?)` â†?Write JSON with auto-mkdir and `mode: 0o600`
- `cleanExpiredData(username)` â†?Remove expired `raw.json`/`analyzed.json` based on config

**Cleanup Strategy**:

- `data.keepRaw = true` â†?Never clean
- `data.keepRaw = false` â†?Delete files older than `data.rawRetention` days (default: 1)
- `result.json` is never cleaned

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
- **Coverage**: 250+ tests covering parsers, URL generators, services, CLI, config, analyzer, and AI.

