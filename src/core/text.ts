/** Text normalisation: 7-bit fixes, folding for matching, pretty casing, account numbers. */

const EMAIL_RE = /\S+@\S+\.\S+/;
const BRACE_MAP: Record<string, string> = {
  '}': 'å',
  '|': 'ø',
  '{': 'æ',
  '[': 'Æ',
  ']': 'Å',
  '\\': 'Ø',
};
const LETTER_RE = /[A-Za-zÆØÅæøåÄÖÜäöü]/;

/**
 * Repairs old 7-bit replacement characters: "@" between upper-case letters is "Ø",
 * and }|{[]\ are å ø æ Æ Å Ø when they sit next to a letter. E-mail addresses are left alone.
 */
export function fixSevenBit(s: string): string {
  if (!s) return s;
  let out = s;
  if (!EMAIL_RE.test(out)) {
    out = out.replace(/(?<=[A-ZÆØÅ])@(?=[A-ZÆØÅ])/g, 'Ø');
  }
  if (/[}|{\]\[\\]/.test(out)) {
    out = out.replace(/[}|{\]\[\\]/g, (ch: string, offset: number, str: string) => {
      const prev = str[offset - 1] ?? '';
      const next = str[offset + 1] ?? '';
      if (!LETTER_RE.test(prev) && !LETTER_RE.test(next)) return ch;
      return BRACE_MAP[ch] ?? ch;
    });
  }
  return out;
}

/**
 * Folds text for matching: upper case, Ø→OE, Æ→AE, Å→AA, Ö→OE, Ä→AE, Ü→U, other accents stripped,
 * whitespace collapsed.
 */
export function fold(s: string): string {
  if (!s) return '';
  return s
    .toUpperCase()
    .replace(/Ø/g, 'OE')
    .replace(/Æ/g, 'AE')
    .replace(/Å/g, 'AA')
    .replace(/Ö/g, 'OE')
    .replace(/Ä/g, 'AE')
    .replace(/Ü/g, 'U')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s  ]+/g, ' ')
    .trim();
}

/** Collapses repeated characters: "MAAAAT" → "MAT", "FOOOD" → "FOD". */
export function collapseRepeats(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

/** Normalises a message for keyword matching: 7-bit fix, fold, collapse repeats. */
export function normalizeForKeywords(s: string): string {
  return collapseRepeats(fold(fixSevenBit(s)));
}

/** Collapses runs of spaces/tabs (not newlines) and trims. */
export function cleanSpaces(s: string): string {
  return s.replace(/[ \t ]+/g, ' ').trim();
}

/** Normalises a multi-line message: CRLF→LF, trims each line, drops empty lines. */
export function cleanMessage(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => cleanSpaces(line))
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Title-cases ALL CAPS text; mixed-case text is kept as is. */
export function prettyCase(s: string): string {
  const t = cleanSpaces(s);
  if (!t) return '';
  if (/[a-zæøåäöü]/.test(t)) return t;
  return t
    .split(' ')
    .map((word) => {
      if (word.length <= 2) return word;
      return word
        .split(/([-/.'&])/)
        .map((part) => (part.length > 1 ? part.charAt(0) + part.slice(1).toLowerCase() : part))
        .join('');
    })
    .join(' ');
}

/** "11117700001" / "1111.22.33001" / "1111 22 33001" → "1111 22 33001". Other strings are trimmed. */
export function normalizeAccountNumber(s: string | undefined | null): string {
  if (!s) return '';
  const t = s.trim();
  const digits = t.replace(/\D/g, '');
  if (digits.length === 11 && /^[\d\s. ]+$/.test(t)) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`;
  }
  return t;
}

/** Removes a trailing "(12345678901)" account suffix from a description. */
export function stripAccountSuffix(s: string): string {
  return s.replace(/\s*\(\d{11}\)\s*$/, '').trim();
}

/** Whether a description is just "Til konto: …" (no real name). */
export function isAccountOnlyDescription(s: string): boolean {
  return /^(til|fra) konto:?\s*[\d .]+$/i.test(s.trim());
}

const COMPANY_RE =
  /\b(AS|ASA|SF|NUF|AB|APS|A\/S|LTD|LLC|GMBH|INC|OY|OYJ|KS|ANS|DA|BA|SA|PLC|BV|HF|IKS|KF|STIFTELSE|FORENING|KOMMUNE|FYLKESKOMMUNE|SPAREBANK|GEBYR|VIPPS|SKATTEETATEN|NAV)\b/;

/** Whether a (folded) counterparty name looks like a company rather than a person. */
export function looksLikeCompany(nameFolded: string): boolean {
  if (!nameFolded) return false;
  if (COMPANY_RE.test(nameFolded)) return true;
  if (/\bN\.?V\.?(\b|$)/.test(nameFolded)) return true;
  if (/BANK/.test(nameFolded)) return true;
  return false;
}
