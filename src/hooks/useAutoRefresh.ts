import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useCodebuddyAccountStore } from '../stores/useCodebuddyAccountStore';
import { useCodebuddyCnAccountStore } from '../stores/useCodebuddyCnAccountStore';
import { useWorkbuddyAccountStore } from '../stores/useWorkbuddyAccountStore';
import { useQoderAccountStore } from '../stores/useQoderAccountStore';
import { useQoderCnAccountStore } from '../stores/useQoderCnAccountStore';
import { useTraeAccountStore } from '../stores/useTraeAccountStore';
import { getCodebuddyAccountDisplayEmail } from '../types/codebuddy';
import { getWorkbuddyAccountDisplayEmail } from '../types/workbuddy';
import { getQoderAccountDisplayEmail } from '../types/qoder';
import {
  getTraeAccountDisplayEmail,
  getTraeAccountPlatformId,
} from '../types/trae';
import * as traeService from '../services/traeService';
import type { TraePlatformId } from '../services/traeService';
import {
  loadCurrentAccountRefreshMinutesMap,
  getAccountRefreshMinutes,
  type CurrentAccountRefreshPlatform,
} from '../utils/currentAccountRefresh';
import {
  createAutoRefreshScheduler,
  type AutoRefreshSchedulerHandle,
  type AutoRefreshSchedulerTask,
} from '../utils/autoRefreshScheduler';
import { CURRENT_ACCOUNT_CHANGED_EVENT } from '../utils/accountSyncEvents';

interface GeneralConfig {
  codebuddy_auto_refresh_minutes: number;
  codebuddy_cn_auto_refresh_minutes: number;
  workbuddy_auto_refresh_minutes: number;
  qoder_auto_refresh_minutes: number;
  trae_auto_refresh_minutes: number;
  trae_solo_auto_refresh_minutes: number;
  trae_cn_auto_refresh_minutes: number;
  trae_solo_cn_auto_refresh_minutes: number;
}

const resolveCurrentMinutes = (
  platform: CurrentAccountRefreshPlatform,
  currentEmail: string | null,
  refreshMap: Record<CurrentAccountRefreshPlatform, number>,
): number => {
  const platformDefault = refreshMap[platform] ?? 1;
  if (!currentEmail) {
    return platformDefault;
  }
  return getAccountRefreshMinutes(platform, currentEmail, platformDefault);
};

function getCurrentAccountEmails(): Record<CurrentAccountRefreshPlatform, string | null> {
  const getProviderEmail = <TAccount extends { id: string; email?: string }>(
    store: { getState: () => { accounts: TAccount[]; currentAccountId: string | null } },
    resolveEmail: (account: TAccount) => string,
  ): string | null => {
    const state = store.getState();
    const currentId = state.currentAccountId;
    if (!currentId) return null;
    const account = state.accounts.find((a) => a.id === currentId);
    if (!account) return null;
    return account.email ?? resolveEmail(account);
  };

  const getTraeProviderEmail = (platform: TraePlatformId): string | null => {
    const state = useTraeAccountStore.getState();
    const currentId = state.currentAccountId || localStorage.getItem(`agtools.${platform}.current_account_id`);
    if (!currentId) return null;
    const account = state.accounts.find(
      (item) => item.id === currentId && getTraeAccountPlatformId(item) === platform,
    );
    if (!account) return null;
    return account.email ?? getTraeAccountDisplayEmail(account);
  };

  return {
    codebuddy: getProviderEmail(useCodebuddyAccountStore, getCodebuddyAccountDisplayEmail),
    codebuddy_cn: getProviderEmail(useCodebuddyCnAccountStore, getCodebuddyAccountDisplayEmail),
    workbuddy: getProviderEmail(useWorkbuddyAccountStore, getWorkbuddyAccountDisplayEmail),
    qoder: getProviderEmail(useQoderAccountStore, getQoderAccountDisplayEmail),
    qoder_cn: getProviderEmail(useQoderCnAccountStore, getQoderAccountDisplayEmail),
    trae: getTraeProviderEmail('trae'),
    trae_solo: getTraeProviderEmail('trae_solo'),
    trae_cn: getTraeProviderEmail('trae_cn'),
    trae_solo_cn: getTraeProviderEmail('trae_solo_cn'),
  };
}

