# V2ER Insight - Project Context

This file documents the project structure and file purposes for AI assistants to understand the context quickly.

## Project Overview

**V2ER Insight** is a TypeScript CLI tool designed to fetch, parse, and analyze V2EX user data (topics and replies).
It uses a modular architecture separating generic logic (Fetcher) from business logic (V2EX specifics).

## Tech Stack

- **Language**: TypeScript (Node.js >= 20.18.1)
- **Module System**: CommonJS (target ES2020)
- **Path Aliases**: `@/` → `src/` (via `tsconfig.json` paths + `tsc-alias`)
- **Build**: `tsc && tsc-alias` (converts aliases to relative paths)
- **Linting**: ESLint (Flat Config) + Prettier + Husky
- **Testing**: Vitest (`vi.mock` for network calls, `@/` alias in `vitest.config.ts`)
- **HTTP**: Axios
- **HTML Parsing**: Cheerio

## Directory Structure & File Purposes

```
root
├── eslint.config.mjs         # ESLint Flat Config (v9+)
├── package.json              # Dependencies & npm scripts
├── tsconfig.json             # TypeScript compiler config
├── vitest.config.ts          # Vitest test runner config
├── task2.md                  # V2EX page structure analysis doc
├── vitest-env.d.ts           # Vitest global type declarations
├── docs/                     # Documentation & Specifications
│   ├── prompt.md             # AI system prompt template (copy)
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
│   │   ├── utils.ts          # CLI shared utilities (events/error logs)
│   │   └── commands/         # Command handlers
│   │       ├── index.ts      # Re-exports commands
│   │       ├── fetch.ts      # runFetch: Fetch user data
│   │       ├── analyze.ts    # runAnalyze: Process raw data
│   │       ├── ai.ts         # runAi: AI profiling
│   │       ├── show.ts       # runShow: Format and display report
│   │       ├── config.ts     # Proxy configuration command
│   │       └── run.ts        # runPipeline: Main command entry
│   │   ├── workflow/         # Workflow orchestration
│   │   │   ├── types.ts      # StepRunResult, WorkflowStep, RunOutcome
│   │   │   ├── state.ts      # detectWorkflowState, buildExecutionPlan
│   │   │   ├── recovery.ts   # ReasonCode -> RecoveryAction mapping
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
│   │   └── analyzer/         # [Complete] Data analysis for AI input
│   │       ├── index.ts          # Public API (buildAnalyzerOutput)
│   │       ├── builder.ts        # Output builder
│   │       ├── config.ts         # Analyzer constants
│   │       ├── types/            # Type definitions
│   │       ├── utils/            # Utility functions (date-parser, stats)
│   │       ├── periods/          # Active period detection
│   │       ├── stats/            # Statistics calculation
│   │       └── content/          # Content processing
│   │
│   │   └── ai/              # [Complete] AI integration module
│   │       ├── index.ts         # Public API exports
│   │       ├── config.ts        # AI model constants
│   │       ├── types/           # Type definitions
│   │       │   ├── index.ts         # Re-exports all types
│   │       │   ├── options.ts       # AIAnalysisInput, AnalysisOptions
│   │       │   ├── result.ts        # AIAnalysisResult
│   │       │   └── provider.ts      # IAIProvider interface
│   │       ├── prompt/          # System prompt & message builder
│   │       │   ├── index.ts         # buildMessageSequence()
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
│       │   ├── fetcher.ts    # SequentialStrategy & Fetcher class
│       │   ├── types.ts      # FetchOptions, FetchResult
│       │   └── agent.ts      # Proxy agent creation
│       ├── storage/          # [Complete] User data persistence
│       │   ├── index.ts      # Public API exports
│       │   ├── types.ts      # DataFileType, WriteOptions
│       │   ├── paths.ts      # User data dir/file path resolution
│       │   ├── reader.ts     # JSON file reading
│       │   ├── writer.ts     # JSON file writing (auto-mkdir)
│       │   └── cleaner.ts    # Expired data cleanup
│       └── logger/           # [Complete] Global logger
│           ├── index.ts      # Public API exports
│           ├── colors.ts     # Shared ANSI color constants
│           └── logger.ts     # Level-based logging (error/warn/info/debug)
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

- `getUserProfileUrl(username)` → User profile page
- `getUserRepliesUrl(username, page?)` → User replies list
- `getUserTopicsUrl(username, page?)` → User topics list
- `getTopicUrl(topicIdOrPath)` → Single topic page (supports ID or path; throws on invalid)

**Parsers** (`parsers/`):

- `parseUserProfile(html)` → Daily ranking, join date
- `parseRepliesPage(html)` → Replies list, pagination
- `parseTopicsListPage(html)` → Topic URLs, hidden detection
- `parseTopicDetail(html)` → Topic content, stats

**Implementation Specifics**:

- **Parsers Breakdown**:
  - `src/core/v2ex/parsers/replies-page.ts`: Handles nested reply content (traverses `.inner` wrappers).
  - `src/core/v2ex/parsers/utils/pagination.ts`: Robust pagination parser using `.first()` to handle dual pagination bars.
- **Date Handling**:
  - `src/core/analyzer/utils/date-parser.ts`: Supports V2EX's legacy Chinese date formats (YYYY年M月D日) alongside standard formats.
  - `src/core/analyzer/utils/stats.ts`: Implements `weekdayDistribution` returning full 7-day stats (sorted by frequency).

### 3. Use Case Layer (Complete)

- **Role**: Orchestration layer combining Fetcher + Parsers with auto-pagination (formerly Service Layer).

**Shared Types** (`types.ts`):

- `ServiceOptions`: timeout, headers, event callbacks
- `PagedResult<T>`: data, totalPages, fetchedPages, failedPages

**User Use Cases** (`user/`):

- `getUserProfile(username, options?)` → User profile or null
- `getAllUserReplies(username, options?)` → PagedResult<V2exReply>
- `getAllUserTopicUrls(username, options?)` → Full URLs + isHidden flag
- `getAllUserTopicsDetail(username, options?)` → All topic contents

**Utils** (`utils/`):

- `fetchPagedData()` → Generic pagination orchestrator (probe + batch)
  - First page events use `total=-1` (unknown until parsed)
  - Triggers `onError` callback for both fetch and parse failures

### 4. CLI Module (Complete)

- **Role**: Command-line interface for user interaction and analysis pipeline.
- **Entry**: `src/cli/index.ts` (Subcommand architecture).

**Commands**:

- `v2er <username>` → One-click pipeline (fetch → analyze → ai → show)
- `v2er fetch <username>` → Fetch and save raw user data (raw.json)
- `v2er analyze <username>` → Run statistics on raw data (analyzed.json)
- `v2er ai <username>` → Generate user profile via Gemini (result.json)
- `v2er show <username>` → Structure display of results (OCEAN bars, risk icons)
- `v2er config proxy <url>` → Manage proxy settings

**Main Command Options** (`v2er <username>`):

- `--force` → Force re-fetch from scratch
- `--model [name]` → Specify AI model (optional value)
- `--thinking-level [level]` → Specify thinking level (optional value)
- `-v, --verbose` → Show debug output

**Shared Logic** (`utils.ts`):

- `createFetchEvents(label)`: Centralized progress/error reporting for fetch/ai operations.
- `logFetchError(result)`: Unified error formatting with indentation alignment.

### 5. Config Module (Complete)

- **Role**: Persistent configuration management.
- **Config path**: `~/.v2er-insight/config.json`

**Structure**:

- `types/` → Modular config types (AIConfig, FetchConfig, AnalyzerConfig, DataConfig, LogConfig)
- `defaults.ts` → `DEFAULT_CONFIG` with all module defaults; `ResolvedConfig` utility type
- `path.ts` → Config dir/file path resolution (`~/.v2er-insight/`)
- `storage.ts` → Read/write config, `getConfig()` merges defaults with user settings via `deepMerge`
- `proxy.ts` → Get proxy URL (priority: config > HTTPS_PROXY > HTTP_PROXY)

### 6. Analyzer Module (Complete)

- **Role**: Process raw user data into structured AI input (located in `src/core/analyzer`).

**Public API**:

- `buildAnalyzerOutput(rawData)` → Returns `AnalyzerOutput`
  - `userOverview` → User overview statistics
  - `summary` → All periods statistics summary
  - `contents` → Chunked content for AI consumption

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

- `INACTIVITY_THRESHOLD_DAYS: 60` → Period split threshold
- `CHUNK_MAX_TOPICS: 20` → Max topics per chunk
- `CHUNK_MAX_REPLIES: 100` → Max replies per chunk

### 7. AI Module (Complete)

- **Role**: Integrate with Google Gemini to generate deep user insights from analyzer output.

**Public API** (`index.ts`):

- `analyzeUser(input, options?)` → `AIAnalysisResult`

**Sub-modules**:

- **Prompt** (`prompt/`):
  - `buildMessageSequence(input)` → Constructs multi-turn message sequence from analyzer output.
  - `system-prompt.md` → Markdown-based system prompt template.
- **Providers** (`providers/`):
  - `GeminiProvider` → Google Gemini API adapter with multi-turn chat support.
- **Parser** (`parser/`):
  - `parseResponse(text)` → Extracts JSON from AI response (prioritizes ```json blocks).
  - `validateResponse(data)` → Lenient validator with deep merge, score clamping (0-100), and warnings.
