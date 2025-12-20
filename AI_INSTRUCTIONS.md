# V2ER Insight - Project Context

This file documents the project structure and file purposes for AI assistants to understand the context quickly.

## Project Overview

**V2ER Insight** is a TypeScript CLI tool designed to fetch, parse, and analyze V2EX user data (topics and replies).
It uses a modular architecture separating generic logic (Fetcher) from business logic (V2EX specifics).

## Tech Stack

- **Language**: TypeScript (Node.js)
- **Module System**: CommonJS (target ES2020)
- **Linting**: ESLint (Flat Config) + Prettier + Husky
- **Testing**: Vitest (`vi.mock` for network calls)
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
├── src/
│   ├── vitest-env.d.ts       # Vitest global type declarations
│   │
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
│   │       └── parsers/      # HTML parsers (using Cheerio)
│   │           ├── __tests__/        # Parser unit tests
│   │           │   └── fixtures/     # HTML snapshots
│   │           ├── selectors/        # DOM selectors (centralized)
│   │           │   ├── index.ts
│   │           │   ├── common.ts     # Shared selectors
│   │           │   └── *.ts          # Page-specific selectors
│   │           ├── utils/            # Shared utilities
│   │           │   ├── __tests__/
│   │           │   ├── pagination.ts # Pagination parser
│   │           │   └── test-helpers.ts
│   │           ├── index.ts
│   │           └── *.ts              # Parser implementations
│   │
│   └── ui/                   # [Planned] CLI presentation layer
│       └── cli.ts            # Commander.js setup
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
- `getUserRepliesUrl(username, page)` → User replies list
- `getUserTopicsUrl(username, page)` → User topics list
- `getTopicUrl(topicId)` → Single topic page

**Parsers** (`parsers/`):

- `parseUserProfile(html)` → Daily ranking, join date
- `parseRepliesPage(html)` → Replies list, pagination
- `parseTopicsListPage(html)` → Topic URLs, hidden detection
- `parseTopicDetail(html)` → Topic content, stats

## Testing Strategy

- **Structure**: Co-located tests in `__tests__/` folders within each module.
- **Fixtures**: Anonymized HTML snapshots for parser tests.
- **Network Mocking**: Use `vi.mock('axios')`, NOT `nock`.
- **Coverage**: 15 tests covering parsers and URL generators.

## Reference

- V2EX page structure analysis: see `task2.md`
