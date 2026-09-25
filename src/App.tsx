import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import './App.css';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

const safeListen = <T = any,>(
  event: string,
  handler: (event: any) => void,
): Promise<UnlistenFn> => {
  return listen<T>(event, handler).catch(() => (() => {}) as UnlistenFn);
};
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { FileText, FolderOpen, RefreshCw, X } from 'lucide-react';
import { SideNav } from './components/layout/SideNav';
import { VisibleBootPage } from './components/BootReadyMarker';
import { GlobalModal } from './components/GlobalModal';
import { WindowsOperationDialog } from './components/WindowsOperationDialog';
import { AnnouncementHost } from './components/AnnouncementCenter';
import type { QuickSettingsType } from './components/QuickSettingsPopover';
import { isMainWindowNavigablePage, type Page } from './types/navigation';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useEasterEggTrigger } from './hooks/useEasterEggTrigger';
import { useGlobalModal } from './hooks/useGlobalModal';
import { changeLanguage, getCurrentLanguage, normalizeLanguage, syncLanguage } from './i18n';
import { useCodebuddyAccountStore } from './stores/useCodebuddyAccountStore';
import { useCodebuddyCnAccountStore } from './stores/useCodebuddyCnAccountStore';
import { useQoderAccountStore } from './stores/useQoderAccountStore';
import { useQoderCnAccountStore } from './stores/useQoderCnAccountStore';
import { useTraeAccountStore } from './stores/useTraeAccountStore';
import { useWorkbuddyAccountStore } from './stores/useWorkbuddyAccountStore';
import { useWorkbuddyAiAccountStore } from './stores/useWorkbuddyAiAccountStore';
import { useSideNavLayoutStore } from './stores/useSideNavLayoutStore';
import { usePlatformLayoutStore } from './stores/usePlatformLayoutStore';
import { useRemoteConfigStore } from './stores/useRemoteConfigStore';
import type { UpdateCheckResult, UpdateInfo } from './components/UpdateNotification';
import type { RemoteUpdatePromptMode } from './types/remoteConfig';
import type { Update as UpdaterUpdate } from '@tauri-apps/plugin-updater';
import {
  parseUpdaterReleaseNotes,
  resolveUpdaterDownloadUrl,
} from './utils/updaterReleaseNotes';
import { FloatingCardWindow } from './pages/FloatingCardWindow';
import {
  createUpdaterCanceledError,
  isRetryableUpdaterError,
  isUpdaterCanceledError,
  retryWithBackoff,
  sanitizeUpdaterErrorMessage,
  UPDATE_CHECK_RETRY_DELAYS_MS,
  UPDATE_DOWNLOAD_RETRY_DELAYS_MS,
} from './utils/updaterRetry';
import { UpdatePromptPolicy } from './utils/updatePromptPolicy';
import {
  dispatchExternalProviderImportEvent,
  normalizeExternalProviderImportPayload,
  type ExternalProviderImportPayload,
} from './utils/externalProviderImport';
import { runAutoBackupCycle } from './services/scheduledBackupService';
import {
  hydrateUserMemory,
  USER_MEMORY_FLAGS,
} from './utils/userMemory';
import {
  clearLegacyWorkbuddyAutoCheckinLogs,
  getWorkbuddyAutoCheckinConfig,
  migrateWorkbuddyAutoCheckinConfigAsync,
} from './services/workbuddyAutoCheckinService';
import { startAutoCheckinScheduler } from './services/autoCheckinScheduler';
import { applyReducedMotion } from './utils/reducedMotion';
import {
  applyWebviewUiScale,
  isUiScaleResetKey,
  isUiScaleZoomInKey,
  isUiScaleZoomOutKey,
  normalizeUiScale,
  stepUiScale,
  UI_SCALE_DEFAULT,
} from './utils/uiScale';
import {
  emitActivePlatformFocus,
  resolvePlatformIdFromPage,
} from './utils/accountSyncEvents';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const CodebuddyAccountsPage = lazy(() =>
  import('./pages/CodebuddyAccountsPage').then((module) => ({ default: module.CodebuddyAccountsPage })),
);
const CodebuddyCnAccountsPage = lazy(() =>
  import('./pages/CodebuddyCnAccountsPage').then((module) => ({ default: module.CodebuddyCnAccountsPage })),
);
const QoderAccountsPage = lazy(() =>
  import('./pages/QoderAccountsPage').then((module) => ({ default: module.QoderAccountsPage })),
);
const QoderCnAccountsPage = lazy(() =>
  import('./pages/QoderCnAccountsPage').then((module) => ({ default: module.QoderCnAccountsPage })),
);
const QwenWorkAccountsPage = lazy(() =>
  import('./pages/QwenWorkAccountsPage').then((module) => ({ default: module.QwenWorkAccountsPage })),
);
const TraeAccountsPage = lazy(() =>
  import('./pages/TraeAccountsPage').then((module) => ({ default: module.TraeAccountsPage })),
);
const WorkbuddyAccountsPage = lazy(() =>
  import('./pages/WorkbuddyAccountsPage').then((module) => ({ default: module.WorkbuddyAccountsPage })),
);
const WorkbuddyAiAccountsPage = lazy(() =>
  import('./pages/WorkbuddyAiAccountsPage').then((module) => ({ default: module.WorkbuddyAiAccountsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const InstancesPage = lazy(() =>
  import('./pages/InstancesPage').then((module) => ({ default: module.InstancesPage })),
);
const PlatformLayoutModal = lazy(() =>
  import('./components/PlatformLayoutModal').then((module) => ({
    default: module.PlatformLayoutModal,
  })),
);
const UpdateNotification = lazy(() =>
  import('./components/UpdateNotification').then((module) => ({ default: module.UpdateNotification })),
);
const VersionJumpNotification = lazy(() =>
  import('./components/VersionJumpNotification').then((module) => ({ default: module.VersionJumpNotification })),
);
const CloseConfirmDialog = lazy(() =>
  import('./components/CloseConfirmDialog').then((module) => ({ default: module.CloseConfirmDialog })),
);
const BreakoutModal = lazy(() =>
  import('./components/easter-egg/BreakoutModal').then((module) => ({ default: module.BreakoutModal })),
);
const LogViewerModal = lazy(() =>
  import('./components/LogViewerModal').then((module) => ({ default: module.LogViewerModal })),
);

const ACTIVE_PAGE_STORAGE_KEY = 'agtools.active_page';
const RENDERABLE_PAGE_VALUES: readonly Page[] = [
  'dashboard',
  'codebuddy',
  'codebuddy-cn',
  'workbuddy',
  'workbuddy-ai',
  'qoder',
  'qoder-cn',
  'qwenwork',
  'trae',
  'trae-solo',
  'trae-cn',
  'trae-solo-cn',
  'instances',
  'settings',
];
const RENDERABLE_PAGE_SET = new Set<string>(RENDERABLE_PAGE_VALUES);

function normalizeStoredActivePage(value: string | null): Page | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return RENDERABLE_PAGE_SET.has(normalized) ? (normalized as Page) : null;
}

/** 启动页偏好：`last` 表示恢复上次页面，其它为具体 Page id */
function normalizeStartupPagePreference(value: string | null | undefined): 'last' | Page {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'last') {
    return 'last';
  }
  return RENDERABLE_PAGE_SET.has(normalized) ? (normalized as Page) : 'last';
}

interface GeneralConfigTheme {
  theme: string;
  theme_color?: string;
  reduced_motion_enabled: boolean;
  ui_scale?: number;
}

interface GeneralConfigLanguage {
  language: string;
}

interface GeneralConfig extends GeneralConfigTheme, GeneralConfigLanguage {
  codebuddy_app_path: string;
  codebuddy_cn_app_path: string;
  qoder_app_path: string;
  qoder_cn_app_path: string;
  trae_app_path: string;
  trae_solo_app_path: string;
  trae_cn_app_path: string;
  trae_solo_cn_app_path: string;
  trae_app_scan_roots: string;
  trae_solo_app_scan_roots: string;
  trae_cn_app_scan_roots: string;
  trae_solo_cn_app_scan_roots: string;
  workbuddy_app_path: string;
}

type AppPathMissingDetail = {
  app:
    | 'codebuddy'
    | 'codebuddy_cn'
    | 'qoder'
    | 'qoder_cn'
    | 'trae'
    | 'trae_solo'
    | 'trae_cn'
    | 'trae_solo_cn'
    | 'workbuddy';
  retry?:
    | { kind: 'default'; runtimeTarget?: string }
    | { kind: 'instance'; instanceId?: string; runtimeTarget?: string }
    | { kind: 'switchAccount'; accountId?: string; runtimeTarget?: string };
};

type AppLaunchCandidate = {
  target_type: string;
  label: string;
  target: string;
  source: string;
  supports_multi_instance: boolean;
};

function isTraePlatformApp(app: string): app is 'trae' | 'trae_solo' | 'trae_cn' | 'trae_solo_cn' {
  return app === 'trae' || app === 'trae_solo' || app === 'trae_cn' || app === 'trae_solo_cn';
}

type TraePlatformApp = 'trae' | 'trae_solo' | 'trae_cn' | 'trae_solo_cn';

function getTraeAppPath(config: GeneralConfig, app: TraePlatformApp): string {
  switch (app) {
    case 'trae_solo':
      return config.trae_solo_app_path;
    case 'trae_cn':
      return config.trae_cn_app_path;
    case 'trae_solo_cn':
      return config.trae_solo_cn_app_path;
    case 'trae':
    default:
      return config.trae_app_path;
  }
}

const REMOTE_CONFIG_FALLBACK_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const EXTERNAL_IMPORT_DEDUPE_WINDOW_MS = 30 * 1000;

type QuotaAlertPayload = {
  platform?: string;
  current_account_id: string;
  current_email: string;
  threshold: number;
  threshold_display?: string | null;
  lowest_percentage: number;
  low_models: string[];
  recommended_account_id?: string | null;
  recommended_email?: string | null;
  triggered_at: number;
};

type QuotaAlertPlatform =
  | 'codebuddy'
  | 'codebuddy_cn'
  | 'qoder'
  | 'qoder_cn'
  | 'trae'
  | 'workbuddy'
  | 'workbuddy_ai';
type UpdateCheckSource = 'auto' | 'manual';
type UpdateActionState = 'hidden' | 'available' | 'downloading' | 'installing' | 'ready';

type UpdateRuntimeInfo = {
  platform: string;
  linux_install_kind: string;
  linux_managed_install_supported: boolean;
  updater_target?: string | null;
};

type LinuxUpdateProgressPhase =
  | 'download_started'
  | 'downloading'
  | 'downloaded'
  | 'auth_required'
  | 'installing'
  | 'completed';

type LinuxUpdateProgressPayload = {
  version: string;
  phase: LinuxUpdateProgressPhase;
  progress?: number | null;
};

type UpdateAction = {
  state: UpdateActionState;
  version: string | null;
  progress: number;
  requiresInstall: boolean;
};

function buildExternalImportDedupeKey(payload: {
  providerId: string;
  page: string;
  token: string;
  importUrl?: string | null;
  apiBaseUrl?: string | null;
  minAppVersion?: string | null;
  rawUrl?: string | null;
}): string {
  return [
    payload.providerId,
    payload.page,
    payload.rawUrl ?? '',
    payload.importUrl ?? '',
    payload.apiBaseUrl ?? '',
    payload.minAppVersion ?? '',
    payload.token,
  ].join('|');
}

function parseVersionParts(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .trim()
    .replace(/^v/i, '')
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part >= 0);
}

function isVersionLowerThan(currentVersion: string, minimumVersion: string): boolean {
  const currentParts = parseVersionParts(currentVersion);
  const minimumParts = parseVersionParts(minimumVersion);
  if (currentParts.length === 0 || minimumParts.length === 0) {
    return false;
  }
  const maxLength = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const current = currentParts[index] ?? 0;
    const minimum = minimumParts[index] ?? 0;
    if (current < minimum) return true;
    if (current > minimum) return false;
  }
  return false;
}

function normalizeQuotaAlertPlatform(platform: string | undefined): QuotaAlertPlatform {
  switch (platform) {
    case 'codebuddy_cn':
      return 'codebuddy_cn';
    case 'qoder':
      return 'qoder';
    case 'qoder_cn':
    case 'qoder-cn':
      return 'qoder_cn';
    case 'trae':
    case 'trae-solo':
    case 'trae_solo':
    case 'trae-cn':
    case 'trae_cn':
    case 'trae-solo-cn':
    case 'trae_solo_cn':
      return 'trae';
    case 'workbuddy':
      return 'workbuddy';
    case 'workbuddy_ai':
      return 'workbuddy_ai';
    case 'codebuddy':
    default:
      return 'codebuddy';
  }
}

function getQuotaAlertPlatformLabel(
  platform: QuotaAlertPlatform,
  t: (key: string, defaultValue: string) => string,
): string {
  switch (platform) {
    case 'codebuddy_cn':
      return t('nav.codebuddyCn', 'CodeBuddy CN');
    case 'qoder':
      return t('nav.qoder', 'Qoder');
    case 'qoder_cn':
      return t('nav.qoderCn', 'Qoder CN');
    case 'trae':
      return t('nav.trae', 'Trae');
    case 'workbuddy':
      return t('nav.workbuddy', 'WorkBuddy');
    case 'workbuddy_ai':
      return 'WorkBuddy AI';
    case 'codebuddy':
    default:
      return 'CodeBuddy';
  }
}

