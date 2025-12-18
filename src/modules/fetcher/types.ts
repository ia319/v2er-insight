export interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export interface FetchResult {
  url: string;
  content: string | null;
  success: boolean;
  error?: Error;
  statusCode?: number;
}

export interface FetchEvents {
  onStart?: (url: string, index: number, total: number) => void;
  onSuccess?: (result: FetchResult, index: number, total: number) => void;
  onError?: (result: FetchResult, index: number, total: number) => void;
}

export interface IFetchStrategy {
  fetch(urls: string[], options?: FetchOptions, events?: FetchEvents): AsyncGenerator<FetchResult>;
}
