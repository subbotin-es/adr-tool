# CLAUDE.md — P1 ADR Tool
**Version:** 2.0 | **May 2026** | **Author:** Evgenii Subbotin

> **This file is the authoritative specification for Claude Code.**
> Read it completely before writing any code, any config, any migration.
> **Source of truth on conflicts:** Portfolio Projects Roadmap v4 > Strategic Research v2.1 > Meta CV v1.7 > this file.
> Every architectural decision has a rationale here — don't override without explicit instruction.
> When in doubt — ask. Do not invent requirements. Do not skip security checks.

---

## 1. What This Project Does

ADR Tool is a serverless utility that generates Architecture Decision Records (ADRs) in MADR format using AI, then pushes them to GitHub and optionally creates Confluence pages.

**Core flow:**
```
User input:               AI fills:                 Result:
decision context    →     all 7 MADR sections   →   push to GitHub as
+ list of options         (Title, Status,             docs/adr/ADR-NNNN-slug.md
+ preferred option        Context, Drivers,       +   optional Confluence page
                          Options w/ pros/cons,
                          Decision, Consequences)
```

**MADR sections — all 7 required in every generated output:**
- Title
- Status (`proposed` | `accepted` | `deprecated` | `superseded`)
- Context and Problem Statement
- Decision Drivers
- Considered Options (each with explicit pros AND cons)
- Decision Outcome (with justification referencing Decision Drivers)
- Consequences (positive / negative / neutral)

**Interfaces:**
- REST API (primary — for web UI and direct use)
- MCP server (secondary — thin wrapper over REST, for Claude Code toolbox)

**Provider support (provider abstraction layer from day one):**
- Anthropic `claude-haiku-3-5` (default — structured output via tool use)
- Anthropic `claude-sonnet-4-5` (quality mode — via `?quality=high`)
- OpenAI `gpt-4o-mini` (Fork 1 — drop-in via provider abstraction)
- Google Gemini 1.5 Flash (Fork 2 — via provider abstraction)

---

## 2. Absolute Rules — Read Before Every Task

```
NEVER put secrets in code, wrangler.toml, or KV in plaintext
NEVER use string interpolation in SQL queries — always prepared statements (SC-006)
NEVER put user input directly into the system prompt — use separate system message (SC-003)
NEVER use wildcard CORS (*) — allowlist specific origins only (SC-008)
NEVER deploy to production manually — always via wrangler deploy in CI
NEVER skip TypeScript types — every function, handler, and API shape must be typed
NEVER commit .dev.vars — it is in .gitignore and contains local secrets
NEVER skip LangSmith tracing on Anthropic/OpenAI/Gemini calls — it is required for observability DoD
ALWAYS run gitleaks before pushing — pre-commit hook must be installed
ALWAYS validate CF-Access-Jwt-Assertion header on every Workers endpoint (SC-002)
ALWAYS load prompts from KV at runtime — never hardcode prompt text in source
ALWAYS use fine-grained GitHub PAT with contents:write scope only (SC-004)
ALWAYS write unit test immediately after implementing core logic (same session)
ALWAYS handle partial tool_use response — retry or fallback if ADR sections missing
ALWAYS implement PostHog events on user actions: form_filled, adr_generated, pushed_to_github
ALWAYS include SECURITY.md in every PR that touches security-sensitive paths
```

---

## 3. Tech Stack

| Layer | Technology | Version | Why |
|---|---|---|---|
| Runtime | Cloudflare Workers | current | ~0ms cold start, 100k req/day free |
| Database | Cloudflare D1 (SQLite) | current | Native Workers binding, free 5GB |
| KV Storage | Cloudflare KV | current | Prompt versioning hot storage |
| Auth | Cloudflare Access (Zero Trust) | current | Email whitelist, JWT assertion |
| AI Default | Anthropic API — claude-haiku-3-5 | current | Structured output via tool use |
| AI Quality | claude-sonnet-4-5 | current | Via `?quality=high` param |
| AI Fork 1 | OpenAI gpt-4o-mini | current | Provider abstraction swap |
| AI Fork 2 | Google Gemini 1.5 Flash | current | Provider abstraction swap |
| GitHub | GitHub REST API v3 | current | Push ADR files |
| Confluence | Confluence REST API v2 | current | Optional page creation |
| MCP | Custom MCP server | current | Claude Code toolbox |
| Deploy | Wrangler CLI | current | Official Cloudflare tooling |
| CI/CD | GitHub Actions | current | Free 2000 min/month |
| Frontend | Static HTML + vanilla JS | — | Utility tool, no framework needed for MVP |
| AI Observability | LangSmith | Free 5k traces/mo | AI call tracing, cost discipline signal |
| Product Analytics | Plausible Analytics | Free (self-hosted) | Privacy-first pageviews |
| Product Analytics | PostHog | Free 1M events/mo | Funnel, session replay, retention |
| Error Tracking | Sentry | Free 5k errors/mo | Frontend error tracking |
| Static Analysis | CodeClimate | Free for OSS | Maintainability, coverage |
| Linting | ESLint + TypeScript strict | current | Zero-warnings gate in CI |
| Secrets Scanning | Gitleaks | OSS | Pre-commit + CI |
| Language | TypeScript | 5.x | Compile-time safety |

**No Kubernetes. No managed PostgreSQL. No Redis.**
**Budget target: ~$1–2/month (Anthropic API only).**

---

## 4. Repository Structure

