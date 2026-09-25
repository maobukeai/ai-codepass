import { invoke } from '@tauri-apps/api/core';
import {
  ACCOUNT_TRANSFER_SCHEMA,
  AccountTransferBundle,
  AccountTransferImportProgress,
  AccountTransferImportResult,
  buildAccountTransferBundle,
  importAllAccountsFromTransferJson,
} from './accountTransferService';
import { ALL_PLATFORM_IDS, PlatformId } from '../types/platform';
import { getTraeAccountPlatformId } from '../types/trae';
import { emitCurrentAccountChanged } from '../utils/accountSyncEvents';
import {
  CURRENT_ACCOUNT_REFRESH_STORAGE_KEY,
  CurrentAccountRefreshMinutesMap,
  loadCurrentAccountRefreshMinutesMap,
  saveCurrentAccountRefreshMinutesMap,
} from '../utils/currentAccountRefresh';
import * as codebuddyService from './codebuddyService';
import * as codebuddyCnService from './codebuddyCnService';
import * as qoderService from './qoderService';
import * as qoderCnService from './qoderCnService';
import * as qwenworkService from './qwenworkService';
import * as traeService from './traeService';
import * as workbuddyService from './workbuddyService';
import * as workbuddyAiService from './workbuddyAiService';
import type { InstanceLaunchMode } from '../types/instance';

const DATA_TRANSFER_SCHEMA = 'cockpit-tools.data-transfer';
const DATA_TRANSFER_VERSION = 1;

const INSTANCE_PLATFORMS = [
  'codebuddy',
  'codebuddy_cn',
  'qoder',
  'qoder_cn',
  'qwenwork',
  'trae',
  'workbuddy',
] as const;

type InstancePlatform = (typeof INSTANCE_PLATFORMS)[number];
type TransferAccountRecord = Record<string, unknown> & { id: string };
type AccountLoader = () => Promise<TransferAccountRecord[]>;
type LegacyFormat = 'data_bundle' | 'account_bundle' | 'legacy_account_json';
type DataTransferWarningCode = 'accounts_section_missing' | 'config_section_missing';

interface RawUserConfig extends Record<string, unknown> {
  webdav_sync_password?: string;
  backup_directory?: string;
}

interface ExportedUserConfig extends RawUserConfig {}

interface RawInstanceProfile {
  id: string;
  name: string;
  userDataDir: string;
  workingDir?: string | null;
  extraArgs: string;
  bindAccountId?: string | null;
  launchMode?: InstanceLaunchMode;
  createdAt: number;
  lastLaunchedAt?: number | null;
  lastPid?: number | null;
}

interface RawDefaultInstanceSettings {
  bindAccountId?: string | null;
  extraArgs: string;
  launchMode?: InstanceLaunchMode;
  followLocalAccount?: boolean;
  lastPid?: number | null;
}

interface RawInstanceStore {
  instances: RawInstanceProfile[];
  defaultSettings: RawDefaultInstanceSettings;
}

interface ExportedInstanceProfile {
  id: string;
  name: string;
  userDataDir: string;
  workingDir?: string | null;
  extraArgs: string;
  bindAccountRef: DataTransferAccountRef | null;
  launchMode?: InstanceLaunchMode;
  createdAt: number;
}

interface ExportedDefaultInstanceSettings {
  bindAccountRef: DataTransferAccountRef | null;
  extraArgs: string;
  launchMode?: InstanceLaunchMode;
  followLocalAccount: boolean;
}

interface ExportedInstanceStore {
  defaultSettings: ExportedDefaultInstanceSettings;
  instances: ExportedInstanceProfile[];
}

export interface DataTransferAccountRef {
  platform: PlatformId;
  email?: string;
  userId?: string;
  uid?: string;
  domain?: string;
}

export interface DataTransferSelection {
  includeAccounts: boolean;
  includeConfig: boolean;
}

export interface DataTransferConfigBundle {
  user_config: ExportedUserConfig;
  instance_stores?: Partial<Record<InstancePlatform, ExportedInstanceStore>>;
  current_account_refresh_minutes?: CurrentAccountRefreshMinutesMap;
  current_account_refresh_overrides?: unknown;
  platform_layout_config?: unknown;
  platform_layout_custom_icons?: unknown;
  compact_group_order?: unknown;
  compact_group_colors?: unknown;
  compact_hidden_groups?: unknown;
  app_language?: string;

  // Auto check-in configs, logs, and dates
  auto_checkin_configs?: Record<string, unknown>;
  auto_checkin_logs?: Record<string, unknown>;
  checkin_dates_records?: Record<string, unknown>;

