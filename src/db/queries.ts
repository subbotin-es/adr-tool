import type { ADRRow, ADRListItem, ADRStatus, PromptVersion, ProviderName } from '../types';

export async function insertADR(db: D1Database, params: {
  id: string;
  slug: string;
  title: string;
  status: ADRStatus;
  date: string;
  contentJson: string;
  markdownContent: string;
  provider: ProviderName;
  promptVersion: string;
  tokensUsed: number;
  durationMs: number;
}): Promise<void> {
  await db.prepare(
    `INSERT INTO adrs (id, slug, title, status, date, content_json, markdown_content, provider, prompt_version, tokens_used, duration_ms)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
  ).bind(
    params.id, params.slug, params.title, params.status, params.date,
    params.contentJson, params.markdownContent, params.provider,
    params.promptVersion, params.tokensUsed, params.durationMs
  ).run();
}

export async function getADRById(db: D1Database, id: string): Promise<ADRRow | null> {
  return db.prepare(`SELECT * FROM adrs WHERE id = ?1`).bind(id).first<ADRRow>();
}

export async function updateADRGitHub(db: D1Database, id: string, adrId: string, githubPath: string): Promise<void> {
  await db.prepare(
    `UPDATE adrs SET adr_id = ?1, github_path = ?2 WHERE id = ?3`
  ).bind(adrId, githubPath, id).run();
}

export async function updateADRConfluence(db: D1Database, id: string, confluencePageId: string): Promise<void> {
  await db.prepare(
    `UPDATE adrs SET confluence_page_id = ?1 WHERE id = ?2`
  ).bind(confluencePageId, id).run();
}

export async function getMaxADRNumber(db: D1Database): Promise<number | null> {
  const row = await db.prepare(
    `SELECT MAX(CAST(REPLACE(adr_id, 'ADR-', '') AS INTEGER)) as max_num FROM adrs WHERE adr_id IS NOT NULL`
  ).first<{ max_num: number | null }>();
  return row?.max_num ?? null;
}

export async function listADRs(db: D1Database, limit: number, offset: number): Promise<ADRListItem[]> {
  const { results } = await db.prepare(
    `SELECT id, adr_id as adrId, slug, title, status, date, provider, github_path as githubPath, confluence_page_id as confluencePageId
     FROM adrs ORDER BY created_at DESC LIMIT ?1 OFFSET ?2`
  ).bind(limit, offset).all<ADRListItem>();
  return results;
}

export async function listADRsByStatus(db: D1Database, status: ADRStatus, limit: number, offset: number): Promise<ADRListItem[]> {
  const { results } = await db.prepare(
    `SELECT id, adr_id as adrId, slug, title, status, date, provider, github_path as githubPath, confluence_page_id as confluencePageId
     FROM adrs WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`
  ).bind(status, limit, offset).all<ADRListItem>();
  return results;
}

export async function countADRs(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) as count FROM adrs`).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function countADRsByStatus(db: D1Database, status: ADRStatus): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) as count FROM adrs WHERE status = ?1`
  ).bind(status).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function insertGenerationLog(db: D1Database, params: {
  id: string;
  inputJson: string;
  outputJson: string;
  promptVersion: string;
  provider: ProviderName;
  model: string;
  tokensUsed: number;
  durationMs: number;
  langsmithRunId: string | null;
}): Promise<void> {
  await db.prepare(
    `INSERT INTO generation_log (id, input_json, output_json, prompt_version, provider, model, tokens_used, duration_ms, langsmith_run_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(
    params.id, params.inputJson, params.outputJson, params.promptVersion,
    params.provider, params.model, params.tokensUsed, params.durationMs,
    params.langsmithRunId
  ).run();
}

export async function insertPromptVersion(db: D1Database, pv: PromptVersion): Promise<void> {
  await db.prepare(
    `INSERT INTO prompt_versions (version, content, updated_at, updated_by, notes) VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(pv.version, pv.content, pv.updatedAt, pv.updatedBy, pv.notes).run();
}

export async function getPromptVersionRow(db: D1Database, version: string): Promise<PromptVersion | null> {
  return db.prepare(
    `SELECT version, content, updated_at as updatedAt, updated_by as updatedBy, notes FROM prompt_versions WHERE version = ?1`
  ).bind(version).first<PromptVersion>();
}
