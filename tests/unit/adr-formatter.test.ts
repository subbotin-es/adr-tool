import { describe, it, expect } from 'vitest';
import { formatADRMarkdown } from '../../src/utils/adr-formatter';
import type { ADRDocument } from '../../src/types';

const baseDoc: ADRDocument = {
  id: 'test-uuid',
  slug: 'use-cloudflare-workers',
  title: 'Use Cloudflare Workers',
  status: 'accepted',
  date: '2024-01-15',
  contextAndProblem: 'We need a serverless runtime with near-zero cold start latency.',
  decisionDrivers: ['Zero cold start', 'Cost under $2/month'],
  consideredOptions: [
    {
      name: 'Cloudflare Workers',
      description: 'Edge serverless with V8 isolates.',
      pros: ['~0ms cold start', 'Native D1 binding'],
      cons: ['No Node.js built-ins'],
    },
    {
      name: 'AWS Lambda',
      description: 'Traditional FaaS with container model.',
      pros: ['Mature ecosystem'],
      cons: ['~200ms cold start', 'Extra cost'],
    },
  ],
  decisionOutcome: {
    chosenOption: 'Cloudflare Workers',
    justification: 'Addresses the Zero cold start driver and stays within the $2/month budget.',
  },
  consequences: {
    positive: ['~0ms cold starts in production'],
    negative: ['No Node.js built-ins available'],
    neutral: ['New Wrangler tooling required'],
  },
};

describe('formatADRMarkdown — all 7 MADR sections present', () => {
  it('renders title as H1', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('# Use Cloudflare Workers');
  });

  it('renders status line', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('* Status: accepted');
  });

  it('renders date line', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('* Date: 2024-01-15');
  });

  it('renders Context and Problem Statement section', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('## Context and Problem Statement');
    expect(md).toContain('near-zero cold start latency');
  });

  it('renders Decision Drivers section with all drivers', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('## Decision Drivers');
    expect(md).toContain('* Zero cold start');
    expect(md).toContain('* Cost under $2/month');
  });

  it('renders Considered Options section listing option names', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('## Considered Options');
    expect(md).toContain('* Cloudflare Workers');
    expect(md).toContain('* AWS Lambda');
  });

  it('renders Decision Outcome with chosen option and justification', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('## Decision Outcome');
    expect(md).toContain('Chosen option: "Cloudflare Workers"');
    expect(md).toContain('Zero cold start driver');
  });

  it('renders Pros and Cons section with all options', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('## Pros and Cons of the Options');
    expect(md).toContain('### Cloudflare Workers');
    expect(md).toContain('### AWS Lambda');
  });

  it('renders pros with Good prefix', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('* Good, because ~0ms cold start');
    expect(md).toContain('* Good, because Mature ecosystem');
  });

  it('renders cons with Bad prefix', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('* Bad, because No Node.js built-ins');
    expect(md).toContain('* Bad, because ~200ms cold start');
  });
});

describe('formatADRMarkdown — consequences sections', () => {
  it('renders Positive Consequences', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('### Positive Consequences');
    expect(md).toContain('* ~0ms cold starts in production');
  });

  it('renders Negative Consequences', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('### Negative Consequences');
    expect(md).toContain('* No Node.js built-ins available');
  });

  it('renders Neutral Consequences', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('### Neutral Consequences');
    expect(md).toContain('* New Wrangler tooling required');
  });

  it('omits Positive Consequences section when array is empty', () => {
    const doc = { ...baseDoc, consequences: { ...baseDoc.consequences, positive: [] } };
    const md = formatADRMarkdown(doc);
    expect(md).not.toContain('### Positive Consequences');
  });

  it('omits Negative Consequences section when array is empty', () => {
    const doc = { ...baseDoc, consequences: { ...baseDoc.consequences, negative: [] } };
    const md = formatADRMarkdown(doc);
    expect(md).not.toContain('### Negative Consequences');
  });

  it('omits Neutral Consequences section when array is empty', () => {
    const doc = { ...baseDoc, consequences: { ...baseDoc.consequences, neutral: [] } };
    const md = formatADRMarkdown(doc);
    expect(md).not.toContain('### Neutral Consequences');
  });
});

describe('formatADRMarkdown — adrId prefix', () => {
  it('prepends ADR-NNNN to title when adrId provided', () => {
    const md = formatADRMarkdown(baseDoc, 'ADR-0042');
    expect(md).toContain('# ADR-0042: Use Cloudflare Workers');
  });

  it('uses bare title when adrId omitted', () => {
    const md = formatADRMarkdown(baseDoc);
    expect(md).toContain('# Use Cloudflare Workers');
    expect(md).not.toContain('ADR-');
  });
});
