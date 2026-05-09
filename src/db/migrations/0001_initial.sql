-- src/db/schema.sql
-- Source of truth. Run: wrangler d1 execute adr-tool-db --file=src/db/schema.sql

CREATE TABLE IF NOT EXISTS adrs (
  id                 TEXT PRIMARY KEY,         -- UUID (generation ID)
  adr_id             TEXT UNIQUE,              -- ADR-0001 (assigned at GitHub push)
  slug               TEXT NOT NULL,
  title              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'proposed',
  date               TEXT NOT NULL,            -- ISO 8601
  content_json       TEXT NOT NULL,            -- ADRDocument as JSON
  markdown_content   TEXT NOT NULL,
  provider           TEXT NOT NULL DEFAULT 'anthropic',
  github_path        TEXT,                     -- docs/adr/ADR-0001-slug.md
  confluence_page_id TEXT,
  prompt_version     TEXT NOT NULL,
  tokens_used        INTEGER NOT NULL DEFAULT 0,
  duration_ms        INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generation_log (
  id                TEXT PRIMARY KEY,
  input_json        TEXT NOT NULL,
  output_json       TEXT NOT NULL,
  prompt_version    TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  tokens_used       INTEGER NOT NULL,
  duration_ms       INTEGER NOT NULL,
  langsmith_run_id  TEXT,                      -- LangSmith trace ID
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  version    TEXT PRIMARY KEY,                 -- "1.0.0"
  content    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  notes      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_adrs_adr_id ON adrs(adr_id);
CREATE INDEX IF NOT EXISTS idx_adrs_status ON adrs(status);
CREATE INDEX IF NOT EXISTS idx_adrs_created ON adrs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_log_created ON generation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_log_provider ON generation_log(provider);