function getQuotaAlertTargetPage(platform: QuotaAlertPlatform): Page {
  switch (platform) {
    case 'codebuddy_cn':
      return 'codebuddy-cn';
    case 'qoder':
      return 'qoder';
    case 'qoder_cn':
      return 'qoder-cn';
    case 'trae':
      return 'trae';
    case 'workbuddy':
      return 'workbuddy';
    case 'workbuddy_ai':
      return 'workbuddy-ai';
    case 'codebuddy':
    default:
      return 'codebuddy';
  }
}

function getQuotaAlertQuickSettingsType(platform: QuotaAlertPlatform): QuickSettingsType {
  switch (platform) {
    case 'codebuddy_cn':
      return 'codebuddy_cn';
    case 'qoder':
      return 'qoder';
    case 'qoder_cn':
      return 'qoder_cn';
    case 'trae':
      return 'trae';
    case 'workbuddy':
    case 'workbuddy_ai':
      return 'workbuddy';
    case 'codebuddy':
    default:
      return 'codebuddy';
  }
}

function isElementVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function triggerPageRefreshButton(): boolean {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button.btn.btn-secondary.icon-only:not(:disabled)'),
  );

  const target = buttons.find((button) => {
    if (!isElementVisible(button)) {
      return false;
    }
    return !!button.querySelector('svg.lucide-refresh-cw');
  });

  if (!target) {
    return false;
  }

  target.click();
  return true;
}

function isWindowsPlatform(): boolean {
  const navWithUAData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = navWithUAData.userAgentData?.platform || navigator.platform || '';
  return platform.toLowerCase().includes('win');
}

