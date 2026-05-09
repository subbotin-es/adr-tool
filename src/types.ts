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
