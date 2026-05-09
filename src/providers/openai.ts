import type { ADRInput, ADRDocument, Env } from '../types';
import { ExternalServiceError } from '../types';
import type { AIProvider, ADRDocumentResult } from './types';
import { generateSlug } from '../utils/generate-slug';

const MODEL = 'gpt-4o-mini';
const LANGSMITH_PROJECT = 'p1-adr-tool';

const ADR_JSON_SCHEMA = {
  name: 'adr_document',
  strict: true,
  schema: {
    type: 'object',
    required: [
      'title', 'status', 'contextAndProblem', 'decisionDrivers',
      'consideredOptions', 'decisionOutcome', 'consequences',
    ],
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      status: { type: 'string', enum: ['proposed', 'accepted', 'deprecated', 'superseded'] },
      contextAndProblem: { type: 'string' },
      decisionDrivers: { type: 'array', items: { type: 'string' } },
      consideredOptions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'description', 'pros', 'cons'],
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      decisionOutcome: {
        type: 'object',
        required: ['chosenOption', 'justification'],
        additionalProperties: false,
        properties: {
          chosenOption: { type: 'string' },
          justification: { type: 'string' },
        },
      },
      consequences: {
        type: 'object',
        required: ['positive', 'negative', 'neutral'],
        additionalProperties: false,
        properties: {
          positive: { type: 'array', items: { type: 'string' } },
          negative: { type: 'array', items: { type: 'string' } },
          neutral: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

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

export class OpenAIProvider implements AIProvider {
  readonly providerName = 'openai' as const;

  async generateADR(input: ADRInput, promptContent: string, env: Env): Promise<ADRDocumentResult> {
    const start = Date.now();

    const call = async () => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: promptContent },
            { role: 'user', content: JSON.stringify(input) },
          ],
          response_format: { type: 'json_schema', json_schema: ADR_JSON_SCHEMA },
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new ExternalServiceError(`OpenAI API error ${response.status}: ${text}`, response.status >= 500);
      }

      return response.json() as Promise<Record<string, unknown>>;
    };

    const { result, runId } = await withLangSmithTrace(
      'generate-adr-openai',
      { model: MODEL, input },
      call,
      env.LANGSMITH_API_KEY,
    );

    const choices = result.choices as Array<{ message: { content: string } }>;
    const content = choices?.[0]?.message?.content;
    if (!content) throw new ExternalServiceError('OpenAI returned empty content', false);

    const rawAdr = JSON.parse(content) as ADRDocument;
    const usage = result.usage as { total_tokens?: number } | undefined;

    const adr: ADRDocument = {
      ...rawAdr,
      id: crypto.randomUUID(),
      slug: generateSlug(rawAdr.title),
      date: rawAdr.date ?? new Date().toISOString().slice(0, 10),
    };

    return { adr, tokensUsed: usage?.total_tokens ?? 0, durationMs: Date.now() - start, langsmithRunId: runId };
  }
}
