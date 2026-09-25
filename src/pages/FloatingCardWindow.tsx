import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import {
  buildCodebuddyAccountPresentation,
  buildQoderAccountPresentation,
  buildTraeAccountPresentation,
  buildWorkbuddyAccountPresentation,
  UnifiedAccountPresentation,
} from '../presentation/platformAccountPresentation';
import * as traeService from '../services/traeService';
import {
  hideCurrentFloatingCardWindow,
  hideFloatingCardWindow,
  showMainWindowAndNavigate,
  type FloatingCardInstanceContext,
} from '../services/floatingCardService';
import { useCodebuddyAccountStore } from '../stores/useCodebuddyAccountStore';
import { useCodebuddyCnAccountStore } from '../stores/useCodebuddyCnAccountStore';
import { usePlatformLayoutStore } from '../stores/usePlatformLayoutStore';
import { useRemoteConfigStore } from '../stores/useRemoteConfigStore';
import { useQoderAccountStore } from '../stores/useQoderAccountStore';
import { useTraeAccountStore } from '../stores/useTraeAccountStore';
import { useWorkbuddyAccountStore } from '../stores/useWorkbuddyAccountStore';
import { ALL_PLATFORM_IDS, isAccountPlatform, PLATFORM_PAGE_MAP, PlatformId } from '../types/platform';
import { isPrivacyModeEnabledByDefault, maskSensitiveValue } from '../utils/privacy';
import { getPlatformLabel, renderPlatformIcon } from '../utils/platformMeta';
import { FLOATING_CARD_PLATFORM_STORAGE_KEY } from '../utils/accountSyncEvents';
import './FloatingCardWindow.css';

function getSafeWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return 'floating-card';
  }
}
const FLOATING_CARD_WINDOW_LABEL = 'floating-card';

type FloatingCardAccount = {
  id: string;
  tags?: string[] | null;
  [key: string]: unknown;
};

function isTraeSuitePlatform(
  platformId: PlatformId,
): platformId is 'trae' | 'trae_solo' | 'trae_cn' | 'trae_solo_cn' {
  return (
    platformId === 'trae' ||
    platformId === 'trae_solo' ||
    platformId === 'trae_cn' ||
    platformId === 'trae_solo_cn'
  );
}

function loadInitialPlatform(): PlatformId {
  try {
    const saved = localStorage.getItem(FLOATING_CARD_PLATFORM_STORAGE_KEY);
    if (saved && ALL_PLATFORM_IDS.includes(saved as PlatformId)) {
      return saved as PlatformId;
    }
  } catch {
    // ignore
  }
  return 'codebuddy';
}

function resolveCurrentAccountById<T extends { id: string }>(
  accounts: T[],
  currentId: string | null | undefined,
): T | null {
  if (!currentId) return null;
  return accounts.find((account) => account.id === currentId) ?? null;
}

