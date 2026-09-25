import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  Settings,
  RefreshCw,
  FolderOpen,
  Zap,
  X,
} from 'lucide-react';
import { useEscClose } from '../hooks/useEscClose';
import {
  buildDefaultCurrentAccountRefreshMinutesMap,
  type CurrentAccountRefreshMinutesMap,
  type CurrentAccountRefreshPlatform,
  loadCurrentAccountRefreshMinutesMap,
  saveCurrentAccountRefreshMinutesMap,
} from '../utils/currentAccountRefresh';
import { usePlatformRuntimeSupport } from '../hooks/usePlatformRuntimeSupport';
import {
  readAccountsOverviewFilterPersistenceEnabled,
  resolveAccountsOverviewScopeFromQuickSettingsType,
  setAccountsOverviewFilterPersistenceEnabled,
} from '../utils/accountsOverviewFilterPersistence';
import './QuickSettingsPopover.css';

/** GeneralConfig from backend */
interface GeneralConfig {
  codebuddy_auto_refresh_minutes: number;
  codebuddy_cn_auto_refresh_minutes: number;
  qoder_auto_refresh_minutes: number;
  qoder_cn_auto_refresh_minutes: number;
  trae_auto_refresh_minutes: number;
  trae_solo_auto_refresh_minutes: number;
  trae_cn_auto_refresh_minutes: number;
  trae_solo_cn_auto_refresh_minutes: number;
  workbuddy_auto_refresh_minutes: number;

  codebuddy_app_path: string;
  codebuddy_share_sessions_on_switch: boolean;
  codebuddy_cn_app_path: string;
  codebuddy_cn_share_sessions_on_switch: boolean;
  qoder_app_path: string;
  qoder_cn_app_path: string;
  trae_app_path: string;
  trae_solo_app_path: string;
  trae_cn_app_path: string;
  trae_solo_cn_app_path: string;
  trae_share_sessions_on_switch: boolean;
  trae_solo_share_sessions_on_switch: boolean;
  trae_cn_share_sessions_on_switch: boolean;
  trae_solo_cn_share_sessions_on_switch: boolean;
  workbuddy_app_path: string;
  workbuddy_share_sessions_on_switch: boolean;

  codebuddy_quota_alert_enabled: boolean;
  codebuddy_quota_alert_threshold: number;
  codebuddy_cn_quota_alert_enabled: boolean;
  codebuddy_cn_quota_alert_threshold: number;
  qoder_quota_alert_enabled: boolean;
  qoder_quota_alert_threshold: number;
  qoder_cn_quota_alert_enabled: boolean;
  qoder_cn_quota_alert_threshold: number;
  trae_quota_alert_enabled: boolean;
  trae_quota_alert_threshold: number;
  trae_solo_quota_alert_enabled: boolean;
  trae_solo_quota_alert_threshold: number;
  trae_cn_quota_alert_enabled: boolean;
  trae_cn_quota_alert_threshold: number;
  trae_solo_cn_quota_alert_enabled: boolean;
  trae_solo_cn_quota_alert_threshold: number;
  workbuddy_quota_alert_enabled: boolean;
  workbuddy_quota_alert_threshold: number;
}

export type QuickSettingsType =
  | 'codebuddy'
  | 'codebuddy_cn'
  | 'qoder'
  | 'qoder_cn'
  | 'trae'
  | 'trae_solo'
  | 'trae_cn'
  | 'trae_solo_cn'
  | 'workbuddy';

type AppPathTarget = QuickSettingsType;

type QuotaAlertEnabledKey =
  | 'codebuddy_quota_alert_enabled'
  | 'codebuddy_cn_quota_alert_enabled'
  | 'qoder_quota_alert_enabled'
  | 'qoder_cn_quota_alert_enabled'
  | 'trae_quota_alert_enabled'
  | 'trae_solo_quota_alert_enabled'
  | 'trae_cn_quota_alert_enabled'
  | 'trae_solo_cn_quota_alert_enabled'
  | 'workbuddy_quota_alert_enabled';

type QuotaAlertThresholdKey =
  | 'codebuddy_quota_alert_threshold'
  | 'codebuddy_cn_quota_alert_threshold'
  | 'qoder_quota_alert_threshold'
  | 'qoder_cn_quota_alert_threshold'
  | 'trae_quota_alert_threshold'
  | 'trae_solo_quota_alert_threshold'
  | 'trae_cn_quota_alert_threshold'
  | 'trae_solo_cn_quota_alert_threshold'
  | 'workbuddy_quota_alert_threshold';

type AppLaunchCandidate = {
  target_type: string;
  label: string;
  target: string;
  source: string;
  supports_multi_instance: boolean;
};