function MainApp() {
  const { t } = useTranslation();
  const sideNavLayoutMode = useSideNavLayoutStore((state) => state.mode);
  const sideNavClassicCollapsed = useSideNavLayoutStore((state) => state.classicCollapsed);
  const sideNavClassicFirstSyncDone = useSideNavLayoutStore((state) => state.classicFirstSyncDone);
  const markSideNavClassicFirstSyncDone = useSideNavLayoutStore((state) => state.markClassicFirstSyncDone);
  const syncSidebarEntriesFromDashboard = usePlatformLayoutStore((state) => state.syncSidebarEntriesFromDashboard);
  const [page, setPage] = useState<Page>(() => {
    try {
      const saved = normalizeStoredActivePage(localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY));
      if (saved) {
        return saved;
      }
      localStorage.removeItem(ACTIVE_PAGE_STORAGE_KEY);
    } catch {}
    return 'dashboard';
  });

  useEffect(() => {
    void hydrateUserMemory().then((memory) => {
      const store = useSideNavLayoutStore.getState();
      if (
        memory.dismissed[USER_MEMORY_FLAGS.classicSwitchPrompt] ||
        store.hideClassicSwitchPrompt
      ) {
        store.setHideClassicSwitchPrompt(true);
      }
    });
  }, []);

  useEffect(() => {
    try {
      const normalized = normalizeStoredActivePage(page);
      if (normalized) {
        localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, normalized);
      } else {
        localStorage.removeItem(ACTIVE_PAGE_STORAGE_KEY);
        setPage('dashboard');
      }
    } catch (e) {
      console.warn('Failed to save active page to localStorage:', e);
    }
  }, [page]);

  // 冷启动：若设置了固定启动页，则覆盖 localStorage 中的上次页面
  useEffect(() => {
    let disposed = false;
    const applyStartupPagePreference = async () => {
      try {
        const config = await invoke<{ startup_page?: string }>('get_general_config');
        if (disposed) {
          return;
        }
        const preferred = normalizeStartupPagePreference(config.startup_page);
        if (preferred !== 'last') {
          setPage(preferred);
        }
      } catch (error) {
        console.warn('Failed to apply startup page preference:', error);
      }
    };
    void applyStartupPagePreference();
    return () => {
      disposed = true;
    };
  }, []);

  // 窗口可见性与后台资源优化：隐藏时修剪内存并暂停动画，极大减少后台占用
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.visibilityState === 'hidden';
      if (isHidden) {
        document.body.setAttribute('data-app-visibility', 'hidden');
        void invoke('trim_memory').catch(() => {});
      } else {
        document.body.removeAttribute('data-app-visibility');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 主窗口切到某平台页时，记住所在分组的最新选中平台，并同步悬浮窗/菜单栏
  useEffect(() => {
    const platformId = resolvePlatformIdFromPage(page);
    if (!platformId) {
      return;
    }
    usePlatformLayoutStore.getState().rememberGroupPlatform(platformId);
    void emitActivePlatformFocus({
      platformId,
      page,
      reason: 'main-window-page',
    });
  }, [page]);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [updateNotificationKey, setUpdateNotificationKey] = useState(0);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [showPlatformLayoutModal, setShowPlatformLayoutModal] = useState(false);
  const [platformLayoutRequestedGroupId, setPlatformLayoutRequestedGroupId] = useState<string | null>(null);
  const [showBreakout, setShowBreakout] = useState(false);
  const [hasBreakoutSession, setHasBreakoutSession] = useState(false);
  const [appPathMissing, setAppPathMissing] = useState<AppPathMissingDetail | null>(null);
  const [appPathSetting, setAppPathSetting] = useState(false);
  const [appPathDetecting, setAppPathDetecting] = useState(false);
  const [appPathDraft, setAppPathDraft] = useState('');
  const [appLaunchCandidates, setAppLaunchCandidates] = useState<AppLaunchCandidate[]>([]);
  const [appPathActionError, setAppPathActionError] = useState('');
  const [appPathScanError, setAppPathScanError] = useState('');
  const [versionJumpInfo, setVersionJumpInfo] = useState<{
    previous_version: string;
    current_version: string;
    release_notes: string;
    release_notes_zh: string;
  } | null>(null);
  const [showVersionJumpNotification, setShowVersionJumpNotification] = useState(false);
  const [updateRuntimeInfo, setUpdateRuntimeInfo] = useState<UpdateRuntimeInfo | null>(null);
  const [updateRuntimeInfoLoaded, setUpdateRuntimeInfoLoaded] = useState(false);
  const [updateNotificationInfo, setUpdateNotificationInfo] = useState<UpdateInfo | null>(null);
  const [updateNotificationChecking, setUpdateNotificationChecking] = useState(false);
  const [updateRemindersEnabled, setUpdateRemindersEnabled] = useState(false);
  const [updateSkipError, setUpdateSkipError] = useState('');
  const [silentUpdateVersion, setSilentUpdateVersion] = useState<string | null>(null);
  const [updateAction, setUpdateAction] = useState<UpdateAction>({
    state: 'hidden',
    version: null,
    progress: 0,
    requiresInstall: true,
  });
  const [updateRetryStatus, setUpdateRetryStatus] = useState('');
  const [updateDownloadError, setUpdateDownloadError] = useState('');
  const [updateErrorDetails, setUpdateErrorDetails] = useState('');
  const pendingSilentUpdateRef = useRef<UpdaterUpdate | null>(null);
  const activeUpdateDownloadRef = useRef<UpdaterUpdate | null>(null);
  const updateCancelRequestedRef = useRef(false);
  const updateDownloadTaskIdRef = useRef(0);
  const updateDownloadOwnerRef = useRef<'none' | 'shared' | 'silent'>('none');
  const updateCheckRequestIdRef = useRef(0);
  const updatePromptPolicyRef = useRef(new UpdatePromptPolicy());
  const externalImportHandledAtRef = useRef<Map<string, number>>(new Map());
  const { showModal, closeModal } = useGlobalModal();
  const fetchRemoteConfigState = useRemoteConfigStore((state) => state.fetchState);
  const sponsorEntryVisible = false;
  const trayRefreshInFlightRef = useRef(false);
  const openPlatformLayoutModal = useCallback(() => {
    setPlatformLayoutRequestedGroupId(null);
    setShowPlatformLayoutModal(true);
  }, []);
  const openBreakout = useCallback(() => {
    setHasBreakoutSession(true);
    setShowBreakout(true);
  }, []);
  const ensureExternalImportVersionCompatible = useCallback(
    async (payload: ExternalProviderImportPayload): Promise<boolean> => {
      const requiredVersion = payload.minAppVersion?.trim().replace(/^v/i, '');
      if (!requiredVersion) return true;

      let currentVersion = '';
      try {
        currentVersion = await getVersion();
      } catch (error) {
        console.warn('[ExternalImport][App] 读取当前应用版本失败，已终止外部导入', error);
      }

      if (currentVersion && !isVersionLowerThan(currentVersion, requiredVersion)) {
        return true;
      }

      showModal({
        title: t('common.shared.externalImport.versionUnsupportedTitle', '应用版本过低'),
        description: t(
          'common.shared.externalImport.versionUnsupportedDesc',
          '暂不支持此方式，请下载最新版。',
        ),
        width: 'sm',
        actions: [
          {
            id: 'check-update',
            label: t('common.shared.externalImport.checkUpdate', '检查更新'),
            variant: 'primary',
            onClick: () => {
              window.dispatchEvent(
                new CustomEvent('update-check-requested', {
                  detail: { source: 'manual' satisfies UpdateCheckSource },
                }),
              );
            },
          },
          {
            id: 'close',
            label: t('common.close', '关闭'),
            variant: 'secondary',
          },
        ],
      });
      console.warn('[ExternalImport][App] 当前版本不支持外部导入方式，已终止导入', {
        currentVersion: currentVersion || null,
        requiredVersion,
        providerId: payload.providerId,
      });
      return false;
    },
    [showModal, t],
  );

  const handleExternalProviderImportRawPayload = useCallback(async (rawPayload: unknown) => {
    console.info('[ExternalImport][App] 收到原始 payload:', rawPayload);
    const normalized = normalizeExternalProviderImportPayload(rawPayload);
    if (!normalized) {
      console.warn('[ExternalImport][App] payload 归一化失败，已忽略');
      return;
    }
    if (!(await ensureExternalImportVersionCompatible(normalized))) {
      return;
    }
    const now = Date.now();
    for (const [key, handledAt] of externalImportHandledAtRef.current) {
      if (now - handledAt > EXTERNAL_IMPORT_DEDUPE_WINDOW_MS) {
        externalImportHandledAtRef.current.delete(key);
      }
    }
    const dedupeKey = buildExternalImportDedupeKey(normalized);
    if (externalImportHandledAtRef.current.has(dedupeKey)) {
      console.info('[ExternalImport][App] 重复外部导入 payload 已忽略');
      return;
    }
    externalImportHandledAtRef.current.set(dedupeKey, now);
    console.info('[ExternalImport][App] payload 归一化成功:', {
      providerId: normalized.providerId,
      page: normalized.page,
      autoImport: normalized.autoImport,
      tokenLength: normalized.token.length,
      hasImportUrl: Boolean(normalized.importUrl),
      apiBaseUrl: normalized.apiBaseUrl ?? null,
      minAppVersion: normalized.minAppVersion ?? null,
      source: normalized.source ?? null,
    });
    setPage(normalized.page);
    window.setTimeout(() => {
      console.info('[ExternalImport][App] 分发前端外部导入事件');
      dispatchExternalProviderImportEvent(normalized);
    }, 0);
  }, [ensureExternalImportVersionCompatible]);
  const handleBreakoutMinimize = useCallback(() => {
    setShowBreakout(false);
  }, []);
  const handleBreakoutTerminate = useCallback(() => {
    setShowBreakout(false);
    setHasBreakoutSession(false);
  }, []);
  const handleResumeBreakout = useCallback(() => {
    if (!hasBreakoutSession) return;
    setShowBreakout(true);
  }, [hasBreakoutSession]);

  const {
    count: easterEggClickCount,
    registerClick: handleEasterEggTriggerClick,
    reset: resetEasterEggTrigger,
  } = useEasterEggTrigger({
    threshold: 20,
    windowMs: 8000,
    onTrigger: openBreakout,
  });
  const handleBreakoutEntryTriggerClick = useCallback(() => {
    if (hasBreakoutSession) {
      resetEasterEggTrigger();
      handleResumeBreakout();
      return;
    }
    handleEasterEggTriggerClick();
  }, [handleEasterEggTriggerClick, handleResumeBreakout, hasBreakoutSession, resetEasterEggTrigger]);
  
  // 启用自动刷新 hook
  useAutoRefresh();


  useEffect(() => {
    let disposed = false;

    const syncLanguageFromConfig = async () => {
      try {
        const config = await invoke<GeneralConfigLanguage>('get_general_config');
        const nextLanguage = await syncLanguage(config.language);
        if (disposed) {
          return;
        }
        window.dispatchEvent(
          new CustomEvent('general-language-updated', { detail: { language: nextLanguage } }),
        );
      } catch (error) {
        console.error('Failed to sync language config:', error);
      }
    };

    void syncLanguageFromConfig();
    window.addEventListener('config-updated', syncLanguageFromConfig);
    return () => {
      disposed = true;
      window.removeEventListener('config-updated', syncLanguageFromConfig);
    };
  }, []);

  useEffect(() => {
    const handleRefreshShortcut = (event: KeyboardEvent) => {
      const isRefreshKey = event.key.toLowerCase() === 'r';
      const isWindowsF5 = isWindowsPlatform() && event.key === 'F5';
      const hasMainModifier = event.metaKey || event.ctrlKey;
      const matchMainRefresh = isRefreshKey && hasMainModifier && !event.altKey && !event.shiftKey;
      const matchWindowsRefresh = isWindowsF5 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      if ((!matchMainRefresh && !matchWindowsRefresh) || event.repeat) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      triggerPageRefreshButton();
    };

    window.addEventListener('keydown', handleRefreshShortcut, true);
    return () => {
      window.removeEventListener('keydown', handleRefreshShortcut, true);
    };
  }, []);

  // ⌘+/⌘-（Windows/Linux: Ctrl+/Ctrl-）步进界面缩放；⌘0 / Ctrl+0 重置。
  useEffect(() => {
    let disposed = false;
    let currentScale = UI_SCALE_DEFAULT;
    let saveTimer: number | null = null;
    let pendingScale: number | null = null;
    let saveQueue: Promise<void> = Promise.resolve();

    const loadCurrentScale = async () => {
      try {
        const config = await invoke<{ ui_scale?: number }>('get_general_config');
        if (disposed) return;
        currentScale = normalizeUiScale(config.ui_scale);
      } catch (error) {
        console.error('Failed to load UI scale for shortcuts:', error);
      }
    };

    const persistScale = (scale: number) => {
      pendingScale = scale;
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
      }
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        const toSave = pendingScale;
        pendingScale = null;
        if (toSave == null) return;
        saveQueue = saveQueue
          .catch(() => undefined)
          .then(async () => {
            if (disposed) return;
            try {
              await invoke('patch_general_config', {
                updates: { ui_scale: toSave },
              });
              window.dispatchEvent(new Event('config-updated'));
            } catch (error) {
              console.error('Failed to save UI scale:', error);
            }
          });
      }, 250);
    };

    const handleZoomShortcut = (event: KeyboardEvent) => {
      const hasMainModifier = event.metaKey || event.ctrlKey;
      if (!hasMainModifier || event.altKey) {
        return;
      }

      const zoomIn = isUiScaleZoomInKey(event);
      const zoomOut = isUiScaleZoomOutKey(event);
      const reset = isUiScaleResetKey(event);
      if (!zoomIn && !zoomOut && !reset) {
        return;
      }
      // 重置不需要连发；放大缩小允许按住连按。
      if (reset && event.repeat) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const nextScale = reset
        ? UI_SCALE_DEFAULT
        : stepUiScale(currentScale, zoomIn ? 1 : -1);
      if (nextScale === currentScale) {
        return;
      }
      currentScale = nextScale;
      void applyWebviewUiScale(nextScale).catch((error) => {
        console.error('Failed to apply UI scale shortcut:', error);
      });
      persistScale(nextScale);
    };

    void loadCurrentScale();
    window.addEventListener('keydown', handleZoomShortcut, true);
    window.addEventListener('config-updated', loadCurrentScale);
    return () => {
      disposed = true;
      window.removeEventListener('keydown', handleZoomShortcut, true);
      window.removeEventListener('config-updated', loadCurrentScale);
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
      }
    };
  }, []);


  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;

    const scheduleNextRefresh = (delayMs: number) => {
      if (disposed) return;
      const normalizedDelay = Number.isFinite(delayMs) && delayMs >= 60_000
        ? delayMs
        : REMOTE_CONFIG_FALLBACK_REFRESH_INTERVAL_MS;
      timer = window.setTimeout(() => {
        void refresh(false);
      }, normalizedDelay);
    };

    const refresh = async (force: boolean) => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      const state = await fetchRemoteConfigState(force);
      scheduleNextRefresh(state.refreshIntervalMs);
    };

    void refresh(true);

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [fetchRemoteConfigState]);


  useEffect(() => {
    if (sideNavLayoutMode !== 'classic' || sideNavClassicFirstSyncDone) {
      return;
    }
    syncSidebarEntriesFromDashboard();
    markSideNavClassicFirstSyncDone();
  }, [
    sideNavLayoutMode,
    sideNavClassicFirstSyncDone,
    syncSidebarEntriesFromDashboard,
    markSideNavClassicFirstSyncDone,
  ]);

  const openUpdateNotificationDetails = useCallback((source: UpdateCheckSource = 'manual') => {
    if (source === 'manual') updatePromptPolicyRef.current.openManual();
    setUpdateSkipError('');
    setUpdateNotificationKey(Date.now());
    setShowUpdateNotification(true);
  }, []);

  const openUpdateNotification = useCallback((source: UpdateCheckSource) => {
    if (source === 'manual') {
      window.dispatchEvent(new CustomEvent('update-check-started', { detail: { source } }));
    }
    openUpdateNotificationDetails();
  }, [openUpdateNotificationDetails]);

  const closeUpdateNotification = useCallback(() => {
    updatePromptPolicyRef.current.close();
    setShowUpdateNotification(false);
    setUpdateSkipError('');
    if (updateAction.state === 'hidden') {
      setUpdateNotificationInfo(null);
      setUpdateRetryStatus('');
      setUpdateDownloadError('');
      setUpdateErrorDetails('');
    }
  }, [updateAction.state]);

  const writeUpdateLog = useCallback((level: 'info' | 'warn' | 'error', message: string) => {
    void invoke('update_log', { level, message }).catch(() => {});
  }, []);

  const openAutomaticUpdatePrompt = useCallback((
    version: string,
    mode: RemoteUpdatePromptMode,
  ) => {
    if (!updatePromptPolicyRef.current.openAutomatic(version, mode)) {
      return false;
    }
    openUpdateNotificationDetails('auto');
    writeUpdateLog('info', `远端更新策略已自动打开更新弹框: version=${version}`);
    return true;
  }, [openUpdateNotificationDetails, writeUpdateLog]);

  const applyUpdateReminderPreference = useCallback((enabled: boolean, revision?: number) => {
    const policy = updatePromptPolicyRef.current;
    if (!policy.applyPreference(enabled, revision)) return;
    setUpdateRemindersEnabled(policy.enabled);
    if (policy.shouldCloseAutomaticPrompt()) {
      policy.close();
      setShowUpdateNotification(false);
    }
  }, []);

  const prepareCodexLocalAccessBeforeRelaunch = useCallback(async () => {}, []);
  const restoreCodexLocalAccessAfterRelaunchFailure = useCallback(async () => {}, []);

  const prepareUpdateNotificationInfo = useCallback(async (update: UpdaterUpdate): Promise<UpdateInfo> => {
    const { releaseNotes, releaseNotesZh } = parseUpdaterReleaseNotes(update.body);
    const currentVersion = update.currentVersion || (await getVersion());
    return {
      current_version: currentVersion,
      latest_version: update.version,
      download_url: resolveUpdaterDownloadUrl(update.version, update.rawJson),
      release_notes: releaseNotes,
      release_notes_zh: releaseNotesZh,
    };
  }, []);

  const handleUpdateCheckResult = useCallback((result: UpdateCheckResult) => {
    const latestVersion = result.latestVersion;
    if (result.status === 'has_update' && latestVersion) {
      setUpdateAction((prev) => {
        if (prev.state === 'downloading' && prev.version === latestVersion) {
          return prev;
        }
        if (prev.state === 'installing' && prev.version === latestVersion) {
          return prev;
        }
        if (prev.state === 'ready' && prev.version === latestVersion) {
          return prev;
        }
        return {
          state: 'available',
          version: latestVersion,
          progress: 0,
          requiresInstall: true,
        };
      });
      setUpdateRetryStatus('');
    } else if (result.status === 'up_to_date') {
      setUpdateAction((prev) => {
        if (prev.state === 'ready' || prev.state === 'downloading' || prev.state === 'installing') {
          return prev;
        }
        return {
          state: 'hidden',
          version: null,
          progress: 0,
          requiresInstall: true,
        };
      });
      setUpdateRetryStatus('');
      setUpdateDownloadError('');
      setUpdateErrorDetails('');
    }

    if (result.source === 'manual') {
      window.dispatchEvent(new CustomEvent('update-check-finished', { detail: result }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    invoke<UpdateRuntimeInfo>('get_update_runtime_info')
      .then((info) => {
        if (cancelled) {
          return;
        }
        setUpdateRuntimeInfo(info);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('[App] Failed to load update runtime info:', error);
        writeUpdateLog('warn', `加载更新运行时信息失败: error=${sanitizeUpdaterErrorMessage(error)}`);
      })
      .finally(() => {
        if (!cancelled) {
          setUpdateRuntimeInfoLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [writeUpdateLog]);

  useEffect(() => {
    let cancelled = false;
    const preferenceRevision = updatePromptPolicyRef.current.revision;
    invoke<{
      auto_check?: boolean;
      check_interval_hours?: number;
      auto_install?: boolean;
      last_run_version?: string;
      remind_on_update?: boolean;
      skipped_version?: string;
    }>('get_update_settings')
      .then((settings) => {
        if (cancelled) {
          return;
        }
        applyUpdateReminderPreference(settings?.remind_on_update ?? true, preferenceRevision);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applyUpdateReminderPreference]);

  useEffect(() => {
    const handleUpdateReminderChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === 'boolean') {
        applyUpdateReminderPreference(detail.enabled);
      }
    };
    window.addEventListener('update-reminder-changed', handleUpdateReminderChanged as EventListener);
    return () => {
      window.removeEventListener('update-reminder-changed', handleUpdateReminderChanged as EventListener);
    };
  }, [applyUpdateReminderPreference]);

  const isLinuxManagedUpdate = updateRuntimeInfo?.platform === 'linux'
    && updateRuntimeInfo.linux_managed_install_supported;

  const getUpdaterCheckTarget = useCallback((): string | undefined => {
    if (typeof updateRuntimeInfo?.updater_target !== 'string') {
      return undefined;
    }

    const target = updateRuntimeInfo.updater_target.trim();
    return target.length > 0 ? target : undefined;
  }, [updateRuntimeInfo]);

  const runUpdaterCheck = useCallback(async () => {
    const { check } = await import('@tauri-apps/plugin-updater');
    const target = getUpdaterCheckTarget();
    return target ? check({ target }) : check();
  }, [getUpdaterCheckTarget]);

  const closeUpdaterHandle = useCallback(async (handle: UpdaterUpdate | null | undefined) => {
    if (!handle) {
      return;
    }
    await handle.close().catch(() => {});
  }, []);

  const runModalUpdateCheck = useCallback(async (source: UpdateCheckSource) => {
    const requestId = Date.now();
    updateCheckRequestIdRef.current = requestId;
    setUpdateNotificationInfo(null);
    setUpdateNotificationChecking(true);
    setUpdateRetryStatus('');
    setUpdateDownloadError('');
    setUpdateErrorDetails('');
    openUpdateNotification(source);

    try {
      const update = await retryWithBackoff(
        async () => runUpdaterCheck(),
        {
          delaysMs: UPDATE_CHECK_RETRY_DELAYS_MS,
          shouldRetry: isRetryableUpdaterError,
          onRetry: ({ retryIndex, totalRetries, delayMs, error }) => {
            if (updateCheckRequestIdRef.current !== requestId) {
              return;
            }
            const compactError = sanitizeUpdaterErrorMessage(error);
            setUpdateRetryStatus(
              t('update_notification.checkRetrying', {
                attempt: retryIndex,
                total: totalRetries,
              }),
            );
            writeUpdateLog(
              'warn',
              `交互式更新检查失败，准备重试(${retryIndex}/${totalRetries})，delay=${delayMs}ms，error=${compactError}`,
            );
          },
        },
      );

      if (updateCheckRequestIdRef.current !== requestId) {
        await closeUpdaterHandle(update);
        return;
      }

      setUpdateRetryStatus('');
      if (update) {
        const info = await prepareUpdateNotificationInfo(update);
        if (updateCheckRequestIdRef.current !== requestId) {
          await closeUpdaterHandle(update);
          return;
        }
        setUpdateNotificationInfo(info);
        handleUpdateCheckResult({
          source,
          status: 'has_update',
          currentVersion: info.current_version,
          latestVersion: info.latest_version,
        });
        await closeUpdaterHandle(update);
        return;
      }

      const currentVersion = await getVersion();
      if (updateCheckRequestIdRef.current !== requestId) {
        return;
      }
      updatePromptPolicyRef.current.close();
      setShowUpdateNotification(false);
      setUpdateNotificationInfo(null);
      handleUpdateCheckResult({
        source,
        status: 'up_to_date',
        currentVersion,
        latestVersion: currentVersion,
      });
    } catch (error) {
      if (updateCheckRequestIdRef.current !== requestId) {
        return;
      }
      console.error('[App] Interactive update check failed:', error);
      writeUpdateLog(
        'warn',
        `交互式更新检查失败，关闭弹窗: error=${sanitizeUpdaterErrorMessage(error)}`,
      );
      updatePromptPolicyRef.current.close();
      setShowUpdateNotification(false);
      setUpdateNotificationInfo(null);
      handleUpdateCheckResult({
        source,
        status: 'failed',
        error: String(error),
      });
    } finally {
      if (updateCheckRequestIdRef.current === requestId) {
        setUpdateNotificationChecking(false);
      }
    }
  }, [
    closeUpdaterHandle,
    handleUpdateCheckResult,
    openUpdateNotification,
    prepareUpdateNotificationInfo,
    runUpdaterCheck,
    t,
    writeUpdateLog,
  ]);

  const handleApplyPendingUpdate = useCallback(async () => {
    const targetVersion = updateAction.version || silentUpdateVersion || '';
    const shouldInstall = updateAction.state === 'ready'
      ? updateAction.requiresInstall
      : Boolean(pendingSilentUpdateRef.current);
    let failureStage: 'prepare' | 'install' | 'relaunch' = 'prepare';
    try {
      writeUpdateLog(
        'info',
        `用户点击立即重启应用更新: version=${targetVersion || 'unknown'}, install_before_restart=${shouldInstall}`,
      );
      setUpdateRetryStatus(
        t('update_notification.stoppingApiService', '正在关闭 API 服务...'),
      );
      setUpdateDownloadError('');
      setUpdateErrorDetails('');
      await prepareCodexLocalAccessBeforeRelaunch();
      failureStage = 'install';
      const pendingUpdate = pendingSilentUpdateRef.current;
      if (shouldInstall && pendingUpdate) {
        await pendingUpdate.install();
      }
      if (pendingUpdate) {
        await pendingUpdate.close().catch(() => {});
        pendingSilentUpdateRef.current = null;
      }
      setSilentUpdateVersion(null);
      setUpdateRetryStatus('');
      setUpdateDownloadError('');
      setUpdateErrorDetails('');
      setUpdateAction({
        state: 'ready',
        version: targetVersion || null,
        progress: 100,
        requiresInstall: false,
      });
      failureStage = 'relaunch';
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (error) {
      await restoreCodexLocalAccessAfterRelaunchFailure();
      console.error('[App] Failed to apply pending update:', error);
      const compactError = sanitizeUpdaterErrorMessage(error);
      const errorMessage = failureStage === 'prepare'
        ? t('update_notification.stopApiServiceFailed', '无法关闭 API 服务，请先停用后重试。')
        : failureStage === 'install'
          ? t('update_notification.installFailed', '系统安装失败，请稍后重试或手动下载安装。')
          : t('update_notification.restartRequiredAfterInstall', '更新已安装，请手动重启应用完成切换。');
      setUpdateRetryStatus('');
      setUpdateDownloadError(errorMessage);
      setUpdateErrorDetails(compactError);
      writeUpdateLog(
        'error',
        `用户手动应用更新失败: stage=${failureStage}, error=${compactError}`,
      );
      throw error;
    }
  }, [
    prepareCodexLocalAccessBeforeRelaunch,
    restoreCodexLocalAccessAfterRelaunchFailure,
    silentUpdateVersion,
    updateAction,
    t,
    writeUpdateLog,
  ]);

  const runLinuxManagedUpdate = useCallback(async (expectedVersion: string) => {
    setUpdateRetryStatus('');
    setUpdateDownloadError('');
    setUpdateErrorDetails('');
    setSilentUpdateVersion(null);
    setUpdateAction({
      state: 'downloading',
      version: expectedVersion,
      progress: 0,
      requiresInstall: false,
    });

    if (pendingSilentUpdateRef.current) {
      await closeUpdaterHandle(pendingSilentUpdateRef.current);
      pendingSilentUpdateRef.current = null;
    }

    writeUpdateLog('info', `Linux 托管更新开始执行: version=${expectedVersion}`);

    try {
      await invoke('install_linux_update', {
        expectedVersion,
      });

      setUpdateAction({
        state: 'ready',
        version: expectedVersion,
        progress: 100,
        requiresInstall: false,
      });
      setUpdateRetryStatus(t('update_notification.installSuccess', '更新已安装，正在重启...'));
      setUpdateDownloadError('');
      setUpdateErrorDetails('');

      let relaunchStage: 'prepare' | 'relaunch' = 'prepare';
      try {
        await prepareCodexLocalAccessBeforeRelaunch();
        relaunchStage = 'relaunch';
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch (error) {
        await restoreCodexLocalAccessAfterRelaunchFailure();
        const compactError = sanitizeUpdaterErrorMessage(error);
        console.error('[App] Linux managed update installed but relaunch failed:', error);
        writeUpdateLog(
          'error',
          `Linux 托管更新安装完成但重启失败: version=${expectedVersion}, error=${compactError}`,
        );
        setUpdateRetryStatus('');
        setUpdateDownloadError(
          relaunchStage === 'prepare'
            ? t('update_notification.stopApiServiceFailed', '无法关闭 API 服务，请先停用后重试。')
            : t('update_notification.restartRequiredAfterInstall', '更新已安装，请手动重启应用完成切换。'),
        );
        setUpdateErrorDetails(compactError);
      }
    } catch (error) {
      console.error('[App] Linux managed update failed:', error);
      const compactError = sanitizeUpdaterErrorMessage(error);
      writeUpdateLog('error', `Linux 托管更新失败: version=${expectedVersion}, error=${compactError}`);
      setUpdateRetryStatus('');
      setUpdateDownloadError(
        t('update_notification.installFailed', '系统安装失败，请稍后重试或手动下载安装。'),
      );
      setUpdateErrorDetails(compactError);
      setUpdateAction({
        state: 'available',
        version: expectedVersion,
        progress: 0,
        requiresInstall: true,
      });
      throw error;
    }
  }, [
    closeUpdaterHandle,
    prepareCodexLocalAccessBeforeRelaunch,
    restoreCodexLocalAccessAfterRelaunchFailure,
    t,
    writeUpdateLog,
  ]);

  const runSharedUpdateDownload = useCallback(async (expectedVersion: string) => {
    const taskId = Date.now();
    updateDownloadTaskIdRef.current = taskId;
    updateCancelRequestedRef.current = false;
    updateDownloadOwnerRef.current = 'shared';
    setUpdateRetryStatus('');
    setUpdateDownloadError('');
    setUpdateErrorDetails('');
    setUpdateAction({
      state: 'downloading',
      version: expectedVersion,
      progress: 0,
      requiresInstall: true,
    });
    writeUpdateLog('info', `统一更新任务开始下载: version=${expectedVersion}`);

    let usedAttempts = 0;
    try {
      const downloadedUpdate = await retryWithBackoff(
        async (attempt) => {
          usedAttempts = attempt;
          if (updateCancelRequestedRef.current || updateDownloadTaskIdRef.current !== taskId) {
            throw createUpdaterCanceledError();
          }

          let candidate: UpdaterUpdate | null = null;
          try {
            candidate = await runUpdaterCheck();
            if (!candidate) {
              throw new Error('No update available from updater plugin');
            }
            activeUpdateDownloadRef.current = candidate;

            const candidateVersion = candidate.version;
            const { releaseNotes, releaseNotesZh } = parseUpdaterReleaseNotes(candidate.body);
            await invoke('save_pending_update_notes', {
              version: candidateVersion,
              releaseNotes,
              releaseNotesZh,
            }).catch((error) => {
              console.error('[App] Failed to cache shared update notes:', error);
              writeUpdateLog(
                'warn',
                `缓存统一更新说明失败: version=${candidateVersion}, error=${sanitizeUpdaterErrorMessage(error)}`,
              );
            });

            let downloaded = 0;
            let contentLength = 0;
            await candidate.download((event) => {
              if (updateCancelRequestedRef.current || updateDownloadTaskIdRef.current !== taskId) {
                throw createUpdaterCanceledError();
              }
              setUpdateAction((prev) => {
                if (prev.state !== 'downloading') {
                  return prev;
                }

                if (event.event === 'Started') {
                  contentLength = event.data.contentLength ?? 0;
                  return {
                    ...prev,
                    version: candidateVersion,
                    progress: 0,
                  };
                }

                if (event.event === 'Progress') {
                  downloaded += event.data.chunkLength;
                  const nextProgress = contentLength > 0
                    ? Math.min(100, Math.round((downloaded / contentLength) * 100))
                    : Math.min(95, prev.progress + 1);
                  return {
                    ...prev,
                    version: candidateVersion,
                    progress: nextProgress,
                  };
                }

                return {
                  ...prev,
                  version: candidateVersion,
                  progress: 100,
                };
              });
            });

            if (updateCancelRequestedRef.current || updateDownloadTaskIdRef.current !== taskId) {
              throw createUpdaterCanceledError();
            }

            return candidate;
          } catch (error) {
            if (candidate) {
              await closeUpdaterHandle(candidate);
            }
            if (activeUpdateDownloadRef.current === candidate) {
              activeUpdateDownloadRef.current = null;
            }
            throw error;
          }
        },
        {
          delaysMs: UPDATE_DOWNLOAD_RETRY_DELAYS_MS,
          shouldRetry: isRetryableUpdaterError,
          onRetry: ({ retryIndex, totalRetries, delayMs, error }) => {
            const compactError = sanitizeUpdaterErrorMessage(error);
            setUpdateRetryStatus(
              t('update_notification.downloadRetrying', {
                attempt: retryIndex,
                total: totalRetries,
              }),
            );
            writeUpdateLog(
              'warn',
              `统一更新下载失败，准备重试(${retryIndex}/${totalRetries})，delay=${delayMs}ms，error=${compactError}`,
            );
            setUpdateAction((prev) => {
              if (prev.state !== 'downloading') {
                return prev;
              }
              return {
                ...prev,
                progress: 0,
              };
            });
          },
        },
      );

      if (updateCancelRequestedRef.current || updateDownloadTaskIdRef.current !== taskId) {
        await closeUpdaterHandle(downloadedUpdate);
        return;
      }

      if (pendingSilentUpdateRef.current) {
        await closeUpdaterHandle(pendingSilentUpdateRef.current);
      }
      pendingSilentUpdateRef.current = downloadedUpdate;
      activeUpdateDownloadRef.current = null;
      setSilentUpdateVersion(downloadedUpdate.version);
      setUpdateRetryStatus('');
      setUpdateDownloadError('');
      setUpdateErrorDetails('');
      setUpdateAction({
        state: 'ready',
        version: downloadedUpdate.version,
        progress: 100,
        requiresInstall: true,
      });
      writeUpdateLog('info', `统一更新下载完成，等待重启安装: version=${downloadedUpdate.version}`);
    } catch (error) {
      if (isUpdaterCanceledError(error) || updateCancelRequestedRef.current || updateDownloadTaskIdRef.current !== taskId) {
        writeUpdateLog('info', `统一更新下载已取消: version=${expectedVersion}`);
        setUpdateRetryStatus(t('update_notification.updateCancelled', '已取消更新'));
        setUpdateDownloadError('');
        setUpdateErrorDetails('');
        return;
      }

      console.error('[App] Shared update download failed:', error);
      writeUpdateLog('error', `统一更新下载失败: error=${sanitizeUpdaterErrorMessage(error)}`);
      setUpdateRetryStatus('');
      setUpdateDownloadError(
        t('update_notification.autoUpdateFailedAfterRetries', {
          count: Math.max(usedAttempts, 1),
        }),
      );
      setUpdateErrorDetails(sanitizeUpdaterErrorMessage(error));
      setUpdateAction({
        state: 'available',
        version: expectedVersion,
        progress: 0,
        requiresInstall: true,
      });
      throw error;
    } finally {
      if (updateDownloadTaskIdRef.current === taskId && updateDownloadOwnerRef.current === 'shared') {
        updateDownloadOwnerRef.current = 'none';
      }
    }
  }, [closeUpdaterHandle, runUpdaterCheck, t, writeUpdateLog]);

  const cancelUpdateDownload = useCallback(async () => {
    if (updateAction.state !== 'downloading') {
      return;
    }
    if (updateDownloadOwnerRef.current !== 'shared') {
      writeUpdateLog('info', '当前下载任务不支持取消（非统一更新任务）');
      return;
    }

    const version = updateAction.version;
    updateCancelRequestedRef.current = true;
    updateDownloadTaskIdRef.current += 1;
    setUpdateRetryStatus('');
    setUpdateDownloadError('');
    setUpdateErrorDetails('');

    const active = activeUpdateDownloadRef.current;
    if (active) {
      await closeUpdaterHandle(active);
      activeUpdateDownloadRef.current = null;
    }

    if (version) {
      setUpdateAction({
        state: 'available',
        version,
        progress: 0,
        requiresInstall: true,
      });
    } else {
      setUpdateAction({
        state: 'hidden',
        version: null,
        progress: 0,
        requiresInstall: true,
      });
    }
    updateDownloadOwnerRef.current = 'none';
    writeUpdateLog('info', `用户取消统一更新下载: version=${version || 'unknown'}`);
  }, [closeUpdaterHandle, updateAction.state, updateAction.version, writeUpdateLog]);

  const handleUpdatePrimaryAction = useCallback(async () => {
    updatePromptPolicyRef.current.openManual();
    if (updateAction.state === 'downloading') {
      openUpdateNotificationDetails();
      return;
    }
    if (updateAction.state === 'installing') {
      return;
    }

    if (updateAction.state === 'ready') {
      try {
        await handleApplyPendingUpdate();
      } catch (error) {
        console.error('[App] Update restart failed:', error);
        writeUpdateLog('error', `更新重启失败: error=${sanitizeUpdaterErrorMessage(error)}`);
        openUpdateNotificationDetails();
      }
      return;
    }

    if (updateAction.state !== 'available' || !updateAction.version) {
      return;
    }

    const expectedVersion = updateAction.version;
    try {
      if (isLinuxManagedUpdate) {
        await runLinuxManagedUpdate(expectedVersion);
      } else {
        await runSharedUpdateDownload(expectedVersion);
      }
    } catch (error) {
      console.error('[App] Update download failed:', error);
      writeUpdateLog('error', `更新下载失败: error=${sanitizeUpdaterErrorMessage(error)}`);
      openUpdateNotificationDetails();
    }
  }, [
    handleApplyPendingUpdate,
    isLinuxManagedUpdate,
    openUpdateNotificationDetails,
    runLinuxManagedUpdate,
    runSharedUpdateDownload,
    updateAction,
    writeUpdateLog,
  ]);

  const handleQuickUpdateActionClick = useCallback(() => {
    const shouldOpenUpdateDetails = updateAction.state !== 'hidden'
      && (
        updateRemindersEnabled
        || updateAction.state === 'downloading'
        || updateAction.state === 'installing'
        || updateAction.state === 'ready'
      );

    if (!shouldOpenUpdateDetails) {
      if (versionJumpInfo) {
        (
          window as Window & {
            __agtoolsVersionJumpModalRequestedAt?: number;
          }
        ).__agtoolsVersionJumpModalRequestedAt = performance.now();
        setShowVersionJumpNotification(true);
      }
      return;
    }

    if (updateAction.state === 'installing') {
      return;
    }

    openUpdateNotificationDetails();
  }, [openUpdateNotificationDetails, updateAction.state, updateRemindersEnabled, versionJumpInfo]);

  const handleSkipUpdateVersion = useCallback(async () => {
    const targetVersion = updateNotificationInfo?.latest_version;
    if (!targetVersion) {
      return;
    }
    setUpdateSkipError('');
    try {
      await invoke('patch_update_settings', { skippedVersion: targetVersion });
      const pendingUpdate = pendingSilentUpdateRef.current;
      if (pendingUpdate && pendingUpdate.version === targetVersion) {
        await closeUpdaterHandle(pendingUpdate);
        pendingSilentUpdateRef.current = null;
      }
      writeUpdateLog('info', `用户跳过更新版本: version=${targetVersion}`);
      setUpdateAction((prev) => {
        if (
          prev.version === targetVersion
          && (prev.state === 'available' || prev.state === 'downloading' || prev.state === 'ready')
        ) {
          return {
            state: 'hidden',
            version: null,
            progress: 0,
            requiresInstall: true,
          };
        }
        return prev;
      });
      updatePromptPolicyRef.current.close();
      setShowUpdateNotification(false);
      setUpdateNotificationInfo(null);
      setUpdateRetryStatus('');
      setUpdateDownloadError('');
      setUpdateErrorDetails('');
      setSilentUpdateVersion(null);
      updateDownloadOwnerRef.current = 'none';
      setUpdateSkipError('');
    } catch (error) {
      console.error('[App] Failed to skip update version:', error);
      setUpdateSkipError(
        t('update_notification.skipFailed', {
          error: sanitizeUpdaterErrorMessage(error),
        }),
      );
      writeUpdateLog('error', `跳过更新版本失败: error=${sanitizeUpdaterErrorMessage(error)}`);
    }
  }, [closeUpdaterHandle, t, updateNotificationInfo, writeUpdateLog]);

  useEffect(() => {
    return () => {
      const pendingUpdate = pendingSilentUpdateRef.current;
      if (pendingUpdate) {
        void pendingUpdate.close();
        pendingSilentUpdateRef.current = null;
      }
      const activeUpdate = activeUpdateDownloadRef.current;
      if (activeUpdate) {
        void activeUpdate.close();
        activeUpdateDownloadRef.current = null;
      }
    };
  }, []);

  const openQuickSettingsForPlatform = useCallback((platform: QuotaAlertPlatform) => {
    const targetPage = getQuotaAlertTargetPage(platform);
    const targetType = getQuotaAlertQuickSettingsType(platform);
    closeModal();
    setPage(targetPage);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('quick-settings:open', { detail: { type: targetType } }));
      });
    });
  }, [closeModal]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let disposed = false;

    const applyTheme = (newTheme: string) => {
      if (newTheme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', newTheme);
      }
    };

    const applyUiScale = async (rawScale?: number) => {
      try {
        await applyWebviewUiScale(rawScale);
      } catch (error) {
        console.error('Failed to apply UI scale:', error);
      }
    };

    const watchSystemTheme = () => {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
      } else {
        mediaQuery.addListener(handleChange);
      }

      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleChange);
        } else {
          mediaQuery.removeListener(handleChange);
        }
      };
    };

    const syncVisualConfig = async () => {
      try {
        const config = await invoke<GeneralConfigTheme>('get_general_config');
        if (disposed) {
          return;
        }
        applyTheme(config.theme);
        try {
          document.documentElement.setAttribute(
            'data-theme-color',
            (config.theme_color || 'default').trim() || 'default',
          );
        } catch {
          /* ignore */
        }
        applyReducedMotion(config.reduced_motion_enabled);
        void applyUiScale(config.ui_scale);
        cleanup?.();
        cleanup = null;
        if (config.theme === 'system') {
          cleanup = watchSystemTheme();
        }
      } catch (error) {
        console.error('Failed to load theme config:', error);
      }
    };

    void syncVisualConfig();
    window.addEventListener('config-updated', syncVisualConfig);

    return () => {
      disposed = true;
      window.removeEventListener('config-updated', syncVisualConfig);
      cleanup?.();
    };
  }, []);


  useEffect(() => {
    const AUTO_BACKUP_STARTUP_DELAY_MS = 5 * 60 * 1000;
    const AUTO_BACKUP_POLL_INTERVAL_MS = 60 * 60 * 1000;
    let startupTimerId: number | undefined;
    let intervalId: number | undefined;
    let inFlight = false;

    const checkAutoBackup = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        await runAutoBackupCycle();
      } catch (error) {
        console.warn('[AutoBackup] 定期备份执行失败:', error);
      } finally {
        inFlight = false;
      }
    };

    startupTimerId = window.setTimeout(() => {
      void checkAutoBackup();
      intervalId = window.setInterval(() => {
        void checkAutoBackup();
      }, AUTO_BACKUP_POLL_INTERVAL_MS);
    }, AUTO_BACKUP_STARTUP_DELAY_MS);

    return () => {
      if (startupTimerId !== undefined) {
        window.clearTimeout(startupTimerId);
      }
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  // 将旧版本保存在 WebView localStorage 中的设置迁移到 Rust 后台调度器，并启动常驻自动签到调度器
  useEffect(() => {
    clearLegacyWorkbuddyAutoCheckinLogs();
    void migrateWorkbuddyAutoCheckinConfigAsync(getWorkbuddyAutoCheckinConfig()).catch((err) => {
      console.warn('[WorkbuddyAutoCheckin] 迁移旧版自动签到配置失败:', err);
    });
    const stopScheduler = startAutoCheckinScheduler();
    return () => {
      stopScheduler();
    };
  }, []);

  // Check for updates on startup
  useEffect(() => {
    if (!updateRuntimeInfoLoaded) {
      return;
    }

    const UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;
    let updateCheckInFlight = false;
    let intervalId: number | undefined;

    const checkUpdates = async (trigger: 'startup' | 'hourly') => {
      if (updateCheckInFlight) {
        writeUpdateLog('info', `${trigger === 'startup' ? '启动' : '每小时轮询'}更新检查跳过：上一次尚未结束`);
        return;
      }
      updateCheckInFlight = true;
      const triggerLabel = trigger === 'startup' ? '启动' : '每小时轮询';
      const updateFlowStartedAt = performance.now();
      try {
        console.log(`[App] ${triggerLabel} update check triggered.`);
        console.log(`[StartupPerf][UpdateCheck] ${triggerLabel} update check started`);
        writeUpdateLog('info', `${triggerLabel}触发自动更新检查流程`);

        const settingsInvokeStartedAt = performance.now();
        const preferenceRevision = updatePromptPolicyRef.current.revision;
        const settings = await invoke<{
          auto_check?: boolean;
          check_interval_hours?: number;
          auto_install?: boolean;
          remind_on_update?: boolean;
          skipped_version?: string;
        }>('get_update_settings');
        const settingsInvokeElapsed = performance.now() - settingsInvokeStartedAt;
        console.log(
          `[StartupPerf][UpdateCheck] get_update_settings completed in ${settingsInvokeElapsed.toFixed(2)}ms`,
        );
        const autoInstall = settings?.auto_install ?? false;
        applyUpdateReminderPreference(settings?.remind_on_update ?? true, preferenceRevision);
        const skippedVersion = (settings?.skipped_version ?? '').trim();
        const remoteConfigState = await fetchRemoteConfigState(false);
        const updatePromptMode = remoteConfigState.updatePromptMode;
        writeUpdateLog(
          'info',
          `读取更新设置: auto_install=${autoInstall}, update_prompt_mode=${updatePromptMode}；启动始终执行更新检查`,
        );

        writeUpdateLog('info', '启动检查立即执行');

        if (autoInstall && !isLinuxManagedUpdate) {
          // Silent update: check and download in background, install on restart
          console.log('[App] Auto-install enabled, attempting silent update...');
          writeUpdateLog('info', '后台自动更新已开启，尝试静默检查并下载');
          let preparedUpdateInfo: UpdateInfo | null = null;
          try {
            const silentCheckStartedAt = performance.now();
            const update = await retryWithBackoff(
              async () => runUpdaterCheck(),
              {
                delaysMs: UPDATE_CHECK_RETRY_DELAYS_MS,
                shouldRetry: isRetryableUpdaterError,
                onRetry: ({ retryIndex, totalRetries, delayMs, error }) => {
                  const compactError = sanitizeUpdaterErrorMessage(error);
                  console.warn(
                    `[App] Silent update check failed, retrying (${retryIndex}/${totalRetries}) in ${delayMs}ms:`,
                    error,
                  );
                  writeUpdateLog(
                    'warn',
                    `静默更新检查失败，准备重试(${retryIndex}/${totalRetries})，delay=${delayMs}ms，error=${compactError}`,
                  );
                },
              },
            );
            console.log(
              `[StartupPerf][UpdateCheck] silent runUpdaterCheck completed in ${(performance.now() - silentCheckStartedAt).toFixed(2)}ms; hasUpdate=${Boolean(update)}`,
            );
            if (update) {
              if (skippedVersion && update.version === skippedVersion) {
                console.log('[App] Update skipped by user, ignoring:', update.version);
                writeUpdateLog('info', `检测到新版本但已跳过: version=${update.version}`);
                await closeUpdaterHandle(update);
                setUpdateAction((prev) => {
                  if (prev.state === 'available' && prev.version === update.version) {
                    return {
                      state: 'hidden',
                      version: null,
                      progress: 0,
                      requiresInstall: true,
                    };
                  }
                  return prev;
                });
              } else {
                preparedUpdateInfo = await prepareUpdateNotificationInfo(update);
                setUpdateNotificationInfo(preparedUpdateInfo);
                handleUpdateCheckResult({
                  source: 'auto',
                  status: 'has_update',
                  currentVersion: preparedUpdateInfo.current_version,
                  latestVersion: preparedUpdateInfo.latest_version,
                });
                openAutomaticUpdatePrompt(update.version, updatePromptMode);
                console.log('[App] Update found, downloading silently with retry...');
                writeUpdateLog('info', `检测到新版本，开始静默下载: version=${update.version}`);
                updateDownloadOwnerRef.current = 'silent';
                setUpdateRetryStatus('');
                setUpdateDownloadError('');
                setUpdateErrorDetails('');
                setUpdateAction((prev) => {
                  if (prev.state === 'ready' && prev.version === update.version) {
                    return prev;
                  }
                  return {
                    state: 'downloading',
                    version: update.version,
                    progress: 0,
                    requiresInstall: true,
                  };
                });
                await invoke('save_pending_update_notes', {
                  version: update.version,
                  releaseNotes: preparedUpdateInfo.release_notes,
                  releaseNotesZh: preparedUpdateInfo.release_notes_zh,
                }).catch((error) => {
                  console.error('[App] Failed to cache silent update notes:', error);
                  writeUpdateLog(
                    'warn',
                    `缓存待安装更新说明失败: version=${update.version}, error=${sanitizeUpdaterErrorMessage(error)}`,
                  );
                });
                const silentDownloadStartedAt = performance.now();
                const downloadedUpdate = await retryWithBackoff(
                  async (attempt) => {
                    let candidate: UpdaterUpdate | null = null;
                    try {
                      if (attempt === 1) {
                        candidate = update;
                      } else {
                        candidate = await runUpdaterCheck();
                      }

                      if (!candidate) {
                        throw new Error('No update available from updater plugin');
                      }

                      let downloaded = 0;
                      let contentLength = 0;
                      const candidateVersion = candidate.version;
                      await candidate.download((event) => {
                        setUpdateAction((prev) => {
                          if (prev.state !== 'downloading') {
                            return prev;
                          }

                          if (event.event === 'Started') {
                            contentLength = event.data.contentLength ?? 0;
                            return {
                              ...prev,
                              version: candidateVersion,
                              progress: 0,
                            };
                          }

                          if (event.event === 'Progress') {
                            downloaded += event.data.chunkLength;
                            const nextProgress = contentLength > 0
                              ? Math.min(100, Math.round((downloaded / contentLength) * 100))
                              : Math.min(95, prev.progress + 1);
                            return {
                              ...prev,
                              version: candidateVersion,
                              progress: nextProgress,
                            };
                          }

                          return {
                            ...prev,
                            version: candidateVersion,
                            progress: 100,
                          };
                        });
                      });
                      return candidate;
                    } catch (error) {
                      if (candidate) {
                        await candidate.close().catch(() => {});
                      }
                      throw error;
                    }
                  },
                  {
                    delaysMs: UPDATE_DOWNLOAD_RETRY_DELAYS_MS,
                    shouldRetry: isRetryableUpdaterError,
                    onRetry: ({ retryIndex, totalRetries, delayMs, error }) => {
                      const compactError = sanitizeUpdaterErrorMessage(error);
                      setUpdateRetryStatus(
                        t('update_notification.downloadRetrying', {
                          attempt: retryIndex,
                          total: totalRetries,
                        }),
                      );
                      console.warn(
                        `[App] Silent update download failed, retrying (${retryIndex}/${totalRetries}) in ${delayMs}ms:`,
                        error,
                      );
                      writeUpdateLog(
                        'warn',
                        `静默更新下载失败，准备重试(${retryIndex}/${totalRetries})，delay=${delayMs}ms，error=${compactError}`,
                      );
                      setUpdateAction((prev) => {
                        if (prev.state !== 'downloading') {
                          return prev;
                        }
                        return {
                          ...prev,
                          progress: 0,
                        };
                      });
                    },
                  },
                );
                console.log(
                  `[StartupPerf][UpdateCheck] silent update download completed in ${(performance.now() - silentDownloadStartedAt).toFixed(2)}ms; version=${downloadedUpdate.version}`,
                );

                if (pendingSilentUpdateRef.current) {
                  await pendingSilentUpdateRef.current.close();
                }
                pendingSilentUpdateRef.current = downloadedUpdate;
                console.log('[App] Silent download complete, waiting for restart to install.');
                writeUpdateLog(
                  'info',
                  `静默更新下载完成，等待用户重启应用生效: version=${downloadedUpdate.version}`,
                );
                updateDownloadOwnerRef.current = 'none';
                setUpdateRetryStatus('');
                setUpdateDownloadError('');
                setUpdateErrorDetails('');
                setSilentUpdateVersion(downloadedUpdate.version);
                setUpdateAction({
                  state: 'ready',
                  version: downloadedUpdate.version,
                  progress: 100,
                  requiresInstall: true,
                });
                if (updatePromptPolicyRef.current.enabled) {
                  writeUpdateLog('info', `静默更新已在左上角显示待重启入口: version=${downloadedUpdate.version}`);
                }
              }
            } else {
              console.log('[App] No update available.');
              writeUpdateLog('info', '更新检查完成：当前已是最新版本');
              updateDownloadOwnerRef.current = 'none';
              setUpdateRetryStatus('');
              setUpdateDownloadError('');
              setUpdateErrorDetails('');
              setUpdateAction((prev) => {
                if (prev.state === 'ready') {
                  return prev;
                }
                return {
                  state: 'hidden',
                  version: null,
                  progress: 0,
                  requiresInstall: true,
                };
              });
            }
          } catch (err) {
            console.error('[App] Silent update failed:', err);
            updateDownloadOwnerRef.current = 'none';
            writeUpdateLog(
              'error',
              `静默更新失败，保留左上角更新入口: error=${sanitizeUpdaterErrorMessage(err)}`,
            );
            if (!updatePromptPolicyRef.current.enabled) {
              setUpdateRetryStatus('');
              setUpdateDownloadError('');
              setUpdateErrorDetails('');
              setUpdateAction((prev) => {
                if (prev.state === 'downloading' || prev.state === 'available') {
                  return {
                    state: 'hidden',
                    version: null,
                    progress: 0,
                    requiresInstall: true,
                  };
                }
                return prev;
              });
            }
            if (preparedUpdateInfo && updatePromptPolicyRef.current.enabled) {
              setUpdateNotificationInfo(preparedUpdateInfo);
              setUpdateAction({
                state: 'available',
                version: preparedUpdateInfo.latest_version,
                progress: 0,
                requiresInstall: true,
              });
              writeUpdateLog('info', `静默更新失败后已在左上角显示更新入口: version=${preparedUpdateInfo.latest_version}`);
            }
          }
        } else {
          // Auto-check only opens the dialog after a real update is found.
          if (autoInstall && isLinuxManagedUpdate) {
            writeUpdateLog(
              'info',
              `Linux 包管理安装(${updateRuntimeInfo?.linux_install_kind || 'unknown'})跳过静默下载，改为左上角一键安装入口`,
            );
          }
          writeUpdateLog('info', '后台自动更新关闭，先执行无弹窗检查，仅在发现新版本时显示左上角入口');
          try {
            const manualCheckStartedAt = performance.now();
            const update = await retryWithBackoff(
              async () => runUpdaterCheck(),
              {
                delaysMs: UPDATE_CHECK_RETRY_DELAYS_MS,
                shouldRetry: isRetryableUpdaterError,
                onRetry: ({ retryIndex, totalRetries, delayMs, error }) => {
                  const compactError = sanitizeUpdaterErrorMessage(error);
                  console.warn(
                    `[App] Background manual update check failed, retrying (${retryIndex}/${totalRetries}) in ${delayMs}ms:`,
                    error,
                  );
                  writeUpdateLog(
                    'warn',
                    `后台手动更新检查失败，准备重试(${retryIndex}/${totalRetries})，delay=${delayMs}ms，error=${compactError}`,
                  );
                },
              },
            );
            console.log(
              `[StartupPerf][UpdateCheck] manual runUpdaterCheck completed in ${(performance.now() - manualCheckStartedAt).toFixed(2)}ms; hasUpdate=${Boolean(update)}`,
            );

            if (update) {
              if (skippedVersion && update.version === skippedVersion) {
                console.log('[App] Update skipped by user, ignoring:', update.version);
                writeUpdateLog('info', `检测到新版本但已跳过: version=${update.version}`);
                await closeUpdaterHandle(update);
                setUpdateAction((prev) => {
                  if (prev.state === 'available' && prev.version === update.version) {
                    return {
                      state: 'hidden',
                      version: null,
                      progress: 0,
                      requiresInstall: true,
                    };
                  }
                  return prev;
                });
              } else {
                const info = await prepareUpdateNotificationInfo(update);
                setUpdateNotificationInfo(info);
                handleUpdateCheckResult({
                  source: 'auto',
                  status: 'has_update',
                  currentVersion: info.current_version,
                  latestVersion: info.latest_version,
                });
                const openedPrompt = openAutomaticUpdatePrompt(update.version, updatePromptMode);
                writeUpdateLog(
                  'info',
                  openedPrompt
                    ? `检测到新版本，已按远端策略打开更新弹框: version=${update.version}`
                    : `检测到新版本，已在左上角显示更新入口: version=${update.version}`,
                );
                await closeUpdaterHandle(update);
              }
            } else {
              writeUpdateLog('info', '更新检查完成：当前已是最新版本');
              setUpdateRetryStatus('');
              setUpdateDownloadError('');
              setUpdateErrorDetails('');
              setUpdateAction((prev) => {
                if (prev.state === 'ready') {
                  return prev;
                }
                return {
                  state: 'hidden',
                  version: null,
                  progress: 0,
                  requiresInstall: true,
                };
              });
            }
          } catch (err) {
            console.error('[App] Background update check failed:', err);
            writeUpdateLog(
              'warn',
              `后台手动更新检查失败，跳过弹窗: error=${sanitizeUpdaterErrorMessage(err)}`,
            );
          }
        }

        const updateLastCheckStartedAt = performance.now();
        await invoke('update_last_check_time');
        console.log(
          `[StartupPerf][UpdateCheck] update_last_check_time completed in ${(performance.now() - updateLastCheckStartedAt).toFixed(2)}ms`,
        );
        writeUpdateLog('info', '已更新 last_check_time，结束本次更新检查流程');
        console.log('[App] Update check cycle completed.');
        console.log(
          `[StartupPerf][UpdateCheck] ${triggerLabel} update check completed in ${(performance.now() - updateFlowStartedAt).toFixed(2)}ms`,
        );
      } catch (error) {
        console.error('Failed to check update settings:', error);
        console.error(
          `[StartupPerf][UpdateCheck] ${triggerLabel} update check failed after ${(performance.now() - updateFlowStartedAt).toFixed(2)}ms:`,
          error,
        );
        writeUpdateLog('error', `更新检查流程异常中断: error=${sanitizeUpdaterErrorMessage(error)}`);
      } finally {
        updateCheckInFlight = false;
      }
    };

    void checkUpdates('startup');
    intervalId = window.setInterval(() => {
      void checkUpdates('hourly');
    }, UPDATE_POLL_INTERVAL_MS);
    return () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [
    applyUpdateReminderPreference,
    closeUpdaterHandle,
    fetchRemoteConfigState,
    handleUpdateCheckResult,
    isLinuxManagedUpdate,
    openAutomaticUpdatePrompt,
    prepareUpdateNotificationInfo,
    runUpdaterCheck,
    updateRuntimeInfo?.linux_install_kind,
    updateRuntimeInfoLoaded,
    writeUpdateLog,
  ]);

  // Version jump detection (post-update changelog)
  useEffect(() => {
    const detectVersionJump = async () => {
      const versionJumpStartedAt = performance.now();
      try {
        console.log('[StartupPerf][VersionJump] detection started');
        const versionJumpInvokeStartedAt = performance.now();
        const jumpInfo = await invoke<{
          previous_version: string;
          current_version: string;
          release_notes: string;
          release_notes_zh: string;
        } | null>('check_version_jump');
        console.log(
          `[StartupPerf][VersionJump] check_version_jump completed in ${(performance.now() - versionJumpInvokeStartedAt).toFixed(2)}ms; hasJump=${Boolean(jumpInfo)}`,
        );
        if (jumpInfo) {
          console.log('[App] Version jump detected:', jumpInfo.previous_version, '->', jumpInfo.current_version);
          (
            window as Window & {
              __agtoolsVersionJumpModalRequestedAt?: number;
            }
          ).__agtoolsVersionJumpModalRequestedAt = performance.now();
          setVersionJumpInfo(jumpInfo);
          setShowVersionJumpNotification(true);
          requestAnimationFrame(() => {
            console.log(
              `[StartupPerf][VersionJump] first frame after opening version jump modal in ${(performance.now() - versionJumpStartedAt).toFixed(2)}ms`,
            );
          });
        }
        console.log(
          `[StartupPerf][VersionJump] detection finished in ${(performance.now() - versionJumpStartedAt).toFixed(2)}ms`,
        );
      } catch (error) {
        console.error('Failed to check version jump:', error);
        console.error(
          `[StartupPerf][VersionJump] detection failed after ${(performance.now() - versionJumpStartedAt).toFixed(2)}ms:`,
          error,
        );
      }
    };

    const timer = setTimeout(detectVersionJump, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    safeListen<string>('settings:language_changed', (event) => {
      const nextLanguage = normalizeLanguage(String(event.payload || ''));
      if (!nextLanguage || nextLanguage === getCurrentLanguage()) {
        return;
      }
      void changeLanguage(nextLanguage);
      window.dispatchEvent(new CustomEvent('general-language-updated', { detail: { language: nextLanguage } }));
    }).then((fn) => { unlisten = fn; });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    safeListen<QuotaAlertPayload>('quota:alert', (event) => {
      const payload = event.payload;
      if (!payload || !payload.current_account_id) {
        return;
      }

      const platform = normalizeQuotaAlertPlatform(payload.platform);
      const platformLabel = getQuotaAlertPlatformLabel(platform, t);
      const hasRecommendation = Boolean(payload.recommended_account_id && payload.recommended_email);
      const lowQuotaItemsText = payload.low_models.length > 0
        ? payload.low_models.join(', ')
        : t('quotaAlert.modal.unknownModel', '未知模型');

      showModal({
        title: t('quotaAlert.modal.title', '配额预警'),
        description: t(
          'quotaAlert.modal.desc',
          '当前账号配额已达到预警阈值，请尽快处理。'
        ),
        width: 'md',
        content: (
          <div className="quota-alert-modal-content">
            <div className="quota-alert-modal-row">
              <span>{t('quotaAlert.modal.platform', '平台')}</span>
              <strong>{platformLabel}</strong>
            </div>
            <div className="quota-alert-modal-row">
              <span>{t('quotaAlert.modal.account', '当前账号')}</span>
              <strong>{payload.current_email}</strong>
            </div>
            <div className="quota-alert-modal-row">
              <span>{t('quotaAlert.modal.threshold', '预警阈值')}</span>
              <strong>{payload.threshold_display || `${payload.threshold}%`}</strong>
            </div>
            <div className="quota-alert-modal-row">
              <span>{t('quotaAlert.modal.lowest', '当前最低')}</span>
              <strong>{payload.lowest_percentage}%</strong>
            </div>
            <div className="quota-alert-modal-row quota-alert-modal-row--stack">
              <span>{t('quotaAlert.modal.models', '触发模型')}</span>
              <strong>{lowQuotaItemsText}</strong>
            </div>
            <div className="quota-alert-modal-row">
              <span>{t('quotaAlert.modal.recommended', '建议切换')}</span>
              <strong>
                {payload.recommended_email || t('quotaAlert.modal.noRecommendation', '暂无可切换账号')}
              </strong>
            </div>
          </div>
        ),
        actions: [
          {
            id: 'quota-alert-later',
            label: t('quotaAlert.modal.later', '稍后处理'),
            variant: 'secondary',
          },
          {
            id: 'quota-alert-open-settings',
            label: t('quotaAlert.modal.openSettings', '调整预警设置'),
            variant: 'secondary',
            autoClose: false,
            onClick: () => {
              openQuickSettingsForPlatform(platform);
            },
          },
          ...(hasRecommendation
            ? [{
                id: 'quota-alert-switch',
                label: t('quotaAlert.modal.switchNow', '快捷切号到 {{email}}', {
                  email: payload.recommended_email as string,
                }),
                variant: 'primary' as const,
                autoClose: false,
                onClick: async () => {
                  try {
                    const targetAccountId = payload.recommended_account_id as string;
                    if (platform === 'codebuddy') {
                      await useCodebuddyAccountStore.getState().switchAccount(targetAccountId);
                      setPage('codebuddy');
                    } else if (platform === 'codebuddy_cn') {
                      await useCodebuddyCnAccountStore.getState().switchAccount(targetAccountId);
                      setPage('codebuddy-cn');
                    } else if (platform === 'qoder') {
                      await useQoderAccountStore.getState().switchAccount(targetAccountId);
                      setPage('qoder');
                    } else if (platform === 'qoder_cn') {
                      await useQoderCnAccountStore.getState().switchAccount(targetAccountId);
                      setPage('qoder-cn');
                    } else if (platform === 'trae') {
                      await useTraeAccountStore.getState().switchAccount(targetAccountId);
                      setPage('trae');
                    } else if (platform === 'workbuddy') {
                      await useWorkbuddyAccountStore.getState().switchAccount(targetAccountId);
                      setPage('workbuddy');
                    } else if (platform === 'workbuddy_ai') {
                      await useWorkbuddyAiAccountStore.getState().switchAccount(targetAccountId);
                      setPage('workbuddy-ai');
                    }
                    closeModal();
                  } catch (error) {
                    showModal({
                      title: t('quotaAlert.modal.switchFailedTitle', '切号失败'),
                      description: t('quotaAlert.modal.switchFailedBody', '快捷切号失败：{{error}}', {
                        error: String(error),
                      }),
                      width: 'sm',
                      actions: [
                        {
                          id: 'quota-alert-switch-failed-ok',
                          label: t('common.confirm', '确定'),
                          variant: 'primary',
                        },
                      ],
                    });
                  }
                },
              }]
            : []),
        ],
      });
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [closeModal, openQuickSettingsForPlatform, showModal, t]);


  useEffect(() => {
    const handleUpdateRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: UpdateCheckSource }>).detail;
      // Automatic checks use the background flow and its local-preference gate.
      if (detail?.source !== 'manual') return;
      void runModalUpdateCheck('manual');
    };
    window.addEventListener('update-check-requested', handleUpdateRequest as EventListener);
    return () => {
      window.removeEventListener('update-check-requested', handleUpdateRequest as EventListener);
    };
  }, [runModalUpdateCheck]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    safeListen<LinuxUpdateProgressPayload>('update://linux-progress', (event) => {
      const { phase, progress, version } = event.payload;
      setUpdateDownloadError('');
      setUpdateErrorDetails('');

      setUpdateAction((prev) => {
        if (
          prev.version
          && prev.version !== version
          && (prev.state === 'downloading' || prev.state === 'installing' || prev.state === 'ready')
        ) {
          return prev;
        }

        if (phase === 'completed') {
          return {
            state: 'ready',
            version,
            progress: 100,
            requiresInstall: false,
          };
        }

        if (phase === 'auth_required' || phase === 'installing' || phase === 'downloaded') {
          return {
            state: 'installing',
            version,
            progress: 100,
            requiresInstall: false,
          };
        }

        return {
          state: 'downloading',
          version,
          progress: Math.max(0, Math.min(100, Math.round(progress ?? 0))),
          requiresInstall: false,
        };
      });

      if (phase === 'auth_required' || phase === 'downloaded') {
        setUpdateRetryStatus(
          t('update_notification.authorizing', '等待系统授权安装...'),
        );
        return;
      }

      if (phase === 'installing') {
        setUpdateRetryStatus(
          t('update_notification.installing', '安装中...'),
        );
        return;
      }

      if (phase === 'completed') {
        setUpdateRetryStatus(
          t('update_notification.installSuccess', '更新已安装，正在重启...'),
        );
        return;
      }

      setUpdateRetryStatus('');
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [t]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const refreshTasks = [
      {
        command: 'refresh_current_quota',
        errorMessage: 'Failed to refresh Antigravity IDE quotas:',
      },
      {
        command: 'refresh_current_codex_quota',
        errorMessage: 'Failed to refresh Codex quotas:',
      },
      {
        command: 'refresh_all_claude_quotas',
        errorMessage: 'Failed to refresh Claude quotas:',
      },
      {
        command: 'refresh_all_github_copilot_tokens',
        errorMessage: 'Failed to refresh GitHub Copilot quotas:',
      },
      {
        command: 'refresh_all_windsurf_tokens',
        errorMessage: 'Failed to refresh Devin quotas:',
      },
      {
        command: 'refresh_all_kiro_tokens',
        errorMessage: 'Failed to refresh Kiro quotas:',
      },
      {
        command: 'refresh_all_cursor_tokens',
        errorMessage: 'Failed to refresh Cursor:',
      },
      {
        command: 'refresh_all_grok_accounts',
        errorMessage: 'Failed to refresh Grok:',
      },
      {
        command: 'refresh_all_codebuddy_tokens',
        errorMessage: 'Failed to refresh CodeBuddy:',
      },
      {
        command: 'refresh_all_codebuddy_cn_tokens',
        errorMessage: 'Failed to refresh CodeBuddy CN:',
      },
      {
        command: 'refresh_all_qoder_tokens',
        errorMessage: 'Failed to refresh Qoder:',
      },
      {
        command: 'refresh_all_qoder_cn_tokens',
        errorMessage: 'Failed to refresh Qoder CN:',
      },
      {
        command: 'refresh_all_zcode_accounts',
        errorMessage: 'Failed to refresh ZCode:',
      },
      {
        command: 'refresh_all_trae_tokens',
        errorMessage: 'Failed to refresh Trae:',
      },
      {
        command: 'refresh_all_zed_tokens',
        errorMessage: 'Failed to refresh Zed:',
      },
    ] as const;

    safeListen('tray:refresh_quota', async () => {
      if (trayRefreshInFlightRef.current) {
        return;
      }
      trayRefreshInFlightRef.current = true;

      try {
        await Promise.all(
          refreshTasks.map(({ command, errorMessage }) =>
            invoke(command).catch((error) => {
              console.error(errorMessage, error);
            }),
          ),
        );
      } finally {
        trayRefreshInFlightRef.current = false;
      }
    }).then((fn) => { unlisten = fn; });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    const handlePayload = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const detail = payload as AppPathMissingDetail;
      if (
        detail.app !== 'codebuddy' &&
        detail.app !== 'codebuddy_cn' &&
        detail.app !== 'qoder' &&
        detail.app !== 'qoder_cn' &&
        !isTraePlatformApp(detail.app) &&
        detail.app !== 'workbuddy'
      ) {
        return;
      }
      setAppPathMissing(detail);
    };

    safeListen('app:path_missing', (event) => {
      handlePayload(event.payload);
    }).then((fn) => { unlisten = fn; });

    const handleWindowEvent = (event: Event) => {
      const custom = event as CustomEvent<AppPathMissingDetail>;
      handlePayload(custom.detail);
    };
    window.addEventListener('app-path-missing', handleWindowEvent as EventListener);

    return () => {
      if (unlisten) {
        unlisten();
      }
      window.removeEventListener('app-path-missing', handleWindowEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!appPathMissing) {
      setAppPathDraft('');
      setAppLaunchCandidates([]);
      setAppPathDetecting(false);
      setAppPathActionError('');
      setAppPathScanError('');
      return () => {
        active = false;
      };
    }
    setAppPathActionError('');
    setAppPathScanError('');
    setAppLaunchCandidates([]);
    (async () => {
      try {
        const config = await invoke<GeneralConfig>('get_general_config');
        const currentPath =
          appPathMissing.app === 'codebuddy'
            ? config.codebuddy_app_path
            : appPathMissing.app === 'codebuddy_cn'
              ? config.codebuddy_cn_app_path
            : appPathMissing.app === 'qoder'
              ? config.qoder_app_path
            : appPathMissing.app === 'qoder_cn'
              ? config.qoder_cn_app_path
            : isTraePlatformApp(appPathMissing.app)
              ? getTraeAppPath(config, appPathMissing.app)
            : config.workbuddy_app_path;
        if (active) {
          setAppPathDraft(currentPath || '');
        }
      } catch (error) {
        console.error('Failed to load app path config:', error);
      }
    })();
    return () => {
      active = false;
    };
  }, [appPathMissing]);

  const handlePickMissingAppPath = async () => {
    if (appPathSetting) return;
    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (path) {
        setAppPathActionError('');
        setAppPathScanError('');
        setAppPathDraft(path);
        setAppLaunchCandidates([]);
      }
    } catch (error) {
      console.error('选择应用路径失败:', error);
    }
  };

  const handleSaveMissingAppPath = async () => {
    if (!appPathMissing || appPathSetting || appPathDetecting) return;
    const path = appPathDraft.trim();
    if (!path) return;
    setAppPathScanError('');
    setAppPathSetting(true);
    setAppPathActionError('');
    setAppPathScanError('');
    try {
      const app = appPathMissing.app;
      const retry = appPathMissing.retry;
      await invoke('set_app_path', { app, path });
      if (retry?.kind === 'instance' && retry.instanceId) {
        if (app === 'codebuddy') {
          await invoke('codebuddy_start_instance', { instanceId: retry.instanceId });
        } else if (app === 'codebuddy_cn') {
          await invoke('codebuddy_cn_start_instance', { instanceId: retry.instanceId });
        } else if (app === 'qoder') {
          await invoke('qoder_start_instance', { instanceId: retry.instanceId });
        } else if (app === 'qoder_cn') {
          await invoke('qoder_cn_start_instance', { instanceId: retry.instanceId });
        } else if (isTraePlatformApp(app)) {
          await invoke('trae_start_instance', { platformId: app, instanceId: retry.instanceId });
        } else if (app === 'workbuddy') {
          await invoke('workbuddy_start_instance', { instanceId: retry.instanceId });
        }
      } else {
        if (app === 'codebuddy') {
          await invoke('codebuddy_start_instance', { instanceId: '__default__' });
        } else if (app === 'codebuddy_cn') {
          await invoke('codebuddy_cn_start_instance', { instanceId: '__default__' });
        } else if (app === 'qoder') {
          await invoke('qoder_start_instance', { instanceId: '__default__' });
        } else if (app === 'qoder_cn') {
          await invoke('qoder_cn_start_instance', { instanceId: '__default__' });
        } else if (isTraePlatformApp(app)) {
          await invoke('trae_start_instance', { platformId: app, instanceId: '__default__' });
        } else if (app === 'workbuddy') {
          await invoke('workbuddy_start_instance', { instanceId: '__default__' });
        }
      }
      setAppPathMissing(null);
      setAppPathSetting(false);
    } catch (error) {
      console.error('设置应用路径失败:', error);
      setAppPathActionError(String(error));
      setAppPathSetting(false);
    }
  };

  const handleResetMissingAppPath = async () => {
    if (!appPathMissing || appPathSetting || appPathDetecting) return;
    const scanApp = appPathMissing.app;

    if (isWindowsPlatform()) {
      setAppPathDetecting(true);
      setAppPathActionError('');
      setAppPathScanError('');
      try {
        const candidates = await invoke<AppLaunchCandidate[]>('scan_app_launch_targets', {
          app: scanApp,
        });
        setAppLaunchCandidates(candidates);
        if (candidates.length === 0) {
          setAppPathScanError(
            t(
              'appPath.missing.scanEmptyGeneric',
              '未检测到正在运行的 {{app}}，请先启动应用后重试，或手动选择路径。',
              { app: appPathMissingAppName },
            ),
          );
        }
      } catch (error) {
        console.error('扫描启动目标失败:', error);
        setAppPathScanError(String(error));
      } finally {
        setAppPathDetecting(false);
      }
      return;
    }
    setAppPathDetecting(true);
    try {
      const detected = await invoke<string | null>('detect_app_path', {
        app: scanApp,
        force: true,
      });
      setAppPathActionError('');
      setAppPathScanError('');
      setAppPathDraft((detected || '').trim());
    } catch (error) {
      console.error('自动探测应用路径失败:', error);
    } finally {
      setAppPathDetecting(false);
    }
  };

  const handleSelectAppLaunchCandidate = (candidate: AppLaunchCandidate) => {
    setAppPathActionError('');
    setAppPathScanError('');
    setAppPathDraft(candidate.target);
  };

  // 监听窗口关闭请求事件
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    safeListen('window:close_requested', () => {
      setShowCloseDialog(true);
    }).then((fn) => { unlisten = fn; });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // After tray destroy/recreate (#686), apply any deferred navigation.
  useEffect(() => {
    void invoke<string | null>('main_window_take_pending_navigation')
      .then((target) => {
        if (!target) return;
        const page = String(target);
        if (isMainWindowNavigablePage(page)) {
          setPage(page);
        }
      })
      .catch(() => {
        /* command may be unavailable on older builds */
      });
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    safeListen<string>('tray:navigate', (event) => {
      const target = String(event.payload || '');
      if (isMainWindowNavigablePage(target)) {
        setPage(target);
      }
    }).then((fn) => { unlisten = fn; });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    safeListen('external:provider-import', (event) => {
      console.info('[ExternalImport][App] 收到 Tauri 事件 external:provider-import');
      void handleExternalProviderImportRawPayload(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleExternalProviderImportRawPayload]);

  useEffect(() => {
    let canceled = false;
    void invoke<unknown>('external_import_take_pending')
      .then((payload) => {
        if (canceled) return;
        if (!payload) {
          console.info('[ExternalImport][App] 启动时无待处理导入 payload');
          return;
        }
        console.info('[ExternalImport][App] 启动时读取到待处理导入 payload');
        void handleExternalProviderImportRawPayload(payload);
      })
      .catch((error) => {
        console.warn('[ExternalImport] 读取待处理导入请求失败:', error);
      });
    return () => {
      canceled = true;
    };
  }, [handleExternalProviderImportRawPayload]);

  // 窗口拖拽处理
  const handleDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    void getCurrentWindow().startDragging().catch((error) => {
      console.warn('[Window] startDragging failed:', error);
    });
  };

  useEffect(() => {
    const handleRequestNavigate = (e: Event) => {
      const custom = e as CustomEvent<Page>;
      if (custom.detail) {
        setPage(custom.detail);
      }
    };
    window.addEventListener('app-request-navigate', handleRequestNavigate as EventListener);
    return () => {
      window.removeEventListener('app-request-navigate', handleRequestNavigate as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleOpenPlatformLayout = (e: Event) => {
      const custom = e as CustomEvent<{ groupId?: string | null }>;
      const groupId =
        custom.detail && typeof custom.detail.groupId === 'string' && custom.detail.groupId.trim()
          ? custom.detail.groupId.trim()
          : null;
      setPlatformLayoutRequestedGroupId(groupId);
      setShowPlatformLayoutModal(true);
    };

    window.addEventListener('app-open-platform-layout', handleOpenPlatformLayout as EventListener);
    return () => {
      window.removeEventListener('app-open-platform-layout', handleOpenPlatformLayout as EventListener);
    };
  }, []);
  const suspenseFallback = (
    <div className="loading-state">
      {t('common.loading', '加载中...')}
    </div>
  );

  const appPathMissingAppName = appPathMissing
    ? appPathMissing.app === 'codebuddy'
      ? 'CodeBuddy'
      : appPathMissing.app === 'codebuddy_cn'
        ? 'CodeBuddy CN'
        : appPathMissing.app === 'qoder'
          ? 'Qoder'
        : appPathMissing.app === 'qoder_cn'
          ? 'Qoder CN'
          : isTraePlatformApp(appPathMissing.app)
            ? 'Trae'
            : appPathMissing.app === 'workbuddy'
              ? 'WorkBuddy'
              : ''
    : '';

  const appPathMissingPathLabel = appPathMissing
    ? appPathMissing.app === 'codebuddy'
      ? t('quickSettings.codebuddy.appPath', 'CodeBuddy 路径')
      : appPathMissing.app === 'codebuddy_cn'
        ? t('quickSettings.codebuddyCn.appPath', 'CodeBuddy CN 路径')
        : appPathMissing.app === 'qoder'
          ? t('quickSettings.qoder.appPath', 'Qoder 路径')
        : appPathMissing.app === 'qoder_cn'
          ? t('quickSettings.qoderCn.appPath', 'Qoder CN 路径')
          : isTraePlatformApp(appPathMissing.app)
            ? t('quickSettings.trae.appPath', 'Trae 路径')
            : t('quickSettings.workbuddy.appPath', 'WorkBuddy 路径')
    : t('quickSettings.codebuddy.appPath', 'CodeBuddy 路径');
  const appPathMissingBusy = appPathSetting || appPathDetecting;
  const shouldRenderUpdateNotification = showUpdateNotification
    || (updateRemindersEnabled && updateAction.state !== 'hidden');

  return (
    <div
      className={`app-container${isWindowsPlatform() ? ' app-container-windows' : ''}${sideNavLayoutMode === 'classic' ? ' app-container-side-nav-classic' : ''}${sideNavLayoutMode === 'classic' && sideNavClassicCollapsed ? ' app-container-side-nav-classic-collapsed' : ''}`}
    >
      {/* 更新通知：活跃状态时保持挂载，关闭后继续保留当前更新状态 */}
      {shouldRenderUpdateNotification && (
        <div style={showUpdateNotification ? undefined : { display: 'none' }}>
        <Suspense fallback={null}>
          <UpdateNotification
            key={updateNotificationKey}
            updateInfo={updateNotificationInfo}
            checking={updateNotificationChecking}
            onRestartUpdate={handleApplyPendingUpdate}
            actionState={updateAction.state}
            actionVersion={updateAction.version}
            actionProgress={updateAction.progress}
            actionRetryStatus={updateRetryStatus}
            actionError={updateDownloadError}
            actionErrorDetails={updateErrorDetails}
            skipError={updateSkipError}
            onPrimaryAction={handleUpdatePrimaryAction}
            onCancelUpdate={cancelUpdateDownload}
            onSkipUpdate={handleSkipUpdateVersion}
            onClose={closeUpdateNotification}
          />
        </Suspense>
        </div>
      )}
      {/* 版本跳跃通知（更新后首次启动） */}
      {versionJumpInfo && (
        <Suspense fallback={null}>
          {showVersionJumpNotification && (
            <VersionJumpNotification
              info={versionJumpInfo}
              onClose={() => {
                setShowVersionJumpNotification(false);
                setVersionJumpInfo(null);
              }}
            />
          )}
        </Suspense>
      )}
      <GlobalModal />
      <WindowsOperationDialog />

      {/* 关闭确认对话框 */}
      {showCloseDialog && (
        <Suspense fallback={null}>
          <CloseConfirmDialog onClose={() => setShowCloseDialog(false)} />
        </Suspense>
      )}

      {hasBreakoutSession && (
        <Suspense fallback={null}>
          <BreakoutModal
            open={showBreakout}
            onMinimize={handleBreakoutMinimize}
            onTerminate={handleBreakoutTerminate}
          />
        </Suspense>
      )}

      {appPathMissing && (
        <div className="qs-overlay" style={{ zIndex: 10100 }}>
          <div className="qs-modal app-path-missing-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qs-header">
              <span className="qs-title">{t('appPath.missing.title', '未找到应用程序路径')}</span>
              <button
                className="qs-close"
                onClick={() => setAppPathMissing(null)}
                aria-label={t('common.close', '关闭')}
                disabled={appPathMissingBusy}
              >
                <X size={16} />
              </button>
            </div>

            <div className="qs-body">
              <div className="qs-section">
                <p className="app-path-missing-desc">
                  {t('appPath.missing.desc', '未找到 {{app}} 应用程序路径，请立即设置后继续启动。', {
                    app: appPathMissingAppName,
                  })}
                </p>
              </div>

              <div className="qs-section">
                <div className="qs-section-header">
                  <FolderOpen size={15} />
                  <span>{appPathMissingPathLabel}</span>
                </div>
                <div className="qs-path-control">
                  <input
                    type="text"
                    className="qs-path-input"
                    value={appPathDraft}
                    placeholder={t('settings.general.codexAppPathPlaceholder', '默认路径')}
                    onChange={(e) => {
                      setAppPathActionError('');
                      setAppPathScanError('');
                      setAppLaunchCandidates([]);
                      setAppPathDraft(e.target.value);
                    }}
                    disabled={appPathMissingBusy}
                  />
                  <div className="qs-path-actions">
                    <button
                      className="qs-btn"
                      onClick={handlePickMissingAppPath}
                      disabled={appPathMissingBusy}
                    >
                      {t('settings.general.codexPathSelect', '选择')}
                    </button>
                    <button
                      className="qs-btn"
                      onClick={handleResetMissingAppPath}
                      disabled={appPathMissingBusy}
                      title={
                        appPathDetecting
                          ? t('common.loading', '加载中...')
                          : isWindowsPlatform()
                            ? t('appPath.missing.scanApps', '检测运行中应用')
                            : (
                            appPathMissing.app === 'codebuddy'
                              ? t('settings.general.codebuddyPathReset', '重置默认')
                              : appPathMissing.app === 'codebuddy_cn'
                                ? t('settings.general.codebuddyPathReset', '重置默认')
                                : appPathMissing.app === 'qoder'
                                  ? t('settings.general.qoderPathReset', '重置默认')
                                : appPathMissing.app === 'qoder_cn'
                                  ? t('settings.general.qoderCnPathReset', '重置默认')
                                  : isTraePlatformApp(appPathMissing.app)
                                    ? t('settings.general.traePathReset', '重置默认')
                                    : t('settings.general.workbuddyPathReset', '重置默认')
                          )
                      }
                    >
                      {isWindowsPlatform() ? (
                        appPathDetecting
                          ? t('common.loading', '加载中...')
                          : t('appPath.missing.scanApps', '检测运行中应用')
                      ) : (
                        <RefreshCw size={12} className={appPathDetecting ? 'spin' : undefined} />
                      )}
                    </button>
                  </div>
                </div>
                {isWindowsPlatform() ? (
                  <>
                    {appLaunchCandidates.length > 0 ? (
                      <div className="app-path-candidate-list">
                        {appLaunchCandidates.map((candidate) => (
                          <button
                            key={`${candidate.target_type}:${candidate.target}`}
                            type="button"
                            className={`app-path-candidate-item${
                              appPathDraft.trim() === candidate.target ? ' selected' : ''
                            }`}
                            onClick={() => handleSelectAppLaunchCandidate(candidate)}
                            disabled={appPathMissingBusy}
                          >
                            <div className="app-path-candidate-main">
                              <span>{candidate.label || appPathMissingAppName}</span>
                              <span className="app-path-candidate-badge">
                                {candidate.target_type === 'windows_app'
                                  ? t('appPath.missing.windowsApp', 'Microsoft Store')
                                  : 'EXE'}
                              </span>
                            </div>
                            <div className="app-path-candidate-target">{candidate.target}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {appPathScanError || appPathActionError ? (
                  <p className="app-path-missing-error">
                    {appPathScanError || t('messages.switchFailed', { error: appPathActionError })}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setAppPathMissing(null)}
                disabled={appPathMissingBusy}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveMissingAppPath}
                disabled={appPathMissingBusy || !appPathDraft.trim()}
              >
                {t('common.save', '保存')}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 顶部固定拖拽区域 */}
      <div
        className="drag-region"
        data-tauri-drag-region
        onMouseDown={handleDragStart}
      />

      {/* 左侧悬浮导航 */}
      <SideNav
        page={page}
        setPage={setPage}
        onOpenPlatformLayout={openPlatformLayoutModal}
        easterEggClickCount={easterEggClickCount}
        onEasterEggTriggerClick={handleBreakoutEntryTriggerClick}
        hasBreakoutSession={hasBreakoutSession}
        updateActionState={updateAction.state}
        updateProgress={updateAction.progress}
        onUpdateActionClick={handleQuickUpdateActionClick}
        updateRemindersEnabled={updateRemindersEnabled}
        sponsorEntryVisible={sponsorEntryVisible}
        onOpenLogViewer={() => setShowLogViewer(true)}
      />

      <AnnouncementHost onNavigate={setPage} />

      {sideNavLayoutMode !== 'classic' && (
        <button
          className="log-entry-fab"
          onClick={() => setShowLogViewer(true)}
          title={t('manual.dataPrivacy.keywords.5', '日志')}
          aria-label={t('manual.dataPrivacy.keywords.5', '日志')}
        >
          <FileText size={18} />
        </button>
      )}

      <Suspense fallback={null}>
        <PlatformLayoutModal
          open={showPlatformLayoutModal}
          requestedEditGroupId={platformLayoutRequestedGroupId}
          onClose={() => {
            setShowPlatformLayoutModal(false);
            setPlatformLayoutRequestedGroupId(null);
          }}
        />
        <LogViewerModal
          open={showLogViewer}
          onClose={() => setShowLogViewer(false)}
        />
      </Suspense>

      <div className="main-wrapper">
        <Suspense fallback={suspenseFallback}>
          <VisibleBootPage when={page === 'dashboard'}>
            <DashboardPage
              onNavigate={setPage}
              onOpenPlatformLayout={openPlatformLayoutModal}
              onEasterEggTriggerClick={handleBreakoutEntryTriggerClick}
            />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'codebuddy'}>
            <CodebuddyAccountsPage />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'codebuddy-cn'}>
            <CodebuddyCnAccountsPage />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'qoder'}>
            <QoderAccountsPage />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'qoder-cn'}>
            <QoderCnAccountsPage />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'qwenwork'}>
            <QwenWorkAccountsPage />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'trae'}>
            <TraeAccountsPage platformId="trae" />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'trae-solo'}>
            <TraeAccountsPage platformId="trae_solo" />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'trae-cn'}>
            <TraeAccountsPage platformId="trae_cn" />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'trae-solo-cn'}>
            <TraeAccountsPage platformId="trae_solo_cn" />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'workbuddy'}>
            <WorkbuddyAccountsPage />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'workbuddy-ai'}>
            <WorkbuddyAiAccountsPage />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'instances'}>
            <InstancesPage onNavigate={setPage} />
          </VisibleBootPage>
          <VisibleBootPage when={page === 'settings'}>
            <SettingsPage />
          </VisibleBootPage>
        </Suspense>
      </div>
    </div>
  );
}

function App() {
  let windowLabel = 'main';
  try {
    windowLabel = getCurrentWindow().label;
  } catch {
    windowLabel = 'main';
  }
  if (windowLabel === 'floating-card' || windowLabel.startsWith('instance-floating-card-')) {
    return <FloatingCardWindow />;
  }

  return <MainApp />;
}

export default App;
