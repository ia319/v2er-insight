# V2ER Insight - Project Context

This file documents the project structure and file purposes for AI assistants to understand the context quickly.

## Project Overview

**V2ER Insight** is a TypeScript CLI tool designed to fetch, parse, and analyze V2EX user data (topics and replies).
It uses a modular architecture separating generic logic (Fetcher) from business logic (V2EX specifics).

## Tech Stack

- **Language**: TypeScript (Node.js)
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
│   └── specs/
│       ├── ai-input/         # [Source -> AI] Input data schema for AI
│       │   ├── input-schema.md # Data structure specification
│       │   └── input-types.ts  # Reference type definitions
│       │
│       └── ai-output/        # [AI -> App] Expected response from AI
│           └── ...
├── src/
│   ├── modules/
│   │   ├── fetcher/          # [Complete] Generic HTTP fetcher
│   │   │   ├── __tests__/    # Unit tests for fetcher
│   │   │   ├── fetcher.ts    # SequentialStrategy & Fetcher class
│   │   │   ├── types.ts      # FetchOptions, FetchResult, IFetchStrategy
│   │   │   └── index.ts      # Public API exports
│   │   │
│   │   └── v2ex/             # [Complete] V2EX business logic
│   │       ├── index.ts      # Public API exports (types, urls, parsers)
│   │       ├── types/        # Type definitions
│   │       │   ├── index.ts      # Re-exports all types
│   │       │   ├── entities.ts   # V2exReply, V2exTopicDetail
│   │       │   └── parse-result.ts # Page parse result types
│   │       ├── urls/         # URL generators
│   │       │   ├── index.ts      # Re-exports all URL functions
│   │       │   ├── constants.ts  # V2EX_BASE constant
│   │       │   ├── user-urls.ts  # User page URL generators
│   │       │   └── topic-urls.ts # Topic page URL generators
│   │       ├── parsers/      # HTML parsers (using Cheerio)
│   │       │   ├── __tests__/        # Parser unit tests
│   │       │   │   └── fixtures/     # HTML snapshots
│   │       │   ├── selectors/        # DOM selectors (one per parser)
│   │       │   ├── utils/            # Shared utilities
│   │       │   │   ├── index.ts      # Re-exports
│   │       │   │   └── pagination.ts # Robust pagination parser
│   │       │   ├── index.ts
│   │       │   └── *.ts              # Parser implementations
│   │       └── services/     # [Complete] Service layer (orchestration)
│   │           ├── index.ts      # Public API exports
│   │           ├── types.ts      # ServiceOptions, PagedResult types
│   │           ├── user/         # User-related services
│   │           │   ├── __tests__/    # User service unit tests
│   │           │   ├── index.ts      # Re-exports user services
│   │           │   ├── profile.ts    # User profile fetcher
│   │           │   ├── replies.ts    # User replies fetcher (paginated)
│   │           │   ├── topic-urls.ts # User topic URLs fetcher (paginated)
│   │           │   └── topics-detail.ts # User topics content fetcher
│   │           └── utils/        # Shared utilities
│   │               ├── __tests__/    # Utility unit tests
│   │               ├── index.ts      # Re-exports utilities
│   │               └── page-orchestrator.ts # Generic pagination logic
│   │
│   ├── cli/                  # [Complete] Command-line interface
│   │   ├── index.ts          # CLI entry point (commander setup)
│   │   ├── types.ts          # CLI option types
│   │   ├── commands/         # Command handlers
│   │   │   ├── index.ts      # Re-exports commands
│   │   │   ├── fetch-user.ts # User data fetch command
│   │   │   └── config.ts     # Config management command
│   │   └── output/           # Output utilities
│   │       ├── index.ts      # Re-exports
│   │       └── logger.ts     # Formatted console output
│   │
│   ├── config/               # [Complete] Configuration management
│   │   ├── index.ts          # Public exports
│   │   ├── types.ts          # V2erConfig interface
│   │   ├── path.ts           # Config file path (~/.v2errc.json)
│   │   ├── storage.ts        # Read/write config file
│   │   └── proxy.ts          # Proxy URL resolution
│   │
│   └── analyzer/             # [Complete] Data analysis for AI input
│       ├── index.ts          # Public API (buildAnalyzerOutput)
│       ├── builder.ts        # Output builder (orchestrates all modules)
│       ├── config.ts         # Analyzer configuration constants
│       ├── types/            # Type definitions
│       │   ├── input.ts      # RawUserData input type
│       │   ├── output.ts     # AnalyzerOutput output type
│       │   └── internal.ts   # ActivePeriod, PeriodBoundary types
│       ├── utils/            # Utility functions
│       │   ├── date-parser.ts # Date parsing (absolute/relative/Chinese)
│       │   └── stats.ts      # Statistics (average, distribution)
│       ├── periods/          # Active period detection
│       │   ├── detector.ts   # Inactivity-based period detection
│       │   └── splitter.ts   # Data splitting by periods
│       ├── stats/            # Statistics calculation
│       │   ├── user-overview.ts  # User overview stats
│       │   ├── topic-stats.ts    # Topic stats
│       │   └── reply-stats.ts    # Reply stats
│       └── content/          # Content processing
│           ├── transformer.ts # Transform to AI format
│           └── chunker.ts    # Content chunking logic
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
  - `parsers/replies-page.ts`: Handles nested reply content (traverses `.inner` wrappers).
  - `parsers/utils/pagination.ts`: Robust pagination parser using `.first()` to handle dual pagination bars.
