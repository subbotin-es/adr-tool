import type { ADRInput, ADRDocument, Env } from '../types';
import { ExternalServiceError } from '../types';
import type { AIProvider, ADRDocumentResult } from './types';
import { generateSlug } from '../utils/generate-slug';

const MODEL_STANDARD = 'claude-haiku-3-5';
const MODEL_QUALITY = 'claude-sonnet-4-5';
const LANGSMITH_PROJECT = 'p1-adr-tool';

const ADR_TOOL_SCHEMA = {
  name: 'create_adr_document',
  description: 'Creates a complete Architecture Decision Record in MADR format',
  input_schema: {
    type: 'object',
    required: [
      'title', 'status', 'contextAndProblem', 'decisionDrivers',
      'consideredOptions', 'decisionOutcome', 'consequences',
    ],
    properties: {
      title: { type: 'string' },
      status: { type: 'string', enum: ['proposed', 'accepted', 'deprecated', 'superseded'] },
      contextAndProblem: { type: 'string' },
      decisionDrivers: { type: 'array', items: { type: 'string' }, minItems: 1 },
      consideredOptions: {
        type: 'array',
        minItems: 2,
        items: {
          type: 'object',
          required: ['name', 'description', 'pros', 'cons'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' }, minItems: 1 },
            cons: { type: 'array', items: { type: 'string' }, minItems: 1 },
          },
        },
      },
      decisionOutcome: {
        type: 'object',
        required: ['chosenOption', 'justification'],
        properties: {
          chosenOption: { type: 'string' },
          justification: { type: 'string' },
        },
      },
      consequences: {
        type: 'object',
        required: ['positive', 'negative', 'neutral'],
        properties: {
          positive: { type: 'array', items: { type: 'string' } },
          negative: { type: 'array', items: { type: 'string' } },
          neutral:  { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

function isCompleteADR(input: unknown): input is ADRDocument {
  if (typeof input !== 'object' || input === null) return false;
  const doc = input as Partial<ADRDocument>;
  return !!(
    doc.title &&
    doc.status &&
    doc.contextAndProblem &&
    doc.decisionDrivers?.length &&
    doc.consideredOptions && doc.consideredOptions.length >= 2 &&
    doc.consideredOptions.every(o => o.pros?.length && o.cons?.length) &&
    doc.decisionOutcome?.chosenOption &&
    doc.decisionOutcome?.justification &&
    doc.consequences
  );
}

async function withLangSmithTrace<T>(
  runName: string,
  inputs: Record<string, unknown>,
  fn: () => Promise<T>,
  apiKey: string,
): Promise<{ result: T; runId: string | null }> {
  let runId: string | null = null;

  try {
    const res = await fetch('https://api.smith.langchain.com/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        name: runName,
        run_type: 'llm',
        inputs,
        start_time: new Date().toISOString(),
        project_name: LANGSMITH_PROJECT,
      }),
    });
    if (res.ok) {
      const data = await res.json() as { id: string };
      runId = data.id;
    }
  } catch {
    console.warn('LangSmith: failed to create run');
  }

  let result: T;
  try {
    result = await fn();
  } catch (err) {
    if (runId) {
      try {
        await fetch(`https://api.smith.langchain.com/runs/${runId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ error: err instanceof Error ? err.message : 'unknown', end_time: new Date().toISOString() }),
        });
      } catch { /* LangSmith is non-blocking */ }
    }
    throw err;
  }

  if (runId) {
    try {
      await fetch(`https://api.smith.langchain.com/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ outputs: { result }, end_time: new Date().toISOString() }),
      });
    } catch { /* LangSmith is non-blocking */ }
  }

  return { result: result!, runId };
}

async function callAnthropicWithRetry(
  body: Record<string, unknown>,
  apiKey: string,
  maxAttempts = 2,
): Promise<{ data: Record<string, unknown>; toolInput: unknown }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ExternalServiceError(`Anthropic API error ${response.status}: ${text}`, response.status >= 500);
    }

    const data = await response.json() as Record<string, unknown>;
    const content = data.content as Array<Record<string, unknown>> | undefined;
    const toolUseBlock = content?.find(b => b.type === 'tool_use');

    if (toolUseBlock?.input && isCompleteADR(toolUseBlock.input)) {
      return { data, toolInput: toolUseBlock.input };
    }

    if (attempt < maxAttempts) {
      (body as Record<string, unknown>).max_tokens = Math.floor((body.max_tokens as number) * 1.5);
      continue;
    }
    throw new ExternalServiceError('Anthropic returned incomplete ADR after retry', true);
  }
  throw new ExternalServiceError('Anthropic call failed', true);
}

export class AnthropicProvider implements AIProvider {
  readonly providerName = 'anthropic' as const;

  async generateADR(input: ADRInput, promptContent: string, env: Env): Promise<ADRDocumentResult> {
    const model = input.quality === 'high' ? MODEL_QUALITY : MODEL_STANDARD;
    const start = Date.now();

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      // CRITICAL: system prompt in system field, never in messages array (SC-003)
      system: promptContent,
      tools: [ADR_TOOL_SCHEMA],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    };

    const { result, runId } = await withLangSmithTrace(
      'generate-adr-anthropic',
      { model, input },
      () => callAnthropicWithRetry(requestBody, env.ANTHROPIC_API_KEY),
      env.LANGSMITH_API_KEY,
    );

    const rawData = result.data as Record<string, unknown>;
    const usage = rawData.usage as Record<string, number> | undefined;
    const tokensUsed = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
    const rawAdr = result.toolInput as ADRDocument;

    const adr: ADRDocument = {
      ...rawAdr,
      id: crypto.randomUUID(),
      slug: generateSlug(rawAdr.title),
      date: rawAdr.date ?? new Date().toISOString().slice(0, 10),
    };

    return { adr, tokensUsed, durationMs: Date.now() - start, langsmithRunId: runId };
  }
}
