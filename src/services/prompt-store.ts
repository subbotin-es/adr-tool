import type { PromptVersion } from '../types';

const CURRENT_KEY = 'prompt:adr-generator:current';

export async function getCurrentPromptContent(kv: KVNamespace): Promise<string> {
  const content = await kv.get(CURRENT_KEY);
  if (!content) {
    throw new Error('No prompt found in KV. Run seed step from CLAUDE.md Section 15 Step 10.');
  }
  return content;
}

export async function getPromptVersionContent(kv: KVNamespace, version: string): Promise<string | null> {
  return kv.get(`prompt:adr-generator:${version}`);
}

export async function savePromptToKV(kv: KVNamespace, pv: PromptVersion): Promise<void> {
  await kv.put(`prompt:adr-generator:${pv.version}`, pv.content);
  await kv.put(CURRENT_KEY, pv.content);
}
