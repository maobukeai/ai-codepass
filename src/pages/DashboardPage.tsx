import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  CheckCircle2,
  RotateCw,
  Play,
  Eye,
  EyeOff,
  Layers,
  ArrowRight,
  Bell,
  Plus,
  Sparkles,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Page } from '../types/navigation';
import { useCodebuddyAccountStore } from '../stores/useCodebuddyAccountStore';
import { useCodebuddyCnAccountStore } from '../stores/useCodebuddyCnAccountStore';
import { useWorkbuddyAccountStore } from '../stores/useWorkbuddyAccountStore';
import { useWorkbuddyAiAccountStore } from '../stores/useWorkbuddyAiAccountStore';
import { useQoderAccountStore } from '../stores/useQoderAccountStore';
import { useQoderCnAccountStore } from '../stores/useQoderCnAccountStore';
import { useQwenworkAccountStore } from '../stores/useQwenworkAccountStore';
import { useQoderInstanceStore } from '../stores/useQoderInstanceStore';
import { useQoderCnInstanceStore } from '../stores/useQoderCnInstanceStore';
import { useTraeAccountStore } from '../stores/useTraeAccountStore';
import { CodebuddyIcon } from '../components/icons/CodebuddyIcon';
import { QoderIcon } from '../components/icons/QoderIcon';
import { TraeIcon } from '../components/icons/TraeIcon';
import { TraeCheckinModal } from '../components/codebuddy-suite/TraeCheckinModal';
import { WorkbuddyAutoCheckinConfigModal } from '../components/codebuddy-suite/WorkbuddyAutoCheckinConfigModal';
import { ScheduleNotificationModal } from '../components/ScheduleNotificationModal';
import {
  getWorkbuddyAutoCheckinConfigAsync,
  saveWorkbuddyAutoCheckinConfigAsync,
  WorkbuddyAutoCheckinConfig,
} from '../services/workbuddyAutoCheckinService';
import {
  getCodebuddyResourceSummary,
  getCodebuddyPlanBadge,
} from '../types/codebuddy';
import { getQoderSubscriptionInfo } from '../types/qoder';
import {
  TraeAccount,
  getTraePlanBadge,
  getTraeUsage,
  getTraeAccountDisplayName,
  getTraeAccountPlatformId,
  isTraeCnAccountPlatform,
} from '../types/trae';
import * as workbuddyService from '../services/workbuddyService';
import * as qoderService from '../services/qoderService';
import * as qoderCnService from '../services/qoderCnService';
import * as qwenworkService from '../services/qwenworkService';
import * as traeService from '../services/traeService';
import { isPrivacyModeEnabledByDefault, maskSensitiveValue } from '../utils/privacy';
import { findGroupByPlatform, usePlatformLayoutStore } from '../stores/usePlatformLayoutStore';
import { PLATFORM_PAGE_MAP } from '../types/platform';
import './DashboardPage.css';

interface DashboardPageProps {
  onNavigate?: (page: Page) => void;
  onOpenPlatformLayout?: () => void;
  onEasterEggTriggerClick?: () => void;
}

