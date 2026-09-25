export const VALID_ACCOUNTS_FILTER_VALUE = '__valid_accounts__';

export function buildValidAccountsFilterOption(
  t: (key: string, options?: Record<string, unknown>) => string,
  count?: number,
): { value: string; label: string; count?: number } {
  return {
    value: VALID_ACCOUNTS_FILTER_VALUE,
    label: t('accountFilter.validAccounts', { defaultValue: '仅有效账号' }),
    count,
  };
}

export function splitValidityFilterValues(values: string[]): {
  requireValidAccounts: boolean;
  selectedTypes: Set<string>;
} {
  const requireValidAccounts = values.includes(VALID_ACCOUNTS_FILTER_VALUE);
  const selectedTypes = new Set(values.filter((v) => v !== VALID_ACCOUNTS_FILTER_VALUE));
  return { requireValidAccounts, selectedTypes };
}
