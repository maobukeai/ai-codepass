/**
 * Trae SOLO CN 签到弹窗
 *
 * 基于 CodebuddySuiteCheckinModal 模式，适配 Trae 的签到 API。
 */

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
  Trophy,
  Ban,
  Clock,
  Settings,
  Info,
} from 'lucide-react';
import { TraeAccount, isTraeCnAccountPlatform } from '../../types/trae';
import { TraeCheckinStatusResult, getTraeCheckinStatus, claimTraeCheckin } from '../../services/traeService';
import { useEscClose } from '../../hooks/useEscClose';
import { getTraeAccountDisplayEmail, getTraeAccountDisplayName } from '../../types/trae';
import { TraeAutoCheckinConfigModal } from './TraeAutoCheckinConfigModal';
import {
  getTraeAutoCheckinConfig,
  saveTraeAutoCheckinConfig,
  TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT,
  TraeAutoCheckinConfig,
} from '../../services/traeAutoCheckinService';

type CheckinUiState = 'loading' | 'available' | 'claimed' | 'inactive' | 'error';

interface AccountCheckinState {
  status: TraeCheckinStatusResult | null;
  uiState: CheckinUiState;
  checkingIn: boolean;
  error: string | null;
}

function resolveUiState(status: TraeCheckinStatusResult | null): CheckinUiState {
  if (!status) {
    return 'inactive';
  }
  if (status.checked_in) {
    return 'claimed';
  }
  return 'available';
}

function emptyAccountState(uiState: CheckinUiState = 'loading'): AccountCheckinState {
  return {
    status: null,
    uiState,
    checkingIn: false,
    error: null,
  };
}

interface TraeCheckinModalProps {
  accounts: TraeAccount[];
  onClose: () => void;
  onCheckinComplete?: () => void;
}