  // Current selected accounts per platform
  current_account_refs?: Partial<Record<PlatformId, DataTransferAccountRef | null>>;

  // UI preferences, side navigation & overview filters
  ui_preferences?: Record<string, unknown>;
  overview_filters?: Record<string, unknown>;
  user_memory?: unknown;

  // Legacy compatibility fields
  group_settings?: unknown;
  account_groups?: unknown;
  codex_account_groups?: unknown;
  codex_model_providers?: unknown;
  antigravity_wakeup?: unknown;
  codex_wakeup?: unknown;
  verification_records?: unknown;
  verification_history?: unknown;
}

export interface DataTransferBundle {
  schema: typeof DATA_TRANSFER_SCHEMA;
  version: typeof DATA_TRANSFER_VERSION;
  exported_at: string;
  sections: {
    accounts: boolean;
    config: boolean;
  };
  accounts?: AccountTransferBundle;
  config?: DataTransferConfigBundle;
}

export interface DataTransferConfigImportResult {
  applied: boolean;
  unresolved_account_ref_count: number;
  disabled_task_count: number;
  needs_restart: boolean;
}

export interface DataTransferImportResult {
  detected_format: LegacyFormat;
  legacy_account_platform?: PlatformId | null;
  imported_account_count: number;
  account_result: AccountTransferImportResult | null;
  config_result: DataTransferConfigImportResult | null;
  warnings: DataTransferWarningCode[];
}

export interface DataTransferImportOptions extends DataTransferSelection {
  onAccountProgress?: (progress: AccountTransferImportProgress) => void;
}

interface AccountRegistry {
  byPlatform: Record<PlatformId, TransferAccountRecord[]>;
  byId: Record<PlatformId, Map<string, TransferAccountRecord>>;
}

const ACCOUNT_LOADERS: Record<PlatformId, AccountLoader> = {
  codebuddy: async () => (await codebuddyService.listCodebuddyAccounts()) as unknown as TransferAccountRecord[],
  codebuddy_cn: async () =>
    (await codebuddyCnService.listCodebuddyCnAccounts()) as unknown as TransferAccountRecord[],
  qoder: async () => (await qoderService.listQoderAccounts()) as unknown as TransferAccountRecord[],
  qoder_cn: async () => (await qoderCnService.listQoderAccounts()) as unknown as TransferAccountRecord[],
  qwenwork: async () => (await qwenworkService.listQoderAccounts()) as unknown as TransferAccountRecord[],
  trae: async () =>
    (await traeService.listTraeAccounts()).filter(
      (acc) => getTraeAccountPlatformId(acc) === 'trae',
    ) as unknown as TransferAccountRecord[],
  trae_solo: async () =>
    (await traeService.listTraeAccounts()).filter(
      (acc) => getTraeAccountPlatformId(acc) === 'trae_solo',
    ) as unknown as TransferAccountRecord[],
  trae_cn: async () =>
    (await traeService.listTraeAccounts()).filter(
      (acc) => getTraeAccountPlatformId(acc) === 'trae_cn',
    ) as unknown as TransferAccountRecord[],
  trae_solo_cn: async () =>
    (await traeService.listTraeAccounts()).filter(
      (acc) => getTraeAccountPlatformId(acc) === 'trae_solo_cn',
    ) as unknown as TransferAccountRecord[],
  workbuddy: async () => (await workbuddyService.listWorkbuddyAccounts()) as unknown as TransferAccountRecord[],
  workbuddy_ai: async () => (await workbuddyAiService.listWorkbuddyAiAccounts()) as unknown as TransferAccountRecord[],
};

