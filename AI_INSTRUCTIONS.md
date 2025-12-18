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

## Directory Structure & File Purposes

```
root
├── eslint.config.mjs         # ESLint Flat Config (v9+), supports TypeScript & Prettier
├── package.json              # Dependencies & Scripts (lint, test, format)
├── tsconfig.json             # TypeScript config (CommonJS, Node types)
├── vitest.config.ts          # Vitest config (globals: true)
├── src/
│   ├── vitest-env.d.ts       # Global types for Vitest
│   │
│   ├── core/                 # (Planned) Core shared utilities
│   │
│   ├── modules/              # Independent feature modules
│   │   ├── fetcher/          # [Generic Module] HTTP Request Handler
│   │   │   ├── __tests__/    # Unit tests (using vi.mock('axios'))
│   │   │   ├── fetcher.ts    # Main logic: SequentialStrategy & Fetcher class
│   │   │   ├── types.ts      # Interfaces: FetchOptions, FetchResult, IFetchStrategy
│   │   │   └── index.ts      # Public API export
│   │   │
│   │   └── v2ex/             # [Business Module] V2EX Specific Logic (Planned)
│   │       ├── types.ts      # V2EX domain types (Reply, Topic)
│   │       ├── urls.ts       # URL generation logic
│   │       └── page-detector.ts # Max page detection logic
│   │
│   └── ui/                   # [Presentation Layer] CLI Interaction (Planned)
│       └── cli.ts            # Commander setup
```

## Key Architectural Concepts

### 1. Fetcher Module

- **Role**: Pure HTTP fetching capability. Does NOT know about "users" or "V2EX".
- **Design**: Strategy Pattern (`IFetchStrategy`).
- **Implementation**: `SequentialStrategy` (fetches URLs one by one to avoid rate limits).
- **Events**: Supports `onStart`, `onSuccess`, `onError` callbacks for UI progress updates.

### 2. V2EX Module (Planned)

- **Role**: Handles V2EX-specific business logic.
- **Responsibilities**:
  - Generate URL lists (e.g., `/member/xxx/replies?p=1...N`).
  - Parse HTML to detect max page numbers.
  - Extract content from HTML (Cheerio).

### 3. Testing Strategy

- **Unit Tests**: Co-located in `__tests__` folders.
- **Network**: **MUST** use `vi.mock('axios')` to simulate network responses. Do not use `nock`.
- **Style**: Test public interfaces and event triggers.
