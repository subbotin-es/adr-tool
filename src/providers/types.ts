import type { ADRInput, ADRDocument, ProviderName, Env } from '../types';

export interface ADRDocumentResult {
  adr: ADRDocument;
  tokensUsed: number;
  durationMs: number;
  langsmithRunId: string | null;
}

export interface AIProvider {
  readonly providerName: ProviderName;
  generateADR(input: ADRInput, promptContent: string, env: Env): Promise<ADRDocumentResult>;
}
