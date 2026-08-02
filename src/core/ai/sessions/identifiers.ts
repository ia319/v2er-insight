const LOCAL_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks a local AI session identifier before it is used as a file name.
 * @param value - Unknown identifier candidate.
 * @returns Whether the value is a canonical UUID string.
 */
export function isLocalSessionId(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_SESSION_ID_PATTERN.test(value);
}