```
adr-tool/
├── src/
│   ├── index.ts                        # Wrangler entry point — route dispatch
│   ├── providers/
│   │   ├── types.ts                    # AIProvider interface
│   │   ├── anthropic.ts                # AnthropicProvider (default)
│   │   ├── openai.ts                   # OpenAIProvider (Fork 1)
│   │   └── gemini.ts                   # GeminiProvider (Fork 2)
│   ├── handlers/
│   │   ├── generate.ts                 # POST /api/adr/generate
│   │   ├── push-github.ts              # POST /api/adr/push-github
│   │   ├── push-confluence.ts          # POST /api/adr/push-confluence
│   │   ├── list.ts                     # GET  /api/adr/list
│   │   └── prompt-admin.ts             # GET/PUT /api/admin/prompt
│   ├── services/
│   │   ├── github.ts                   # GitHub REST API client
│   │   ├── confluence.ts               # Confluence REST API client
│   │   └── prompt-store.ts             # KV read/write + two-way git sync
│   ├── db/
│   │   ├── schema.sql                  # D1 table definitions (source of truth)
│   │   ├── migrations/
│   │   │   └── 0001_initial.sql
│   │   └── queries.ts                  # All prepared statements — NO string concat
│   ├── mcp/
│   │   ├── server.ts                   # MCP server entry point
│   │   └── tools.ts                    # create_adr, list_adrs, get_adr tools
│   ├── middleware/
│   │   ├── auth.ts                     # CF-Access-Jwt-Assertion validation
│   │   ├── cors.ts                     # Allowlist-based CORS
│   │   └── rate-limit.ts               # Rate limiting wrapper
│   ├── types.ts                        # All TypeScript interfaces (define first)
│   └── utils/
│       ├── sanitize-input.ts           # Prompt injection prevention (SC-003)
│       ├── adr-formatter.ts            # ADRDocument → MADR markdown
│       ├── adr-numbering.ts            # Next ADR ID logic
│       └── generate-slug.ts            # Title → kebab-case slug
├── public/
│   ├── index.html                      # Static UI
│   ├── app.js                          # UI logic: PostHog events, Sentry, Plausible
│   └── style.css
├── tests/
│   ├── unit/
│   │   ├── sanitize-input.test.ts      # SC-003 unit coverage
│   │   ├── adr-formatter.test.ts       # MADR rendering
│   │   ├── adr-numbering.test.ts       # ADR-0001 → ADR-9999 padding
│   │   ├── generate-slug.test.ts       # slug edge cases
│   │   └── prompt-store.test.ts        # KV parse/serialize
│   ├── integration/
│   │   ├── generate-flow.test.ts       # Workers → D1 → mock provider (Miniflare)
│   │   ├── github-push.test.ts         # GitHub API mock
│   │   ├── confluence-push.test.ts     # Confluence API mock
│   │   ├── list-adrs.test.ts           # D1 pagination
│   │   ├── prompt-admin.test.ts        # KV write + git sync
│   │   ├── auth-middleware.test.ts     # JWT validation paths
│   │   └── rate-limit.test.ts          # 429 on 11th request
│   ├── security/
│   │   └── prompt-injection.test.ts    # All SC-003 documented injection attempts
│   ├── e2e/
│   │   ├── happy-path.spec.ts          # Full flow: form → generate → GitHub
│   │   ├── mcp-create-adr.spec.ts      # MCP tool end-to-end
│   │   └── confluence-push.spec.ts     # Confluence integration
│   └── helpers/
│       ├── miniflare-setup.ts          # Miniflare Workers runtime setup
│       ├── mock-anthropic.ts           # Fake tool_use response
│       ├── mock-openai.ts              # Fake OpenAI structured output
│       ├── mock-gemini.ts              # Fake Gemini response
│       └── mock-github.ts              # Fake GitHub Contents API
├── docs/
│   ├── adr/                            # ADR-0000 through ADR-NNNN
│   ├── prompts/                        # Git mirror of KV prompt versions
│   │   └── adr-generator-v1.0.0.md
│   └── golden-set/                     # Input/expected pairs for eval
├── .github/
│   └── workflows/
│       ├── ci.yml                      # lint → typecheck → test → deploy
│       └── prompt-sync.yml             # docs/prompts/ → KV on merge
├── wrangler.toml                       # Environments, bindings (NO secrets)
├── .dev.vars                           # Local secrets — NEVER commit
├── .dev.vars.example                   # Template — safe to commit
├── SECURITY.md                         # Vulnerability disclosure + SC mitigations
├── vitest.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 5. TypeScript Types — Define First

Create `src/types.ts` as the **first file** before any handlers, providers, or services.

```typescript
// src/types.ts

// ─── Cloudflare Worker Environment ───────────────────────────────────────────

export interface Env {
  DB: D1Database;
  PROMPT_STORE: KVNamespace;
  // Secrets (Workers Secrets or .dev.vars)
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;        // Fork 1
  GEMINI_API_KEY: string;        // Fork 2
  GITHUB_PAT: string;
  CONFLUENCE_TOKEN: string;
  CONFLUENCE_BASE_URL: string;
  LANGSMITH_API_KEY: string;
  // Config vars (wrangler.toml [vars] — NOT secrets)
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;
  CONFLUENCE_SPACE_KEY: string;
  ALLOWED_ORIGINS: string;        // comma-separated
  ACCESS_POLICY_AUD: string;      // CF Access audience tag
  AI_PROVIDER: string;            // "anthropic" | "openai" | "gemini" — default: "anthropic"
}

// ─── Provider Abstraction ─────────────────────────────────────────────────────

export interface AIProvider {
  generateADR(input: ADRInput, promptContent: string): Promise<ADRDocument>;
  readonly providerName: string;
}

export type ProviderName = 'anthropic' | 'openai' | 'gemini';
export type QualityMode = 'standard' | 'high';

// ─── ADR Domain Types ─────────────────────────────────────────────────────────

export type ADRStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';

export interface ADRInput {
  title: string;
  context: string;
  decisionDrivers: string[];
  consideredOptions: OptionInput[];
  decision: string;
  rationale: string;
  quality?: QualityMode;
  provider?: ProviderName;
}

export interface OptionInput {
  name: string;
  description: string;
}

export interface ADRDocument {
  id: string;                     // ADR-NNNN (assigned at push time)
  slug: string;                   // kebab-case-title
  title: string;
  status: ADRStatus;
  date: string;                   // ISO date
  contextAndProblem: string;
  decisionDrivers: string[];
  consideredOptions: ConsideredOption[];
  decisionOutcome: DecisionOutcome;
  consequences: Consequences;
}

export interface ConsideredOption {
  name: string;
  description: string;
  pros: string[];                 // minimum 1 item
  cons: string[];                 // minimum 1 item
}

export interface DecisionOutcome {
  chosenOption: string;
  justification: string;          // must reference at least one Decision Driver
}

export interface Consequences {
  positive: string[];
  negative: string[];
  neutral: string[];
}

// ─── API Request / Response Types ────────────────────────────────────────────

export interface GenerateADRRequest {
  input: ADRInput;
}

export interface GenerateADRResponse {
  adr: ADRDocument;
  markdownContent: string;
  generationId: string;
  provider: ProviderName;
  tokensUsed: number;
  durationMs: number;
}

export interface PushGitHubRequest {
  generationId: string;
}

export interface PushGitHubResponse {
  filePath: string;               // docs/adr/ADR-0042-use-cloudflare-workers.md
  commitSha: string;
  adrId: string;                  // ADR-0042
}

export interface PushConfluenceRequest {
  generationId: string;
  parentPageId?: string;
}

export interface PushConfluenceResponse {
  pageId: string;
  pageUrl: string;
}

