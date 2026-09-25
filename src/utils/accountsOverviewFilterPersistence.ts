export const ACCOUNTS_OVERVIEW_FILTER_PERSISTENCE_CHANGED_EVENT =
  'agtools.accounts_overview_filter_persistence_changed';

export interface AccountsOverviewFilterPersistenceChangedDetail {
  scope: string;
  enabled: boolean;
}

const STORAGE_PREFIX = 'agtools.accounts_overview_filter.';

export function normalizeAccountsOverviewScope(scope: string): string {
  return scope.trim().toLowerCase();
}

export function resolveAccountsOverviewScopeFromQuickSettingsType(type: string): string {
  return normalizeAccountsOverviewScope(type);
}

function getScopeKey(scope: string): string {
  return `${STORAGE_PREFIX}${normalizeAccountsOverviewScope(scope)}`;
}

export function readAccountsOverviewFilterPersistenceEnabled(scope: string): boolean {
  try {
    const raw = localStorage.getItem(`${getScopeKey(scope)}.enabled`);
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function setAccountsOverviewFilterPersistenceEnabled(
  scope: string,
  enabled: boolean,
): void {
  try {
    localStorage.setItem(`${getScopeKey(scope)}.enabled`, enabled ? 'true' : 'false');
    window.dispatchEvent(
      new CustomEvent<AccountsOverviewFilterPersistenceChangedDetail>(
        ACCOUNTS_OVERVIEW_FILTER_PERSISTENCE_CHANGED_EVENT,
        {
          detail: {
            scope: normalizeAccountsOverviewScope(scope),
            enabled,
          },
        },
      ),
    );
  } catch {
    // ignore
  }
}

export function readAccountsOverviewFilterField<T = unknown>(
  scope: string,
  field: string,
  defaultValue: T,
): T;
export function readAccountsOverviewFilterField<T = unknown>(
  scope: string,
  field: string,
  defaultValue?: T,
): T | undefined;
export function readAccountsOverviewFilterField<T = unknown>(
  scope: string,
  field: string,
  defaultValue?: T,
): T | undefined {
  try {
    const raw = localStorage.getItem(`${getScopeKey(scope)}.${field}`);
    if (!raw) return defaultValue;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export function readAccountsOverviewFilterStringArray(
  scope: string,
  field: string,
): string[] {
  try {
    const raw = localStorage.getItem(`${getScopeKey(scope)}.${field}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function writeAccountsOverviewFilterField(
  scope: string,
  field: string,
  value: unknown,
): void {
  try {
    localStorage.setItem(`${getScopeKey(scope)}.${field}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function removeAccountsOverviewFilterField(
  scope: string,
  field: string,
): void {
  try {
    localStorage.removeItem(`${getScopeKey(scope)}.${field}`);
  } catch {
    // ignore
  }
}