- **Date Handling**:
  - `analyzer/utils/date-parser.ts`: Supports V2EX's legacy Chinese date formats (YYYY年M月D日) alongside standard formats.
  - `analyzer/utils/stats.ts`: Implements `weekdayDistribution` returning full 7-day stats (sorted by frequency).

### 3. Service Layer (Complete)

- **Role**: Orchestration layer combining Fetcher + Parsers with auto-pagination.

**Shared Types** (`types.ts`):

- `ServiceOptions`: timeout, headers, event callbacks
- `PagedResult<T>`: data, totalPages, fetchedPages, failedPages

**User Services** (`user/`):

- `getUserProfile(username, options?)` → User profile or null
- `getAllUserReplies(username, options?)` → PagedResult<V2exReply>
- `getAllUserTopicUrls(username, options?)` → Full URLs + isHidden flag
- `getAllUserTopicsDetail(username, options?)` → All topic contents

**Utils** (`utils/`):

- `fetchPagedData()` → Generic pagination orchestrator (probe + batch)
  - First page events use `total=-1` (unknown until parsed)
  - Triggers `onError` callback for both fetch and parse failures

### 4. CLI Module (Complete)

- **Role**: Command-line interface for user interaction.

**Commands**:

- `v2er <username>` → Fetch all user data
- `v2er <username> --topics` → Fetch topics only
- `v2er <username> --replies` → Fetch replies only
- `v2er config proxy <url>` → Set proxy
- `v2er config proxy --clear` → Clear proxy

**Output** (`output/`):

- `logger.ts` → Formatted console output (info, success, error, progress)

### 5. Config Module (Complete)

- **Role**: Persistent configuration management.

**Structure**:

- `path.ts` → Config file path resolution (`~/.v2errc.json`)
- `storage.ts` → Read/write JSON config
- `proxy.ts` → Get proxy URL (priority: config > HTTPS_PROXY > HTTP_PROXY)

### 6. Analyzer Module (Complete)

- **Role**: Process raw user data into structured AI input.

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

## Proxy Configuration

**Priority Order**:

1. Config file (`~/.v2errc.json`)
2. Environment variable `HTTPS_PROXY`
3. Environment variable `HTTP_PROXY`

If none are set, no proxy is used.

**Technical Details**:

- Uses `https-proxy-agent` library to create proxy Agent
- Axios built-in proxy handling is disabled (`proxy: false`) to avoid conflicts
- Proxy URL format: `http://host:port` (e.g., `http://127.0.0.1:10808`)

**Security**:

- Config file uses `0600` permission (owner read/write only, Linux/Mac)
- Windows users should manually verify config file permissions
- Avoid storing proxy credentials in config file; use environment variables instead

## Testing Strategy

- **Structure**: Co-located tests in `__tests__/` folders within each module.
- **Fixtures**: Anonymized HTML snapshots for parser tests.
- **Network Mocking**: Use `vi.mock` for modules (Fetcher, parsers).
- **Coverage**: 70+ tests covering parsers, URL generators, services, CLI, and config.

## Reference

- V2EX page structure analysis: see `task2.md`
