/**
 * Provider Interface Definitions
 */

/** Provider interface for future extensibility */
export interface IAIProvider {
  readonly name: string;
  createSession(systemPrompt: string): void;
  sendMessage(content: string): Promise<string>;
}
