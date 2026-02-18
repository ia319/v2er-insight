export interface ErrorDetails {
  message: string;
  raw: string;
}

export function extractErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    const raw = error.stack ?? `${error.name}: ${error.message}`;
    return {
      message: error.message,
      raw,
    };
  }

  const raw = String(error);
  return {
    message: raw,
    raw,
  };
}