const LEGACY_IMPORTERS: Record<PlatformId, ((jsonContent: string) => Promise<unknown[]>) | undefined> = {
  codebuddy: codebuddyService.importCodebuddyFromJson,
  codebuddy_cn: codebuddyCnService.importCodebuddyCnFromJson,
  qoder: qoderService.importQoderFromJson,
  qoder_cn: qoderCnService.importQoderFromJson,
  qwenwork: qwenworkService.importQoderFromJson,
  trae: traeService.importTraeFromJson,
  trae_solo: traeService.importTraeFromJson,
  trae_cn: traeService.importTraeFromJson,
  trae_solo_cn: traeService.importTraeFromJson,
  workbuddy: workbuddyService.importWorkbuddyFromJson,
  workbuddy_ai: workbuddyAiService.importWorkbuddyAiFromJson,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function stringEquals(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeString(left)?.toLowerCase();
  const normalizedRight = normalizeString(right)?.toLowerCase();
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function stringContains(value: unknown, keyword: string): boolean {
  const normalized = normalizeString(value)?.toLowerCase();
  return Boolean(normalized && normalized.includes(keyword.toLowerCase()));
}

function parseJsonOrThrow(jsonContent: string, errorCode: string): unknown {
  try {
    return JSON.parse(jsonContent) as unknown;
  } catch {
    throw new Error(errorCode);
  }
}

function safeGetLocalStorageItem(key: string): unknown {
  const value = localStorage.getItem(key);
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function safeSetLocalStorageItem(key: string, value: unknown): void {
  if (value === null || value === undefined) {
    localStorage.removeItem(key);
  } else if (typeof value === 'string') {
    localStorage.setItem(key, value);
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function ensureSelection(selection: DataTransferSelection): void {
  if (!selection.includeAccounts && !selection.includeConfig) {
    throw new Error('transfer_selection_required');
  }
}

function firstLegacySample(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.find((item) => isRecord(item)) ?? null;
  }
  return isRecord(value) ? value : null;
}

function isDataTransferBundle(value: unknown): value is DataTransferBundle {
  return isRecord(value) && value.schema === DATA_TRANSFER_SCHEMA;
}

function isAccountTransferBundleLike(value: unknown): boolean {
  return isRecord(value) && value.schema === ACCOUNT_TRANSFER_SCHEMA;
}

function buildAccountRegistry(
  entries: Array<readonly [PlatformId, TransferAccountRecord[]]>,
): AccountRegistry {
  const byPlatform = {} as Record<PlatformId, TransferAccountRecord[]>;
  const byId = {} as Record<PlatformId, Map<string, TransferAccountRecord>>;

  for (const platform of ALL_PLATFORM_IDS) {
    byPlatform[platform] = [];
    byId[platform] = new Map<string, TransferAccountRecord>();
  }

  for (const [platform, accounts] of entries) {
    byPlatform[platform] = accounts;
    byId[platform] = new Map(accounts.map((account) => [String(account.id), account]));
  }

  return {
    byPlatform,
    byId,
  };
}

async function loadAccountRegistry(): Promise<AccountRegistry> {
  const entries: Array<readonly [PlatformId, TransferAccountRecord[]]> = [];
  for (const platform of ALL_PLATFORM_IDS) {
    const accounts = await ACCOUNT_LOADERS[platform]();
    entries.push([platform, accounts] as const);
  }

  return buildAccountRegistry(entries);
}

function buildAccountRef(platform: PlatformId, account: TransferAccountRecord): DataTransferAccountRef | null {
  const ref: DataTransferAccountRef = { platform };

  switch (platform) {
    case 'qoder':
    case 'qoder_cn':
    case 'qwenwork':
    case 'trae':
    case 'trae_solo':
    case 'trae_cn':
    case 'trae_solo_cn':
      ref.email = normalizeString(account.email) ?? undefined;
      ref.userId = normalizeString(account.user_id) ?? undefined;
      break;
    case 'codebuddy':
    case 'codebuddy_cn':
    case 'workbuddy':
    case 'workbuddy_ai':
      ref.email = normalizeString(account.email) ?? undefined;
      ref.uid = normalizeString(account.uid) ?? undefined;
      ref.domain = normalizeString(account.domain) ?? undefined;
      break;
  }

  const hintKeys = Object.keys(ref).filter((key) => key !== 'platform');
  return hintKeys.length > 0 ? ref : null;
}

function scoreAccountRef(ref: DataTransferAccountRef, account: TransferAccountRecord): number {
  let score = 0;

  const addStringScore = (expected: string | undefined, actual: unknown, weight: number) => {
    if (!expected) return;
    if (stringEquals(expected, actual)) {
      score += weight;
    }
  };

  switch (ref.platform) {
    case 'qoder':
    case 'qoder_cn':
    case 'qwenwork':
    case 'trae':
    case 'trae_solo':
    case 'trae_cn':
    case 'trae_solo_cn':
      addStringScore(ref.userId, account.user_id, 24);
      addStringScore(ref.email, account.email, 10);
      break;
    case 'codebuddy':
    case 'codebuddy_cn':
    case 'workbuddy':
    case 'workbuddy_ai':
      addStringScore(ref.uid, account.uid, 24);
      addStringScore(ref.email, account.email, 10);
      addStringScore(ref.domain, account.domain, 4);
      break;
  }

  return score;
}

function resolveAccountRef(
  ref: DataTransferAccountRef | null | undefined,
  registry: AccountRegistry,
): string | null {
  if (!ref) return null;
  const candidates = registry.byPlatform[ref.platform] ?? [];
  let bestScore = 0;
  let bestId: string | null = null;
  let tied = false;

  for (const candidate of candidates) {
    const score = scoreAccountRef(ref, candidate);
    if (score <= 0) continue;
    if (score > bestScore) {
      bestScore = score;
      bestId = String(candidate.id);
      tied = false;
      continue;
    }
    if (score === bestScore && bestId !== String(candidate.id)) {
      tied = true;
    }
  }

  if (bestScore <= 0 || tied) {
    return null;
  }

  return bestId;
}

function mapAccountIdsToRefs(
  platform: PlatformId,
  accountIds: string[] | undefined,
  registry: AccountRegistry,
): DataTransferAccountRef[] {
  if (!Array.isArray(accountIds)) {
    return [];
  }

  const result: DataTransferAccountRef[] = [];
  const seen = new Set<string>();
  const accountMap = registry.byId[platform];

  for (const rawId of accountIds) {
    const accountId = normalizeString(rawId);
    if (!accountId || seen.has(accountId)) continue;
    seen.add(accountId);
    const account = accountMap.get(accountId);
    if (!account) continue;
    const ref = buildAccountRef(platform, account);
    if (ref) {
      result.push(ref);
    }
  }

  return result;
}

function exportInstanceStore(
  platform: InstancePlatform,
  store: RawInstanceStore,
  registry: AccountRegistry,
): ExportedInstanceStore {
  return {
    defaultSettings: {
      bindAccountRef:
        store.defaultSettings.bindAccountId != null
          ? mapAccountIdsToRefs(platform, [store.defaultSettings.bindAccountId], registry)[0] ?? null
          : null,
      extraArgs: normalizeString(store.defaultSettings.extraArgs) ?? '',
      launchMode: store.defaultSettings.launchMode,
      followLocalAccount: normalizeBoolean(store.defaultSettings.followLocalAccount) ?? false,
    },
    instances: Array.isArray(store.instances)
      ? store.instances.map((instance) => ({
          id: instance.id,
          name: instance.name,
          userDataDir: instance.userDataDir,
          workingDir: instance.workingDir ?? null,
          extraArgs: normalizeString(instance.extraArgs) ?? '',
          bindAccountRef:
            instance.bindAccountId != null
              ? mapAccountIdsToRefs(platform, [instance.bindAccountId], registry)[0] ?? null
              : null,
          launchMode: instance.launchMode,
          createdAt: instance.createdAt,
        }))
      : [],
  };
}

function importInstanceStore(
  _platform: InstancePlatform,
  store: ExportedInstanceStore,
  registry: AccountRegistry,
): { store: RawInstanceStore; unresolved: number } {
  let unresolved = 0;

  const defaultResolved = resolveAccountRef(store.defaultSettings.bindAccountRef, registry);
  if (store.defaultSettings.bindAccountRef && !defaultResolved) {
    unresolved += 1;
  }

  const restoredInstances = Array.isArray(store.instances)
    ? store.instances.map((instance) => {
        const resolvedId = resolveAccountRef(instance.bindAccountRef, registry);
        if (instance.bindAccountRef && !resolvedId) {
          unresolved += 1;
        }
        return {
          id: instance.id,
          name: instance.name,
          userDataDir: instance.userDataDir,
          workingDir: instance.workingDir ?? null,
          extraArgs: normalizeString(instance.extraArgs) ?? '',
          bindAccountId: resolvedId,
          launchMode: instance.launchMode,
          createdAt: instance.createdAt,
          lastLaunchedAt: null,
          lastPid: null,
        } as RawInstanceProfile;
      })
    : [];

  return {
    store: {
      defaultSettings: {
        bindAccountId: defaultResolved,
        extraArgs: normalizeString(store.defaultSettings.extraArgs) ?? '',
        launchMode: store.defaultSettings.launchMode,
        followLocalAccount: normalizeBoolean(store.defaultSettings.followLocalAccount) ?? false,
        lastPid: null,
      },
      instances: restoredInstances,
    },
    unresolved,
  };
}

async function exportConfigBundle(registry: AccountRegistry): Promise<DataTransferConfigBundle> {
  const [
    rawUserConfig,
    instanceStoreEntries,
    userMemoryData,
  ] = await Promise.all([
    invoke<RawUserConfig>('data_transfer_get_user_config'),
    (async () => {
      const entries: Array<readonly [InstancePlatform, ExportedInstanceStore]> = [];
      for (const platform of INSTANCE_PLATFORMS) {
        try {
          const store = await invoke<RawInstanceStore>('data_transfer_get_instance_store', { platform });
          entries.push([platform, exportInstanceStore(platform, store, registry)] as const);
        } catch {
          // ignore unsupported instance platform
        }
      }
      return entries;
    })(),
    invoke('load_user_memory').catch(() => null),
  ]);

  // 1. Auto check-in configs
  const autoCheckinConfigs: Record<string, unknown> = {};
  const autoCheckinKeys = [
    'agtools.qoder.auto_checkin_config',
    'agtools.trae.auto_checkin_config',
    'agtools.workbuddy.auto_checkin_config',
  ];
  for (const k of autoCheckinKeys) {
    const val = safeGetLocalStorageItem(k);
    if (val !== undefined) autoCheckinConfigs[k] = val;
  }

  // 2. Auto check-in logs
  const autoCheckinLogs: Record<string, unknown> = {};
  const autoCheckinLogsKeys = [
    'agtools.qoder.auto_checkin_logs',
    'agtools.trae.auto_checkin_logs',
    'agtools.workbuddy.auto_checkin_logs',
  ];
  for (const k of autoCheckinLogsKeys) {
    const val = safeGetLocalStorageItem(k);
    if (val !== undefined) autoCheckinLogs[k] = val;
  }

  // 3. Historical check-in dates
  const checkinDates: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.includes('.checkin_dates.')) {
      const val = safeGetLocalStorageItem(k);
      if (val !== undefined) checkinDates[k] = val;
    }
  }

  // 4. Current selected accounts
  const currentAccountRefs: Partial<Record<PlatformId, DataTransferAccountRef | null>> = {};
  for (const platform of ALL_PLATFORM_IDS) {
    const primaryKey = `agtools.${platform}.current_account_id`;
    const aliasKey = platform === 'codebuddy_cn' ? 'agtools.codebuddycn.current_account_id' : null;
    const currentId = localStorage.getItem(primaryKey) || (aliasKey ? localStorage.getItem(aliasKey) : null);
    if (currentId) {
      const account = registry.byId[platform]?.get(currentId);
      if (account) {
        currentAccountRefs[platform] = buildAccountRef(platform, account);
      } else {
        currentAccountRefs[platform] = { platform, userId: currentId };
      }
    }
  }

  // 5. Overview filters
  const overviewFilters: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('agtools.accounts_overview_filter.')) {
      const val = safeGetLocalStorageItem(k);
      if (val !== undefined) overviewFilters[k] = val;
    }
  }

  // 6. UI Preferences
  const uiPreferences: Record<string, unknown> = {
    privacy_mode_enabled: localStorage.getItem('privacy_mode_enabled') ?? undefined,
    dashboard_view_mode: localStorage.getItem('dashboard_view_mode') ?? undefined,
    side_nav_layout: safeGetLocalStorageItem('agtools.side_nav.layout.v1'),
    floating_card_platform:
      localStorage.getItem('agtools.floating_card.platform') ||
      localStorage.getItem('agtools.floating_card_platform') ||
      undefined,
    antigravity_seamless_switch_unlock:
      localStorage.getItem('agtools.antigravity_seamless_switch_unlock') ?? undefined,
  };
  for (const platform of ALL_PLATFORM_IDS) {
    const flowNoticeKey = `agtools.${platform}.flow_notice_collapsed`;
    const val = localStorage.getItem(flowNoticeKey);
    if (val !== null) {
      uiPreferences[flowNoticeKey] = val;
    }
  }

  return {
    user_config: rawUserConfig,
    instance_stores: Object.fromEntries(instanceStoreEntries) as Partial<
      Record<InstancePlatform, ExportedInstanceStore>
    >,
    current_account_refresh_minutes: loadCurrentAccountRefreshMinutesMap(),
    current_account_refresh_overrides: safeGetLocalStorageItem('agtools.current_account_refresh_overrides.v1'),
    platform_layout_config: safeGetLocalStorageItem('agtools.platform_layout.v1'),
    platform_layout_custom_icons: safeGetLocalStorageItem('agtools.platform_layout.custom_icons.v1'),
    compact_group_order: safeGetLocalStorageItem('compactGroupOrder'),
    compact_group_colors: safeGetLocalStorageItem('compactGroupColors'),
    compact_hidden_groups: safeGetLocalStorageItem('compactHiddenGroups'),
    app_language: localStorage.getItem('app-language') ?? undefined,
    auto_checkin_configs: autoCheckinConfigs,
    auto_checkin_logs: autoCheckinLogs,
    checkin_dates_records: checkinDates,
    current_account_refs: currentAccountRefs,
    overview_filters: overviewFilters,
    ui_preferences: uiPreferences,
    user_memory: userMemoryData,
  };
}