export interface ListADRsResponse {
  adrs: ADRListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ADRListItem {
  id: string;
  slug: string;
  title: string;
  status: ADRStatus;
  date: string;
  provider: ProviderName;
  githubPath: string | null;
  confluencePageId: string | null;
}

// ─── Prompt Versioning ────────────────────────────────────────────────────────

export interface PromptVersion {
  version: string;                // semver: "1.0.0"
  content: string;
  updatedAt: string;
  updatedBy: string;
  notes: string;
}

// ─── DB Row Types ─────────────────────────────────────────────────────────────

export interface ADRRow {
  id: string;
  adr_id: string | null;          // null until pushed to GitHub
  slug: string;
  title: string;
  status: ADRStatus;
  date: string;
  content_json: string;
  markdown_content: string;
  provider: ProviderName;
  github_path: string | null;
  confluence_page_id: string | null;
  prompt_version: string;
  tokens_used: number;
  duration_ms: number;
  created_at: string;
}

export interface GenerationLogRow {
  id: string;
  input_json: string;
  output_json: string;
  prompt_version: string;
  provider: ProviderName;
  model: string;
  tokens_used: number;
  duration_ms: number;
  langsmith_run_id: string | null;
  created_at: string;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputValidationError';
  }
}

export class ExternalServiceError extends Error {
  constructor(message: string, public readonly retryable: boolean = false) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}
```

---

## 6. D1 Schema — Exact Definition

```sql
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
```

---

## 7. API Routes — Exact Contract

Auth middleware runs before every handler. No exceptions.

### `POST /api/adr/generate`

```
Headers:  CF-Access-Jwt-Assertion (required)
Request:  GenerateADRRequest
Response: GenerateADRResponse

Behaviour:
  1. Validate required fields → 400 if missing
  2. sanitizeInput() on all string fields → 400 InputValidationError if injection detected
  3. Load prompt from KV: "prompt:adr-generator:current"
  4. Resolve provider: request.input.provider ?? env.AI_PROVIDER ?? "anthropic"
  5. Call provider.generateADR() with system prompt in system field (never in messages)
  6. Validate ADRDocument completeness (all 7 sections, options have pros+cons)
  7. Insert to D1: adrs + generation_log (with langsmith_run_id if available)
  8. Return GenerateADRResponse

Errors:
  missing/invalid input  → 400 { error: string, field?: string }
  injection detected     → 400 { error: "Potentially unsafe input detected" }
  provider API error     → 502 { error: "AI generation failed", retryable: true }
  partial tool_use       → retry once with max_tokens * 1.5, then 502
  D1 error               → 500 { error: "Storage error" }

Provider selection priority: request.input.provider > env.AI_PROVIDER > "anthropic"
```

### `POST /api/adr/push-github`

```
Request:  PushGitHubRequest { generationId: string }
Response: PushGitHubResponse

Behaviour:
  1. Load ADR from D1 by generationId → 404 if not found
  2. Get next ADR number: MAX(CAST(REPLACE(adr_id, 'ADR-', '') AS INTEGER)) + 1
     KNOWN LIMITATION SC-011: not atomic. Race condition possible with concurrent calls.
     Documented in ADR-NNNN (persistence strategy). Migration path: Durable Object in v2.
  3. Format: ADR-0001, ADR-0042, ADR-1000 (4-digit minimum, grows naturally)
  4. Build file path: docs/adr/{ADR-NNNN}-{slug}.md
  5. Create file via GitHub Contents API (PUT /repos/{owner}/{repo}/contents/{path})
  6. Update D1: SET github_path, adr_id WHERE id = generationId
  7. Return PushGitHubResponse

Errors:
  generationId not found    → 404
  GitHub 401/403            → 502 { error: "GitHub auth failed" }
  GitHub 422 (file exists)  → 409 { error: "File already exists at path" }
```

### `POST /api/adr/push-confluence`

```
Request:  PushConfluenceRequest
Response: PushConfluenceResponse

Behaviour:
  1. Load ADR from D1 by generationId
  2. Convert ADRDocument → Confluence Storage Format (XHTML)
     Mapping: each MADR section → Confluence heading + content
  3. POST to Confluence REST API v2: /wiki/api/v2/pages
  4. Update D1: SET confluence_page_id WHERE id = generationId
  5. Return PushConfluenceResponse

Errors:
  Confluence 401/403  → 502 { error: "Confluence auth failed" }
  Page title exists   → 409 { error: "Page title already exists in space" }
  IMPORTANT: never log Confluence token in error output (SC-007)
```

### `GET /api/adr/list`

```
Query: status? (filter), limit? (default 20, max 100), offset? (default 0)
Response: ListADRsResponse
Order: created_at DESC
```

### `GET /api/admin/prompt`

```
Response: PromptVersion (current active version from KV)
```

### `PUT /api/admin/prompt`

```
Request:  { version: string, content: string, notes: string }
Response: { ok: true, version: string }

Behaviour:
  1. Write to KV key "prompt:adr-generator:current"
  2. Write to KV key "prompt:adr-generator:{version}"
  3. Insert to D1 table prompt_versions
  4. TWO-WAY SYNC: Create/update file docs/prompts/{version}.md in GitHub via Contents API
     This keeps git as source of truth, not just KV.
  5. Return { ok: true, version }
```

---

## 8. Provider Implementations

### Provider Interface

```typescript
// src/providers/types.ts
export interface AIProvider {
  readonly providerName: ProviderName;
  generateADR(input: ADRInput, promptContent: string, env: Env): Promise<ADRDocumentResult>;
}

export interface ADRDocumentResult {
  adr: ADRDocument;
  tokensUsed: number;
  durationMs: number;
  langsmithRunId: string | null;
}
```

### Anthropic Provider (Default)

```typescript
// src/providers/anthropic.ts

const ADR_TOOL_SCHEMA = {
  name: "create_adr_document",
  description: "Creates a complete Architecture Decision Record in MADR format",
  input_schema: {
    type: "object",
    required: ["title", "status", "contextAndProblem", "decisionDrivers",
               "consideredOptions", "decisionOutcome", "consequences"],
    properties: {
      title: { type: "string" },
      status: { type: "string", enum: ["proposed", "accepted", "deprecated", "superseded"] },
      contextAndProblem: { type: "string" },
      decisionDrivers: { type: "array", items: { type: "string" }, minItems: 1 },
      consideredOptions: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          required: ["name", "description", "pros", "cons"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            pros: { type: "array", items: { type: "string" }, minItems: 1 },
            cons: { type: "array", items: { type: "string" }, minItems: 1 },
          }
        }
      },
      decisionOutcome: {
        type: "object",
        required: ["chosenOption", "justification"],
        properties: {
          chosenOption: { type: "string" },
          justification: { type: "string" },
        }
      },
      consequences: {
        type: "object",
        required: ["positive", "negative", "neutral"],
        properties: {
          positive: { type: "array", items: { type: "string" } },
          negative: { type: "array", items: { type: "string" } },
          neutral:  { type: "array", items: { type: "string" } },
        }
      }
    }
  }
};