export function DashboardPage({ onNavigate, onEasterEggTriggerClick }: DashboardPageProps) {
  const { t } = useTranslation();

  const platformGroups = usePlatformLayoutStore((state) => state.platformGroups);
  const cbGroup = findGroupByPlatform(platformGroups, 'codebuddy');
  const cbTargetPlatform = cbGroup?.defaultPlatformId || 'codebuddy';
  const cbTargetPage = PLATFORM_PAGE_MAP[cbTargetPlatform] || 'codebuddy';

  const traeGroup = findGroupByPlatform(platformGroups, 'trae');
  const traeTargetPlatform = traeGroup?.defaultPlatformId || 'trae';
  const traeTargetPage = PLATFORM_PAGE_MAP[traeTargetPlatform] || 'trae';

  const qoderGroup = findGroupByPlatform(platformGroups, 'qoder');
  const qoderTargetPlatform = qoderGroup?.defaultPlatformId || 'qoder';
  const qoderTargetPage = PLATFORM_PAGE_MAP[qoderTargetPlatform] || 'qoder';

  // Stores
  const {
    accounts: cbAccounts,
    fetchAccounts: fetchCbAccounts,
    refreshAllTokens: refreshAllCbTokens,
  } = useCodebuddyAccountStore();
  const {
    accounts: cbCnAccounts,
    fetchAccounts: fetchCbCnAccounts,
    refreshAllTokens: refreshAllCbCnTokens,
  } = useCodebuddyCnAccountStore();
  const {
    accounts: wbAccounts,
    fetchAccounts: fetchWbAccounts,
    refreshAllTokens: refreshAllWbTokens,
  } = useWorkbuddyAccountStore();
  const {
    accounts: wbAiAccounts,
    fetchAccounts: fetchWbAiAccounts,
    refreshAllTokens: refreshAllWbAiTokens,
  } = useWorkbuddyAiAccountStore();
  const {
    accounts: qoderAccounts,
    fetchAccounts: fetchQoderAccounts,
    refreshAllTokens: refreshAllQoderTokens,
  } = useQoderAccountStore();
  const {
    accounts: qoderCnAccounts,
    fetchAccounts: fetchQoderCnAccounts,
    refreshAllTokens: refreshAllQoderCnTokens,
  } = useQoderCnAccountStore();
  const {
    accounts: qwenworkAccounts,
    fetchAccounts: fetchQwenworkAccounts,
  } = useQwenworkAccountStore();
  const {
    instances: qoderInstances,
    fetchInstances: fetchQoderInstances,
  } = useQoderInstanceStore();
  const {
    instances: qoderCnInstances,
    fetchInstances: fetchQoderCnInstances,
  } = useQoderCnInstanceStore();
  const {
    accounts: traeAccounts,
    fetchAccounts: fetchTraeAccounts,
    refreshAllTokens: refreshAllTraeTokens,
  } = useTraeAccountStore();

  // UI state
  const [privacyMode, setPrivacyMode] = useState<boolean>(() => isPrivacyModeEnabledByDefault());
  const [viewMode, setViewMode] = useState<'grid' | 'row'>(() => {
    try {
      return (localStorage.getItem('agtools.dashboard_view_mode') as 'grid' | 'row') || 'grid';
    } catch {
      return 'grid';
    }
  });
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Checkin states
  const [wbCheckinLoading, setWbCheckinLoading] = useState(false);
  const [wbCheckinStatus, setWbCheckinStatus] = useState<string | null>(null);
  const [showWbAutoCheckinModal, setShowWbAutoCheckinModal] = useState(false);
  const [wbAutoCheckinConfig, setWbAutoCheckinConfig] = useState<WorkbuddyAutoCheckinConfig>({
    enabled: false,
    startTime: '00:30',
    endTime: '05:30',
  });
  const [traeCheckinLoading, setTraeCheckinLoading] = useState(false);
  const [traeCheckinStatus, setTraeCheckinStatus] = useState<string | null>(null);
  const [showTraeCheckinModal, setShowTraeCheckinModal] = useState(false);
  const [showScheduleNotificationModal, setShowScheduleNotificationModal] = useState(false);

  const openWbAutoCheckinModal = useCallback(async () => {
    try {
      const cfg = await getWorkbuddyAutoCheckinConfigAsync();
      setWbAutoCheckinConfig(cfg);
    } catch {}
    setShowWbAutoCheckinModal(true);
  }, []);

  const handleSetViewMode = (mode: 'grid' | 'row') => {
    setViewMode(mode);
    try {
      localStorage.setItem('agtools.dashboard_view_mode', mode);
    } catch {}
  };

  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return t('dashboard.greetingDawn', '清晨好');
    if (hour < 12) return t('dashboard.greetingMorning', '早上好');
    if (hour < 18) return t('dashboard.greetingAfternoon', '下午好');
    return t('dashboard.greetingEvening', '晚上好');
  }, [t]);

  useEffect(() => {
    fetchCbAccounts();
    fetchCbCnAccounts();
    fetchWbAccounts();
    fetchWbAiAccounts();
    fetchQoderAccounts();
    fetchQoderCnAccounts();
    fetchQwenworkAccounts();
    fetchQoderInstances();
    fetchQoderCnInstances();
    fetchTraeAccounts();
  }, [
    fetchCbAccounts,
    fetchCbCnAccounts,
    fetchWbAccounts,
    fetchWbAiAccounts,
    fetchQoderAccounts,
    fetchQoderCnAccounts,
    fetchQwenworkAccounts,
    fetchQoderInstances,
    fetchQoderCnInstances,
    fetchTraeAccounts,
  ]);

  const safeCbAccounts = cbAccounts || [];
  const safeCbCnAccounts = cbCnAccounts || [];
  const safeWbAccounts = wbAccounts || [];
  const safeWbAiAccounts = wbAiAccounts || [];
  const safeQoderAccounts = qoderAccounts || [];
  const safeQoderCnAccounts = qoderCnAccounts || [];
  const safeQwenworkAccounts = qwenworkAccounts || [];
  const safeQoderInstances = qoderInstances || [];
  const safeQoderCnInstances = qoderCnInstances || [];
  const safeTraeAccounts = traeAccounts || [];

  // Aggregate accounts count
  const totalCbCount = safeCbAccounts.length + safeCbCnAccounts.length + safeWbAccounts.length + safeWbAiAccounts.length;
  const totalQoderCount = safeQoderAccounts.length + safeQoderCnAccounts.length + safeQwenworkAccounts.length;
  const totalQoderInstances = safeQoderInstances.length + safeQoderCnInstances.length;
  const totalTraeCount = safeTraeAccounts.length;
  const grandTotalAccounts = totalCbCount + totalQoderCount + totalTraeCount;

  // Active or top accounts for each platform
  const primaryWbAccount = safeWbAccounts[0] || null;
  const primaryCbAccount = safeCbAccounts[0] || null;
  const primaryCbCnAccount = safeCbCnAccounts[0] || null;
  const activeCbAccount = primaryWbAccount || primaryCbCnAccount || primaryCbAccount;

  const primaryQoderAccount = safeQoderAccounts[0] || null;
  const primaryQoderCnAccount = safeQoderCnAccounts[0] || null;
  const primaryQwenworkAccount = safeQwenworkAccounts[0] || null;
  const activeQoderAccount = primaryQoderAccount || primaryQoderCnAccount || primaryQwenworkAccount;
  const primaryTraeAccount = safeTraeAccounts[0] || null;
  const primaryTraeCnAccount = useMemo(() => {
    return safeTraeAccounts.find((acc) => isTraeCnAccountPlatform(acc)) || null;
  }, [safeTraeAccounts]);
  const hasOnlyGlobalTraeAccounts = safeTraeAccounts.length > 0 && !primaryTraeCnAccount;

  // Check checkin status for Workbuddy on load
  useEffect(() => {
    let active = true;
    if (primaryWbAccount) {
      workbuddyService
        .getCheckinStatusWorkbuddy(primaryWbAccount.id)
        .then((res) => {
          if (active) {
            setWbCheckinStatus(res.today_checked_in ? t('dashboard.checkedIn', '今日已签到') : t('dashboard.notCheckedIn', '今日未签到'));
          }
        })
        .catch(() => {
          if (active) setWbCheckinStatus(null);
        });
    }
    return () => {
      active = false;
    };
  }, [primaryWbAccount, t]);

  // Check checkin status for Trae on load
  useEffect(() => {
    let active = true;
    if (primaryTraeCnAccount) {
      traeService
        .getTraeCheckinStatus(primaryTraeCnAccount.id)
        .then((res) => {
          if (active) {
            setTraeCheckinStatus(
              res.checked_in
                ? t('dashboard.checkedIn', '今日已签到')
                : t('dashboard.notCheckedIn', '今日未签到'),
            );
          }
        })
        .catch(() => {
          if (active) setTraeCheckinStatus(null);
        });
    } else if (hasOnlyGlobalTraeAccounts) {
      setTraeCheckinStatus(t('dashboard.traeGlobalMonthlyReset', '国际版(月度重置)'));
    } else {
      setTraeCheckinStatus(null);
    }
    return () => {
      active = false;
    };
  }, [primaryTraeCnAccount, hasOnlyGlobalTraeAccounts, t]);

  // Global Refresh All
  const handleRefreshAll = useCallback(async () => {
    setIsRefreshingAll(true);
    setActionMessage(t('dashboard.refreshing', '正在刷新所有平台凭据与配额...'));
    try {
      await Promise.allSettled([
        refreshAllCbTokens(),
        refreshAllCbCnTokens(),
        refreshAllWbTokens(),
        refreshAllWbAiTokens(),
        refreshAllQoderTokens(),
        refreshAllQoderCnTokens(),
        refreshAllTraeTokens(),
      ]);
      setActionMessage(t('dashboard.refreshSuccess', '所有平台凭据已更新完成'));
    } catch {
      setActionMessage(t('dashboard.refreshError', '部分凭据刷新异常'));
    } finally {
      setIsRefreshingAll(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  }, [
    refreshAllCbTokens,
    refreshAllCbCnTokens,
    refreshAllWbTokens,
    refreshAllWbAiTokens,
    refreshAllQoderTokens,
    refreshAllQoderCnTokens,
    refreshAllTraeTokens,
    t,
  ]);

  // Workbuddy check-in action
  const handleWorkbuddyCheckin = useCallback(async () => {
    if (!primaryWbAccount) {
      if (onNavigate) onNavigate('workbuddy');
      return;
    }
    setWbCheckinLoading(true);
    try {
      const res = await workbuddyService.checkinWorkbuddy(primaryWbAccount.id);
      if (res.success) {
        setWbCheckinStatus(t('dashboard.checkedIn', '今日已签到'));
        setActionMessage(t('dashboard.workbuddyCheckinSuccess', 'WorkBuddy 签到成功！'));
        fetchWbAccounts();
      } else {
        setActionMessage(res.message || t('dashboard.workbuddyCheckinDone', 'WorkBuddy 签到完成'));
      }
    } catch (err: unknown) {
      setActionMessage(`${t('dashboard.checkinFailed', '签到失败')}: ${String(err)}`);
    } finally {
      setWbCheckinLoading(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  }, [primaryWbAccount, onNavigate, t, fetchWbAccounts]);

  // Trae check-in action
  const handleTraeCheckin = useCallback(async () => {
    if (safeTraeAccounts.length === 0) {
      if (onNavigate) onNavigate(traeTargetPage as Page);
      return;
    }
    if (!primaryTraeCnAccount) {
      setActionMessage(
        t(
          'dashboard.traeGlobalNoDailyCheckin',
          'Trae 国际版采用月度自动重置模式（免每日签到）。每日签到仅对 Trae 国内版开放。',
        ),
      );
      setTimeout(() => setActionMessage(null), 4000);
      return;
    }
    setTraeCheckinLoading(true);
    try {
      const res = await traeService.claimTraeCheckin(primaryTraeCnAccount.id);
      if (res.checked_in) {
        setTraeCheckinStatus(t('dashboard.checkedIn', '今日已签到'));
        setActionMessage(
          `Trae 签到成功！连续签到 ${res.consecutive_days} 天，获得 ${res.credits_earned_today} 额度`,
        );
        fetchTraeAccounts();
      } else {
        setActionMessage(res.message || t('dashboard.traeCheckinDone', 'Trae 签到完成'));
      }
    } catch (err: unknown) {
      setActionMessage(`${t('dashboard.checkinFailed', '签到失败')}: ${String(err)}`);
    } finally {
      setTraeCheckinLoading(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  }, [safeTraeAccounts.length, primaryTraeCnAccount, onNavigate, traeTargetPage, t, fetchTraeAccounts]);

  // Helper for masking email/display name
  const displayEmail = (email?: string | null) => {
    if (!email) return t('dashboard.noAccount', '暂无账号');
    return maskSensitiveValue(email, privacyMode);
  };

  const displayTraeAccount = useCallback(
    (account: TraeAccount | null) => {
      if (!account) return t('dashboard.noAccount', '暂无账号');
      const name = getTraeAccountDisplayName(account);
      if (name && name !== 'unknown') {
        return maskSensitiveValue(name, privacyMode);
      }
      if (account.email && account.email !== 'unknown') {
        return maskSensitiveValue(account.email, privacyMode);
      }
      if (account.nickname) {
        return maskSensitiveValue(account.nickname, privacyMode);
      }
      return maskSensitiveValue(account.id, privacyMode);
    },
    [privacyMode, t],
  );

  const traePlatformStats = useMemo(() => {
    const stats = {
      trae: 0,
      trae_solo: 0,
      trae_cn: 0,
      trae_solo_cn: 0,
    };
    for (const acc of safeTraeAccounts) {
      const pid = getTraeAccountPlatformId(acc);
      if (pid in stats) {
        stats[pid as keyof typeof stats]++;
      }
    }
    return stats;
  }, [safeTraeAccounts]);


  // Quota calculation for primary CodeBuddy
  const cbQuotaInfo = useMemo(() => {
    if (!activeCbAccount) return null;
    const summary = getCodebuddyResourceSummary(activeCbAccount as any);
    const percent = summary?.remainPercent ?? (summary?.usedPercent != null ? 100 - summary.usedPercent : 100);
    const remainingText = summary ? `${t('dashboard.remaining', '剩余')}: ${summary.remain}` : t('dashboard.quotaNormal', '配额正常');
    return { percent: Math.round(percent), remainingText };
  }, [activeCbAccount, t]);

  // Multi-account detailed list for CodeBuddy suite
  const allCbAccountsList = useMemo(() => {
    const list: Array<{
      id: string;
      email: string;
      displayName: string;
      subPlatform: 'wb' | 'cb-cn' | 'cb';
      platformLabel: string;
      planBadge: string;
      percent: number;
      remainingText: string;
    }> = [];

    safeWbAccounts.forEach((acc) => {
      const summary = getCodebuddyResourceSummary(acc as any);
      const percent = summary?.remainPercent ?? (summary?.usedPercent != null ? 100 - summary.usedPercent : 100);
      list.push({
        id: acc.id,
        email: acc.email,
        displayName: (acc as any).nickname || acc.email,
        subPlatform: 'wb',
        platformLabel: 'WorkBuddy',
        planBadge: getCodebuddyPlanBadge(acc as any) || 'FREE',
        percent: Math.round(percent),
        remainingText: summary ? `${summary.remain}` : t('dashboard.quotaNormal', '正常'),
      });
    });

    safeCbCnAccounts.forEach((acc) => {
      const summary = getCodebuddyResourceSummary(acc as any);
      const percent = summary?.remainPercent ?? (summary?.usedPercent != null ? 100 - summary.usedPercent : 100);
      list.push({
        id: acc.id,
        email: acc.email,
        displayName: (acc as any).nickname || acc.email,
        subPlatform: 'cb-cn',
        platformLabel: '国内版',
        planBadge: getCodebuddyPlanBadge(acc as any) || 'FREE',
        percent: Math.round(percent),
        remainingText: summary ? `${summary.remain}` : t('dashboard.quotaNormal', '正常'),
      });
    });

    safeCbAccounts.forEach((acc) => {
      const summary = getCodebuddyResourceSummary(acc as any);
      const percent = summary?.remainPercent ?? (summary?.usedPercent != null ? 100 - summary.usedPercent : 100);
      list.push({
        id: acc.id,
        email: acc.email,
        displayName: (acc as any).nickname || acc.email,
        subPlatform: 'cb',
        platformLabel: '国际版',
        planBadge: getCodebuddyPlanBadge(acc as any) || 'FREE',
        percent: Math.round(percent),
        remainingText: summary ? `${summary.remain}` : t('dashboard.quotaNormal', '正常'),
      });
    });

    return list;
  }, [safeWbAccounts, safeCbCnAccounts, safeCbAccounts, t]);

  // Multi-account detailed list for Qoder suite
  const allQoderAccountsList = useMemo(() => {
    const list: Array<{
      id: string;
      email: string;
      displayName: string;
      subPlatform: 'qoder' | 'qoder_cn';
      platformLabel: string;
      planBadge: string;
      percent: number;
      remainingText: string;
    }> = [];

    safeQoderAccounts.forEach((acc) => {
      const sub = getQoderSubscriptionInfo(acc);
      const used = acc.credits_used ?? 0;
      const total = acc.credits_total ?? 100;
      const percent = acc.credits_usage_percent ?? (total > 0 ? Math.min(100, (used / total) * 100) : 0);
      const remaining = acc.credits_remaining ?? Math.max(0, total - used);
      list.push({
        id: acc.id,
        email: acc.email,
        displayName: acc.email,
        subPlatform: 'qoder',
        platformLabel: '国际版',
        planBadge: sub?.planTag || acc.plan_type || 'Standard',
        percent: Math.round(percent),
        remainingText: `${remaining}`,
      });
    });

    safeQoderCnAccounts.forEach((acc) => {
      const sub = getQoderSubscriptionInfo(acc);
      const used = acc.credits_used ?? 0;
      const total = acc.credits_total ?? 100;
      const percent = acc.credits_usage_percent ?? (total > 0 ? Math.min(100, (used / total) * 100) : 0);
      const remaining = acc.credits_remaining ?? Math.max(0, total - used);
      list.push({
        id: acc.id,
        email: acc.email,
        displayName: acc.email,
        subPlatform: 'qoder_cn',
        platformLabel: '国内版',
        planBadge: sub?.planTag || acc.plan_type || 'Standard',
        percent: Math.round(percent),
        remainingText: `${remaining}`,
      });
    });

    safeQwenworkAccounts.forEach((acc) => {
      const sub = getQoderSubscriptionInfo(acc);
      const used = acc.credits_used ?? 0;
      const total = acc.credits_total ?? 100;
      const percent = acc.credits_usage_percent ?? (total > 0 ? Math.min(100, (used / total) * 100) : 0);
      const remaining = acc.credits_remaining ?? Math.max(0, total - used);
      list.push({
        id: acc.id,
        email: acc.email,
        displayName: acc.email,
        subPlatform: 'qoder_cn',
        platformLabel: '千问办公',
        planBadge: sub?.planTag || acc.plan_type || 'Standard',
        percent: Math.round(percent),
        remainingText: `${remaining}`,
      });
    });

    return list;
  }, [safeQoderAccounts, safeQoderCnAccounts, safeQwenworkAccounts]);

  // Quota calculation for primary Qoder
  const qoderQuotaInfo = useMemo(() => {
    if (!activeQoderAccount) return null;
    const sub = getQoderSubscriptionInfo(activeQoderAccount);
    const used = activeQoderAccount.credits_used ?? 0;
    const total = activeQoderAccount.credits_total ?? 100;
    const percent =
      activeQoderAccount.credits_usage_percent ?? (total > 0 ? Math.min(100, (used / total) * 100) : 0);
    return {
      planTag: sub?.planTag || activeQoderAccount.plan_type || 'Standard',
      percent: Math.round(percent),
      used,
      total,
      remaining: activeQoderAccount.credits_remaining ?? Math.max(0, total - used),
    };
  }, [activeQoderAccount]);

  // Quota calculation for primary Trae
  const traeQuotaInfo = useMemo(() => {
    if (!primaryTraeAccount) return null;
    const usage = getTraeUsage(primaryTraeAccount);
    const badge = getTraePlanBadge(primaryTraeAccount);
    const percent = usage.usedPercent != null ? usage.usedPercent : 0;
    const usedText = usage.spentUsd != null ? `$${usage.spentUsd}` : (usage.basicUsage != null ? `${usage.basicUsage}` : t('dashboard.used', '已使用'));
    const remainingText = usage.totalUsd != null ? `${t('dashboard.total', '总额')}: $${usage.totalUsd}` : (usage.basicQuota != null ? `${t('dashboard.quota', '配额')}: ${usage.basicQuota}` : t('dashboard.quotaNormal', '配额正常'));
    return {
      planBadge: badge || 'Free',
      percent: Math.round(percent),
      usedText,
      remainingText,
    };
  }, [primaryTraeAccount, t]);

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="page-heading">
        <div className="dashboard-title-label">
          <h2>{t('dashboard.title', 'AI CodePass 仪表盘')}</h2>
          <span
            className="checkin-tag success"
            style={{ marginLeft: 6, cursor: onEasterEggTriggerClick ? 'pointer' : 'default' }}
            onClick={onEasterEggTriggerClick}
            title={onEasterEggTriggerClick ? '彩蛋模式' : undefined}
          >
            <Sparkles size={13} />
            {greetingText}
          </span>
        </div>

        <div className="dashboard-top-actions">
          {actionMessage && <span className="text-secondary text-sm">{actionMessage}</span>}

          {/* View Mode Toggle: 3-Column Bento Cards vs High-Density Rows */}
          <div className="view-mode-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => handleSetViewMode('grid')}
              title={t('dashboard.viewGrid', '3列卡片视图 (一行全览)')}
            >
              <LayoutGrid size={13} />
              <span>{t('dashboard.grid', '3列卡片')}</span>
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'row' ? 'active' : ''}`}
              onClick={() => handleSetViewMode('row')}
              title={t('dashboard.viewRow', '高密横排视图 (一行展示更多内容)')}
            >
              <List size={13} />
              <span>{t('dashboard.rowList', '高密横排')}</span>
            </button>
          </div>

          <button
            type="button"
            className="header-action-btn"
            onClick={() => setShowScheduleNotificationModal(true)}
            title={t('settings.tabs.notifications', '定时签到与通知')}
          >
            <Bell size={15} />
            <span>{t('settings.tabs.notifications', '定时签到与通知')}</span>
          </button>

          <button
            type="button"
            className="header-action-btn"
            onClick={() => setPrivacyMode((prev) => !prev)}
            title={privacyMode ? t('privacy.showSensitive', '显示敏感信息') : t('privacy.hideSensitive', '隐藏敏感信息')}
          >
            {privacyMode ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{privacyMode ? t('privacy.modeActive', '隐私模式') : t('privacy.modePlain', '明文模式')}</span>
          </button>

          <button
            type="button"
            className="header-action-btn header-action-primary"
            onClick={handleRefreshAll}
            disabled={isRefreshingAll}
            title={t('dashboard.refreshAllTitle', '刷新全部凭据与配额')}
          >
            <RotateCw size={15} className={isRefreshingAll ? 'spin' : ''} />
            <span>{isRefreshingAll ? t('dashboard.refreshingShort', '刷新中...') : t('dashboard.refreshAll', '一键刷新')}</span>
          </button>
        </div>
      </div>

      {/* Stats Row: Always neatly aligned in 1 row on desktop */}
      <div className="stats-row">
        <div className="stat-card stat-card-total">
          <div className="stat-icon-bg primary">
            <Users size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{grandTotalAccounts}</div>
            <div className="stat-label">{t('dashboard.totalAccounts', '总托管账号')}</div>
          </div>
          <span className="stat-status-badge">全托管</span>
        </div>

        <button
          type="button"
          className="stat-card stat-card-button stat-card-cb"
          onClick={() => onNavigate && onNavigate(cbTargetPage as Page)}
        >
          <div className="stat-icon-bg info">
            <CodebuddyIcon style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalCbCount}</div>
            <div className="stat-label" title="CodeBuddy & WorkBuddy">CodeBuddy</div>
          </div>
          <span className="stat-status-tag" title="WorkBuddy / 国内版 / 国际版">
            WB:{safeWbAccounts.length} · CN:{safeCbCnAccounts.length}
          </span>
        </button>

        <button
          type="button"
          className="stat-card stat-card-button stat-card-qoder"
          onClick={() => onNavigate && onNavigate(qoderTargetPage as Page)}
        >
          <div className="stat-icon-bg success">
            <QoderIcon style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalQoderCount}</div>
            <div className="stat-label">{t('dashboard.qoderAccounts', 'Qoder 账号')}</div>
          </div>
          {totalQoderInstances > 0 ? (
            <span className="stat-status-badge live" title={`${totalQoderInstances} 个实例运行中`}>
              <span className="live-pulse-dot" />
              {totalQoderInstances} 运行
            </span>
          ) : (
            <span className="stat-status-tag" title="国际版 / 国内版">
              国际:{safeQoderAccounts.length} · 国内:{safeQoderCnAccounts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className="stat-card stat-card-button stat-card-trae"
          onClick={() => onNavigate && onNavigate(traeTargetPage as Page)}
        >
          <div className="stat-icon-bg windsurf">
            <TraeIcon style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalTraeCount}</div>
            <div className="stat-label" title="Trae / Work / CN">Trae / Work</div>
          </div>
          <span className={`stat-status-badge ${traeCheckinStatus === t('dashboard.checkedIn', '今日已签到') ? 'success' : ''}`}>
            {traeCheckinStatus === t('dashboard.checkedIn', '今日已签到') ? '已签到' : '待签到'}
          </span>
        </button>
      </div>

      {/* VIEW MODE 1: 3-Column Bento Cards (一行显示3个平台卡片) */}
      {viewMode === 'grid' && (
        <div className="dashboard-cards-grid">
          {/* CARD 1: CodeBuddy / WorkBuddy */}
          <div className="platform-dedicated-card">
            <div className="card-top-bar">
              <div className="card-top-title">
                <CodebuddyIcon style={{ width: 20, height: 20 }} />
                <span>CodeBuddy & WorkBuddy</span>
                <span className={`platform-status-dot ${totalCbCount > 0 ? 'online' : 'offline'}`} title={totalCbCount > 0 ? '账号就绪' : '暂无账号'} />
              </div>
              <button
                type="button"
                className="card-top-nav-btn"
                onClick={() => onNavigate && onNavigate(cbTargetPage as Page)}
                title={t('dashboard.enterManage', '进入管理')}
                aria-label={t('dashboard.enterManage', '进入管理')}
              >
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="card-body">
              {/* Auto Check-in Badge & Action */}
              <div className="checkin-row">
                <span className="font-medium text-xs text-secondary">{t('dashboard.dailyCheckin', '自动签到')}</span>
                <div className="d-flex align-items-center gap-1">
                  <span
                    className={`checkin-tag ${
                      wbCheckinStatus === t('dashboard.checkedIn', '今日已签到') ? 'success' : 'warning'
                    }`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => void openWbAutoCheckinModal()}
                    title="点击配置批量自动签到时间与规则"
                  >
                    <CheckCircle2 size={12} />
                    {wbCheckinStatus === t('dashboard.checkedIn', '今日已签到')
                      ? t('dashboard.checkedIn', '已签到')
                      : t('dashboard.supportAutoCheckin', '支持自动签到')}
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    disabled={wbCheckinLoading}
                    onClick={handleWorkbuddyCheckin}
                  >
                    {wbCheckinLoading ? '...' : t('dashboard.checkinNow', '签到')}
                  </button>
                </div>
              </div>

              {/* Account snippet or Multi-Account mini list */}
              {totalCbCount === 0 ? (
                <div
                  className="account-empty-guide"
                  onClick={() => onNavigate && onNavigate(cbTargetPage as Page)}
                >
                  <Plus size={15} />
                  <span>{t('dashboard.emptyCbGuide', '尚未托管 CodeBuddy 账号，点击立即添加')}</span>
                </div>
              ) : allCbAccountsList.length > 1 ? (
                /* Multi-Account Mini-List: shows all accounts in compact rows */
                <div className="account-mini-list">
                  {allCbAccountsList.map((acc) => (
                    <div key={acc.id} className="account-mini-item">
                      <div className="account-mini-header">
                        <div className="account-mini-left">
                          <span className="account-mini-platform-tag">{acc.platformLabel}</span>
                          <span className="account-mini-name">{displayEmail(acc.displayName)}</span>
                        </div>
                        <div className="account-mini-right">
                          <span className="badge badge-info" style={{ fontSize: 10, padding: '1px 5px' }}>{acc.planBadge}</span>
                          <span className="account-mini-quota-text">余 {acc.remainingText}</span>
                        </div>
                      </div>
                      <div className="quota-bar-track" style={{ height: 3 }}>
                        <div
                          className={`quota-bar-fill ${acc.percent > 20 ? 'normal' : 'danger'}`}
                          style={{ width: `${Math.min(100, Math.max(5, acc.percent))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Single Account snippet */
                <div className="account-snippet">
                  <div className="account-snippet-header">
                    <span className="account-snippet-email">
                      {displayEmail((activeCbAccount as any)?.nickname || activeCbAccount?.email)}
                    </span>
                    {activeCbAccount && (
                      <span className="badge badge-info" style={{ fontSize: 11 }}>
                        {getCodebuddyPlanBadge(activeCbAccount as any) || 'Active'}
                      </span>
                    )}
                  </div>

                  {cbQuotaInfo && (
                    <div className="quota-bar-wrapper">
                      <div className="quota-bar-labels">
                        <span>{t('dashboard.resourceQuota', '资源额度')}</span>
                        <span>{cbQuotaInfo.remainingText}</span>
                      </div>
                      <div className="quota-bar-track">
                        <div
                          className={`quota-bar-fill ${
                            cbQuotaInfo.percent > 20 ? 'normal' : 'danger'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, cbQuotaInfo.percent))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-platform navigation pills */}
              <div className="sub-platform-pills">
                <button
                  type="button"
                  className={`sub-platform-pill ${safeCbAccounts.length > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('codebuddy')}
                  title="CodeBuddy 国际版"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>国际版 ({safeCbAccounts.length})</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${safeCbCnAccounts.length > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('codebuddy-cn')}
                  title="CodeBuddy 国内版"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>国内版 ({safeCbCnAccounts.length})</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${safeWbAccounts.length > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('workbuddy')}
                  title="WorkBuddy 腾讯协同版"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>WorkBuddy ({safeWbAccounts.length})</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${safeWbAiAccounts.length > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('workbuddy-ai')}
                  title="WorkBuddy AI 国际版"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>WorkBuddy AI ({safeWbAiAccounts.length})</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="card-footer-action"
              onClick={() => onNavigate && onNavigate(cbTargetPage as Page)}
            >
              <Play size={13} />
              <span>{t('dashboard.switchOrInject', '切换账号 / 注入 IDE')}</span>
            </button>
          </div>

          {/* CARD 2: Qoder */}
          <div className="platform-dedicated-card">
            <div className="card-top-bar">
              <div className="card-top-title">
                <QoderIcon style={{ width: 20, height: 20 }} />
                <span>Qoder</span>
                <span className={`platform-status-dot ${totalQoderCount > 0 ? 'online' : 'offline'}`} title={totalQoderCount > 0 ? '账号就绪' : '暂无账号'} />
              </div>
              <button
                type="button"
                className="card-top-nav-btn"
                onClick={() => onNavigate && onNavigate(qoderTargetPage as Page)}
                title={t('dashboard.enterManage', '进入管理')}
                aria-label={t('dashboard.enterManage', '进入管理')}
              >
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="card-body">
              {/* Daily Check-in & Multi-Instance overview */}
              <div className="checkin-row">
                <div className="d-flex align-items-center gap-2">
                  <CheckCircle2 size={16} className="text-secondary" />
                  <span className="font-medium text-xs">每日领 100 Credits</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="checkin-tag success" title="Qoder 国际版 / 国内版 / 千问办公 每日签到">
                    <CheckCircle2 size={12} />
                    <span>3端已适配</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    onClick={async () => {
                      try {
                        const tasks: Promise<unknown>[] = [];
                        if (safeQoderAccounts.length > 0) {
                          tasks.push(qoderService.claimQoderCheckin(safeQoderAccounts[0].id));
                        }
                        if (safeQoderCnAccounts.length > 0) {
                          tasks.push(qoderCnService.claimQoderCheckin(safeQoderCnAccounts[0].id));
                        }
                        if (safeQwenworkAccounts.length > 0) {
                          tasks.push(qwenworkService.claimQwenworkCheckin(safeQwenworkAccounts[0].id));
                        }
                        await Promise.allSettled(tasks);
                        await Promise.allSettled([
                          fetchQoderAccounts(),
                          fetchQoderCnAccounts(),
                          fetchQwenworkAccounts(),
                        ]);
                        setActionMessage('Qoder / Qoder 国内版 / 千问办公 每日签到完成（+100 Credits/端）！');
                        setTimeout(() => setActionMessage(null), 4500);
                      } catch (err) {
                        setActionMessage(`Qoder 签到失败: ${err instanceof Error ? err.message : String(err)}`);
                        setTimeout(() => setActionMessage(null), 4500);
                      }
                    }}
                  >
                    {t('dashboard.checkinNow', '签到')}
                  </button>
                </div>
              </div>

              {/* Account snippet or Multi-Account mini list */}
              {totalQoderCount === 0 ? (
                <div
                  className="account-empty-guide"
                  onClick={() => onNavigate && onNavigate(qoderTargetPage as Page)}
                >
                  <Plus size={15} />
                  <span>{t('dashboard.emptyQoderGuide', '尚未托管 Qoder 账号，点击立即添加')}</span>
                </div>
              ) : allQoderAccountsList.length > 1 ? (
                /* Multi-Account Mini-List: shows all accounts in compact rows */
                <div className="account-mini-list">
                  {allQoderAccountsList.map((acc) => (
                    <div key={acc.id} className="account-mini-item">
                      <div className="account-mini-header">
                        <div className="account-mini-left">
                          <span className="account-mini-platform-tag">{acc.platformLabel}</span>
                          <span className="account-mini-name">{displayEmail(acc.displayName)}</span>
                        </div>
                        <div className="account-mini-right">
                          <span className="badge badge-success" style={{ fontSize: 10, padding: '1px 5px' }}>{acc.planBadge}</span>
                          <span className="account-mini-quota-text">余 {acc.remainingText}</span>
                        </div>
                      </div>
                      <div className="quota-bar-track" style={{ height: 3 }}>
                        <div
                          className={`quota-bar-fill ${acc.percent < 80 ? 'normal' : 'warning'}`}
                          style={{ width: `${Math.min(100, Math.max(5, acc.percent))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="account-snippet">
                  <div className="account-snippet-header">
                    <div className="d-flex align-items-center gap-1">
                      <span className="account-mini-platform-tag">
                        {safeQoderAccounts.length > 0 ? '国际版' : '国内版'}
                      </span>
                      <span className="account-snippet-email">
                        {displayEmail(activeQoderAccount?.email)}
                      </span>
                    </div>
                    {qoderQuotaInfo && (
                      <span className="badge badge-success" style={{ fontSize: 11 }}>{qoderQuotaInfo.planTag}</span>
                    )}
                  </div>

                  {qoderQuotaInfo && (
                    <div className="quota-bar-wrapper">
                      <div className="quota-bar-labels">
                        <span>{t('dashboard.creditUsageRate', '额度使用率')}</span>
                        <span>{qoderQuotaInfo.percent}%</span>
                      </div>
                      <div className="quota-bar-track">
                        <div
                          className={`quota-bar-fill ${
                            qoderQuotaInfo.percent < 80 ? 'normal' : 'warning'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, qoderQuotaInfo.percent))}%` }}
                        />
                      </div>
                      <div className="text-muted text-xs d-flex justify-content-between mt-1">
                        <span>{t('dashboard.used', '已用')}: {qoderQuotaInfo.used}</span>
                        <span>{t('dashboard.remaining', '剩余')}: {qoderQuotaInfo.remaining}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-platform navigation pills */}
              <div className="sub-platform-pills">
                <button
                  type="button"
                  className={`sub-platform-pill ${safeQoderAccounts.length > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('qoder')}
                  title="Qoder 国际版"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>国际版 ({safeQoderAccounts.length})</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${safeQoderCnAccounts.length > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('qoder-cn')}
                  title="Qoder 国内版"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>国内版 ({safeQoderCnAccounts.length})</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${safeQwenworkAccounts.length > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('qwenwork')}
                  title="千问办公 (QwenWork CN)"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>千问办公 ({safeQwenworkAccounts.length})</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${totalQoderInstances > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('instances')}
                  title="多开实例配置"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>多开配置 ({totalQoderInstances})</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="card-footer-action"
              onClick={() => onNavigate && onNavigate(qoderTargetPage as Page)}
            >
              <Play size={13} />
              <span>{t('dashboard.switchOrInject', '切换账号 / 注入 IDE')}</span>
            </button>
          </div>

          {/* CARD 3: Trae */}
          <div className="platform-dedicated-card">
            <div className="card-top-bar">
              <div className="card-top-title">
                <TraeIcon style={{ width: 20, height: 20 }} />
                <span>Trae (字节跳动)</span>
                <span className={`platform-status-dot ${totalTraeCount > 0 ? 'online' : 'offline'}`} title={totalTraeCount > 0 ? '账号就绪' : '暂无账号'} />
              </div>
              <button
                type="button"
                className="card-top-nav-btn"
                onClick={() => onNavigate && onNavigate(traeTargetPage as Page)}
                title={t('dashboard.enterManage', '进入管理')}
                aria-label={t('dashboard.enterManage', '进入管理')}
              >
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="card-body">
              {/* Daily Check-in Badge */}
              <div className="checkin-row">
                <span className="font-medium text-xs text-secondary">{t('dashboard.dailyCheckinCredits', '签到领额度')}</span>
                <div className="d-flex align-items-center gap-1">
                  <span
                    className={`checkin-tag ${
                      traeCheckinStatus === t('dashboard.checkedIn', '今日已签到')
                        ? 'success'
                        : hasOnlyGlobalTraeAccounts
                          ? 'info'
                          : 'warning'
                    }`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowTraeCheckinModal(true)}
                    title={traeCheckinStatus || t('dashboard.supportDailyCheckin', '支持签到')}
                  >
                    <CheckCircle2 size={12} />
                    {traeCheckinStatus === t('dashboard.checkedIn', '今日已签到')
                      ? t('dashboard.checkedIn', '已签到')
                      : hasOnlyGlobalTraeAccounts
                        ? t('dashboard.traeGlobalMonthlyReset', '国际版(月度重置)')
                        : t('dashboard.notCheckedIn', '未签到')}
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    disabled={traeCheckinLoading}
                    onClick={hasOnlyGlobalTraeAccounts ? () => setShowTraeCheckinModal(true) : handleTraeCheckin}
                  >
                    {traeCheckinLoading
                      ? '...'
                      : hasOnlyGlobalTraeAccounts
                        ? t('dashboard.viewDetails', '详情')
                        : t('dashboard.checkinNow', '签到')}
                  </button>
                </div>
              </div>

              {/* Account snippet or Empty guide */}
              {totalTraeCount === 0 ? (
                <div
                  className="account-empty-guide"
                  onClick={() => onNavigate && onNavigate(traeTargetPage as Page)}
                >
                  <Plus size={15} />
                  <span>{t('dashboard.emptyTraeGuide', '尚未托管 Trae 账号，点击立即添加')}</span>
                </div>
              ) : (
                <div className="account-snippet">
                  <div className="account-snippet-header">
                    <span className="account-snippet-email">
                      {displayTraeAccount(primaryTraeAccount)}
                    </span>
                    {traeQuotaInfo && (
                      <span className="badge badge-info" style={{ fontSize: 11 }}>{traeQuotaInfo.planBadge}</span>
                    )}
                  </div>

                  {traeQuotaInfo && (
                    <div className="quota-bar-wrapper">
                      <div className="quota-bar-labels">
                        <span>{t('dashboard.advancedModelProgress', '模型使用进度')}</span>
                        <span>{traeQuotaInfo.percent}%</span>
                      </div>
                      <div className="quota-bar-track">
                        <div
                          className={`quota-bar-fill ${
                            traeQuotaInfo.percent < 80 ? 'normal' : 'warning'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, traeQuotaInfo.percent))}%` }}
                        />
                      </div>
                      <div className="text-muted text-xs d-flex justify-content-between mt-1">
                        <span>{traeQuotaInfo.usedText}</span>
                        <span>{traeQuotaInfo.remainingText}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-platform navigation pills */}
              <div className="sub-platform-pills">
                <button
                  type="button"
                  className={`sub-platform-pill ${traePlatformStats.trae > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('trae')}
                  title="Trae 国际版"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>Trae 国际版{traePlatformStats.trae > 0 ? ` (${traePlatformStats.trae})` : ''}</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${traePlatformStats.trae_solo > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('trae-solo')}
                  title="TRAE Work"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>Work{traePlatformStats.trae_solo > 0 ? ` (${traePlatformStats.trae_solo})` : ''}</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${traePlatformStats.trae_cn > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('trae-cn')}
                  title="Trae 国内版"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>国内版{traePlatformStats.trae_cn > 0 ? ` (${traePlatformStats.trae_cn})` : ''}</span>
                </button>
                <button
                  type="button"
                  className={`sub-platform-pill ${traePlatformStats.trae_solo_cn > 0 ? 'has-accounts' : ''}`}
                  onClick={() => onNavigate && onNavigate('trae-solo-cn')}
                  title="TRAE Work CN"
                >
                  <span className="sub-platform-pill-dot" />
                  <span>Work CN{traePlatformStats.trae_solo_cn > 0 ? ` (${traePlatformStats.trae_solo_cn})` : ''}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="card-footer-action"
              onClick={() => onNavigate && onNavigate(traeTargetPage as Page)}
            >
              <Play size={13} />
              <span>{t('dashboard.switchOrInject', '切换账号 / 注入 IDE')}</span>
            </button>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: High-Density Horizontal Rows (一行展示更多完整内容) */}
      {viewMode === 'row' && (
        <div className="dashboard-cards-row">
          {/* ROW 1: CodeBuddy & WorkBuddy */}
          <div className="platform-dedicated-row">
            {/* Col 1: Platform Brand */}
            <div className="row-col-platform">
              <div className="row-platform-brand">
                <CodebuddyIcon style={{ width: 24, height: 24 }} />
                <div className="row-platform-title-group">
                  <span className="row-platform-name">CodeBuddy & WorkBuddy</span>
                  <span className="row-platform-count">{totalCbCount} 个账号托管</span>
                </div>
              </div>
            </div>

            {/* Col 2: Check-in / Status */}
            <div className="row-col-status">
              <div className="row-status-buttons">
                <span
                  className={`checkin-tag ${
                    wbCheckinStatus === t('dashboard.checkedIn', '今日已签到') ? 'success' : 'warning'
                  }`}
                >
                  <CheckCircle2 size={12} />
                  {wbCheckinStatus || t('dashboard.supportAutoCheckin', '支持自动签到')}
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  disabled={wbCheckinLoading}
                  onClick={handleWorkbuddyCheckin}
                >
                  {wbCheckinLoading ? '...' : t('dashboard.checkinNow', '签到')}
                </button>
              </div>
            </div>

            {/* Col 3: Accounts & Quota */}
            <div className="row-col-accounts">
              {totalCbCount === 0 ? (
                <span className="text-secondary text-xs cursor-pointer" onClick={() => onNavigate && onNavigate(cbTargetPage as Page)}>
                  + 暂无账号，点击立即添加
                </span>
              ) : (
                <div className="row-account-details">
                  <div className="row-account-meta">
                    <span className="row-account-email">
                      {displayEmail((activeCbAccount as any)?.nickname || activeCbAccount?.email)}
                    </span>
                    <span className="badge badge-info" style={{ fontSize: 10, padding: '1px 5px' }}>
                      {getCodebuddyPlanBadge(activeCbAccount as any) || 'Active'}
                    </span>
                    {cbQuotaInfo && (
                      <span className="text-xs text-secondary">{cbQuotaInfo.remainingText}</span>
                    )}
                  </div>
                  {cbQuotaInfo && (
                    <div className="quota-bar-track" style={{ height: 3, maxWidth: 300 }}>
                      <div
                        className={`quota-bar-fill ${cbQuotaInfo.percent > 20 ? 'normal' : 'danger'}`}
                        style={{ width: `${Math.min(100, Math.max(5, cbQuotaInfo.percent))}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Col 4: Sub-platform Pills */}
            <div className="row-col-pills">
              <button
                type="button"
                className={`sub-platform-pill ${safeCbAccounts.length > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('codebuddy')}
                title="CodeBuddy 国际版"
              >
                <span className="sub-platform-pill-dot" />
                <span>国际版 ({safeCbAccounts.length})</span>
              </button>
              <button
                type="button"
                className={`sub-platform-pill ${safeCbCnAccounts.length > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('codebuddy-cn')}
                title="CodeBuddy 国内版"
              >
                <span className="sub-platform-pill-dot" />
                <span>国内版 ({safeCbCnAccounts.length})</span>
              </button>
              <button
                type="button"
                className={`sub-platform-pill ${safeWbAccounts.length > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('workbuddy')}
                title="WorkBuddy 腾讯协同版"
              >
                <span className="sub-platform-pill-dot" />
                <span>WorkBuddy ({safeWbAccounts.length})</span>
              </button>
              <button
                type="button"
                className={`sub-platform-pill ${safeWbAiAccounts.length > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('workbuddy-ai')}
                title="WorkBuddy AI 国际版"
              >
                <span className="sub-platform-pill-dot" />
                <span>WorkBuddy AI ({safeWbAiAccounts.length})</span>
              </button>
            </div>

            {/* Col 5: Actions */}
            <div className="row-col-actions">
              <button
                type="button"
                className="btn-row-action primary"
                onClick={() => onNavigate && onNavigate(cbTargetPage as Page)}
                title="切换账号 / 注入 IDE"
              >
                <Play size={12} />
                <span>注入 IDE</span>
              </button>
              <button
                type="button"
                className="btn-row-action"
                onClick={() => onNavigate && onNavigate(cbTargetPage as Page)}
              >
                <span>管理</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* ROW 2: Qoder */}
          <div className="platform-dedicated-row">
            {/* Col 1: Platform Brand */}
            <div className="row-col-platform">
              <div className="row-platform-brand">
                <QoderIcon style={{ width: 24, height: 24 }} />
                <div className="row-platform-title-group">
                  <span className="row-platform-name">Qoder</span>
                  <span className="row-platform-count">{totalQoderCount} 个账号托管</span>
                </div>
              </div>
            </div>

            {/* Col 2: Check-in / Status */}
            <div className="row-col-status">
              <span className={`checkin-tag ${totalQoderInstances > 0 ? 'info' : ''}`}>
                <Layers size={12} />
                {totalQoderInstances > 0 ? (
                  <>
                    <span className="live-pulse-dot" />
                    <span>{totalQoderInstances} 个实例运行中</span>
                  </>
                ) : (
                  <span>0 运行中</span>
                )}
              </span>
            </div>

            {/* Col 3: Accounts & Quota */}
            <div className="row-col-accounts">
              {totalQoderCount === 0 ? (
                <span className="text-secondary text-xs cursor-pointer" onClick={() => onNavigate && onNavigate(qoderTargetPage as Page)}>
                  + 暂无账号，点击立即添加
                </span>
              ) : (
                <div className="row-account-details">
                  <div className="row-account-meta">
                    <span className="account-mini-platform-tag">
                      {safeQoderAccounts.length > 0 ? '国际版' : '国内版'}
                    </span>
                    <span className="row-account-email">
                      {displayEmail(activeQoderAccount?.email)}
                    </span>
                    {qoderQuotaInfo && (
                      <>
                        <span className="badge badge-success" style={{ fontSize: 10, padding: '1px 5px' }}>{qoderQuotaInfo.planTag}</span>
                        <span className="text-xs text-secondary">已用 {qoderQuotaInfo.used} / 余 {qoderQuotaInfo.remaining}</span>
                      </>
                    )}
                  </div>
                  {qoderQuotaInfo && (
                    <div className="quota-bar-track" style={{ height: 3, maxWidth: 300 }}>
                      <div
                        className={`quota-bar-fill ${qoderQuotaInfo.percent < 80 ? 'normal' : 'warning'}`}
                        style={{ width: `${Math.min(100, Math.max(5, qoderQuotaInfo.percent))}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Col 4: Sub-platform Pills */}
            <div className="row-col-pills">
              <button
                type="button"
                className={`sub-platform-pill ${safeQoderAccounts.length > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('qoder')}
                title="Qoder 国际版"
              >
                <span className="sub-platform-pill-dot" />
                <span>国际版 ({safeQoderAccounts.length})</span>
              </button>
              <button
                type="button"
                className={`sub-platform-pill ${safeQoderCnAccounts.length > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('qoder-cn')}
                title="Qoder 国内版"
              >
                <span className="sub-platform-pill-dot" />
                <span>国内版 ({safeQoderCnAccounts.length})</span>
              </button>
              <button
                type="button"
                className={`sub-platform-pill ${totalQoderInstances > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('instances')}
                title="多开实例配置"
              >
                <span className="sub-platform-pill-dot" />
                <span>多开配置 ({totalQoderInstances})</span>
              </button>
            </div>

            {/* Col 5: Actions */}
            <div className="row-col-actions">
              <button
                type="button"
                className="btn-row-action primary"
                onClick={() => onNavigate && onNavigate(qoderTargetPage as Page)}
                title="切换账号 / 注入 IDE"
              >
                <Play size={12} />
                <span>注入 IDE</span>
              </button>
              <button
                type="button"
                className="btn-row-action"
                onClick={() => onNavigate && onNavigate(qoderTargetPage as Page)}
              >
                <span>管理</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* ROW 3: Trae */}
          <div className="platform-dedicated-row">
            {/* Col 1: Platform Brand */}
            <div className="row-col-platform">
              <div className="row-platform-brand">
                <TraeIcon style={{ width: 24, height: 24 }} />
                <div className="row-platform-title-group">
                  <span className="row-platform-name">Trae (字节跳动)</span>
                  <span className="row-platform-count">{totalTraeCount} 个账号托管</span>
                </div>
              </div>
            </div>

            {/* Col 2: Check-in / Status */}
            <div className="row-col-status">
              <div className="row-status-buttons">
                <span
                  className={`checkin-tag ${
                    traeCheckinStatus === t('dashboard.checkedIn', '今日已签到')
                      ? 'success'
                      : hasOnlyGlobalTraeAccounts
                        ? 'info'
                        : 'warning'
                  }`}
                >
                  <CheckCircle2 size={12} />
                  {traeCheckinStatus ||
                    (hasOnlyGlobalTraeAccounts
                      ? t('dashboard.traeGlobalMonthlyReset', '国际版(月度重置)')
                      : t('dashboard.supportDailyCheckin', '支持签到'))}
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  disabled={traeCheckinLoading}
                  onClick={hasOnlyGlobalTraeAccounts ? () => setShowTraeCheckinModal(true) : handleTraeCheckin}
                >
                  {traeCheckinLoading
                    ? '...'
                    : hasOnlyGlobalTraeAccounts
                      ? t('dashboard.viewDetails', '详情')
                      : t('dashboard.checkinNow', '签到')}
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => setShowTraeCheckinModal(true)}
                  title={t('dashboard.checkinDetails', '签到中心')}
                >
                  {t('dashboard.viewDetails', '详情')}
                </button>
              </div>
            </div>

            {/* Col 3: Accounts & Quota */}
            <div className="row-col-accounts">
              {totalTraeCount === 0 ? (
                <span className="text-secondary text-xs cursor-pointer" onClick={() => onNavigate && onNavigate(traeTargetPage as Page)}>
                  + 暂无账号，点击立即添加
                </span>
              ) : (
                <div className="row-account-details">
                  <div className="row-account-meta">
                    <span className="row-account-email">
                      {displayTraeAccount(primaryTraeAccount)}
                    </span>
                    {traeQuotaInfo && (
                      <>
                        <span className="badge badge-info" style={{ fontSize: 10, padding: '1px 5px' }}>{traeQuotaInfo.planBadge}</span>
                        <span className="text-xs text-secondary">{traeQuotaInfo.usedText} · {traeQuotaInfo.remainingText}</span>
                      </>
                    )}
                  </div>
                  {traeQuotaInfo && (
                    <div className="quota-bar-track" style={{ height: 3, maxWidth: 300 }}>
                      <div
                        className={`quota-bar-fill ${traeQuotaInfo.percent < 80 ? 'normal' : 'warning'}`}
                        style={{ width: `${Math.min(100, Math.max(5, traeQuotaInfo.percent))}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Col 4: Sub-platform Pills */}
            <div className="row-col-pills">
              <button
                type="button"
                className={`sub-platform-pill ${traePlatformStats.trae > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('trae')}
                title="Trae 国际版"
              >
                <span className="sub-platform-pill-dot" />
                <span>Trae 国际版{traePlatformStats.trae > 0 ? ` (${traePlatformStats.trae})` : ''}</span>
              </button>
              <button
                type="button"
                className={`sub-platform-pill ${traePlatformStats.trae_solo > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('trae-solo')}
                title="TRAE Work"
              >
                <span className="sub-platform-pill-dot" />
                <span>Work{traePlatformStats.trae_solo > 0 ? ` (${traePlatformStats.trae_solo})` : ''}</span>
              </button>
              <button
                type="button"
                className={`sub-platform-pill ${traePlatformStats.trae_cn > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('trae-cn')}
                title="Trae 国内版"
              >
                <span className="sub-platform-pill-dot" />
                <span>国内版{traePlatformStats.trae_cn > 0 ? ` (${traePlatformStats.trae_cn})` : ''}</span>
              </button>
              <button
                type="button"
                className={`sub-platform-pill ${traePlatformStats.trae_solo_cn > 0 ? 'has-accounts' : ''}`}
                onClick={() => onNavigate && onNavigate('trae-solo-cn')}
                title="TRAE Work CN"
              >
                <span className="sub-platform-pill-dot" />
                <span>Work CN{traePlatformStats.trae_solo_cn > 0 ? ` (${traePlatformStats.trae_solo_cn})` : ''}</span>
              </button>
            </div>

            {/* Col 5: Actions */}
            <div className="row-col-actions">
              <button
                type="button"
                className="btn-row-action primary"
                onClick={() => onNavigate && onNavigate(traeTargetPage as Page)}
                title="切换账号 / 注入 IDE"
              >
                <Play size={12} />
                <span>注入 IDE</span>
              </button>
              <button
                type="button"
                className="btn-row-action"
                onClick={() => onNavigate && onNavigate(traeTargetPage as Page)}
              >
                <span>管理</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showTraeCheckinModal && (
        <TraeCheckinModal
          accounts={safeTraeAccounts}
          onClose={() => setShowTraeCheckinModal(false)}
          onCheckinComplete={() => {
            fetchTraeAccounts();
            if (primaryTraeCnAccount) {
              traeService.getTraeCheckinStatus(primaryTraeCnAccount.id).then((res) => {
                setTraeCheckinStatus(
                  res.checked_in
                    ? t('dashboard.checkedIn', '今日已签到')
                    : t('dashboard.notCheckedIn', '今日未签到'),
                );
              });
            } else if (hasOnlyGlobalTraeAccounts) {
              setTraeCheckinStatus(t('dashboard.traeGlobalMonthlyReset', '国际版(月度重置)'));
            }
          }}
        />
      )}

      {showWbAutoCheckinModal && (
        <WorkbuddyAutoCheckinConfigModal
          config={wbAutoCheckinConfig}
          onSave={async (newConfig) => {
            await saveWorkbuddyAutoCheckinConfigAsync(newConfig);
            setWbAutoCheckinConfig(newConfig);
          }}
          onClose={() => setShowWbAutoCheckinModal(false)}
        />
      )}

      {showScheduleNotificationModal && (
        <ScheduleNotificationModal
          open={showScheduleNotificationModal}
          onClose={() => setShowScheduleNotificationModal(false)}
        />
      )}
    </div>
  );
}
