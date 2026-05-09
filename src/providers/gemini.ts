import type { ADRInput, ADRDocument, Env } from '../types';
import { ExternalServiceError } from '../types';
import type { AIProvider, ADRDocumentResult } from './types';
import { generateSlug } from '../utils/generate-slug';

const MODEL = 'gemini-1.5-flash';
const LANGSMITH_PROJECT = 'p1-adr-tool';

const ADR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: [
    'title', 'status', 'contextAndProblem', 'decisionDrivers',
    'consideredOptions', 'decisionOutcome', 'consequences',
  ],
  properties: {
    title: { type: 'STRING' },
    status: { type: 'STRING' },
    contextAndProblem: { type: 'STRING' },
    decisionDrivers: { type: 'ARRAY', items: { type: 'STRING' } },
    consideredOptions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['name', 'description', 'pros', 'cons'],
        properties: {
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          pros: { type: 'ARRAY', items: { type: 'STRING' } },
          cons: { type: 'ARRAY', items: { type: 'STRING' } },
        },
      },
    },
    decisionOutcome: {
      type: 'OBJECT',
      required: ['chosenOption', 'justification'],
      properties: {
        chosenOption: { type: 'STRING' },
        justification: { type: 'STRING' },
      },
    },
    consequences: {
      type: 'OBJECT',
      required: ['positive', 'negative', 'neutral'],
      properties: {
        positive: { type: 'ARRAY', items: { type: 'STRING' } },
        negative: { type: 'ARRAY', items: { type: 'STRING' } },
        neutral: { type: 'ARRAY', items: { type: 'STRING' } },
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

export class GeminiProvider implements AIProvider {
  readonly providerName = 'gemini' as const;

  async generateADR(input: ADRInput, promptContent: string, env: Env): Promise<ADRDocumentResult> {
    const start = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

    const call = async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: promptContent }] },
          contents: [{ parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: ADR_RESPONSE_SCHEMA,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new ExternalServiceError(`Gemini API error ${response.status}: ${text}`, response.status >= 500);
      }

      return response.json() as Promise<Record<string, unknown>>;
    };

    const { result, runId } = await withLangSmithTrace(
      'generate-adr-gemini',
      { model: MODEL, input },
      call,
      env.LANGSMITH_API_KEY,
    );

    const candidates = result.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
    const text = candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new ExternalServiceError('Gemini returned empty response', false);

    const rawAdr = JSON.parse(text) as ADRDocument;
    const usageMeta = result.usageMetadata as { totalTokenCount?: number } | undefined;

    const adr: ADRDocument = {
      ...rawAdr,
      id: crypto.randomUUID(),
      slug: generateSlug(rawAdr.title),
      date: rawAdr.date ?? new Date().toISOString().slice(0, 10),
    };

    return { adr, tokensUsed: usageMeta?.totalTokenCount ?? 0, durationMs: Date.now() - start, langsmithRunId: runId };
  }
}