async function importConfigBundle(bundle: DataTransferConfigBundle): Promise<DataTransferConfigImportResult> {
  const registry = await loadAccountRegistry();
  let unresolvedAccountRefs = 0;

  const needsRestart = await invoke<boolean>('data_transfer_apply_user_config', {
    config: bundle.user_config,
  });

  if (bundle.instance_stores) {
    for (const platform of INSTANCE_PLATFORMS) {
      const store = bundle.instance_stores[platform];
      if (!store) continue;
      const imported = importInstanceStore(platform, store, registry);
      unresolvedAccountRefs += imported.unresolved;
      try {
        await invoke('data_transfer_replace_instance_store', {
          platform,
          store: imported.store,
        });
      } catch {
        // ignore
      }
    }
  }

  if (bundle.platform_layout_config !== undefined) safeSetLocalStorageItem('agtools.platform_layout.v1', bundle.platform_layout_config);
  if (bundle.platform_layout_custom_icons !== undefined) safeSetLocalStorageItem('agtools.platform_layout.custom_icons.v1', bundle.platform_layout_custom_icons);
  if (bundle.compact_group_order !== undefined) safeSetLocalStorageItem('compactGroupOrder', bundle.compact_group_order);
  if (bundle.compact_group_colors !== undefined) safeSetLocalStorageItem('compactGroupColors', bundle.compact_group_colors);
  if (bundle.compact_hidden_groups !== undefined) safeSetLocalStorageItem('compactHiddenGroups', bundle.compact_hidden_groups);
  if (bundle.app_language !== undefined) {
    localStorage.setItem('app-language', bundle.app_language);
  }

  if (bundle.current_account_refresh_minutes) {
    saveCurrentAccountRefreshMinutesMap(bundle.current_account_refresh_minutes);
  }
  if (bundle.current_account_refresh_overrides !== undefined) {
    safeSetLocalStorageItem(
      'agtools.current_account_refresh_overrides.v1',
      bundle.current_account_refresh_overrides,
    );
  }

  if (bundle.auto_checkin_configs) {
    for (const [key, value] of Object.entries(bundle.auto_checkin_configs)) {
      safeSetLocalStorageItem(key, value);
    }
    window.dispatchEvent(new Event('qoder-auto-checkin-config-changed'));
    window.dispatchEvent(new Event('trae-auto-checkin-config-changed'));
    window.dispatchEvent(new Event('workbuddy-auto-checkin-config-changed'));
  }

  if (bundle.auto_checkin_logs) {
    for (const [key, value] of Object.entries(bundle.auto_checkin_logs)) {
      safeSetLocalStorageItem(key, value);
    }
    window.dispatchEvent(new Event('qoder-auto-checkin-logs-changed'));
    window.dispatchEvent(new Event('trae-auto-checkin-logs-changed'));
    window.dispatchEvent(new Event('workbuddy-auto-checkin-logs-changed'));
  }

  if (bundle.checkin_dates_records) {
    for (const [key, value] of Object.entries(bundle.checkin_dates_records)) {
      safeSetLocalStorageItem(key, value);
    }
  }

  if (bundle.current_account_refs) {
    for (const platform of ALL_PLATFORM_IDS) {
      const ref = bundle.current_account_refs[platform];
      if (!ref) continue;
      const resolvedId = resolveAccountRef(ref, registry) || ref.userId || null;
      if (resolvedId) {
        const primaryKey = `agtools.${platform}.current_account_id`;
        safeSetLocalStorageItem(primaryKey, resolvedId);
        if (platform === 'codebuddy_cn') {
          safeSetLocalStorageItem('agtools.codebuddycn.current_account_id', resolvedId);
        }
        try {
          await emitCurrentAccountChanged({ platformId: platform, accountId: resolvedId });
        } catch {
          // ignore
        }
      }
    }
  }

  if (bundle.overview_filters) {
    for (const [key, value] of Object.entries(bundle.overview_filters)) {
      safeSetLocalStorageItem(key, value);
    }
    window.dispatchEvent(new Event('agtools.accounts_overview_filter_persistence_changed'));
  }

  if (bundle.ui_preferences) {
    const prefs = bundle.ui_preferences;
    if (prefs.privacy_mode_enabled !== undefined) {
      safeSetLocalStorageItem('privacy_mode_enabled', prefs.privacy_mode_enabled);
    }
    if (prefs.dashboard_view_mode !== undefined) {
      safeSetLocalStorageItem('dashboard_view_mode', prefs.dashboard_view_mode);
    }
    if (prefs.side_nav_layout !== undefined) {
      safeSetLocalStorageItem('agtools.side_nav.layout.v1', prefs.side_nav_layout);
    }
    if (prefs.floating_card_platform !== undefined) {
      safeSetLocalStorageItem('agtools.floating_card.platform', prefs.floating_card_platform);
    }
    if (prefs.antigravity_seamless_switch_unlock !== undefined) {
      safeSetLocalStorageItem(
        'agtools.antigravity_seamless_switch_unlock',
        prefs.antigravity_seamless_switch_unlock,
      );
    }
    for (const [key, value] of Object.entries(prefs)) {
      if (key.startsWith('agtools.') && key.endsWith('.flow_notice_collapsed')) {
        safeSetLocalStorageItem(key, value);
      }
    }
  }

  if (bundle.user_memory && typeof bundle.user_memory === 'object') {
    try {
      const memory = bundle.user_memory as {
        dismissed?: Record<string, boolean>;
        lists?: Record<string, string[]>;
      };
      if (memory.dismissed) {
        for (const [id, isDismissed] of Object.entries(memory.dismissed)) {
          if (isDismissed) {
            await invoke('mark_user_memory_dismissed', { id }).catch(() => {});
          }
        }
      }
      if (memory.lists) {
        for (const [id, items] of Object.entries(memory.lists)) {
          if (Array.isArray(items)) {
            await invoke('save_user_memory_list', { id, items }).catch(() => {});
          }
        }
      }
    } catch {
      // ignore
    }
  }

  window.dispatchEvent(new Event('config-updated'));
  window.dispatchEvent(new Event('app-config-changed'));

  return {
    applied: true,
    unresolved_account_ref_count: unresolvedAccountRefs,
    disabled_task_count: 0,
    needs_restart: Boolean(needsRestart),
  };
}