export function FloatingCardWindow() {
  const { t } = useTranslation();
  const currentWindowLabel = useMemo(() => getSafeWindowLabel(), []);
  const isPrimaryFloatingCardWindow = currentWindowLabel === FLOATING_CARD_WINDOW_LABEL;
  const orderedPlatformIds = usePlatformLayoutStore((state) => state.orderedPlatformIds);
  const trayPlatformIds = usePlatformLayoutStore((state) => state.trayPlatformIds);
  const remoteHiddenPlatformIds = useRemoteConfigStore((state) => state.hiddenPlatformIds);
  const fetchRemoteConfigState = useRemoteConfigStore((state) => state.fetchState);

  const {
    accounts: codebuddyAccounts,
    currentAccountId: codebuddyCurrentId,
  } = useCodebuddyAccountStore();
  const {
    accounts: codebuddyCnAccounts,
    currentAccountId: codebuddyCnCurrentId,
  } = useCodebuddyCnAccountStore();
  const {
    accounts: qoderAccounts,
    currentAccountId: qoderCurrentId,
  } = useQoderAccountStore();
  const {
    accounts: traeAccounts,
    currentAccountId: traeCurrentId,
  } = useTraeAccountStore();
  const {
    accounts: workbuddyAccounts,
    currentAccountId: workbuddyCurrentId,
  } = useWorkbuddyAccountStore();

  const shellRef = useRef<HTMLDivElement | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>(loadInitialPlatform);
  const [instanceContext] = useState<FloatingCardInstanceContext | null>(null);
  const [viewedAccountIds, setViewedAccountIds] = useState<Partial<Record<PlatformId, string | null>>>({});
  const [privacyModeEnabled] = useState<boolean>(() =>
    isPrivacyModeEnabledByDefault(),
  );
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [refreshingAccountId, setRefreshingAccountId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);
  const remoteHiddenPlatformSet = useMemo(
    () => new Set(remoteHiddenPlatformIds),
    [remoteHiddenPlatformIds],
  );

  const platformOrder = useMemo(() => {
    const seen = new Set<PlatformId>();
    const ordered: PlatformId[] = [];
    const trayEnabled = new Set(trayPlatformIds);

    for (const platformId of orderedPlatformIds) {
      if (!ALL_PLATFORM_IDS.includes(platformId) || seen.has(platformId)) continue;
      if (!isAccountPlatform(platformId)) continue;
      if (remoteHiddenPlatformSet.has(platformId)) continue;
      if (!trayEnabled.has(platformId)) continue;
      ordered.push(platformId);
      seen.add(platformId);
    }

    for (const platformId of trayPlatformIds) {
      if (!ALL_PLATFORM_IDS.includes(platformId) || seen.has(platformId)) continue;
      if (!isAccountPlatform(platformId)) continue;
      if (remoteHiddenPlatformSet.has(platformId)) continue;
      ordered.push(platformId);
      seen.add(platformId);
    }

    return ordered.length > 0 ? ordered : [...ALL_PLATFORM_IDS];
  }, [orderedPlatformIds, remoteHiddenPlatformSet, trayPlatformIds]);

  useEffect(() => {
    void fetchRemoteConfigState(false);
  }, [fetchRemoteConfigState]);

  useEffect(() => {
    if (platformOrder.length === 0) return;
    if (platformOrder.includes(selectedPlatform)) return;
    setSelectedPlatform(platformOrder[0] ?? 'codebuddy');
  }, [platformOrder, selectedPlatform]);

  const selectAccount = useCallback((platformId: PlatformId, accountId: string | null) => {
    setViewedAccountIds((prev) => ({
      ...prev,
      [platformId]: accountId,
    }));
  }, []);

  const fetchPlatformData = useCallback(
    async (targetPlatform: PlatformId) => {
      setPlatformLoading(true);
      try {
        switch (targetPlatform) {
          case 'codebuddy':
            await useCodebuddyAccountStore.getState().fetchAccounts();
            break;
          case 'codebuddy_cn':
            await useCodebuddyCnAccountStore.getState().fetchAccounts();
            break;
          case 'qoder':
            await useQoderAccountStore.getState().fetchAccounts();
            break;
          case 'trae':
          case 'trae_solo':
          case 'trae_cn':
          case 'trae_solo_cn':
            await useTraeAccountStore.getState().fetchAccounts();
            break;
          case 'workbuddy':
            await useWorkbuddyAccountStore.getState().fetchAccounts();
            break;
        }
      } finally {
        setPlatformLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchPlatformData(selectedPlatform);
  }, [fetchPlatformData, selectedPlatform]);

  const codebuddyCurrent = useMemo(
    () => resolveCurrentAccountById(codebuddyAccounts, codebuddyCurrentId),
    [codebuddyAccounts, codebuddyCurrentId],
  );
  const codebuddyCnCurrent = useMemo(
    () => resolveCurrentAccountById(codebuddyCnAccounts, codebuddyCnCurrentId),
    [codebuddyCnAccounts, codebuddyCnCurrentId],
  );
  const qoderCurrent = useMemo(
    () => resolveCurrentAccountById(qoderAccounts, qoderCurrentId),
    [qoderAccounts, qoderCurrentId],
  );
  const traeCurrent = useMemo(
    () => resolveCurrentAccountById(traeAccounts, traeCurrentId),
    [traeAccounts, traeCurrentId],
  );
  const workbuddyCurrent = useMemo(
    () => resolveCurrentAccountById(workbuddyAccounts, workbuddyCurrentId),
    [workbuddyAccounts, workbuddyCurrentId],
  );

  const selectedState = useMemo(() => {
    switch (selectedPlatform) {
      case 'codebuddy':
        return {
          accounts: codebuddyAccounts,
          actualCurrentAccount: codebuddyCurrent,
        };
      case 'codebuddy_cn':
        return {
          accounts: codebuddyCnAccounts,
          actualCurrentAccount: codebuddyCnCurrent,
        };
      case 'qoder':
        return {
          accounts: qoderAccounts,
          actualCurrentAccount: qoderCurrent,
        };
      case 'trae':
      case 'trae_solo':
      case 'trae_cn':
      case 'trae_solo_cn':
        return {
          accounts: traeAccounts,
          actualCurrentAccount: traeCurrent,
        };
      case 'workbuddy':
        return {
          accounts: workbuddyAccounts,
          actualCurrentAccount: workbuddyCurrent,
        };
      default:
        return {
          accounts: [],
          actualCurrentAccount: null,
        };
    }
  }, [
    codebuddyAccounts,
    codebuddyCnAccounts,
    codebuddyCnCurrent,
    codebuddyCurrent,
    qoderAccounts,
    qoderCurrent,
    selectedPlatform,
    traeAccounts,
    traeCurrent,
    workbuddyAccounts,
    workbuddyCurrent,
  ]);

  const accounts = selectedState.accounts as unknown as FloatingCardAccount[];
  const actualCurrentAccount = selectedState.actualCurrentAccount as unknown as (FloatingCardAccount | null);
  const currentAccount = useMemo(() => {
    if (!instanceContext || instanceContext.platformId !== selectedPlatform) {
      return actualCurrentAccount;
    }
    return accounts.find((account) => account.id === instanceContext.boundAccountId) ?? null;
  }, [accounts, actualCurrentAccount, instanceContext, selectedPlatform]);

  const viewedAccountId = viewedAccountIds[selectedPlatform] ?? null;
  const viewedAccount = useMemo(() => {
    if (accounts.length === 0) return null;
    if (viewedAccountId) {
      const target = accounts.find((account) => account.id === viewedAccountId);
      if (target) return target;
    }
    return currentAccount ?? accounts[0] ?? null;
  }, [accounts, currentAccount, viewedAccountId]);

  const presentation = useMemo<UnifiedAccountPresentation | null>(() => {
    if (!viewedAccount) return null;
    switch (selectedPlatform) {
      case 'codebuddy':
        return buildCodebuddyAccountPresentation(viewedAccount as any, t);
      case 'codebuddy_cn':
        return buildCodebuddyAccountPresentation(viewedAccount as any, t);
      case 'workbuddy':
        return buildWorkbuddyAccountPresentation(viewedAccount as any, t);
      case 'qoder':
        return buildQoderAccountPresentation(viewedAccount as any, t);
      case 'trae':
      case 'trae_solo':
      case 'trae_cn':
      case 'trae_solo_cn':
        return buildTraeAccountPresentation(viewedAccount as any, t);
      default:
        return null;
    }
  }, [selectedPlatform, t, viewedAccount]);

  const isCurrentViewed = useMemo(() => {
    if (!currentAccount || !viewedAccount) return false;
    return currentAccount.id === viewedAccount.id;
  }, [currentAccount, viewedAccount]);

  const handleSwitchAccount = useCallback(async () => {
    if (!viewedAccount) return;
    setSwitchingAccountId(viewedAccount.id);
    setErrorText(null);
    try {
      switch (selectedPlatform) {
        case 'codebuddy':
          await useCodebuddyAccountStore.getState().switchAccount(viewedAccount.id);
          break;
        case 'codebuddy_cn':
          await useCodebuddyCnAccountStore.getState().switchAccount(viewedAccount.id);
          break;
        case 'qoder':
          await useQoderAccountStore.getState().switchAccount(viewedAccount.id);
          break;
        case 'trae':
        case 'trae_solo':
        case 'trae_cn':
        case 'trae_solo_cn':
          if (isTraeSuitePlatform(selectedPlatform)) {
            await traeService.injectTraeAccount(viewedAccount.id, selectedPlatform);
            await useTraeAccountStore.getState().fetchAccounts();
          }
          break;
        case 'workbuddy':
          await useWorkbuddyAccountStore.getState().switchAccount(viewedAccount.id);
          break;
      }
      selectAccount(selectedPlatform, viewedAccount.id);
    } catch (error) {
      setErrorText(String(error));
    } finally {
      setSwitchingAccountId(null);
    }
  }, [selectedPlatform, viewedAccount, selectAccount]);

  const handleRefresh = useCallback(async () => {
    if (!viewedAccount) return;
    setRefreshingAccountId(viewedAccount.id);
    try {
      switch (selectedPlatform) {
        case 'codebuddy':
          await useCodebuddyAccountStore.getState().refreshToken(viewedAccount.id);
          break;
        case 'codebuddy_cn':
          await useCodebuddyCnAccountStore.getState().refreshToken(viewedAccount.id);
          break;
        case 'qoder':
          await useQoderAccountStore.getState().refreshToken(viewedAccount.id);
          break;
        case 'trae':
        case 'trae_solo':
        case 'trae_cn':
        case 'trae_solo_cn':
          await traeService.refreshTraeToken(viewedAccount.id);
          await useTraeAccountStore.getState().fetchAccounts();
          break;
        case 'workbuddy':
          await useWorkbuddyAccountStore.getState().refreshToken(viewedAccount.id);
          break;
      }
    } catch (err) {
      setErrorText(String(err));
    } finally {
      setRefreshingAccountId(null);
    }
  }, [selectedPlatform, viewedAccount]);

  const handleClose = useCallback(async () => {
    if (isPrimaryFloatingCardWindow) {
      await hideFloatingCardWindow();
    } else {
      await hideCurrentFloatingCardWindow();
    }
  }, [isPrimaryFloatingCardWindow]);

  const handleNavigateMain = useCallback(async () => {
    const page = PLATFORM_PAGE_MAP[selectedPlatform] ?? 'dashboard';
    await showMainWindowAndNavigate(page);
  }, [selectedPlatform]);

  const maskAccountText = useCallback(
    (value?: string | null) => maskSensitiveValue(value, privacyModeEnabled),
    [privacyModeEnabled],
  );

  return (
    <div className="floating-card-window" ref={shellRef}>
      {/* Top Header */}
      <div className="floating-card-header" data-tauri-drag-region>
        <div className="platform-selector">
          {renderPlatformIcon(selectedPlatform, 18)}
          <span className="platform-name">{getPlatformLabel(selectedPlatform, t)}</span>
        </div>

        <div className="header-actions">
          <button
            className="action-btn"
            onClick={handleNavigateMain}
            title={t('floatingCard.openMain', '在主窗口打开')}
          >
            <ExternalLink size={14} />
          </button>
          <button className="action-btn close-btn" onClick={handleClose} title={t('common.close', '关闭')}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="floating-card-body">
        {errorText && <div className="floating-card-error">{errorText}</div>}

        {presentation ? (
          <div className="account-details">
            <div className="account-row">
              <span className="account-email">{maskAccountText(presentation.displayName)}</span>
              <span className={`plan-badge ${presentation.planClass}`}>{presentation.planLabel}</span>
            </div>

            {/* Quota Progress */}
            {presentation.quotaItems.map((item) => (
              <div key={item.key} className="quota-row">
                <div className="quota-labels">
                  <span>{item.label}</span>
                  <span>{item.valueText}</span>
                </div>
                {item.showProgress && (
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${item.quotaClass}`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {platformLoading ? t('common.loading', '加载中...') : t('common.noAccounts', '暂无账号')}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="floating-card-footer">
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRefresh}
          disabled={!viewedAccount || refreshingAccountId === viewedAccount.id}
          title={t('common.refresh', '刷新')}
        >
          <RefreshCw size={13} className={refreshingAccountId ? 'spin' : ''} />
          <span>刷新</span>
        </button>

        <button
          className={`btn btn-sm ${isCurrentViewed ? 'btn-success' : 'btn-primary'}`}
          onClick={handleSwitchAccount}
          disabled={!viewedAccount || isCurrentViewed || switchingAccountId === viewedAccount.id}
        >
          {isCurrentViewed ? '当前使用中' : switchingAccountId ? '切换中...' : '切换到该账号'}
        </button>
      </div>
    </div>
  );
}
