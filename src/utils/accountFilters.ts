export type AccountFilterType =
  | 'PRO'
  | 'ULTRA'
  | 'FREE'
  | 'UNKNOWN'
  | 'VERIFICATION_REQUIRED'
  | 'TOS_VIOLATION';

export function normalizeAccountTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function collectAvailableAccountTags(accounts: Array<{ tags?: string[] }>): string[] {
  const values = new Set<string>();
  for (const account of accounts) {
    for (const tag of account.tags || []) {
      const normalized = normalizeAccountTag(tag);
      if (normalized) {
        values.add(normalized);
      }
    }
  }
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}
