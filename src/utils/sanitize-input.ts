import { InputValidationError } from '../types';

const MAX_LENGTH = 10000;

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
  if (trimmed.length > MAX_LENGTH) {
    throw new InputValidationError('Input too long (max 10000 chars)');
  }
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new InputValidationError('Potentially unsafe input detected');
    }
  }
  return trimmed.replace(/[<>]/g, '');
}