async function callAnthropicWithRetry(body: object, apiKey: string, maxAttempts = 2) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json() as any;

    // Extract tool_use block
    const toolUseBlock = data.content?.find((b: any) => b.type === "tool_use");
    if (toolUseBlock?.input && isCompleteADR(toolUseBlock.input)) {
      return { data, toolInput: toolUseBlock.input };
    }

    // Partial response — retry with larger max_tokens
    if (attempt < maxAttempts) {
      (body as any).max_tokens = Math.floor((body as any).max_tokens * 1.5);
      continue;
    }
    throw new ExternalServiceError("Anthropic returned incomplete ADR after retry", true);
  }
}

// CRITICAL: system prompt goes in `system` field, NEVER in messages array
// User input goes in messages array ONLY
```

### LangSmith Tracing

```typescript
// Wrap every provider call with LangSmith trace
async function withLangSmithTrace<T>(
  runName: string,
  inputs: Record<string, unknown>,
  fn: () => Promise<T>,
  apiKey: string,
  projectName: string
): Promise<{ result: T; runId: string | null }> {
  // POST to LangSmith runs API before call
  // PATCH to LangSmith with outputs after call
  // On failure: log warning, do NOT fail the main request
  // LangSmith errors are non-blocking
}
```

Key: LangSmith is **non-blocking**. If LangSmith is down or rate-limited, the main ADR generation still succeeds. Log warning to console, continue.

### Partial tool_use Fallback

```typescript
function isCompleteADR(input: unknown): input is ADRDocument {
  if (typeof input !== 'object' || input === null) return false;
  const doc = input as Partial<ADRDocument>;
  return !!(
    doc.title &&
    doc.status &&
    doc.contextAndProblem &&
    doc.decisionDrivers?.length &&
    doc.consideredOptions?.length >= 2 &&
    doc.consideredOptions.every(o => o.pros?.length && o.cons?.length) &&
    doc.decisionOutcome?.chosenOption &&
    doc.decisionOutcome?.justification &&
    doc.consequences
  );
}
```

---

## 9. Security Implementation

### SC-001 — Secrets

```
Local dev:    .dev.vars (git-ignored — verified by gitleaks hook)
CI:           GitHub Secrets
Production:   wrangler secret put ANTHROPIC_API_KEY
              wrangler secret put OPENAI_API_KEY
              wrangler secret put GEMINI_API_KEY
              wrangler secret put GITHUB_PAT
              wrangler secret put CONFLUENCE_TOKEN
              wrangler secret put CONFLUENCE_BASE_URL
              wrangler secret put LANGSMITH_API_KEY

NEVER in:     wrangler.toml [vars] / code / KV / git history
```

Pre-commit hook:
```bash
# .git/hooks/pre-commit
#!/bin/sh
gitleaks detect --staged --no-git -v
if [ $? -ne 0 ]; then
  echo "❌ Gitleaks: secret detected. Commit blocked."
  exit 1
fi
```

### SC-002 — CF Access JWT

```typescript
// src/middleware/auth.ts
export async function validateAccess(request: Request, env: Env): Promise<Response | null> {
  const jwt = request.headers.get('CF-Access-Jwt-Assertion');
  if (!jwt) return json401('Unauthorized');
  const isValid = await verifyCFAccessJWT(jwt, env.ACCESS_POLICY_AUD);
  if (!isValid) return json401('Invalid token');
  return null; // null = pass through
}
```

### SC-003 — Prompt Injection Prevention

```typescript
// src/utils/sanitize-input.ts
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above)\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /act\s+as\s+/i,
  /system\s*:/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /ignore\s+above/i,
  /reveal\s+your\s+system\s+prompt/i,
  /DAN\s+mode/i,
];