const getAppPathKeyForTarget = (target: AppPathTarget): keyof GeneralConfig => {
  switch (target) {
    case 'codebuddy':
      return 'codebuddy_app_path';
    case 'codebuddy_cn':
      return 'codebuddy_cn_app_path';
    case 'qoder':
      return 'qoder_app_path';
    case 'qoder_cn':
      return 'qoder_cn_app_path';
    case 'trae':
      return 'trae_app_path';
    case 'trae_solo':
      return 'trae_solo_app_path';
    case 'trae_cn':
      return 'trae_cn_app_path';
    case 'trae_solo_cn':
      return 'trae_solo_cn_app_path';
    case 'workbuddy':
      return 'workbuddy_app_path';
  }
};

interface QuickSettingsPopoverProps {
  type: QuickSettingsType;
}

const getCurrentAccountRefreshPlatformForType = (
  platformType: QuickSettingsType,
): CurrentAccountRefreshPlatform => {
  switch (platformType) {
    case 'codebuddy':
      return 'codebuddy';
    case 'codebuddy_cn':
      return 'codebuddy_cn';
    case 'qoder':
      return 'qoder';
    case 'qoder_cn':
      return 'qoder_cn';
    case 'trae':
      return 'trae';
    case 'trae_solo':
      return 'trae_solo';
    case 'trae_cn':
      return 'trae_cn';
    case 'trae_solo_cn':
      return 'trae_solo_cn';
    case 'workbuddy':
      return 'workbuddy';
    default:
      return 'codebuddy';
  }
};