function synthesizeAccountImportResult(
  platform: PlatformId,
  importedCount: number,
): AccountTransferImportResult {
  return {
    imported_count: importedCount,
    platform_success_count: importedCount > 0 ? 1 : 0,
    platform_failed_count: importedCount > 0 ? 0 : 1,
    platform_skipped_count: 0,
    details: [
      {
        platform,
        imported_count: importedCount,
        skipped: false,
      },
    ],
  };
}

function detectLegacyPlatform(value: unknown): PlatformId | null {
  const sample = firstLegacySample(value);
  if (!sample) return null;

  const id = normalizeString(sample.id);
  if (id?.startsWith('codebuddy_cn_')) return 'codebuddy_cn';
  if (id?.startsWith('workbuddy_ai_')) return 'workbuddy_ai';
  if (id?.startsWith('workbuddy_')) return 'workbuddy';
  if (id?.startsWith('codebuddy_')) return 'codebuddy';
  if (id?.startsWith('qwenwork_')) return 'qwenwork';
  if (id?.startsWith('qoder_cn_')) return 'qoder_cn';
  if (id?.startsWith('qoder_')) return 'qoder';
  if (id?.startsWith('trae_solo_cn_')) return 'trae_solo_cn';
  if (id?.startsWith('trae_solo_')) return 'trae_solo';
  if (id?.startsWith('trae_cn_')) return 'trae_cn';
  if (id?.startsWith('trae_')) return 'trae';

  if ('trae_auth_raw' in sample || 'trae_profile_raw' in sample || 'trae_server_raw' in sample) {
    return 'trae';
  }
  if ('auth_user_info_raw' in sample || 'auth_credit_usage_raw' in sample || 'credits_usage_percent' in sample) {
    if (stringContains(sample.domain, 'qwenwork') || stringContains(sample.email, 'qwenwork')) return 'qwenwork';
    if (stringContains(sample.domain, 'qoder.cn')) return 'qoder_cn';
    return 'qoder';
  }
  if ('uid' in sample || 'enterprise_id' in sample || 'dosage_notify_code' in sample) {
    if (stringContains(sample.domain, 'workbuddy-ai') || id?.startsWith('workbuddy_ai_')) return 'workbuddy_ai';
    if (stringContains(sample.domain, 'workbuddy')) return 'workbuddy';
    if (stringContains(sample.domain, 'codebuddy.cn')) return 'codebuddy_cn';
    if (stringContains(sample.domain, 'codebuddy')) return 'codebuddy';
    return id?.startsWith('workbuddy_')
      ? 'workbuddy'
      : id?.startsWith('codebuddy_cn_')
        ? 'codebuddy_cn'
        : 'codebuddy';
  }

  return null;
}