export function sanitizeInput(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length > 10000) throw new InputValidationError('Input too long (max 10000 chars)');
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) throw new InputValidationError('Potentially unsafe input detected');
  }
  return trimmed.replace(/[<>]/g, '');
}
```

Security test file `tests/security/prompt-injection.test.ts` must cover all 9 patterns.
Each pattern gets its own named test case. DoD requires all 9 pass before deploy.

### SC-007 — No Credentials in Error Logs

```typescript
// src/services/confluence.ts
try {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (err) {
  // CORRECT: log sanitized message only
  console.error('Confluence API error:', err instanceof Error ? err.message : 'unknown');
  // NEVER: console.error('Confluence error', { token, url, headers })
  throw new ExternalServiceError('Confluence push failed');
}
```

### SC-011 — ADR Numbering Known Limitation

Document in ADR-0003 (Persistence Strategy):
- Race condition is acknowledged
- Probability: negligible at 10–20 req/day
- Detection: UNIQUE constraint on `adr_id` column will cause 409 on conflict
- Recovery: client retries the push (the same ADR content, new number assigned)
- Migration path v2: Cloudflare Durable Object for atomic counter

---

## 10. Observability Stack

P1 implements four-layer observability. Each layer is required for DoD.

### Layer 1: Cloudflare Analytics
Built-in. No setup required. Workers request/error metrics visible at dash.cloudflare.com.

### Layer 2: LangSmith (AI Call Tracing)
```
Registration: smith.langchain.com (free, 5k traces/month)
Project name: "p1-adr-tool"
Secret: LANGSMITH_API_KEY → Workers Secret
Traces: every call to generateADR() across all providers
Visible: tokens used, latency, prompt version, provider, input/output
CV signal: "AI cost discipline in production from project 1"
Public link: include in README
```

### Layer 3: Plausible + PostHog (Product Analytics)
```
Plausible:
  Registration: plausible.io (30-day trial) OR self-hosted (free, OSS)
  Script: added to public/index.html
  Events: automatic pageview tracking

PostHog:
  Registration: app.posthog.com (free, 1M events/month)
  Project key: in public/app.js
  Events (manually tracked):
    posthog.capture('form_filled', { provider: selected, quality: mode })
    posthog.capture('adr_generated', { sections_count: 7, provider, tokens_used })
    posthog.capture('pushed_to_github', { adr_id, file_path })
    posthog.capture('pushed_to_confluence', { page_id })
  Funnel: form_filled → adr_generated → pushed_to_github
  Retention: 7d and 30d cohorts
  Session replay: enabled (free tier)
```

### Layer 4: Sentry (Frontend Error Tracking)
```
Registration: sentry.io (free, 5k errors/month)
Project: "adr-tool-frontend"
DSN: in public/app.js as SENTRY_DSN constant
Init: Sentry.init({ dsn: SENTRY_DSN, environment: 'production' })
Verify: trigger test error manually, confirm visible in Sentry dashboard
```

---

## 11. KV Prompt Versioning — Two-Way Sync

Key schema:
```
prompt:adr-generator:current     ← active at runtime (always this key)
prompt:adr-generator:v1.0.0      ← archived
prompt:adr-generator:v1.1.0      ← archived
```

**Two-way sync contract:**
- **KV → runtime:** always reads `current` key
- **Git → KV:** CI job `prompt-sync.yml` on push to `main` when `docs/prompts/**` changes
- **KV → git:** `PUT /api/admin/prompt` handler writes to both KV AND creates/updates `docs/prompts/{version}.md` via GitHub API

This makes git the source of truth in both directions. No divergence possible.

**Rollback procedure:**
```bash
# Read old version
wrangler kv key get "prompt:adr-generator:v1.0.0" --binding PROMPT_STORE

# Restore to current (immediate, no deploy needed)
wrangler kv key put "prompt:adr-generator:current" \
  "$(cat docs/prompts/adr-generator-v1.0.0.md)" \
  --binding PROMPT_STORE
```

---

## 12. MCP Server

```typescript
// src/mcp/tools.ts
export const MCP_TOOLS = [
  {
    name: "create_adr",
    description: "Generate and push an Architecture Decision Record to GitHub",
    inputSchema: {
      type: "object",
      required: ["title", "context", "options", "decision"],
      properties: {
        title:    { type: "string" },
        context:  { type: "string" },
        options:  { type: "array", items: { type: "string" }, minItems: 2 },
        decision: { type: "string" },
        quality:  { type: "string", enum: ["standard", "high"], default: "standard" },
        provider: { type: "string", enum: ["anthropic", "openai", "gemini"], default: "anthropic" },
      }
    }
  },
  {
    name: "list_adrs",
    description: "List all ADRs in the repository",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["proposed", "accepted", "deprecated", "superseded"] },
        limit:  { type: "number", default: 20 },
      }
    }
  },
  {
    name: "get_adr",
    description: "Retrieve a specific ADR by ID",
    inputSchema: {
      type: "object",
      required: ["adrId"],
      properties: {
        adrId: { type: "string", description: "e.g. ADR-0042" }
      }
    }
  }
];
```

Adding to Claude Code:
```json
// ~/.claude/mcp_servers.json
{
  "adr-tool": {
    "url": "https://adr-tool.YOUR_SUBDOMAIN.workers.dev/mcp",
    "headers": {
      "CF-Access-Client-Id": "YOUR_SERVICE_TOKEN_ID",
      "CF-Access-Client-Secret": "YOUR_SERVICE_TOKEN_SECRET"
    }
  }
}
```

---

## 13. CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD

on:
  push:    { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  quality-gate:
    name: Lint + TypeCheck + Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci

      - name: TypeScript check
        run: npx tsc --noEmit

      - name: ESLint (zero warnings)
        run: npm run lint -- --max-warnings 0

      - name: Gitleaks secrets scan
        uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }

      - name: Unit tests
        run: npm run test:unit

      - name: Integration tests (Miniflare)
        run: npm run test:integration

      - name: Security tests (injection)
        run: npm run test:security

      - name: Coverage check (80%+ core modules)
        run: npm run test:coverage

  deploy-staging:
    name: Deploy Staging
    needs: quality-gate
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - name: Deploy staging
        run: npx wrangler deploy --env staging
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }} }

  deploy-production:
    name: Deploy Production
    needs: quality-gate
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - name: Deploy production
        run: npx wrangler deploy --env production
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }} }
```

```yaml
# .github/workflows/prompt-sync.yml
name: Prompt Sync (Git → KV)

on:
  push:
    branches: [main]
    paths: ['docs/prompts/**']

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g wrangler
      - name: Sync prompts to KV
        run: |
          for file in docs/prompts/*.md; do
            version=$(basename "$file" .md | sed 's/adr-generator-//')
            content=$(cat "$file")
            echo "Syncing version $version to KV"
            echo "$content" | wrangler kv key put "prompt:adr-generator:$version" --binding PROMPT_STORE
          done
          # Always update current to latest version
          latest=$(ls docs/prompts/*.md | sort -V | tail -1)
          cat "$latest" | wrangler kv key put "prompt:adr-generator:current" --binding PROMPT_STORE
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }} }
```

---

## 14. wrangler.toml Structure

```toml
# wrangler.toml — NO secrets here, only non-sensitive config
name = "adr-tool"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
GITHUB_REPO_OWNER = "subbotin-es"
GITHUB_REPO_NAME = "adr-tool"
CONFLUENCE_SPACE_KEY = "ARCH"
ALLOWED_ORIGINS = "https://adr-tool.pages.dev,https://adr.subbotin.es"
ACCESS_POLICY_AUD = "FILL_AFTER_CF_ACCESS_SETUP"
AI_PROVIDER = "anthropic"

[[d1_databases]]
binding = "DB"
database_name = "adr-tool-db"
database_id = "FILL_AFTER_CREATION"

[[kv_namespaces]]
binding = "PROMPT_STORE"
id = "FILL_AFTER_CREATION"

[[unsafe.bindings]]
name = "RATE_LIMITER"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 10, period = 60 }

[env.staging]
name = "adr-tool-staging"
vars = { ALLOWED_ORIGINS = "https://adr-tool-staging.pages.dev", AI_PROVIDER = "anthropic" }

[[env.staging.d1_databases]]
binding = "DB"
database_name = "adr-tool-db-staging"
database_id = "FILL_AFTER_CREATION"

[[env.staging.kv_namespaces]]
binding = "PROMPT_STORE"
id = "FILL_AFTER_CREATION"

[env.production]
name = "adr-tool-production"
vars = { ALLOWED_ORIGINS = "https://adr.subbotin.es", AI_PROVIDER = "anthropic" }
```

---

## 15. Infrastructure Setup — Step by Step

### Step 1: Accounts & Prerequisites

**Cloudflare:** https://dash.cloudflare.com/sign-up → note Account ID.

**Anthropic:** https://console.anthropic.com → Settings → API Keys → Create `p1-adr-tool-production`.

**OpenAI (for Fork 1):** https://platform.openai.com → API Keys → Create `p1-adr-tool-fork1`.

**Google (for Fork 2):** https://makersuite.google.com → Get API key for `gemini-1.5-flash`.

**LangSmith:** https://smith.langchain.com → Sign up (free) → Settings → API Keys → Create key.
Project name: `p1-adr-tool`.

**Sentry:** https://sentry.io → Sign up → Create project "adr-tool-frontend" (JavaScript) → copy DSN.

**PostHog:** https://app.posthog.com → Sign up → Create project → copy Project API key.

**Plausible:** https://plausible.io → Start trial (30 days free) OR self-host (OSS).

**GitHub:** Existing account. Fine-grained PAT: only `contents:write` on `adr-tool` repo.

**Confluence:** Existing account. Settings → Security → API tokens → Create `p1-adr-tool`.

### Step 2: Install Local Tooling

```bash
# Node 20 LTS
nvm install 20 && nvm use 20

# Wrangler
npm install -g wrangler
wrangler login
wrangler whoami  # verify

# Gitleaks
brew install gitleaks
gitleaks version  # verify
```

### Step 3: Create GitHub Repository

```bash
# Create public repo: adr-tool at github.com/new

git clone https://github.com/subbotin-es/adr-tool.git
cd adr-tool

cat > .gitignore << 'EOF'
node_modules/
.dev.vars
.wrangler/
dist/
*.tsbuildinfo
.DS_Store
coverage/
EOF

git add .gitignore
git commit -m "chore: initial — protect secrets before first commit"
git push
```

### Step 4: Cloudflare D1 + KV Setup

```bash
wrangler d1 create adr-tool-db           # → paste database_id into wrangler.toml
wrangler d1 create adr-tool-db-staging   # → paste staging database_id

wrangler kv namespace create PROMPT_STORE           # → paste id
wrangler kv namespace create PROMPT_STORE --env staging  # → paste staging id

# Apply schema
wrangler d1 execute adr-tool-db --file=src/db/schema.sql
wrangler d1 execute adr-tool-db-staging --file=src/db/schema.sql
```

### Step 5: Workers Secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put GITHUB_PAT
wrangler secret put CONFLUENCE_TOKEN
wrangler secret put CONFLUENCE_BASE_URL
wrangler secret put LANGSMITH_API_KEY

# Staging (same values)
wrangler secret put ANTHROPIC_API_KEY --env staging
wrangler secret put OPENAI_API_KEY --env staging
wrangler secret put GEMINI_API_KEY --env staging
wrangler secret put GITHUB_PAT --env staging
wrangler secret put CONFLUENCE_TOKEN --env staging
wrangler secret put CONFLUENCE_BASE_URL --env staging
wrangler secret put LANGSMITH_API_KEY --env staging

wrangler secret list  # verify (shows names, not values)
```

### Step 6: Cloudflare Access

```
Dashboard → Zero Trust → Access → Applications → Add
Type: Self-hosted
Name: ADR Tool
Domain: adr-tool.YOUR_SUBDOMAIN.workers.dev
Session: 24 hours
Identity providers: One-time PIN (email)
Policy: Emails → your email(s)
Note the AUD tag → paste into wrangler.toml ACCESS_POLICY_AUD

Service Token (for MCP access from Claude Code):
Access → Service Auth → Create Service Token
Name: claude-code-mcp
Save Client ID + Client Secret to 1Password
```

### Step 7: GitHub Actions Secrets

```
GitHub repo → Settings → Secrets and variables → Actions:

CF_API_TOKEN    (Cloudflare API token — Template: Edit Cloudflare Workers)
                Permissions: Workers Scripts:Edit + Workers KV:Edit + D1:Edit
```

### Step 8: Local Dev

```bash
cat > .dev.vars << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
GITHUB_PAT=github_pat_...
CONFLUENCE_TOKEN=...
CONFLUENCE_BASE_URL=https://yourspace.atlassian.net
LANGSMITH_API_KEY=ls__...
EOF

cp .dev.vars .dev.vars.example
# Edit .dev.vars.example to remove real values, keep key names

# Install Gitleaks pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
gitleaks detect --staged --no-git -v
if [ $? -ne 0 ]; then
  echo "❌ Secret detected. Commit blocked."
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit

# Test hook (should be blocked)
git add .dev.vars
# Expected: blocked. Then:
git reset .dev.vars

npm install --save-dev wrangler typescript @cloudflare/workers-types vitest @vitest/coverage-v8 miniflare

wrangler dev  # start local dev server
```

### Step 9: CodeClimate Setup

```
codeclimate.com → Log in with GitHub → Add Repository → adr-tool
Target: Maintainability Grade A
Add .codeclimate.yml with TypeScript coverage settings
```

### Step 10: Seed Initial Prompt to KV

```bash
# After writing docs/prompts/adr-generator-v1.0.0.md (see Section 16):

wrangler kv key put "prompt:adr-generator:current" \
  "$(cat docs/prompts/adr-generator-v1.0.0.md)" \
  --binding PROMPT_STORE

wrangler kv key put "prompt:adr-generator:v1.0.0" \
  "$(cat docs/prompts/adr-generator-v1.0.0.md)" \
  --binding PROMPT_STORE

wrangler kv key get "prompt:adr-generator:current" --binding PROMPT_STORE  # verify
```

### Step 11: First Deploy

```bash
wrangler deploy --env staging
# Test:
curl -X POST https://adr-tool-staging.YOUR_SUBDOMAIN.workers.dev/api/adr/generate \
  -H "Content-Type: application/json" \
  -H "CF-Access-Jwt-Assertion: STAGING_TEST_TOKEN" \
  -d '{"input": {"title": "Test", "context": "test context", "decisionDrivers": ["driver1"], "consideredOptions": [{"name":"A","description":"opt A"},{"name":"B","description":"opt B"}], "decision": "A", "rationale": "better fit"}}'

# After staging passes:
wrangler deploy --env production
```

---

## 16. Initial Prompt — v1.0.0

Save as `docs/prompts/adr-generator-v1.0.0.md`.

```markdown
You are an expert software architect specializing in Architecture Decision Records (ADRs).

Your task is to create a complete, high-quality ADR in MADR (Markdown Architectural Decision Records) format.

Given the decision context, considered options, and chosen direction provided by the user, you must use the create_adr_document tool to produce a structured ADR.

Quality standards:
1. Context and Problem Statement: explains WHY a decision was needed, not just what was decided
2. Decision Drivers: specific forces, constraints, or quality attributes (not generic "we want fast")
3. Considered Options: minimum 2 options, each with at minimum 1 pro and 1 con. Be honest about trade-offs.
4. Decision Outcome: clearly states which option was chosen AND why, referencing specific Decision Drivers by name
5. Consequences: realistic outcomes — positive (what gets better), negative (what gets worse or needs monitoring), neutral (what changes but is neither good nor bad)

Specificity requirements:
- Pros/cons must be concrete, not vague ("reduces cold start from ~200ms to ~0ms", not just "faster")
- Negative consequences must include mitigation or acceptance rationale
- Justification must explicitly reference at least one Decision Driver

Status defaults to "accepted" unless the user specifies otherwise.
```

---

## 17. Definition of Done — Per Task

```
□ tsc --noEmit — zero errors
□ ESLint — zero warnings (npm run lint -- --max-warnings 0)
□ Unit test written and passes for new logic
□ Gitleaks pre-commit passes (no secrets)
□ D1 queries use prepared statements (no string interpolation)
□ Error handling doesn't log credentials
□ LangSmith tracing works for new provider calls
□ PostHog events fire on new user actions
□ Task status updated in DOC-003 backlog
□ Commit message: type(T-XXX): description
   Types: feat, fix, docs, test, chore, refactor, security
```

---

## 18. Day-by-Day Prompts

---

### DAY 1 PROMPT — Infrastructure

```
Read CLAUDE.md Section 15 (Infrastructure Setup) completely before starting.

Goal: All infrastructure ready. Zero application code today.

Tasks in order:
1. Verify accounts: Cloudflare, GitHub, Anthropic, OpenAI, Gemini, LangSmith, Sentry, PostHog, Plausible, Confluence
2. Verify tools: wrangler --version, gitleaks version, node --version (must be 20.x)
3. Create GitHub repo, clone, add .gitignore, first commit
4. wrangler d1 create adr-tool-db → note database_id → paste into wrangler.toml
5. wrangler d1 create adr-tool-db-staging → note staging database_id
6. wrangler kv namespace create PROMPT_STORE → note id → paste into wrangler.toml
7. wrangler kv namespace create PROMPT_STORE --env staging → note staging id
8. Create wrangler.toml from Section 14 (fill in all FILL_AFTER_CREATION values)
9. Create .dev.vars and .dev.vars.example
10. Install Gitleaks pre-commit hook
11. Test hook: git add .dev.vars → should be blocked
12. wrangler secret put for all 8 secrets (production)
13. wrangler secret put for all 8 secrets --env staging
14. Create GitHub Actions secret CF_API_TOKEN (Cloudflare API token)
15. Set up Cloudflare Access: Application + email policy + note AUD tag → update wrangler.toml
16. Create Cloudflare Service Token for MCP: save Client ID + Secret to 1Password
17. Set up CodeClimate on repo

After completing, verify:
- wrangler whoami → your account
- wrangler d1 list → 2 databases
- wrangler kv namespace list → 2 namespaces
- wrangler secret list → 8 secrets

Do NOT write any TypeScript today. Infrastructure only.
```

---

### DAY 2 PROMPT — Types, Schema, Utils, Providers

```
Read CLAUDE.md Sections 5, 6, 8 before starting.

Goal: TypeScript foundation + D1 schema + all providers working (mocked first).

Tasks in order:
1. Create src/types.ts (Section 5 — exact types, all exported, no deviation)
2. Create src/db/schema.sql (Section 6)
3. Run: wrangler d1 execute adr-tool-db --file=src/db/schema.sql
4. Run: wrangler d1 execute adr-tool-db-staging --file=src/db/schema.sql
5. Create src/db/migrations/0001_initial.sql (copy of schema.sql)
6. Create src/db/queries.ts — all prepared statements, zero string interpolation
7. Create src/utils/sanitize-input.ts (Section 9 SC-003 patterns — all 9 patterns)
8. Create src/utils/adr-formatter.ts — ADRDocument → MADR markdown
9. Create src/utils/adr-numbering.ts — nextADRId with SC-011 comment
10. Create src/utils/generate-slug.ts — title → kebab-case
11. Create src/providers/types.ts — AIProvider interface
12. Write docs/prompts/adr-generator-v1.0.0.md (Section 16 — exact content)
13. Create src/providers/anthropic.ts — AnthropicProvider with LangSmith tracing + retry
14. Create src/providers/openai.ts — OpenAIProvider (structured outputs via response_format)
15. Create src/providers/gemini.ts — GeminiProvider (structured output via response schema)
16. Create src/services/prompt-store.ts — KV read/write

After each file: tsc --noEmit. Fix all errors before proceeding.

Write unit tests immediately after each util:
- tests/unit/sanitize-input.test.ts (9 injection patterns + happy paths + edge cases)
- tests/unit/adr-formatter.test.ts (all 7 sections rendered correctly, empty arrays)
- tests/unit/adr-numbering.test.ts (ADR-0001, ADR-0042, ADR-1000 padding)
- tests/unit/generate-slug.test.ts (special chars, unicode, very long title)

Seed KV after prompt file created: Step 10 from Section 15.
```

---

### DAY 3 PROMPT — HTTP Handlers, Middleware, Services

```
Read CLAUDE.md Sections 7, 9 before starting.

Goal: All API endpoints working with full security middleware.

Implement in order:
1. Create src/middleware/auth.ts — CF-Access-Jwt-Assertion validation (SC-002)
2. Create src/middleware/cors.ts — ALLOWED_ORIGINS allowlist, no wildcard (SC-008)
3. Create src/middleware/rate-limit.ts — RATE_LIMITER binding wrapper (SC-005)
4. Create src/index.ts — route dispatch with all middleware applied
5. Create src/services/github.ts — GitHub Contents API (push file)
6. Create src/services/confluence.ts — Confluence REST API v2 (create page, SC-007 error handling)
7. Create src/handlers/generate.ts — full flow with provider selection
8. Create src/handlers/push-github.ts — SC-011 comment, 409 on UNIQUE conflict
9. Create src/handlers/push-confluence.ts
10. Create src/handlers/list.ts — pagination support
11. Create src/handlers/prompt-admin.ts — GET + PUT with two-way sync (Section 11)

Security checks after each handler:
□ Input sanitized before reaching any provider
□ No credentials in error messages or logs
□ Prepared statements only
□ Auth middleware applied first

Write integration tests (Miniflare):
- tests/integration/generate-flow.test.ts
- tests/integration/github-push.test.ts
- tests/integration/confluence-push.test.ts
- tests/integration/auth-middleware.test.ts (missing JWT → 401, invalid → 403)
- tests/integration/rate-limit.test.ts (11th request → 429)
- tests/security/prompt-injection.test.ts (all 9 patterns → 400)

Manual test with wrangler dev:
curl -X POST http://localhost:8787/api/adr/generate \
  -H "Content-Type: application/json" \
  -H "CF-Access-Jwt-Assertion: test-local" \
  -d '{"input": {"title": "Use D1 vs PostgreSQL", "context": "Need DB for ADR storage", "decisionDrivers": ["cost", "latency"], "consideredOptions": [{"name":"D1","description":"SQLite edge"},{"name":"PostgreSQL","description":"Managed cloud"}], "decision": "D1", "rationale": "zero latency, free tier, fits scale"}}'
Expected: 200 + ADRDocument with all 7 sections
```

---

### DAY 4 PROMPT — MCP Server + E2E Tests + Observability Verification

```
Read CLAUDE.md Sections 12, 10 before starting.

Goal: MCP working in Claude Code + E2E tests passing + observability confirmed.

1. Create src/mcp/tools.ts (Section 12 — all 3 tools with provider param)
2. Create src/mcp/server.ts — MCP request handler
3. Wire /mcp route in src/index.ts
4. Add MCP to ~/.claude/mcp_servers.json (Section 12)
5. Test MCP: open Claude Code → create_adr("choosing DB", ["D1","PostgreSQL"], "D1")
   → verify file appears in GitHub repo docs/adr/

E2E tests:
6. Create tests/e2e/happy-path.spec.ts — full flow: generate → push-github → verify file
7. Create tests/e2e/mcp-create-adr.spec.ts — MCP tool end-to-end
8. Create tests/e2e/confluence-push.spec.ts — (mock Confluence in CI, real in manual run)

Observability verification:
9. LangSmith: generate one ADR → check smith.langchain.com → trace visible with tokens+latency
10. Sentry: trigger test error in public/app.js → verify visible in Sentry dashboard
11. PostHog: open UI, fill form, generate ADR → verify events in PostHog Live Events

Run full test suite: npm test
All must pass before proceeding.

Deploy staging: wrangler deploy --env staging
Smoke test staging endpoint.
```

---

### DAY 5 PROMPT — UI, Provider Forks, Documentation, Portfolio

```
Goal: Static UI + both provider forks + all documentation + CI green.

UI:
1. Create public/index.html — form: title, context, options (textarea), decision
   Provider selector: Anthropic / OpenAI / Gemini
   Quality toggle: Standard / High
2. Create public/app.js — fetch /api/adr/generate → preview markdown → push buttons
   PostHog events: form_filled, adr_generated, pushed_to_github
   Sentry.init for error tracking
   Plausible script already in index.html
3. Create public/style.css — clean utility aesthetic
4. Deploy to Cloudflare Pages: wrangler pages deploy public/
5. Add Pages URL to ALLOWED_ORIGINS in wrangler.toml, redeploy

Provider forks:
6. Verify OpenAIProvider (T-041b): generate ADR with provider=openai → verify quality
7. Verify GeminiProvider (T-041c): generate ADR with provider=gemini → verify quality
8. Run Golden Set (T-063): 3 identical inputs through all 3 providers → score 1–5 per criteria
   Document in DOC-P1-008 (Multi-Provider Comparison Report)

Documentation:
9. Create SECURITY.md (vulnerability disclosure + SC-001 through SC-011 mitigations)
10. Write README.md:
    - What it does (2 sentences)
    - Live demo URL + LangSmith public dashboard link
    - GitHub repo URL
    - Stack table (include all 4 providers)
    - How to run locally
    - MCP integration (link to DOC-P1-004)
    - Observability: LangSmith + Plausible + PostHog + Sentry
    - Multi-provider support
    - Security notes (link to SECURITY.md + SC-001 through SC-011 summary)
11. Create docs/adr/ADR-0000-use-adr-tool-for-itself.md (meta-ADR)
12. Write DOC-P1-007 Observability Guide (how to read each dashboard)
13. Write DOC-P1-008 Multi-Provider Comparison Report (Golden Set results)

CI verification:
14. Push feature branch → open PR → quality-gate green → deploy-staging runs
15. Merge to main → deploy-production runs
16. Verify prompt-sync.yml: edit docs/prompts/adr-generator-v1.0.0.md → push → KV updates

Final checklist:
□ wrangler dev: all endpoints return correct responses
□ Gitleaks hook blocks .dev.vars
□ CI pipeline green on main
□ MCP create_adr end-to-end in Claude Code
□ All 3 providers generate valid ADRs
□ LangSmith traces visible for all 3 providers
□ PostHog funnel visible (form_filled → adr_generated → pushed_to_github)
□ Sentry error visible in dashboard
□ Plausible pageview visible
□ CodeClimate Grade A
□ SECURITY.md committed
□ ADR-0000 committed
□ README with all links deployed
□ Multi-Provider Comparison Report drafted
```

---

## 19. Common Errors and How to Fix Them

**`Error: No such binding 'DB'`**
→ `wrangler.toml` has wrong or missing `database_id`. Run `wrangler d1 list`.

**`Error: Undefined binding 'ANTHROPIC_API_KEY'`**
→ Secret not set. Run `wrangler secret put ANTHROPIC_API_KEY`. Check `.dev.vars` locally.

**`Error: Undefined binding 'LANGSMITH_API_KEY'`**
→ Same pattern. `wrangler secret put LANGSMITH_API_KEY`. LangSmith failures are non-blocking — but missing key means no traces.

**Gitleaks blocks commit**
→ `gitleaks detect --staged -v` to see what triggered it. False positive → add to `.gitleaksignore`. Never disable the hook.

**CF Access returns 401 on all staging requests**
→ `wrangler dev` bypasses Access. In staging: verify Access Application domain matches `adr-tool-staging.YOUR_SUBDOMAIN.workers.dev` exactly. Check AUD tag in `wrangler.toml`.

**`D1_ERROR: no such table: adrs`**
→ Migration not run. `wrangler d1 execute adr-tool-db --file=src/db/schema.sql`

**Anthropic returns tool_use but content is missing sections**
→ `isCompleteADR()` returns false → auto-retry with `max_tokens * 1.5`. If second attempt also incomplete → 502 with `retryable: true`. Client should show "Try with quality=high".

**OpenAI structured output missing fields**
→ gpt-4o-mini supports `response_format: { type: "json_schema", json_schema: {...} }`. Verify schema is passed correctly. gpt-4o-mini has 16k context — ADR generation should never hit it.

**Gemini returns unstructured text**
→ Gemini 1.5 Flash: use `generationConfig.responseMimeType = "application/json"` + `responseSchema`. Without this it returns prose.

**KV returns null for prompt**
→ Prompt not seeded. Run Step 10 from Section 15. Check key: `prompt:adr-generator:current` (colons, exact spelling).

**GitHub API 422 on push**
→ File already exists. ADR numbering returned duplicate (SC-011). D1 `UNIQUE` on `adr_id` prevents DB insert but not the file creation race. Recovery: client retries the push, new number assigned.

**MCP tool not in Claude Code**
→ Verify `~/.claude/mcp_servers.json` valid JSON. Restart Claude Code. Verify Service Token is active in CF Access dashboard.

**PostHog events not appearing**
→ Check Project API key in `public/app.js`. Verify no adblocker blocking `app.posthog.com`. Check PostHog Live Events tab (real-time, not historical).

**`tsc` passes locally, fails in CI**
→ CI uses `npm ci` (clean install). Check all `@types/*` are in `devDependencies`, not just installed locally.

**CodeClimate Grade D/E**
→ Check Issues tab. Likely: function complexity too high (split into smaller functions), duplicate code, or missing test coverage. Fix before PR merge.

---

## 20. Branching Strategy

```
main          → production (auto-deploy on merge)
feat/T-XXX    → feature branches (one per ToDo task)
fix/T-XXX     → bug fix branches
docs/T-XXX    → documentation branches
security/SC-XX → security fix branches (fast-track review)
```

PR requirements:
- CI quality-gate passes
- Gitleaks clean
- TypeScript zero errors, ESLint zero warnings
- Unit tests updated for changed logic
- CodeClimate no new issues

Commit format: `type(T-XXX): description`

---

*End of CLAUDE.md*
*Version 2.0 | May 2026 | Evgenii Subbotin*
*Aligned with: Portfolio Projects Roadmap v4 | Strategic Research v2.1 | Meta CV v1.7*