export function QuickSettingsPopover({ type }: QuickSettingsPopoverProps) {
  const { t } = useTranslation();
  const isWindows = usePlatformRuntimeSupport('windows-only');
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<GeneralConfig | null>(null);
  const [pathDetecting, setPathDetecting] = useState(false);
  const [appLaunchCandidates, setAppLaunchCandidates] = useState<AppLaunchCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshEditing, setRefreshEditing] = useState(false);
  const [currentAccountRefreshEditing, setCurrentAccountRefreshEditing] = useState(false);
  const [quotaAlertThresholdEditing, setQuotaAlertThresholdEditing] = useState(false);
  const [customRefresh, setCustomRefresh] = useState('');
  const [currentAccountCustomRefresh, setCurrentAccountCustomRefresh] = useState('');
  const [quotaAlertCustomThreshold, setQuotaAlertCustomThreshold] = useState('');
  const [currentAccountRefreshMap, setCurrentAccountRefreshMap] =
    useState<CurrentAccountRefreshMinutesMap>(() => buildDefaultCurrentAccountRefreshMinutesMap());
  const modalRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<GeneralConfig | null>(null);
  const configSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const configSaveVersionRef = useRef(0);
  const configLoadVersionRef = useRef(0);
  const refreshPresets = ['-1', '2', '5', '10', '15'];
  const thresholdPresets = ['0', '20', '40', '60'];

  const overviewFilterScope = resolveAccountsOverviewScopeFromQuickSettingsType(type);
  const [
    overviewFilterPersistenceEnabled,
    setOverviewFilterPersistenceEnabledState,
  ] = useState(() =>
    readAccountsOverviewFilterPersistenceEnabled(overviewFilterScope),
  );

  const handleOverviewFilterPersistenceToggle = useCallback(
    (checked: boolean) => {
      setOverviewFilterPersistenceEnabledState(checked);
      setAccountsOverviewFilterPersistenceEnabled(overviewFilterScope, checked);
    },
    [overviewFilterScope],
  );

  const loadConfig = useCallback(async () => {
    const loadVersion = configLoadVersionRef.current + 1;
    configLoadVersionRef.current = loadVersion;
    try {
      while (true) {
        const pendingSaves = configSaveQueueRef.current;
        await pendingSaves;
        if (pendingSaves === configSaveQueueRef.current) {
          break;
        }
      }
      if (loadVersion !== configLoadVersionRef.current) {
        return;
      }
      const saveVersionAtStart = configSaveVersionRef.current;
      setError(null);
      const cfg = await invoke<GeneralConfig>('get_general_config');
      if (
        loadVersion !== configLoadVersionRef.current ||
        saveVersionAtStart !== configSaveVersionRef.current
      ) {
        return;
      }
      configRef.current = cfg;
      setConfig(cfg);
      setRefreshEditing(false);
      setCurrentAccountRefreshEditing(false);
      setQuotaAlertThresholdEditing(false);
      setCustomRefresh('');
      setCurrentAccountCustomRefresh('');
      setQuotaAlertCustomThreshold('');
      setCurrentAccountRefreshMap(loadCurrentAccountRefreshMinutesMap());
    } catch (e) {
      if (loadVersion === configLoadVersionRef.current) {
        setError(t('settings.general.loadFailed') + ': ' + e);
      }
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      void loadConfig();
      setOverviewFilterPersistenceEnabledState(
        readAccountsOverviewFilterPersistenceEnabled(overviewFilterScope),
      );
    } else {
      configLoadVersionRef.current += 1;
      configRef.current = null;
      setConfig(null);
    }
  }, [isOpen, loadConfig, overviewFilterScope]);

  useEscClose(isOpen, () => setIsOpen(false));

  useEffect(() => {
    const handleExternalOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ type?: QuickSettingsType }>;
      if (customEvent.detail?.type !== type) {
        return;
      }
      setIsOpen(true);
    };

    window.addEventListener('quick-settings:open', handleExternalOpen as EventListener);
    return () => {
      window.removeEventListener('quick-settings:open', handleExternalOpen as EventListener);
    };
  }, [type]);

  const getRefreshKeyForType = (t: QuickSettingsType): keyof GeneralConfig => {
    switch (t) {
      case 'codebuddy': return 'codebuddy_auto_refresh_minutes';
      case 'codebuddy_cn': return 'codebuddy_cn_auto_refresh_minutes';
      case 'qoder': return 'qoder_auto_refresh_minutes';
      case 'qoder_cn': return 'qoder_cn_auto_refresh_minutes';
      case 'trae': return 'trae_auto_refresh_minutes';
      case 'trae_solo': return 'trae_solo_auto_refresh_minutes';
      case 'trae_cn': return 'trae_cn_auto_refresh_minutes';
      case 'trae_solo_cn': return 'trae_solo_cn_auto_refresh_minutes';
      case 'workbuddy': return 'workbuddy_auto_refresh_minutes';
    }
  };

  const saveConfig = useCallback(
    async (updates: Partial<GeneralConfig>) => {
      const current = configRef.current;
      if (!current) return;
      const optimisticConfig = { ...current, ...updates };
      configRef.current = optimisticConfig;
      setConfig(optimisticConfig);
      setError(null);
      const saveVersion = configSaveVersionRef.current + 1;
      configSaveVersionRef.current = saveVersion;

      const operation = configSaveQueueRef.current.then(async () => {
        const latest = await invoke<GeneralConfig>('get_general_config');
        const merged = { ...latest, ...updates };
        await invoke('patch_general_config', { updates });
        if (saveVersion === configSaveVersionRef.current) {
          configRef.current = merged;
          setConfig(merged);
        }
        window.dispatchEvent(new Event('config-updated'));
      }).catch((err) => {
        console.error('Failed to save config:', err);
        setError(t('quickSettings.error.saveFailed', {
          error: String(err),
          defaultValue: '保存配置失败：{{error}}',
        }));
        if (saveVersion === configSaveVersionRef.current) {
          void loadConfig();
        }
      });

      configSaveQueueRef.current = operation;
      await operation;
    },
    [loadConfig, t]
  );

  const handlePickAppPath = async (target: AppPathTarget) => {
    try {
      const selected = await open({ multiple: false, directory: false });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path || !config) return;

      setAppLaunchCandidates([]);
      void saveConfig({ [getAppPathKeyForTarget(target)]: path });
    } catch (err) {
      console.error('Failed to pick path:', err);
      setError(t('quickSettings.error.pickPathFailed', {
        error: String(err),
        defaultValue: '选择路径失败：{{error}}',
      }));
    }
  };

  const handleResetAppPath = async (target: AppPathTarget) => {
    if (pathDetecting) return;
    if (isWindows) {
      setPathDetecting(true);
      setError(null);
      try {
        const candidates = await invoke<AppLaunchCandidate[]>('scan_app_launch_targets', {
          app: target,
        });
        setAppLaunchCandidates(candidates);
        if (candidates.length === 0) {
          setError(
            t(
              'quickSettings.appPath.scanEmpty',
              '未检测到正在运行的应用，请先启动后重试，或手动选择路径。',
            ),
          );
        }
      } catch (err) {
        console.error('Failed to scan app launch targets:', err);
        setError(t('quickSettings.error.resetPathFailed', {
          error: String(err),
          defaultValue: '重置路径失败：{{error}}',
        }));
      } finally {
        setPathDetecting(false);
      }
      return;
    }
    setPathDetecting(true);
    setError(null);
    try {
      const detected = await invoke<string | null>('detect_app_path', { app: target, force: true });
      setAppLaunchCandidates([]);
      void saveConfig({ [getAppPathKeyForTarget(target)]: detected || '' });
    } catch (err) {
      console.error('Failed to reset path:', err);
      setError(t('quickSettings.error.resetPathFailed', {
        error: String(err),
        defaultValue: '重置路径失败：{{error}}',
      }));
    } finally {
      setPathDetecting(false);
    }
  };

  const handleSelectAppLaunchCandidate = (candidate: AppLaunchCandidate) => {
    setError(null);
    void saveConfig({ [getAppPathKeyForTarget(getAppTarget())]: candidate.target });
  };

  const getTitle = () => {
    const platformLabel = (() => {
      switch (type) {
        case 'codebuddy':
          return 'CodeBuddy';
        case 'codebuddy_cn':
          return 'CodeBuddy CN';
        case 'qoder':
          return 'Qoder';
        case 'qoder_cn':
          return 'Qoder CN';
        case 'trae':
          return 'Trae';
        case 'trae_solo':
          return 'TRAE Work';
        case 'trae_cn':
          return 'Trae CN';
        case 'trae_solo_cn':
          return 'TRAE Work CN';
        case 'workbuddy':
          return 'WorkBuddy';
      }
    })();
    return `${platformLabel} ${t('nav.settings', '设置')}`;
  };

  const getSessionSharingPlatformLabel = () => {
    switch (type) {
      case 'codebuddy_cn':
        return 'CodeBuddy CN';
      case 'trae':
        return 'Trae';
      case 'trae_solo':
        return 'TRAE Work';
      case 'trae_cn':
        return 'Trae CN';
      case 'trae_solo_cn':
        return 'TRAE Work CN';
      default:
        return '';
    }
  };

  const getSessionSharingEnabled = () => {
    if (!config) return false;
    if (type === 'codebuddy_cn') {
      return config.codebuddy_cn_share_sessions_on_switch ?? false;
    }
    return false;
  };

  const saveSessionSharingEnabled = (enabled: boolean) => {
    if (type === 'codebuddy_cn') {
      void saveConfig({ codebuddy_cn_share_sessions_on_switch: enabled });
    }
  };

  const getRefreshKey = (): keyof GeneralConfig => {
    return getRefreshKeyForType(type);
  };

  const getQuotaAlertEnabledKeyForType = (t: QuickSettingsType): QuotaAlertEnabledKey => {
    switch (t) {
      case 'codebuddy':
        return 'codebuddy_quota_alert_enabled';
      case 'codebuddy_cn':
        return 'codebuddy_cn_quota_alert_enabled';
      case 'qoder':
        return 'qoder_quota_alert_enabled';
      case 'qoder_cn':
        return 'qoder_cn_quota_alert_enabled';
      case 'trae':
        return 'trae_quota_alert_enabled';
      case 'trae_solo':
        return 'trae_solo_quota_alert_enabled';
      case 'trae_cn':
        return 'trae_cn_quota_alert_enabled';
      case 'trae_solo_cn':
        return 'trae_solo_cn_quota_alert_enabled';
      case 'workbuddy':
        return 'workbuddy_quota_alert_enabled';
    }
  };

  const getQuotaAlertThresholdKeyForType = (t: QuickSettingsType): QuotaAlertThresholdKey => {
    switch (t) {
      case 'codebuddy':
        return 'codebuddy_quota_alert_threshold';
      case 'codebuddy_cn':
        return 'codebuddy_cn_quota_alert_threshold';
      case 'qoder':
        return 'qoder_quota_alert_threshold';
      case 'qoder_cn':
        return 'qoder_cn_quota_alert_threshold';
      case 'trae':
        return 'trae_quota_alert_threshold';
      case 'trae_solo':
        return 'trae_solo_quota_alert_threshold';
      case 'trae_cn':
        return 'trae_cn_quota_alert_threshold';
      case 'trae_solo_cn':
        return 'trae_solo_cn_quota_alert_threshold';
      case 'workbuddy':
        return 'workbuddy_quota_alert_threshold';
    }
  };

  const getRefreshLabel = () => {
    return t('quickSettings.refreshInterval', '配额自动刷新');
  };

  const showAppPathSection = true;

  const getAppPath = (): string => {
    if (!config) return '';
    switch (type) {
      case 'codebuddy':
        return config.codebuddy_app_path;
      case 'codebuddy_cn':
        return config.codebuddy_cn_app_path;
      case 'qoder':
        return config.qoder_app_path;
      case 'qoder_cn':
        return config.qoder_cn_app_path;
      case 'trae':
        return config.trae_app_path;
      case 'trae_solo':
        return config.trae_solo_app_path;
      case 'trae_cn':
        return config.trae_cn_app_path;
      case 'trae_solo_cn':
        return config.trae_solo_cn_app_path;
      case 'workbuddy':
        return config.workbuddy_app_path;
    }
  };

  const getAppPathLabel = () => {
    switch (type) {
      case 'codebuddy':
        return t('quickSettings.codebuddy.appPath', 'CodeBuddy 路径');
      case 'codebuddy_cn':
        return t('quickSettings.codebuddyCn.appPath', 'CodeBuddy CN 路径');
      case 'qoder':
        return t('quickSettings.qoder.appPath', 'Qoder 路径');
      case 'qoder_cn':
        return t('quickSettings.qoderCn.appPath', 'Qoder CN 路径');
      case 'trae':
        return t('quickSettings.trae.appPath', 'Trae 路径');
      case 'trae_solo':
        return t('quickSettings.traeSolo.appPath', 'TRAE Work 路径');
      case 'trae_cn':
        return t('quickSettings.traeCn.appPath', 'Trae CN 路径');
      case 'trae_solo_cn':
        return t('quickSettings.traeSoloCn.appPath', 'TRAE Work CN 路径');
      case 'workbuddy':
        return t('quickSettings.workbuddy.appPath', 'WorkBuddy 路径');
    }
  };

  const getAppTarget = (): AppPathTarget => {
    return type;
  };

  const refreshValue = config ? Number(config[getRefreshKey()]) : -1;
  const isPreset = refreshPresets.includes(String(refreshValue));
  const showRefreshInput = refreshEditing;

  const currentAccountRefreshPlatform = getCurrentAccountRefreshPlatformForType(type);
  const currentAccountRefreshValue = currentAccountRefreshPlatform
    ? currentAccountRefreshMap[currentAccountRefreshPlatform]
    : -1;
  const isCurrentAccountRefreshAllowed = refreshValue !== -1;
  const currentAccountRefreshDisplayValue = !isCurrentAccountRefreshAllowed
    ? '-1'
    : String(currentAccountRefreshValue);
  const isCurrentAccountRefreshPreset = ['1', '2', '5', '10', '15'].includes(
    String(currentAccountRefreshValue),
  );
  const showCurrentAccountRefreshInput =
    isCurrentAccountRefreshAllowed && currentAccountRefreshEditing;

  const quotaAlertEnabledKey = getQuotaAlertEnabledKeyForType(type);
  const quotaAlertThresholdKey = getQuotaAlertThresholdKeyForType(type);
  const quotaAlertEnabledValue = config ? Boolean(config[quotaAlertEnabledKey]) : false;
  const quotaAlertThresholdValue = config ? Number(config[quotaAlertThresholdKey]) : 20;
  const isQuotaAlertThresholdPreset = thresholdPresets.includes(String(quotaAlertThresholdValue));
  const showQuotaAlertThresholdInput = quotaAlertThresholdEditing;

  const handleRefreshSelectChange = (val: string) => {
    if (val === 'custom') {
      setCustomRefresh(String(refreshValue > 0 ? refreshValue : 1));
      setRefreshEditing(true);
    } else {
      setCustomRefresh('');
      setRefreshEditing(false);
      void saveConfig({ [getRefreshKey()]: parseInt(val, 10) });
    }
  };

  const handleCustomRefreshApply = () => {
    const parsed = parseInt(customRefresh, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      void saveConfig({ [getRefreshKey()]: parsed });
      setCustomRefresh('');
      setRefreshEditing(false);
      return;
    }
    setCustomRefresh('');
    setRefreshEditing(false);
  };

  const saveCurrentAccountRefresh = (minutes: number) => {
    if (!currentAccountRefreshPlatform) return;
    setCurrentAccountRefreshMap((prev) => {
      const next = saveCurrentAccountRefreshMinutesMap({
        ...prev,
        [currentAccountRefreshPlatform]: minutes,
      });
      window.dispatchEvent(new Event('config-updated'));
      return next;
    });
  };

  const handleCurrentAccountRefreshSelectChange = (value: string) => {
    if (!isCurrentAccountRefreshAllowed) {
      setCurrentAccountCustomRefresh('');
      setCurrentAccountRefreshEditing(false);
      return;
    }
    if (value === 'custom') {
      setCurrentAccountCustomRefresh(String(currentAccountRefreshValue || 1));
      setCurrentAccountRefreshEditing(true);
      return;
    }
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      saveCurrentAccountRefresh(parsed);
    }
    setCurrentAccountCustomRefresh('');
    setCurrentAccountRefreshEditing(false);
  };

  const handleCurrentAccountCustomRefreshApply = () => {
    if (!isCurrentAccountRefreshAllowed) {
      setCurrentAccountCustomRefresh('');
      setCurrentAccountRefreshEditing(false);
      return;
    }
    const parsed = parseInt(currentAccountCustomRefresh, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      saveCurrentAccountRefresh(parsed);
      setCurrentAccountCustomRefresh('');
      setCurrentAccountRefreshEditing(false);
      return;
    }
    setCurrentAccountCustomRefresh('');
    setCurrentAccountRefreshEditing(false);
  };

  const handleQuotaAlertThresholdSelectChange = (val: string) => {
    if (val === 'custom') {
      setQuotaAlertCustomThreshold(String(quotaAlertThresholdValue));
      setQuotaAlertThresholdEditing(true);
    } else {
      setQuotaAlertCustomThreshold('');
      setQuotaAlertThresholdEditing(false);
      void saveConfig({ [quotaAlertThresholdKey]: parseInt(val, 10) } as Partial<GeneralConfig>);
    }
  };

  const handleQuotaAlertCustomThresholdApply = () => {
    const parsed = parseInt(quotaAlertCustomThreshold, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      void saveConfig({ [quotaAlertThresholdKey]: parsed } as Partial<GeneralConfig>);
      setQuotaAlertCustomThreshold('');
      setQuotaAlertThresholdEditing(false);
      return;
    }
    setQuotaAlertCustomThreshold('');
    setQuotaAlertThresholdEditing(false);
  };

  const renderQuotaAlertControls = () => {
    return (
      <>
        <div className="qs-row">
          <div className="qs-row-label">
            <span>{t('quickSettings.quotaAlert.enable', '超额预警')}</span>
          </div>
          <div className="qs-row-control">
            <label className="qs-switch">
              <input
                type="checkbox"
                checked={quotaAlertEnabledValue}
                onChange={(e) =>
                  void saveConfig({ [quotaAlertEnabledKey]: e.target.checked } as Partial<GeneralConfig>)
                }
              />
              <span className="qs-switch-slider"></span>
            </label>
          </div>
        </div>

        {quotaAlertEnabledValue && (
          <div className="qs-field-group" style={{ animation: 'qsFadeUp 0.2s ease both' }}>
            <div className="qs-row">
              <div className="qs-row-label">
                <span>{t('quickSettings.quotaAlert.threshold', '预警阈值')}</span>
              </div>
              <div className="qs-row-control">
                {showQuotaAlertThresholdInput ? (
                  <div className="qs-inline-input">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="qs-select qs-select--input-mode qs-select--with-unit"
                      value={quotaAlertCustomThreshold}
                      placeholder={t('quickSettings.inputPercent', '输入百分比')}
                      onChange={(e) => setQuotaAlertCustomThreshold(e.target.value.replace(/[^\d]/g, ''))}
                      onBlur={handleQuotaAlertCustomThresholdApply}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuotaAlertCustomThresholdApply();
                        }
                      }}
                    />
                    <span className="qs-input-unit">%</span>
                  </div>
                ) : (
                  <select
                    className="qs-select"
                    value={String(quotaAlertThresholdValue)}
                    onChange={(e) => handleQuotaAlertThresholdSelectChange(e.target.value)}
                  >
                    {!isQuotaAlertThresholdPreset && (
                      <option value={String(quotaAlertThresholdValue)}>
                        {quotaAlertThresholdValue}%
                      </option>
                    )}
                    <option value="0">0%</option>
                    <option value="20">20%</option>
                    <option value="40">40%</option>
                    <option value="60">60%</option>
                    <option value="custom">{t('quickSettings.customInput', '自定义')}</option>
                  </select>
                )}
              </div>
            </div>
            <div className="qs-hint" style={{ marginTop: 6 }}>
              {t(
                'quickSettings.quotaAlert.hint',
                '当当前账号任意模型配额低于阈值时，发送原生通知并在页面提示快捷切号。',
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  const overlayContent = isOpen ? (
    <div className="qs-overlay">
      <div className={`qs-modal qs-modal--${type}`} ref={modalRef}>
        <div className="qs-header">
          <span className="qs-title">{getTitle()}</span>
          <button className="qs-close" onClick={() => setIsOpen(false)} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="qs-error">
            {error}
            <button className="qs-error-close" onClick={() => setError(null)} aria-label={t('common.close')}>
              <X size={12} />
            </button>
          </div>
        )}

        {config && (
          <div className="qs-body">
            {/* ─── Refresh Interval ─── */}
            <div className="qs-section">
              <div className="qs-section-header">
                <RefreshCw size={15} />
                <span>{getRefreshLabel()}</span>
              </div>
              <div className="qs-field-group">
                {showRefreshInput ? (
                  <div className="qs-inline-input">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      className="qs-select qs-select--input-mode qs-select--with-unit"
                      value={customRefresh}
                      placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                      onChange={(e) => setCustomRefresh(e.target.value.replace(/[^\d]/g, ''))}
                      onBlur={handleCustomRefreshApply}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCustomRefreshApply();
                        }
                      }}
                    />
                    <span className="qs-input-unit">{t('settings.general.minutes')}</span>
                  </div>
                ) : (
                  <select
                    className="qs-select"
                    value={String(refreshValue)}
                    onChange={(e) => handleRefreshSelectChange(e.target.value)}
                  >
                    {!isPreset && (
                      <option value={String(refreshValue)}>
                        {refreshValue} {t('settings.general.minutes')}
                      </option>
                    )}
                    <option value="-1">{t('settings.general.autoRefreshDisabled')}</option>
                    <option value="2">2 {t('settings.general.minutes')}</option>
                    <option value="5">5 {t('settings.general.minutes')}</option>
                    <option value="10">10 {t('settings.general.minutes')}</option>
                    <option value="15">15 {t('settings.general.minutes')}</option>
                    <option value="custom">{t('quickSettings.customInput', '自定义')}</option>
                  </select>
                )}
              </div>
            </div>

            {currentAccountRefreshPlatform && (
              <div className="qs-section">
                <div className="qs-section-header">
                  <RefreshCw size={15} />
                  <span>{t('settings.general.currentAccountRefreshTitle')}</span>
                </div>
                <div className="qs-field-group">
                  {showCurrentAccountRefreshInput ? (
                    <div className="qs-inline-input">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        className="qs-select qs-select--input-mode qs-select--with-unit"
                        value={currentAccountCustomRefresh}
                        placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                        onChange={(e) =>
                          setCurrentAccountCustomRefresh(e.target.value.replace(/[^\d]/g, ''))
                        }
                        onBlur={handleCurrentAccountCustomRefreshApply}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCurrentAccountCustomRefreshApply();
                          }
                        }}
                      />
                      <span className="qs-input-unit">{t('settings.general.minutes')}</span>
                    </div>
                  ) : (
                    <select
                      className="qs-select"
                      value={currentAccountRefreshDisplayValue}
                      onChange={(e) => handleCurrentAccountRefreshSelectChange(e.target.value)}
                      disabled={!isCurrentAccountRefreshAllowed}
                    >
                      {!isCurrentAccountRefreshAllowed && (
                        <option value="-1">{t('settings.general.autoRefreshDisabled')}</option>
                      )}
                      {!isCurrentAccountRefreshPreset && (
                        <option value={String(currentAccountRefreshValue)}>
                          {currentAccountRefreshValue} {t('settings.general.minutes')}
                        </option>
                      )}
                      <option value="1">1 {t('settings.general.minutes')}</option>
                      <option value="2">2 {t('settings.general.minutes')}</option>
                      <option value="5">5 {t('settings.general.minutes')}</option>
                      <option value="10">10 {t('settings.general.minutes')}</option>
                      <option value="15">15 {t('settings.general.minutes')}</option>
                      <option value="custom">{t('quickSettings.customInput', '自定义')}</option>
                    </select>
                  )}
                  <div className="qs-hint" style={{ marginTop: 6 }}>
                    {isCurrentAccountRefreshAllowed
                      ? t('settings.general.currentAccountRefreshItemDesc')
                      : t(
                        'settings.general.currentAccountRefreshRequiresAutoRefresh',
                        '需先开启“配额自动刷新”后，才能设置当前账号刷新。',
                      )}
                  </div>
                </div>
              </div>
            )}

            <div className="qs-section">
              <div className="qs-section-header">
                <Settings size={15} />
                <span>{t('quickSettings.filterPersistence.title', '筛选记忆')}</span>
              </div>
              <div className="qs-row">
                <div className="qs-row-label">
                  <span>
                    {t(
                      'quickSettings.filterPersistence.enable',
                      '记住账号总览筛选（不含搜索）',
                    )}
                  </span>
                </div>
                <div className="qs-row-control">
                  <label className="qs-switch">
                    <input
                      type="checkbox"
                      checked={overviewFilterPersistenceEnabled}
                      onChange={(event) =>
                        handleOverviewFilterPersistenceToggle(event.target.checked)
                      }
                    />
                    <span className="qs-switch-slider"></span>
                  </label>
                </div>
              </div>
              <div className="qs-hint">
                {t(
                  'quickSettings.filterPersistence.hint',
                  '默认关闭。开启后会按平台记住筛选、标签和排序。',
                )}
              </div>
            </div>

            {/* ─── App Path ─── */}
            {showAppPathSection && (
              <div className="qs-section">
                <div className="qs-section-header">
                  <FolderOpen size={15} />
                  <span>{getAppPathLabel()}</span>
                </div>
                {config && (
                  <div className="qs-path-control">
                    <input
                      type="text"
                      className="qs-path-input"
                      value={getAppPath()}
                      placeholder={t('settings.general.codexAppPathPlaceholder', '默认路径')}
                      onChange={(e) => {
                        setAppLaunchCandidates([]);
                        void saveConfig({ [getAppPathKeyForTarget(getAppTarget())]: e.target.value });
                      }}
                    />
                    <div className="qs-path-actions">
                      <button
                        className="qs-btn"
                        onClick={() => void handlePickAppPath(getAppTarget())}
                        disabled={pathDetecting}
                        title={t('settings.general.codexPathSelect', '选择')}
                      >
                        {t('settings.general.codexPathSelect', '选择')}
                      </button>
                      <button
                        className="qs-btn"
                        onClick={() => void handleResetAppPath(getAppTarget())}
                        disabled={pathDetecting}
                        title={
                          pathDetecting
                            ? t('common.loading', '加载中...')
                            : isWindows
                              ? t('appPath.missing.scanApps', '检测运行中应用')
                              : t('settings.general.codexPathReset', '恢复默认')
                        }
                      >
                        {isWindows ? (
                          pathDetecting
                            ? t('common.loading', '加载中...')
                            : t('appPath.missing.scanApps', '检测运行中应用')
                        ) : (
                          <RefreshCw size={12} className={pathDetecting ? 'spin' : undefined} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {isWindows && config && (
                  <>
                    {appLaunchCandidates.length > 0 && (
                      <div className="qs-claude-candidate-list">
                        {appLaunchCandidates.map((candidate) => (
                          <button
                            key={`${candidate.target_type}:${candidate.target}`}
                            type="button"
                            className={`qs-claude-candidate-item${
                              getAppPath().trim() === candidate.target ? ' selected' : ''
                            }`}
                            onClick={() => handleSelectAppLaunchCandidate(candidate)}
                          >
                            <div className="qs-claude-candidate-main">
                              <span>{candidate.label || getTitle()}</span>
                              <span className="qs-claude-candidate-badge">
                                {candidate.target_type === 'windows_app'
                                  ? t('appPath.missing.windowsApp', 'Microsoft Store')
                                  : 'EXE'}
                              </span>
                            </div>
                            <div className="qs-claude-candidate-target">{candidate.target}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {type === 'codebuddy' && (
              <div className="qs-section">
                <div className="qs-row qs-row--top">
                  <div className="qs-row-label">
                    <Zap size={15} />
                    <span>{t('settings.general.codebuddyShareSessionsOnSwitch')}</span>
                  </div>
                  <div className="qs-row-control">
                    <label className="qs-switch">
                      <input
                        type="checkbox"
                        checked={config.codebuddy_share_sessions_on_switch ?? false}
                        onChange={(event) =>
                          void saveConfig({
                            codebuddy_share_sessions_on_switch: event.target.checked,
                          })
                        }
                      />
                      <span className="qs-switch-slider"></span>
                    </label>
                  </div>
                </div>
                <div className="qs-hint">
                  {t('settings.general.codebuddyShareSessionsOnSwitchDesc')}
                </div>
              </div>
            )}

            {type === 'codebuddy_cn' && (
              <div className="qs-section">
                <div className="qs-row qs-row--top">
                  <div className="qs-row-label">
                    <Zap size={15} />
                    <span>
                      {t('common.sessionSharing.title', {
                        platform: getSessionSharingPlatformLabel(),
                      })}
                    </span>
                  </div>
                  <div className="qs-row-control">
                    <label className="qs-switch">
                      <input
                        type="checkbox"
                        checked={getSessionSharingEnabled()}
                        onChange={(event) => saveSessionSharingEnabled(event.target.checked)}
                      />
                      <span className="qs-switch-slider"></span>
                    </label>
                  </div>
                </div>
                <div className="qs-hint">
                  {t('common.sessionSharing.fullDesc', {
                    platform: getSessionSharingPlatformLabel(),
                  })}
                </div>
              </div>
            )}

            {type === 'workbuddy' && (
              <div className="qs-section">
                <div className="qs-row qs-row--top">
                  <div className="qs-row-label">
                    <Zap size={15} />
                    <span>{t('settings.general.workbuddyShareSessionsOnSwitch')}</span>
                  </div>
                  <div className="qs-row-control">
                    <label className="qs-switch">
                      <input
                        type="checkbox"
                        checked={config.workbuddy_share_sessions_on_switch ?? false}
                        onChange={(event) =>
                          void saveConfig({
                            workbuddy_share_sessions_on_switch: event.target.checked,
                          })
                        }
                      />
                      <span className="qs-switch-slider"></span>
                    </label>
                  </div>
                </div>
                <div className="qs-hint">
                  {t('settings.general.workbuddyShareSessionsOnSwitchDesc')}
                </div>
              </div>
            )}

            {/* 配额预警 */}
            <div className="qs-section">
              {renderQuotaAlertControls()}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="quick-settings-wrapper">
      <button
        className={`btn btn-secondary icon-only ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={getTitle()}
        aria-label={getTitle()}
      >
        <Settings size={14} />
      </button>
      {overlayContent && createPortal(overlayContent, document.body)}
    </div>
  );
}
