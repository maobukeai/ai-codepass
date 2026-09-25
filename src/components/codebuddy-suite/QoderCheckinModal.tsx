import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  ChevronLeft,
  Gift,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  CalendarCheck,
  Flame,
  Settings,
  Clock,
} from 'lucide-react';
import type { QoderAccount } from '../../types/qoder';
import { useEscClose } from '../../hooks/useEscClose';
import { QoderAutoCheckinConfigModal } from './QoderAutoCheckinConfigModal';
import {
  getQoderAutoCheckinConfig,
  saveQoderAutoCheckinConfig,
  QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT,
  QoderAutoCheckinConfig,
} from '../../services/qoderAutoCheckinService';
import * as qoderGlobalService from '../../services/qoderService';
import * as qoderCnService from '../../services/qoderCnService';
import * as qwenworkService from '../../services/qwenworkService';

export interface QoderCheckinModalProps {
  accounts: QoderAccount[];
  platformId?: 'qoder' | 'qoder_cn' | 'qwenwork';
  onClose: () => void;
  onCheckinComplete?: () => void;
}

type CheckinUiState = 'loading' | 'available' | 'claimed' | 'error';

interface AccountCheckinState {
  status: {
    active: boolean;
    today_checked_in: boolean;
    streak_days: number;
    daily_credit: number;
    today_credit: number | null;
    checkin_dates?: string[] | null;
    message?: string;
  } | null;
  uiState: CheckinUiState;
  checkingIn: boolean;
  error: string | null;
  checkinMessage: string | null;
}

function resolveUiState(status: { today_checked_in: boolean } | null): CheckinUiState {
  if (!status) return 'loading';
  if (status.today_checked_in) return 'claimed';
  return 'available';
}

function emptyAccountState(uiState: CheckinUiState = 'loading'): AccountCheckinState {
  return {
    status: null,
    uiState,
    checkingIn: false,
    error: null,
    checkinMessage: null,
  };
}

