import type { NormalizedFields, Rule } from './types';
import { fold } from './text';

export interface RuleTarget extends NormalizedFields {
  accountId?: number;
}

function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source, 'i');
  } catch {
    return null;
  }
}

/** Whether a user rule matches a transaction. All given conditions must hold. */
export function matchRule(rule: Rule, tx: RuleTarget): boolean {
  const c = rule.conditions;
  if (c.direction && c.direction !== tx.direction) return false;
  if (c.accountId != null && c.accountId !== tx.accountId) return false;
  if (c.counterpartyAccount && c.counterpartyAccount.replace(/\s/g, '') !== tx.counterpartyAccount.replace(/\s/g, '')) return false;
  if (c.counterpartyNameContains && !tx.counterpartyNameFolded.includes(fold(c.counterpartyNameContains))) return false;
  const text = fold(`${tx.description} ${tx.merchantText}`);
  if (c.textContains && !text.includes(fold(c.textContains))) return false;
  if (c.textRegex) {
    const re = safeRegex(c.textRegex);
    if (!re || !(re.test(tx.description) || re.test(tx.merchantText))) return false;
  }
  if (c.messageContains && !fold(tx.message).includes(fold(c.messageContains))) return false;
  if (c.messageRegex) {
    const re = safeRegex(c.messageRegex);
    if (!re || !re.test(tx.message)) return false;
  }
  if (c.type && fold(c.type) !== fold(tx.type)) return false;
  if (c.subtype && fold(c.subtype) !== fold(tx.subtype)) return false;
  const abs = Math.abs(tx.amountOre);
  if (c.minAmountOre != null && abs < c.minAmountOre) return false;
  if (c.maxAmountOre != null && abs > c.maxAmountOre) return false;
  return true;
}

/** A rule with no conditions at all would match everything; treat it as invalid. */
export function ruleHasConditions(rule: Rule): boolean {
  return Object.values(rule.conditions).some((v) => v !== undefined && v !== null && v !== '');
}