export function useAutoRefresh() {
  const refreshAllCodebuddyTokens = useCodebuddyAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentCodebuddyAccountId = useCodebuddyAccountStore((state) => state.fetchCurrentAccountId);
  const refreshCodebuddyToken = useCodebuddyAccountStore((state) => state.refreshToken);

  const refreshAllCodebuddyCnTokens = useCodebuddyCnAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentCodebuddyCnAccountId = useCodebuddyCnAccountStore((state) => state.fetchCurrentAccountId);
  const refreshCodebuddyCnToken = useCodebuddyCnAccountStore((state) => state.refreshToken);

  const refreshAllWorkbuddyTokens = useWorkbuddyAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentWorkbuddyAccountId = useWorkbuddyAccountStore((state) => state.fetchCurrentAccountId);
  const refreshWorkbuddyToken = useWorkbuddyAccountStore((state) => state.refreshToken);

  const refreshAllQoderTokens = useQoderAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentQoderAccountId = useQoderAccountStore((state) => state.fetchCurrentAccountId);
  const refreshQoderToken = useQoderAccountStore((state) => state.refreshToken);

  const fetchTraeAccounts = useTraeAccountStore((state) => state.fetchAccounts);
  const refreshTraeToken = useTraeAccountStore((state) => state.refreshToken);

  const codebuddyRefreshingRef = useRef(false);
  const codebuddyCurrentRefreshingRef = useRef(false);
  const codebuddyCnRefreshingRef = useRef(false);
  const codebuddyCnCurrentRefreshingRef = useRef(false);
  const workbuddyRefreshingRef = useRef(false);
  const workbuddyCurrentRefreshingRef = useRef(false);
  const qoderRefreshingRef = useRef(false);
  const qoderCurrentRefreshingRef = useRef(false);
  const traeRefreshingRef = useRef(false);
  const traeCurrentRefreshingRef = useRef(false);
  const traeSoloRefreshingRef = useRef(false);
  const traeSoloCurrentRefreshingRef = useRef(false);
  const traeCnRefreshingRef = useRef(false);
  const traeCnCurrentRefreshingRef = useRef(false);
  const traeSoloCnRefreshingRef = useRef(false);
  const traeSoloCnCurrentRefreshingRef = useRef(false);

  const schedulerRef = useRef<AutoRefreshSchedulerHandle | null>(null);
  const setupRunningRef = useRef(false);
  const setupPendingRef = useRef(false);
  const destroyedRef = useRef(false);

  const stopScheduler = useCallback(() => {
    schedulerRef.current?.stop();
    schedulerRef.current = null;
  }, []);

  const executeWithGuard = useCallback(
    async (
      refreshingRef: MutableRefObject<boolean>,
      task: () => Promise<void>,
      startMessage: string | null,
      errorMessage: string,
    ) => {
      if (refreshingRef.current) {
        return;
      }

      refreshingRef.current = true;
      try {
        if (startMessage) {
          console.log(startMessage);
        }
        await task();
      } catch (error) {
        console.error(errorMessage, error);
      } finally {
        refreshingRef.current = false;
      }
    },
    [],
  );

  const setupAutoRefresh = useCallback(async () => {
    if (destroyedRef.current) return;
    if (setupRunningRef.current) {
      setupPendingRef.current = true;
      return;
    }

    setupRunningRef.current = true;
    try {
      do {
        setupPendingRef.current = false;
        let config: GeneralConfig;
        try {
          config = await invoke<GeneralConfig>('get_general_config');
        } catch (error) {
          console.error('[AutoRefresh] 获取通用配置失败:', error);
          stopScheduler();
          break;
        }

        if (destroyedRef.current) break;

        const currentRefreshMinutesMap = loadCurrentAccountRefreshMinutesMap();
        const currentAccountEmails = getCurrentAccountEmails();

        const runProviderCurrentRefresh = async (
          getCurrentId: () => Promise<string | null> | string | null,
          refreshToken: (id: string) => Promise<unknown>,
        ) => {
          const currentId = await getCurrentId();
          if (!currentId) return;
          await refreshToken(currentId);
        };

        const createFullRefreshTask = (
          key: string,
          name: string,
          minutes: number,
          refreshingRef: MutableRefObject<boolean>,
          action: () => Promise<void>,
        ): AutoRefreshSchedulerTask | null => {
          if (minutes <= 0) return null;
          return {
            key: `${key}-full`,
            label: name,
            intervalMs: minutes * 60 * 1000,
            run: () =>
              executeWithGuard(
                refreshingRef,
                action,
                `[AutoRefresh] 自动刷新 ${name} 全部配额...`,
                `[AutoRefresh] 自动刷新 ${name} 全部配额失败:`,
              ),
          };
        };

        const createCurrentRefreshTask = (
          key: string,
          name: string,
          minutes: number,
          currentRefreshingRef: MutableRefObject<boolean>,
          action: () => Promise<void>,
        ): AutoRefreshSchedulerTask | null => {
          if (minutes <= 0) return null;
          return {
            key: `${key}-current`,
            label: `${name}-current`,
            intervalMs: minutes * 60 * 1000,
            run: () =>
              executeWithGuard(
                currentRefreshingRef,
                action,
                `[AutoRefresh] 自动刷新 ${name} 当前账号配额...`,
                `[AutoRefresh] 自动刷新 ${name} 当前账号配额失败:`,
              ),
          };
        };

        const platformSpecs: Array<{
          key: CurrentAccountRefreshPlatform;
          label: string;
          intervalMinutes: number;
          currentMinutes: number;
          fullRefreshingRef: MutableRefObject<boolean>;
          currentRefreshingRef: MutableRefObject<boolean>;
          runFullRefresh: () => Promise<void>;
          runCurrentRefresh: () => Promise<void>;
        }> = [
          {
            key: 'codebuddy',
            label: 'CodeBuddy',
            intervalMinutes: config.codebuddy_auto_refresh_minutes,
            currentMinutes: resolveCurrentMinutes('codebuddy', currentAccountEmails.codebuddy, currentRefreshMinutesMap),
            fullRefreshingRef: codebuddyRefreshingRef,
            currentRefreshingRef: codebuddyCurrentRefreshingRef,
            runFullRefresh: () => refreshAllCodebuddyTokens(),
            runCurrentRefresh: () => runProviderCurrentRefresh(fetchCurrentCodebuddyAccountId, refreshCodebuddyToken),
          },
          {
            key: 'codebuddy_cn',
            label: 'CodeBuddy CN',
            intervalMinutes: config.codebuddy_cn_auto_refresh_minutes,
            currentMinutes: resolveCurrentMinutes('codebuddy_cn', currentAccountEmails.codebuddy_cn, currentRefreshMinutesMap),
            fullRefreshingRef: codebuddyCnRefreshingRef,
            currentRefreshingRef: codebuddyCnCurrentRefreshingRef,
            runFullRefresh: () => refreshAllCodebuddyCnTokens(),
            runCurrentRefresh: () => runProviderCurrentRefresh(fetchCurrentCodebuddyCnAccountId, refreshCodebuddyCnToken),
          },
          {
            key: 'workbuddy',
            label: 'WorkBuddy',
            intervalMinutes: config.workbuddy_auto_refresh_minutes,
            currentMinutes: resolveCurrentMinutes('workbuddy', currentAccountEmails.workbuddy, currentRefreshMinutesMap),
            fullRefreshingRef: workbuddyRefreshingRef,
            currentRefreshingRef: workbuddyCurrentRefreshingRef,
            runFullRefresh: () => refreshAllWorkbuddyTokens(),
            runCurrentRefresh: () => runProviderCurrentRefresh(fetchCurrentWorkbuddyAccountId, refreshWorkbuddyToken),
          },
          {
            key: 'qoder',
            label: 'Qoder',
            intervalMinutes: config.qoder_auto_refresh_minutes,
            currentMinutes: resolveCurrentMinutes('qoder', currentAccountEmails.qoder, currentRefreshMinutesMap),
            fullRefreshingRef: qoderRefreshingRef,
            currentRefreshingRef: qoderCurrentRefreshingRef,
            runFullRefresh: () => refreshAllQoderTokens(),
            runCurrentRefresh: () => runProviderCurrentRefresh(fetchCurrentQoderAccountId, refreshQoderToken),
          },
          {
            key: 'trae',
            label: 'Trae',
            intervalMinutes: config.trae_auto_refresh_minutes,
            currentMinutes: resolveCurrentMinutes('trae', currentAccountEmails.trae, currentRefreshMinutesMap),
            fullRefreshingRef: traeRefreshingRef,
            currentRefreshingRef: traeCurrentRefreshingRef,
            runFullRefresh: async () => {
              await traeService.refreshAllTraeTokens('trae');
              await fetchTraeAccounts();
            },
            runCurrentRefresh: () =>
              runProviderCurrentRefresh(
                () => traeService.getTraeCurrentAccountId('trae'),
                refreshTraeToken,
              ),
          },
          {
            key: 'trae_solo',
            label: 'TRAE Work',
            intervalMinutes: config.trae_solo_auto_refresh_minutes,
            currentMinutes: resolveCurrentMinutes('trae_solo', currentAccountEmails.trae_solo, currentRefreshMinutesMap),
            fullRefreshingRef: traeSoloRefreshingRef,
            currentRefreshingRef: traeSoloCurrentRefreshingRef,
            runFullRefresh: async () => {
              await traeService.refreshAllTraeTokens('trae_solo');
              await fetchTraeAccounts();
            },
            runCurrentRefresh: () =>
              runProviderCurrentRefresh(
                () => traeService.getTraeCurrentAccountId('trae_solo'),
                refreshTraeToken,
              ),
          },
          {
            key: 'trae_cn',
            label: 'Trae CN',
            intervalMinutes: config.trae_cn_auto_refresh_minutes,
            currentMinutes: resolveCurrentMinutes('trae_cn', currentAccountEmails.trae_cn, currentRefreshMinutesMap),
            fullRefreshingRef: traeCnRefreshingRef,
            currentRefreshingRef: traeCnCurrentRefreshingRef,
            runFullRefresh: async () => {
              await traeService.refreshAllTraeTokens('trae_cn');
              await fetchTraeAccounts();
            },
            runCurrentRefresh: () =>
              runProviderCurrentRefresh(
                () => traeService.getTraeCurrentAccountId('trae_cn'),
                refreshTraeToken,
              ),
          },
          {
            key: 'trae_solo_cn',
            label: 'TRAE Work CN',
            intervalMinutes: config.trae_solo_cn_auto_refresh_minutes,
            currentMinutes: resolveCurrentMinutes('trae_solo_cn', currentAccountEmails.trae_solo_cn, currentRefreshMinutesMap),
            fullRefreshingRef: traeSoloCnRefreshingRef,
            currentRefreshingRef: traeSoloCnCurrentRefreshingRef,
            runFullRefresh: async () => {
              await traeService.refreshAllTraeTokens('trae_solo_cn');
              await fetchTraeAccounts();
            },
            runCurrentRefresh: () =>
              runProviderCurrentRefresh(
                () => traeService.getTraeCurrentAccountId('trae_solo_cn'),
                refreshTraeToken,
              ),
          },
        ];

        const tasks: AutoRefreshSchedulerTask[] = [];
        for (const spec of platformSpecs) {
          const fullTask = createFullRefreshTask(
            spec.key,
            spec.label,
            spec.intervalMinutes,
            spec.fullRefreshingRef,
            spec.runFullRefresh,
          );
          if (fullTask) tasks.push(fullTask);

          const currentTask = createCurrentRefreshTask(
            spec.key,
            spec.label,
            spec.currentMinutes,
            spec.currentRefreshingRef,
            spec.runCurrentRefresh,
          );
          if (currentTask) tasks.push(currentTask);
        }

        if (tasks.length === 0) {
          stopScheduler();
          continue;
        }

        stopScheduler();
        const scheduler = createAutoRefreshScheduler(tasks);
        schedulerRef.current = scheduler;
        scheduler.start();
      } while (setupPendingRef.current && !destroyedRef.current);
    } finally {
      setupRunningRef.current = false;
    }
  }, [
    executeWithGuard,
    fetchCurrentCodebuddyAccountId,
    fetchCurrentCodebuddyCnAccountId,
    fetchCurrentQoderAccountId,
    fetchCurrentWorkbuddyAccountId,
    fetchTraeAccounts,
    refreshAllCodebuddyCnTokens,
    refreshAllCodebuddyTokens,
    refreshAllQoderTokens,
    refreshAllWorkbuddyTokens,
    refreshCodebuddyCnToken,
    refreshCodebuddyToken,
    refreshQoderToken,
    refreshTraeToken,
    refreshWorkbuddyToken,
    stopScheduler,
  ]);

  useEffect(() => {
    destroyedRef.current = false;
    void setupAutoRefresh();

    let unlistenConfigChanged: UnlistenFn | undefined;
    listen('config:changed', () => {
      void setupAutoRefresh();
    })
      .then((fn) => {
        unlistenConfigChanged = fn;
      })
      .catch(() => {
        // Ignored when running in browser preview without Tauri backend
      });

    const handleWindowConfigChanged = () => {
      void setupAutoRefresh();
    };
    window.addEventListener('app-config-changed', handleWindowConfigChanged);
    window.addEventListener(CURRENT_ACCOUNT_CHANGED_EVENT, handleWindowConfigChanged);

    return () => {
      destroyedRef.current = true;
      stopScheduler();
      if (unlistenConfigChanged) unlistenConfigChanged();
      window.removeEventListener('app-config-changed', handleWindowConfigChanged);
      window.removeEventListener(CURRENT_ACCOUNT_CHANGED_EVENT, handleWindowConfigChanged);
    };
  }, [setupAutoRefresh, stopScheduler]);
}
