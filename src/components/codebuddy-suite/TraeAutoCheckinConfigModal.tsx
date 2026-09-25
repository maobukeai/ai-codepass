import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
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
  TraeAutoCheckinConfig,
  TraeAutoCheckinLogRecord,
  parseTimeToMinutes,
  getTraeAutoCheckinLogs,
  clearTraeAutoCheckinLogs,
  runTraeAutoCheckinCycleIfNeeded,
  TRAE_AUTO_CHECKIN_LOGS_CHANGED_EVENT,
} from '../../services/traeAutoCheckinService';

interface TraeAutoCheckinConfigModalProps {
  config: TraeAutoCheckinConfig;
  onSave: (newConfig: TraeAutoCheckinConfig) => void;
  onClose: () => void;
}

export function TraeAutoCheckinConfigModal({
  config,
  onSave,
  onClose,
}: TraeAutoCheckinConfigModalProps) {
  const { t } = useTranslation();
  useEscClose(true, onClose);

  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');
  const [enabled, setEnabled] = useState(config.enabled);
  const [startTime, setStartTime] = useState(config.startTime || '00:30');
  const [endTime, setEndTime] = useState(config.endTime || '05:30');
  const [error, setError] = useState<string | null>(null);

  const [logs, setLogs] = useState<TraeAutoCheckinLogRecord[]>(() =>
    getTraeAutoCheckinLogs(),
  );
  const [manualTesting, setManualTesting] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleLogsChange = () => {
      setLogs(getTraeAutoCheckinLogs());
    };
    window.addEventListener(TRAE_AUTO_CHECKIN_LOGS_CHANGED_EVENT, handleLogsChange);
    return () => {
      window.removeEventListener(TRAE_AUTO_CHECKIN_LOGS_CHANGED_EVENT, handleLogsChange);
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
      await runTraeAutoCheckinCycleIfNeeded(true);
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
      case 'already_checked':
        return t('common.alreadyChecked', '已签到');
      case 'failed':
        return t('common.failed', '失败');
      case 'inactive':
        return t('workbuddy.checkin.inactive', '不可用');
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
                  <div style={{ fontWeight: 600 }}>{t('workbuddy.autoCheckin.enable', '启用批量自动签到')}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {t('trae.autoCheckin.batchHint', '对所有已添加账号生效。每天在指定时间窗口内为各账号随机分配时间，防风控打散自动签到')}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
              </label>

              <div className="setting-row">
                <span>{t('workbuddy.autoCheckin.timeRange', '签到时间段')}</span>
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
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Play size={14} />
                  )}
                  {t('workbuddy.autoCheckin.testNow', '立即执行')}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="auto-checkin-history">
              <div className="history-header">
                <span className="history-count">
                  {t('workbuddy.autoCheckin.logCount', '共 {{count}} 条记录', { count: logs.length })}
                </span>
                {logs.length > 0 && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm(t('workbuddy.autoCheckin.confirmClear', '确定清空所有记录？'))) {
                        clearTraeAutoCheckinLogs();
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    {t('common.clear', '清空')}
                  </button>
                )}
              </div>

              {logs.length === 0 ? (
                <div className="history-empty">
                  <p>{t('workbuddy.autoCheckin.noLogs', '暂无签到记录')}</p>
                </div>
              ) : (
                <div className="history-list">
                  {logs.map((log) => (
                    <div key={log.id} className="history-item">
                      <div
                        className="history-item-header"
                        onClick={() => toggleLogExpand(log.id)}
                      >
                        <div className="history-item-date">
                          <span className={`history-status-dot ${log.status}`} />
                          <span>{log.date}</span>
                        </div>
                        <div className="history-item-summary">
                          <span className="history-stat success">{log.successCount}</span>
                          <span className="history-stat already">{log.alreadyCheckedCount}</span>
                          <span className="history-stat failed">{log.failedCount}</span>
                          <span className="history-time">{log.timestamp.split(' ')[1]}</span>
                          {expandedLogIds[log.id] ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </div>
                      </div>
                      {expandedLogIds[log.id] && (
                        <div className="history-item-details">
                          {log.details.map((detail, index) => (
                            <div key={index} className="history-detail-row">
                              {statusIcon(detail.status)}
                              <span className="detail-email">{detail.email}</span>
                              <span className={`detail-status ${detail.status}`}>
                                {statusText(detail.status)}
                              </span>
                              {detail.time && <span className="detail-time">{detail.time}</span>}
                              {detail.message && (
                                <span className="detail-message">{detail.message}</span>
                              )}
                            </div>
                          ))}
                          <div className="history-detail-footer">
                            {t('workbuddy.autoCheckin.duration', '耗时: {{ms}}ms', {
                              ms: log.durationMs,
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer auto-checkin-modal-footer">
          {activeTab === 'settings' ? (
            <>
              <button className="btn btn-secondary" onClick={onClose} type="button">
                {t('common.cancel', '取消')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} type="button">
                {t('common.save', '保存设置')}
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={onClose} type="button">
              {t('common.close', '关闭')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}