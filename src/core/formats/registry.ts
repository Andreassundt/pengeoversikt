import type { FormatProfile } from '../types';
import { bankFormat } from './bank';
import { createGenericFormat } from './generic';
import type { FileFormat } from './types';

/** Built-in formats, tried in order. */
export const BUILT_IN_FORMATS: FileFormat[] = [bankFormat];

/** Finds the format for a header: built-in formats first, then saved column-mapping profiles. */
export function detectFormat(header: string[], profiles: FormatProfile[] = []): FileFormat | null {
  for (const f of BUILT_IN_FORMATS) if (f.matches(header)) return f;
  for (const p of profiles) {
    const f = createGenericFormat(p);
    if (f.matches(header)) return f;
  }
  return null;
}

export { headerSignature } from './generic';