export function TraeCheckinModal({
  accounts,
  onClose,
  onCheckinComplete,
}: TraeCheckinModalProps) {
  const { t } = useTranslation();
  useEscClose(true, onClose);
  const [accountStates, setAccountStates] = useState<Record<string, AccountCheckinState>>({});
  const [checkAllLoading, setCheckAllLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [autoCheckinConfig, setAutoCheckinConfig] = useState<TraeAutoCheckinConfig>(() =>
    getTraeAutoCheckinConfig(),
  );
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    const handleConfigChange = () => {
      setAutoCheckinConfig(getTraeAutoCheckinConfig());
    };
    window.addEventListener(TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChange);
    return () => {
      window.removeEventListener(TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChange);
    };
  }, []);

  const updateAccountState = useCallback(
    (accountId: string, update: Partial<AccountCheckinState>) => {
      setAccountStates((prev) => ({
        ...prev,
        [accountId]: { ...prev[accountId], ...update } as AccountCheckinState,
      }));
    },
    [],
  );

  const fetchStatus = useCallback(
    async (accountId: string) => {
      const account = accounts.find((a) => a.id === accountId);
      if (account && !isTraeCnAccountPlatform(account)) {
        updateAccountState(accountId, {
          status: null,
          uiState: 'inactive',
          error: t(
            'trae.checkin.globalNotSupportedNotice',
            '国际版官方无每日签到活动（月度自动重置模式）',
          ),
        });
        return;
      }

      updateAccountState(accountId, { error: null, uiState: 'loading' });
      try {
        const status = await getTraeCheckinStatus(accountId);
        const uiState = resolveUiState(status);
        updateAccountState(accountId, { status, uiState, error: null });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        updateAccountState(accountId, {
          status: null,
          uiState: 'error',
          error: errMsg,
        });
      }
    },
    [accounts, t, updateAccountState],
  );

  const fetchAllStatus = useCallback(async () => {
    setRefreshLoading(true);
    await Promise.all(accounts.map((account) => fetchStatus(account.id)));
    setRefreshLoading(false);
  }, [accounts, fetchStatus]);

  const handleCheck = useCallback(
    async (accountId: string) => {
      const account = accounts.find((a) => a.id === accountId);
      if (account && !isTraeCnAccountPlatform(account)) {
        return;
      }

      updateAccountState(accountId, { checkingIn: true, error: null });
      try {
        const result = await claimTraeCheckin(accountId);
        updateAccountState(accountId, {
          status: result,
          uiState: 'claimed',
          checkingIn: false,
          error: null,
        });
        onCheckinComplete?.();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // 重新查询状态
        try {
          const status = await getTraeCheckinStatus(accountId);
          const uiState = resolveUiState(status);
          updateAccountState(accountId, {
            status,
            uiState,
            checkingIn: false,
            error: uiState === 'claimed' ? null : errMsg,
          });
        } catch {
          updateAccountState(accountId, {
            checkingIn: false,
            error: errMsg,
          });
        }
      }
    },
    [accounts, updateAccountState, onCheckinComplete],
  );

  const handleCheckAll = useCallback(async () => {
    setCheckAllLoading(true);
    const availableAccounts = accounts.filter((account) => {
      if (!isTraeCnAccountPlatform(account)) return false;
      const state = accountStates[account.id];
      return state?.uiState === 'available';
    });
    for (const account of availableAccounts) {
      await handleCheck(account.id);
    }
    setCheckAllLoading(false);
  }, [accounts, accountStates, handleCheck]);

  useEffect(() => {
    void fetchAllStatus();
  }, [fetchAllStatus]);

  const claimedCount = accounts.filter((account) => {
    const state = accountStates[account.id];
    return state?.uiState === 'claimed';
  }).length;

  const availableCount = accounts.filter((account) => {
    const state = accountStates[account.id];
    return state?.uiState === 'available';
  }).length;

  const errorCount = accounts.filter((account) => {
    const state = accountStates[account.id];
    return state?.uiState === 'error';
  }).length;

  const globalAccountCount = accounts.filter((account) => !isTraeCnAccountPlatform(account)).length;
  const hasOnlyGlobalAccounts = accounts.length > 0 && globalAccountCount === accounts.length;

  const getDisplayEmail = useCallback(
    (account: TraeAccount) => {
      const name = getTraeAccountDisplayName(account);
      if (name && name !== 'unknown') return name;
      const email = getTraeAccountDisplayEmail(account);
      if (email && email !== 'unknown') return email;
      return account.nickname || account.id;
    },
    [],
  );


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
            <CalendarCheck size={20} /> {t('trae.checkin.modalTitle', 'TRAE Work CN 每日签到')}
          </h2>
          <button className="modal-close" onClick={onClose}>
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
            {errorCount > 0 && (
              <span className="checkin-stat error">
                <Ban size={14} /> {errorCount} {t('workbuddy.checkin.errors', '异常')}
              </span>
            )}
            {globalAccountCount > 0 && (
              <span
                className="checkin-stat"
                style={{ opacity: 0.85 }}
                title={t(
                  'trae.checkin.globalCountTooltip',
                  'Trae 国际版采用月度自动重置模式，官方无每日签到活动',
                )}
              >
                <Ban size={14} /> {globalAccountCount} {t('trae.checkin.globalCount', '国际版(免签)')}
              </span>
            )}
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
                      '批量自动签到未开启：可统一为所有账号定时签到（点击设置）',
                    )
              }
            >
              <Clock size={13} />
              {autoCheckinConfig.enabled
                ? `${t('workbuddy.checkin.autoCheckinLabel', '批量自动签到')} (${
                    autoCheckinConfig.startTime
                  }-${autoCheckinConfig.endTime})`
                : t('workbuddy.checkin.autoCheckinOff', '批量自动签到未开启')}
            </span>
          </div>
          <div className="checkin-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void fetchAllStatus()}
              disabled={refreshLoading}
            >
              {refreshLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {t('workbuddy.checkin.refreshStatus', '刷新状态')}
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
              {t('workbuddy.checkin.checkAll', '一键签到')}
            </button>
          </div>
        </div>

        <div className="modal-body checkin-modal-body">
          {hasOnlyGlobalAccounts && (
            <div
              style={{
                margin: '12px 16px 8px',
                padding: '12px 14px',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.22)',
                borderRadius: '8px',
                fontSize: '13px',
                lineHeight: '1.6',
                color: 'var(--text-secondary, #94a3b8)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <Info size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: 'var(--text-primary, #f1f5f9)', display: 'block', marginBottom: '3px' }}>
                  {t('trae.checkin.globalNoticeTitle', '关于 Trae 国际版签到说明')}
                </strong>
                <div>
                  {t(
                    'trae.checkin.globalNoticeDesc',
                    'Trae 国际版 (trae.ai / TRAE Work) 官方采用每月 1 日自动重置免费额度机制（例如每月自动重置 $10 体验额度），未开设每日签到赚积分活动。每日签到仅对 Trae 国内版 (trae.cn / 微信/手机号/抖音登录) 开放。',
                  )}
                </div>
              </div>
            </div>
          )}
          {accounts.length === 0 ? (
            <div className="checkin-empty">
              <p>{t('workbuddy.checkin.noAccounts', '暂无账号')}</p>
            </div>
          ) : (
            <div className="checkin-account-list">
              {accounts.map((account) => {
                const state = accountStates[account.id] || emptyAccountState();
                const displayEmail = getDisplayEmail(account);
                const isGlobal = !isTraeCnAccountPlatform(account);

                return (
                  <div key={account.id} className="checkin-account-row">
                    <div className="checkin-account-info">
                      <span className="checkin-account-name">{displayEmail}</span>
                      {state.status && (
                        <span className="checkin-streak-badge">
                          <Flame size={12} />
                          {t('workbuddy.checkin.streakDays', '连续 {{days}} 天', {
                            days: state.status.consecutive_days,
                          })}
                        </span>
                      )}
                      {state.status && state.status.total_credits > 0 && (
                        <span className="checkin-credit-badge">
                          <Trophy size={12} />
                          {t('workbuddy.checkin.totalCredits', '{{credits}} 积分', {
                            credits: state.status.total_credits,
                          })}
                        </span>
                      )}
                    </div>

                    <div className="checkin-account-action">
                      {state.uiState === 'loading' && (
                        <Loader2 size={16} className="animate-spin" />
                      )}
                      {state.uiState === 'error' && (
                        <span className="checkin-error-text" title={state.error || ''}>
                          {t('workbuddy.checkin.error', '查询失败')}
                        </span>
                      )}
                      {state.uiState === 'inactive' && (
                        <span
                          className="checkin-inactive"
                          title={
                            isGlobal
                              ? t(
                                  'trae.checkin.globalNoCheckinTooltip',
                                  'Trae 国际版为月度自动重置模式，官方无每日签到活动',
                                )
                              : state.error || ''
                          }
                        >
                          <Ban size={14} />
                          {isGlobal
                            ? t('trae.checkin.globalMonthlyReset', '国际版(月度重置)')
                            : t('workbuddy.checkin.inactive', '不可用')}
                        </span>
                      )}
                      {state.uiState === 'claimed' && (
                        <span className="checkin-claimed">
                          <CheckCircle size={14} />
                          {t('workbuddy.checkin.claimed', '已领取')}
                        </span>
                      )}
                      {state.uiState === 'available' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => void handleCheck(account.id)}
                          disabled={state.checkingIn}
                        >
                          {state.checkingIn ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Gift size={14} />
                          )}
                          {t('workbuddy.checkin.checkin', '签到')}
                        </button>
                      )}
                    </div>
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
      <TraeAutoCheckinConfigModal
        config={autoCheckinConfig}
        onSave={(newConfig) => {
          saveTraeAutoCheckinConfig(newConfig);
          setAutoCheckinConfig(newConfig);
        }}
        onClose={() => setShowConfigModal(false)}
      />
    )}
  </>
);

return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
