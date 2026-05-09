import type { ADRDocument, ConsideredOption, Consequences } from '../types';

export function formatADRMarkdown(doc: ADRDocument, adrId?: string): string {
  const heading = adrId ? `${adrId}: ${doc.title}` : doc.title;
  const sections: string[] = [];

  sections.push(`# ${heading}`);
  sections.push('');
  sections.push(`* Status: ${doc.status}`);
  sections.push(`* Date: ${doc.date}`);
  sections.push('');
  sections.push('## Context and Problem Statement');
  sections.push('');
  sections.push(doc.contextAndProblem);
  sections.push('');
  sections.push('## Decision Drivers');
  sections.push('');
  sections.push(...doc.decisionDrivers.map(d => `* ${d}`));
  sections.push('');
  sections.push('## Considered Options');
  sections.push('');
  sections.push(...doc.consideredOptions.map(o => `* ${o.name}`));
  sections.push('');
  sections.push('## Decision Outcome');
  sections.push('');
  sections.push(`Chosen option: "${doc.decisionOutcome.chosenOption}", because ${doc.decisionOutcome.justification}`);
  sections.push('');
  sections.push(...formatConsequences(doc.consequences));
  sections.push('');
  sections.push('## Pros and Cons of the Options');
  sections.push('');
  sections.push(...doc.consideredOptions.flatMap(o => formatOption(o)));

  return sections.join('\n');
}

function formatConsequences(c: Consequences): string[] {
  const lines: string[] = [];

  if (c.positive.length > 0) {
    lines.push('### Positive Consequences');
    lines.push('');
    lines.push(...c.positive.map(p => `* ${p}`));
    lines.push('');
  }

  if (c.negative.length > 0) {
    lines.push('### Negative Consequences');
    lines.push('');
    lines.push(...c.negative.map(n => `* ${n}`));
    lines.push('');
  }

  if (c.neutral.length > 0) {
    lines.push('### Neutral Consequences');
    lines.push('');
    lines.push(...c.neutral.map(n => `* ${n}`));
    lines.push('');
  }

  return lines;
}

function formatOption(option: ConsideredOption): string[] {
  const lines: string[] = [];
  lines.push(`### ${option.name}`);
  lines.push('');
  if (option.description) {
    lines.push(option.description);
    lines.push('');
  }
  lines.push(...option.pros.map(p => `* Good, because ${p}`));
  lines.push(...option.cons.map(c => `* Bad, because ${c}`));
  lines.push('');
  return lines;
}