async function importLegacyAccountJson(
  platform: PlatformId,
  jsonContent: string,
): Promise<AccountTransferImportResult> {
  const importer = LEGACY_IMPORTERS[platform];
  if (!importer) {
    throw new Error('unsupported_legacy_account_json');
  }
  const imported = await importer(jsonContent);
  const importedCount = Array.isArray(imported) ? imported.length : 0;
  return synthesizeAccountImportResult(platform, importedCount);
}

export function getDataTransferFileNameBase(selection: DataTransferSelection): string {
  if (selection.includeAccounts && selection.includeConfig) {
    return 'aipass_data_backup';
  }
  if (selection.includeAccounts) {
    return 'aipass_accounts_backup';
  }
  return 'aipass_config_backup';
}

export async function exportDataTransferJson(selection: DataTransferSelection): Promise<string> {
  ensureSelection(selection);
  const bundle: DataTransferBundle = {
    schema: DATA_TRANSFER_SCHEMA,
    version: DATA_TRANSFER_VERSION,
    exported_at: new Date().toISOString(),
    sections: {
      accounts: selection.includeAccounts,
      config: selection.includeConfig,
    },
  };

  if (selection.includeAccounts) {
    bundle.accounts = await buildAccountTransferBundle();
  }

  if (selection.includeConfig) {
    const registry = await loadAccountRegistry();
    bundle.config = await exportConfigBundle(registry);
  }

  return JSON.stringify(bundle, null, 2);
}

