const NON_EXECUTION_ITEM_TYPES = new Set([
  'userMessage',
  'agentMessage',
  'plan',
  'reasoning',
  'contextCompaction',
]);

/**
 * Classifies item types that violate the analysis-only turn boundary.
 * @param itemType - App Server thread item discriminator.
 * @returns True for execution-capable, unexpected, or unknown item types.
 */
export function isUnexpectedTurnAction(itemType: string): boolean {
  return !NON_EXECUTION_ITEM_TYPES.has(itemType);
}