- **Utils** (`utils/`):
  - `resolveApiKey()` → API key resolution (explicit > config > GOOGLE_API_KEY > GEMINI_API_KEY).
  - `withRetry(fn, options)` → Retry with exponential backoff and jitter.

**Defaults** (from `config/defaults.ts`):

- Model: `gemini-3-pro-preview` (via `getConfig().ai.model`)
- ThinkingLevel: `high` (via `getConfig().ai.thinkingLevel`)
- `maxRetries: 3`, `baseDelay: 1000`, `maxDelay: 10_000`

### 8. Logger Module (Complete)

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

### 9. Workflow Module (Complete)

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
- **Orchestrator** (`orchestrator.ts`):
  - Sequential step dispatch with `pipeline: true` flag
  - `failed` → immediate halt, `partial` → continue with exitCode=1
  - Unified failure output with recovery suggestions

### 10. Storage Module (Complete)

- **Role**: User data file persistence and lifecycle management. Located in `src/infra/storage`.

**Data Directory Structure**:

```text
~/.v2er-insight/data/{username}/
├── raw.json       # Raw data captured
├── analyzed.json   # Analyzer output
└── result.json     # AI analysis results
```

**Public API** (username must match `/^[a-zA-Z0-9_-]+$/`, otherwise throws Error):

- `getUserDataDir(username)` → User data directory path
- `getDataFilePath(username, type)` → Specific data file path
- `readDataFile<T>(username, type)` → Read and parse JSON (returns `null` on missing/invalid)
- `writeDataFile(username, type, data, options?)` → Write JSON with auto-mkdir and `mode: 0o600`
- `cleanExpiredData(username)` → Remove expired `raw.json`/`analyzed.json` based on config

**Cleanup Strategy**:

- `data.keepRaw = true` → Never clean
- `data.keepRaw = false` → Delete files older than `data.rawRetention` days (default: 1)
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
- **Coverage**: 200+ tests covering parsers, URL generators, services, CLI, config, analyzer, and AI.