export async function importDataTransferJson(
  jsonContent: string,
  options: DataTransferImportOptions,
): Promise<DataTransferImportResult> {
  ensureSelection(options);
  const parsed = parseJsonOrThrow(jsonContent, 'invalid_json');

  if (isDataTransferBundle(parsed)) {
    if (parsed.version !== DATA_TRANSFER_VERSION) {
      throw new Error('invalid_bundle_version');
    }

    const warnings: DataTransferWarningCode[] = [];
    let accountResult: AccountTransferImportResult | null = null;
    let configResult: DataTransferConfigImportResult | null = null;

    if (options.includeAccounts) {
      if (parsed.accounts) {
        accountResult = await importAllAccountsFromTransferJson(JSON.stringify(parsed.accounts), {
          onProgress: options.onAccountProgress,
        });
      } else {
        warnings.push('accounts_section_missing');
      }
    }

    if (options.includeConfig) {
      if (parsed.config) {
        configResult = await importConfigBundle(parsed.config);
      } else {
        warnings.push('config_section_missing');
      }
    }

    if (!accountResult && !configResult) {
      throw new Error('selected_sections_missing');
    }

    return {
      detected_format: 'data_bundle',
      imported_account_count: accountResult?.imported_count ?? 0,
      account_result: accountResult,
      config_result: configResult,
      warnings,
    };
  }

  if (isAccountTransferBundleLike(parsed)) {
    if (!options.includeAccounts) {
      throw new Error('accounts_section_required');
    }

    const accountResult = await importAllAccountsFromTransferJson(jsonContent, {
      onProgress: options.onAccountProgress,
    });

    return {
      detected_format: 'account_bundle',
      imported_account_count: accountResult.imported_count,
      account_result: accountResult,
      config_result: null,
      warnings: options.includeConfig ? ['config_section_missing'] : [],
    };
  }

  const legacyPlatform = detectLegacyPlatform(parsed);
  if (!legacyPlatform) {
    throw new Error('unsupported_legacy_account_json');
  }
  if (!options.includeAccounts) {
    throw new Error('accounts_section_required');
  }

  const accountResult = await importLegacyAccountJson(legacyPlatform, jsonContent);
  return {
    detected_format: 'legacy_account_json',
    legacy_account_platform: legacyPlatform,
    imported_account_count: accountResult.imported_count,
    account_result: accountResult,
    config_result: null,
    warnings: options.includeConfig ? ['config_section_missing'] : [],
  };
}

export { DATA_TRANSFER_SCHEMA, DATA_TRANSFER_VERSION, CURRENT_ACCOUNT_REFRESH_STORAGE_KEY };