export function QoderCheckinModal({
  accounts,
  platformId = 'qoder',
  onClose,
  onCheckinComplete,
}: QoderCheckinModalProps) {
  const { t } = useTranslation();
  useEscClose(true, onClose);

  const [accountStates, setAccountStates] = useState<Record<string, AccountCheckinState>>({});
  const [checkAllLoading, setCheckAllLoading] = useState(false);
  const [checkAllProgress, setCheckAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [autoCheckinConfig, setAutoCheckinConfig] = useState<QoderAutoCheckinConfig>(() =>
    getQoderAutoCheckinConfig(),
  );

  const isQwenwork = platformId === 'qwenwork';
  const isCn = platformId === 'qoder_cn';
  const platformLabel = isQwenwork ? '千问办公' : isCn ? 'Qoder 国内版' : 'Qoder 国际版';

  const statusFn = useCallback(
    (accountId: string) => {
      if (isQwenwork) return qwenworkService.getQoderCheckinStatus(accountId);
      if (isCn) return qoderCnService.getQoderCheckinStatus(accountId);
      return qoderGlobalService.getQoderCheckinStatus(accountId);
    },
    [isCn, isQwenwork],
  );

  const claimFn = useCallback(
    (accountId: string) => {
      if (isQwenwork) return qwenworkService.claimQwenworkCheckin(accountId);
      if (isCn) return qoderCnService.claimQoderCheckin(accountId);
      return qoderGlobalService.claimQoderCheckin(accountId);
    },
    [isCn, isQwenwork],
  );

  useEffect(() => {
    const handleConfigChange = () => {
      setAutoCheckinConfig(getQoderAutoCheckinConfig());
    };
    window.addEventListener(QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChange);
    return () => {
      window.removeEventListener(QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChange);
    };
  }, []);

  const updateAccountState = useCallback(
    (accountId: string, patch: Partial<AccountCheckinState>) => {
      setAccountStates((prev) => {
        const previous = prev[accountId] ?? emptyAccountState();
        const next: AccountCheckinState = {
          ...previous,
          ...patch,
        };
        if (patch.status !== undefined && patch.uiState === undefined) {
          next.uiState = resolveUiState(patch.status);
        }
        return {
          ...prev,
          [accountId]: next,
        };
      });
    },
    [],
  );

  const fetchStatusForAccount = useCallback(
    async (accountId: string) => {
      try {
        const status = await statusFn(accountId);
        updateAccountState(accountId, {
          status,
          uiState: resolveUiState(status),
          checkingIn: false,
          error: null,
        });
        return status;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        updateAccountState(accountId, {
          status: null,
          uiState: 'error',
          checkingIn: false,
          error: message,
        });
        return null;
      }
    },
    [statusFn, updateAccountState],
  );

  const fetchAllStatus = useCallback(async () => {
    setRefreshLoading(true);
    const newStates: Record<string, AccountCheckinState> = {};
    for (const acc of accounts) {
      newStates[acc.id] = emptyAccountState('loading');
    }
    setAccountStates(newStates);

    await Promise.allSettled(
      accounts.map(async (acc) => {
        try {
          const status = await statusFn(acc.id);
          newStates[acc.id] = {
            status,
            uiState: resolveUiState(status),
            checkingIn: false,
            error: null,
            checkinMessage: null,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          newStates[acc.id] = {
            status: null,
            uiState: 'error',
            checkingIn: false,
            error: message,
            checkinMessage: null,
          };
        }
      }),
    );

    setAccountStates({ ...newStates });
    setRefreshLoading(false);
  }, [accounts, statusFn]);

  useEffect(() => {
    if (accounts.length > 0) {
      void fetchAllStatus();
    }
  }, [accounts, fetchAllStatus]);

  // 单个账号独立签到（解决一个个号签到的核心诉求）
  const handleSingleCheckin = useCallback(
    async (accountId: string) => {
      updateAccountState(accountId, {
        checkingIn: true,
        error: null,
        checkinMessage: null,
      });

      const todayStr = qoderGlobalService.getTodayDateString();

      try {
        const res = await claimFn(accountId);

        const isClaimed = res.success || res.alreadyCheckedIn || (res as any).already_checked_in;
        const msg = res.message || (isClaimed ? '签到成功 +100 Credits' : '签到未成功');

        // 本地立即打上已领取状态
        setAccountStates((prev) => {
          const previous = prev[accountId] ?? emptyAccountState();
          const existingDates = previous.status?.checkin_dates || [];
          const updatedDates = Array.from(new Set([todayStr, ...existingDates])).sort().reverse();
          const nextStreak = (previous.status?.streak_days || 0) + (res.alreadyCheckedIn ? 0 : 1);

          return {
            ...prev,
            [accountId]: {
              ...previous,
              checkingIn: false,
              uiState: 'claimed',
              checkinMessage: msg,
              status: {
                active: true,
                today_checked_in: true,
                streak_days: Math.max(1, nextStreak),
                daily_credit: 100,
                today_credit: 100,
                checkin_dates: updatedDates,
                message: msg,
              },
            },
          };
        });

        // 异步刷新状态
        void fetchStatusForAccount(accountId);
        onCheckinComplete?.();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        updateAccountState(accountId, {
          checkingIn: false,
          error: message,
          uiState: 'error',
        });
      }
    },
    [claimFn, fetchStatusForAccount, onCheckinComplete, updateAccountState],
  );

  // 一键签到：按序一个个账号签到，带动态进度反馈与延时，避免全部一起冲撞
  const handleCheckAll = useCallback(async () => {
    const available = accounts.filter((a) => {
      const state = accountStates[a.id];
      return state?.uiState === 'available';
    });

    if (available.length === 0) return;

    setCheckAllLoading(true);
    setCheckAllProgress({ current: 0, total: available.length });

    for (let i = 0; i < available.length; i++) {
      const acc = available[i];
      setCheckAllProgress({ current: i + 1, total: available.length });
      await handleSingleCheckin(acc.id);

      // 账号间插入防抖延时
      if (i < available.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    setCheckAllLoading(false);
    setCheckAllProgress(null);
    onCheckinComplete?.();
  }, [accounts, accountStates, handleSingleCheckin, onCheckinComplete]);

  const claimedCount = Object.values(accountStates).filter((s) => s.uiState === 'claimed').length;
  const availableCount = Object.values(accountStates).filter((s) => s.uiState === 'available').length;

  const modalContent = (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal checkin-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <button
              className="btn btn-secondary icon-only"
              onClick={onClose}
              title={t('common.back', '返回')}
              aria-label={t('common.back', '返回')}
            >
              <ChevronLeft size={14} />
            </button>
            <h2>
              <CalendarCheck size={20} /> {t('common.dailyCheckin', '每日签到')} - {platformLabel}
            </h2>
            <button className="modal-close" onClick={onClose} aria-label={t('common.close', '关闭')}>
              <X size={18} />
            </button>
          </div>

          <div className="checkin-modal-toolbar">
            <div className="checkin-summary">
              <span className="checkin-stat checked">
                <CheckCircle size={14} /> {claimedCount} {t('workbuddy.checkin.checkedIn', '已签到')}
              </span>
              <span className="checkin-stat unchecked">
                <XCircle size={14} /> {availableCount} {t('workbuddy.checkin.notCheckedIn', '未签到')}
              </span>
              <span
                className={`checkin-stat auto-checkin-badge ${
                  autoCheckinConfig.enabled ? 'enabled' : 'disabled'
                }`}
                onClick={() => setShowConfigModal(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowConfigModal(true);
                  }
                }}
                title={
                  autoCheckinConfig.enabled
                    ? t(
                        'workbuddy.checkin.autoCheckinEnabledHint',
                        '批量自动签到已开启：将在 {{start}} 至 {{end}} 随机为所有账号打散签到（点击设置）',
                        {
                          start: autoCheckinConfig.startTime,
                          end: autoCheckinConfig.endTime,
                        },
                      )
                    : t(
                        'workbuddy.checkin.autoCheckinDisabledHint',
                        '批量自动签到未开启：可统一为所有账号定时打散签到（点击设置）',
                      )
                }
              >
                <Clock size={13} />
                {autoCheckinConfig.enabled
                  ? `${t('workbuddy.checkin.autoCheckinLabel', '自动签到')} (${autoCheckinConfig.startTime}-${autoCheckinConfig.endTime})`
                  : t('workbuddy.checkin.autoCheckinOff', '自动签到未开启')}
              </span>
            </div>

            <div className="checkin-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void fetchAllStatus()}
                disabled={refreshLoading || checkAllLoading}
              >
                {refreshLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                <span>{t('workbuddy.checkin.refreshStatus', '刷新状态')}</span>
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void handleCheckAll()}
                disabled={checkAllLoading || availableCount === 0}
              >
                {checkAllLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Gift size={14} />
                )}
                <span>
                  {checkAllProgress
                    ? `签到中 (${checkAllProgress.current}/${checkAllProgress.total})...`
                    : t('workbuddy.checkin.checkAll', '一键签到')}
                </span>
              </button>
            </div>
          </div>

          <div className="modal-body checkin-modal-body">
            {accounts.length === 0 ? (
              <div className="checkin-empty">{t('accounts.noAccounts', '暂无账号')}</div>
            ) : (
              <div className="checkin-account-list">
                {accounts.map((account) => {
                  const state = accountStates[account.id];
                  const displayEmail = account.display_name
                    ? `${account.display_name} (${account.email})`
                    : account.email || account.user_id || account.id;

                  const uiState: CheckinUiState = state?.uiState ?? 'loading';
                  const isCheckingIn = state?.checkingIn ?? false;
                  const isClaimed = uiState === 'claimed';
                  const isAvailable = uiState === 'available';
                  const isError = uiState === 'error';
                  const isLoading = uiState === 'loading' || state === undefined;

                  const streakDays = state?.status?.streak_days ?? 0;
                  const checkinDates = state?.status?.checkin_dates || [];

                  return (
                    <div
                      key={account.id}
                      className={`checkin-account-row ${isClaimed ? 'checked' : ''}`}
                    >
                      <div className="checkin-account-info">
                        <span className="checkin-account-name" title={displayEmail}>
                          {displayEmail}
                        </span>
                      </div>

                      <div className="checkin-account-status">
                        {isLoading ? (
                          <span className="checkin-status-unknown">
                            <Loader2 size={13} className="animate-spin" />
                            {t('workbuddy.checkin.querying', '查询中...')}
                          </span>
                        ) : isError ? (
                          <span className="checkin-status-no">
                            <XCircle size={16} />
                            {t('workbuddy.checkin.queryFailed', '状态查询失败')}
                          </span>
                        ) : isClaimed ? (
                          <span className="checkin-status-yes">
                            <CheckCircle size={16} />
                            {t('workbuddy.checkin.checkedIn', '已签到')}
                          </span>
                        ) : isAvailable ? (
                          <span className="checkin-status-no">
                            <XCircle size={16} />
                            {t('workbuddy.checkin.notCheckedIn', '未签到')}
                          </span>
                        ) : null}

                        {streakDays > 0 && (
                          <span className="checkin-streak-badge">
                            <Flame size={12} />
                            {t('workbuddy.checkin.streakDays', '{{days}} 天', {
                              days: streakDays,
                            })}
                          </span>
                        )}

                        <span className="checkin-credit-badge">
                          <Gift size={12} />
                          +100 Credits
                        </span>
                      </div>

                      <div className="checkin-account-action">
                        {isCheckingIn ? (
                          <button className="btn btn-primary btn-sm" disabled>
                            <Loader2 size={14} className="animate-spin" />
                            <span>{t('workbuddy.checkin.button.loading', '签到中...')}</span>
                          </button>
                        ) : isClaimed ? (
                          <button className="btn btn-ghost btn-sm" disabled>
                            <CheckCircle size={14} />
                            <span>{t('workbuddy.checkin.claimed', '已领取')}</span>
                          </button>
                        ) : isAvailable ? (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => void handleSingleCheckin(account.id)}
                            disabled={checkAllLoading}
                          >
                            <Gift size={14} />
                            <span>{t('workbuddy.checkin.button', '立即签到')}</span>
                          </button>
                        ) : isError ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => void handleSingleCheckin(account.id)}
                            disabled={checkAllLoading}
                          >
                            <RefreshCw size={14} />
                            <span>{t('workbuddy.checkin.retry', '重试')}</span>
                          </button>
                        ) : (
                          <button className="btn btn-ghost btn-sm" disabled>
                            <CheckCircle size={14} />
                            <span>{t('workbuddy.checkin.claimed', '已领取')}</span>
                          </button>
                        )}
                      </div>

                      {state?.checkinMessage && (
                        <div className="checkin-account-success">
                          <CheckCircle size={13} />
                          <span>{state.checkinMessage}</span>
                        </div>
                      )}

                      {checkinDates && checkinDates.length > 0 && (
                        <div className="checkin-dates">
                          {t('workbuddy.checkin.recentDates', '近期签到：')}
                          {checkinDates.slice(0, 5).map((d) => (
                            <span key={d} className="checkin-date-tag">
                              {d}
                            </span>
                          ))}
                          {checkinDates.length > 5 && (
                            <span
                              className="checkin-date-tag"
                              title={checkinDates.slice(5).join(', ')}
                            >
                              ...
                            </span>
                          )}
                        </div>
                      )}

                      {state?.error && (
                        <div className="checkin-account-error">
                          <XCircle size={12} /> {state.error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-footer checkin-modal-footer">
            <button
              className="auto-checkin-setting-btn"
              onClick={() => setShowConfigModal(true)}
              title={t('workbuddy.checkin.autoCheckinSettings', '批量自动签到设置')}
            >
              <Settings size={14} />
              <span>{t('workbuddy.checkin.autoCheckinSettings', '自动签到设置')}</span>
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              {t('common.close', '关闭')}
            </button>
          </div>
        </div>
      </div>

      {showConfigModal && (
        <QoderAutoCheckinConfigModal
          config={autoCheckinConfig}
          onSave={(newConfig) => {
            saveQoderAutoCheckinConfig(newConfig);
            setAutoCheckinConfig(newConfig);
          }}
          onClose={() => setShowConfigModal(false)}
        />
      )}
    </>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
