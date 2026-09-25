import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  Clock,
  AlertCircle,
  Settings,
  History,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { TimeButtonPicker } from '../../components/TimeButtonPicker';
import { useEscClose } from '../../hooks/useEscClose';
import {
  QoderAutoCheckinConfig,
  QoderAutoCheckinLogItem,
  parseTimeToMinutes,
  getQoderAutoCheckinLogs,
  clearQoderAutoCheckinLogs,
  runQoderAutoCheckinCycleIfNeeded,
  QODER_AUTO_CHECKIN_LOGS_CHANGED_EVENT,
} from '../../services/qoderAutoCheckinService';
import { useQoderAccountStore } from '../../stores/useQoderAccountStore';
import { useQoderCnAccountStore } from '../../stores/useQoderCnAccountStore';
import { useQwenworkAccountStore } from '../../stores/useQwenworkAccountStore';

interface QoderAutoCheckinConfigModalProps {
  config: QoderAutoCheckinConfig;
  onSave: (newConfig: QoderAutoCheckinConfig) => void;
  onClose: () => void;
}

export function QoderAutoCheckinConfigModal({
  config,
  onSave,
  onClose,
}: QoderAutoCheckinConfigModalProps) {
  const { t } = useTranslation();
  useEscClose(true, onClose);

  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');
  const [enabled, setEnabled] = useState(config.enabled);
  const [startTime, setStartTime] = useState(config.startTime || '10:05');
  const [endTime, setEndTime] = useState(config.endTime || '14:00');
  const [error, setError] = useState<string | null>(null);

  const qoderAccounts = useQoderAccountStore((state) => state.accounts) || [];
  const qoderCnAccounts = useQoderCnAccountStore((state) => state.accounts) || [];
  const qwenworkAccounts = useQwenworkAccountStore((state) => state.accounts) || [];
  const totalCount = qoderAccounts.length + qoderCnAccounts.length + qwenworkAccounts.length;

  const [logs, setLogs] = useState<QoderAutoCheckinLogItem[]>(() =>
    getQoderAutoCheckinLogs(),
  );
  const [manualTesting, setManualTesting] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleLogsChange = () => {
      setLogs(getQoderAutoCheckinLogs());
    };
    window.addEventListener(QODER_AUTO_CHECKIN_LOGS_CHANGED_EVENT, handleLogsChange);
    return () => {
      window.removeEventListener(QODER_AUTO_CHECKIN_LOGS_CHANGED_EVENT, handleLogsChange);
    };
  }, []);

  const handleSave = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      setError(t('workbuddy.autoCheckin.error.invalidTime', '开始时间格式错误'));
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
      setError(t('workbuddy.autoCheckin.error.invalidTime', '结束时间格式错误'));
      return;
    }
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (endMinutes < startMinutes) {
      setError(t('workbuddy.autoCheckin.error.endBeforeStart', '结束时间不能早于开始时间'));
      return;
    }
    setError(null);
    onSave({ enabled, startTime, endTime });
    onClose();
  };

  const handleManualTest = async () => {
    setManualTesting(true);
    try {
      await runQoderAutoCheckinCycleIfNeeded(true);
    } finally {
      setManualTesting(false);
    }
  };

  const toggleLogExpand = (logId: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [logId]: !prev[logId],
    }));
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={14} className="checkin-status-success" />;
      case 'already':
      case 'already_checked':
        return <CheckCircle size={14} className="checkin-status-already" />;
      case 'failed':
        return <XCircle size={14} className="checkin-status-failed" />;
      default:
        return null;
    }
  };

  const statusText = (status: string) => {
    switch (status) {
      case 'success':
        return t('common.success', '成功');
      case 'already':
      case 'already_checked':
        return t('common.alreadyChecked', '已签到');
      case 'failed':
        return t('common.failed', '失败');
      default:
        return status;
    }
  };

  const modalContent = (
    <div className="modal-overlay auto-checkin-config-overlay" onClick={onClose}>
      <div
        className="modal auto-checkin-config-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '540px' }}
      >
        <div className="modal-header auto-checkin-modal-header">
          <div className="auto-checkin-tabs-nav">
            <button
              className={`auto-checkin-tab-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              type="button"
            >
              <Settings size={14} />
              {t('workbuddy.autoCheckin.settings', '批量自动签到设置')}
            </button>
            <button
              className={`auto-checkin-tab-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
              type="button"
            >
              <History size={14} />
              {t('workbuddy.autoCheckin.history', '自动签到记录')}
              {logs.length > 0 && <span className="tab-count-badge">{logs.length}</span>}
            </button>
          </div>

          <button className="modal-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body auto-checkin-config-body">
          {error && (
            <div className="message-bar error">
              <AlertCircle size={14} />
              <span>{error}</span>
              <button onClick={() => setError(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="auto-checkin-settings">
              <label className="setting-row">
                <div>
                  <div style={{ fontWeight: 600 }}>启用 Qoder / 千问办公 批量自动签到</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    对所有已添加账号（Qoder 国际版、国内版与阿里千问办公，共 {totalCount} 个）生效。每天定时为各账号领取签到 Credits 奖励
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      国际版: {qoderAccounts.length}
                    </span>
                    <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      国内版: {qoderCnAccounts.length}
                    </span>
                    <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      千问办公: {qwenworkAccounts.length}
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
              </label>

              <div className="setting-row">
                <div>
                  <span>签到时间段</span>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    官方每日于 10:00 (SGT/UTC+8) 刷新奖励，推荐设置在 10:00 之后
                  </div>
                </div>
                <div className="time-range-inputs">
                  <TimeButtonPicker
                    value={startTime}
                    onChange={setStartTime}
                    ariaLabel={t('workbuddy.checkin.startTime', '开始时间')}
                  />
                  <span className="time-separator">-</span>
                  <TimeButtonPicker
                    value={endTime}
                    onChange={setEndTime}
                    ariaLabel={t('workbuddy.checkin.endTime', '结束时间')}
                  />
                </div>
              </div>

              <div className="setting-divider" />

              <div className="setting-row">
                <span>{t('workbuddy.autoCheckin.manualTest', '手动测试')}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleManualTest()}
                  disabled={manualTesting}
                >
                  {manualTesting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Play size={13} />
                  )}
                  <span>{manualTesting ? '正在执行...' : '立即测试全部账号'}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="auto-checkin-history">
              <div className="history-toolbar">
                <span className="history-count">共 {logs.length} 条记录</span>
                {logs.length > 0 && (
                  <button
                    className="btn btn-ghost btn-xs text-danger"
                    onClick={() => clearQoderAutoCheckinLogs()}
                  >
                    <Trash2 size={12} />
                    <span>清空记录</span>
                  </button>
                )}
              </div>

              {logs.length === 0 ? (
                <div className="empty-history">
                  <History size={28} />
                  <p>暂无 Qoder / 千问办公 自动签到记录</p>
                </div>
              ) : (
                <div className="history-list">
                  {logs.map((log) => {
                    const isExpanded = !!expandedLogIds[log.id];
                    return (
                      <div key={log.id} className="history-card">
                        <div
                          className="history-card-header"
                          onClick={() => toggleLogExpand(log.id)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="history-date">
                            <Clock size={12} />
                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          <div className="history-summary">
                            <span className="badge-summary total">共 {log.totalAccounts} 个</span>
                            {log.successCount > 0 && (
                              <span className="badge-summary success">+{log.successCount} 成功</span>
                            )}
                            {log.alreadyCheckedCount > 0 && (
                              <span className="badge-summary already">{log.alreadyCheckedCount} 已签</span>
                            )}
                            {log.failedCount > 0 && (
                              <span className="badge-summary failed">{log.failedCount} 失败</span>
                            )}
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="history-details-list">
                            {log.details.map((detail, idx) => (
                              <div key={`${detail.accountId}-${idx}`} className="history-detail-item">
                                <div className="history-detail-account">
                                  {statusIcon(detail.status)}
                                  <span className="account-email" title={detail.email}>
                                    {detail.email}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: 'var(--bg-secondary)',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    {detail.platform === 'qoder'
                                      ? '国际版'
                                      : detail.platform === 'qoder_cn'
                                      ? '国内版'
                                      : '千问办公'}
                                  </span>
                                </div>
                                <div className="history-detail-status">
                                  <span className="status-label">{statusText(detail.status)}</span>
                                  <span className="detail-message">{detail.message}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {activeTab === 'settings' && (
          <div className="modal-footer auto-checkin-modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel', '取消')}
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {t('common.save', '保存设置')}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
