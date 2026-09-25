import type { Page } from '../types/navigation';
import { PLATFORM_PAGE_MAP, type PlatformId } from '../types/platform';

export const EXTERNAL_PROVIDER_IMPORT_EVENT = 'app:provider-import';

export type ExternalProviderImportPayload = {
  providerId: PlatformId;
  page: Page;
  token: string;
  importUrl?: string | null;
  apiBaseUrl?: string | null;
  minAppVersion?: string | null;
  autoImport: boolean;
  activate: boolean;
  source?: string | null;
  rawUrl?: string | null;
};

type RawExternalProviderImportPayload = {
  providerId?: unknown;
  provider?: unknown;
  platform?: unknown;
  target?: unknown;
  page?: unknown;
  token?: unknown;
  importToken?: unknown;
  payload?: unknown;
  importPayload?: unknown;
  importUrl?: unknown;
  import_url?: unknown;
  apiBaseUrl?: unknown;
  api_base_url?: unknown;
  baseUrl?: unknown;
  base_url?: unknown;
  minAppVersion?: unknown;
  min_app_version?: unknown;
  autoImport?: unknown;
  autoSubmit?: unknown;
  activate?: unknown;
  autoActivate?: unknown;
  source?: unknown;
  rawUrl?: unknown;
  url?: unknown;
};

const IMPORT_TARGET_PAGES: ReadonlySet<Page> = new Set<Page>([
  'codebuddy',
  'codebuddy-cn',
  'workbuddy',
  'qoder',
  'qoder-cn',
  'trae',
  'trae-solo',
  'trae-cn',
  'trae-solo-cn',
]);

const PROVIDER_ALIAS_MAP: Record<string, PlatformId> = {
  codebuddy: 'codebuddy',
  codebuddy_cn: 'codebuddy_cn',
  codebuddycn: 'codebuddy_cn',
  qoder: 'qoder',
  qoder_cn: 'qoder_cn',
  qodercn: 'qoder_cn',
  trae: 'trae',
  trae_solo: 'trae_solo',
  traesolo: 'trae_solo',
  trae_cn: 'trae_cn',
  traecn: 'trae_cn',
  trae_solo_cn: 'trae_solo_cn',
  traesolocn: 'trae_solo_cn',
  workbuddy: 'workbuddy',
};

let pendingExternalProviderImport: ExternalProviderImportPayload | null = null;

function normalizeAliasKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveProviderId(raw: unknown): PlatformId | null {
  if (typeof raw !== 'string') return null;
  const key = normalizeAliasKey(raw);
  if (!key) return null;
  return PROVIDER_ALIAS_MAP[key] ?? null;
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function readString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function resolvePage(providerId: PlatformId, rawPage: unknown): Page {
  const candidate = readString(rawPage);
  if (candidate && IMPORT_TARGET_PAGES.has(candidate as Page)) {
    return candidate as Page;
  }
  return PLATFORM_PAGE_MAP[providerId];
}

export function normalizeExternalProviderImportPayload(
  raw: unknown,
): ExternalProviderImportPayload | null {
  if (!raw || typeof raw !== 'object') return null;

  const payload = raw as RawExternalProviderImportPayload;
  const providerId = resolveProviderId(
    payload.providerId ?? payload.provider ?? payload.platform ?? payload.target,
  );
  if (!providerId) return null;

  const token =
    readString(
      payload.token ?? payload.importToken ?? payload.payload ?? payload.importPayload,
    ) ?? '';
  const importUrl = readString(payload.importUrl ?? payload.import_url);
  const apiBaseUrl = readString(
    payload.apiBaseUrl ?? payload.api_base_url ?? payload.baseUrl ?? payload.base_url,
  );
  if (!token && !importUrl) return null;
  const minAppVersion =
    readString(payload.minAppVersion ?? payload.min_app_version)?.replace(/^v/i, '') ?? null;

  const page = resolvePage(providerId, payload.page);

  return {
    providerId,
    page,
    token,
    importUrl,
    apiBaseUrl,
    minAppVersion,
    autoImport: parseBooleanLike(payload.autoImport ?? payload.autoSubmit),
    activate: parseBooleanLike(payload.activate ?? payload.autoActivate),
    source: readString(payload.source),
    rawUrl: readString(payload.rawUrl ?? payload.url),
  };
}

export function queueExternalProviderImport(payload: ExternalProviderImportPayload): void {
  pendingExternalProviderImport = payload;
}

export function takePendingExternalProviderImport(): ExternalProviderImportPayload | null {
  const payload = pendingExternalProviderImport;
  pendingExternalProviderImport = null;
  return payload;
}

export function consumeQueuedExternalProviderImportForPlatform(
  platformId: PlatformId,
): ExternalProviderImportPayload | null {
  if (pendingExternalProviderImport && pendingExternalProviderImport.providerId === platformId) {
    const payload = pendingExternalProviderImport;
    pendingExternalProviderImport = null;
    return payload;
  }
  return null;
}

export function dispatchExternalProviderImportEvent(
  payload: ExternalProviderImportPayload,
): boolean {
  if (typeof window === 'undefined') return false;
  return window.dispatchEvent(
    new CustomEvent<ExternalProviderImportPayload>(EXTERNAL_PROVIDER_IMPORT_EVENT, {
      detail: payload,
    }),
  );
}

