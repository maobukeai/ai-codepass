import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheck,
  Play,
  History,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Users,
} from 'lucide-react';
import { TimeButtonPicker } from './TimeButtonPicker';
import { useWorkbuddyAccountStore } from '../stores/useWorkbuddyAccountStore';
import { useTraeAccountStore } from '../stores/useTraeAccountStore';
import { useQoderAccountStore } from '../stores/useQoderAccountStore';
import { useQoderCnAccountStore } from '../stores/useQoderCnAccountStore';
import { useQwenworkAccountStore } from '../stores/useQwenworkAccountStore';
import {
  getWorkbuddyAutoCheckinConfigAsync,
  saveWorkbuddyAutoCheckinConfigAsync,
  runWorkbuddyAutoCheckinCycleIfNeeded,
  WORKBUDDY_AUTO_CHECKIN_CONFIG_CHANGED_EVENT,
  WorkbuddyAutoCheckinConfig,
  parseTimeToMinutes as parseWbTimeToMinutes,
} from '../services/workbuddyAutoCheckinService';
import {
  getTraeAutoCheckinConfig,
  saveTraeAutoCheckinConfig,
  runTraeAutoCheckinCycleIfNeeded,
  TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT,
  TraeAutoCheckinConfig,
  parseTimeToMinutes as parseTraeTimeToMinutes,
} from '../services/traeAutoCheckinService';
import {
  getQoderAutoCheckinConfig,
  saveQoderAutoCheckinConfig,
  runQoderAutoCheckinCycleIfNeeded,
  QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT,
  QoderAutoCheckinConfig,
  parseTimeToMinutes as parseQoderTimeToMinutes,
} from '../services/qoderAutoCheckinService';
import { WorkbuddyAutoCheckinConfigModal } from './codebuddy-suite/WorkbuddyAutoCheckinConfigModal';
import { TraeAutoCheckinConfigModal } from './codebuddy-suite/TraeAutoCheckinConfigModal';
import { QoderAutoCheckinConfigModal } from './codebuddy-suite/QoderAutoCheckinConfigModal';

export function SettingsAutoCheckinSection() {
  const { t } = useTranslation();

  // Stores
  const wbAccounts = useWorkbuddyAccountStore((state) => state.accounts) || [];
  const fetchWbAccounts = useWorkbuddyAccountStore((state) => state.fetchAccounts);
  const traeAccounts = useTraeAccountStore((state) => state.accounts) || [];
  const fetchTraeAccounts = useTraeAccountStore((state) => state.fetchAccounts);
  const qoderAccounts = useQoderAccountStore((state) => state.accounts) || [];
  const fetchQoderAccounts = useQoderAccountStore((state) => state.fetchAccounts);
  const qoderCnAccounts = useQoderCnAccountStore((state) => state.accounts) || [];
  const fetchQoderCnAccounts = useQoderCnAccountStore((state) => state.fetchAccounts);
  const qwenworkAccounts = useQwenworkAccountStore((state) => state.accounts) || [];
  const fetchQwenworkAccounts = useQwenworkAccountStore((state) => state.fetchAccounts);

  useEffect(() => {
    fetchWbAccounts();
    fetchTraeAccounts();
    fetchQoderAccounts();
    fetchQoderCnAccounts();
    fetchQwenworkAccounts();
  }, [fetchWbAccounts, fetchTraeAccounts, fetchQoderAccounts, fetchQoderCnAccounts, fetchQwenworkAccounts]);

  // Workbuddy state
  const [wbConfig, setWbConfig] = useState<WorkbuddyAutoCheckinConfig>({
    enabled: false,
    startTime: '00:30',
    endTime: '05:30',
  });
  const [wbSaving, setWbSaving] = useState(false);
  const [wbSaveSuccess, setWbSaveSuccess] = useState(false);
  const [wbTesting, setWbTesting] = useState(false);
  const [wbTestMessage, setWbTestMessage] = useState<string | null>(null);
  const [wbError, setWbError] = useState<string | null>(null);
  const [showWbModal, setShowWbModal] = useState(false);

  // Trae state
  const [traeConfig, setTraeConfig] = useState<TraeAutoCheckinConfig>(() =>
    getTraeAutoCheckinConfig(),
  );
  const [traeSaving, setTraeSaving] = useState(false);
  const [traeSaveSuccess, setTraeSaveSuccess] = useState(false);
  const [traeTesting, setTraeTesting] = useState(false);
  const [traeTestMessage, setTraeTestMessage] = useState<string | null>(null);
  const [traeError, setTraeError] = useState<string | null>(null);
  const [showTraeModal, setShowTraeModal] = useState(false);

  // Qoder state
  const [qoderConfig, setQoderConfig] = useState<QoderAutoCheckinConfig>(() =>
    getQoderAutoCheckinConfig(),
  );
  const [qoderSaving, setQoderSaving] = useState(false);
  const [qoderSaveSuccess, setQoderSaveSuccess] = useState(false);
  const [qoderTesting, setQoderTesting] = useState(false);
  const [qoderTestMessage, setQoderTestMessage] = useState<string | null>(null);
  const [qoderError, setQoderError] = useState<string | null>(null);
  const [showQoderModal, setShowQoderModal] = useState(false);

  // Load Workbuddy config
  const reloadWbConfig = useCallback(async () => {
    try {
      const cfg = await getWorkbuddyAutoCheckinConfigAsync();
      setWbConfig(cfg);
    } catch (err) {
      console.warn('获取 Workbuddy 自动签到配置失败:', err);
    }
  }, []);

  useEffect(() => {
    void reloadWbConfig();
    const handleWbChanged = () => void reloadWbConfig();
    window.addEventListener(WORKBUDDY_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleWbChanged);
    return () => {
      window.removeEventListener(WORKBUDDY_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleWbChanged);
    };
  }, [reloadWbConfig]);

  // Load Trae config
  useEffect(() => {
    const handleTraeChanged = () => {
      setTraeConfig(getTraeAutoCheckinConfig());
    };
    window.addEventListener(TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleTraeChanged);
    return () => {
      window.removeEventListener(TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleTraeChanged);
    };
  }, []);

  // Load Qoder config
  useEffect(() => {
    const handleQoderChanged = () => {
      setQoderConfig(getQoderAutoCheckinConfig());
    };
    window.addEventListener(QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleQoderChanged);
    return () => {
      window.removeEventListener(QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleQoderChanged);
    };
  }, []);

  // Workbuddy actions
  const handleSaveWbConfig = async (nextConfig: WorkbuddyAutoCheckinConfig) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextConfig.startTime)) {
      setWbError(t('workbuddy.autoCheckin.error.invalidTime', '开始时间格式错误'));
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextConfig.endTime)) {
      setWbError(t('workbuddy.autoCheckin.error.invalidTime', '结束时间格式错误'));
      return;
    }
    if (parseWbTimeToMinutes(nextConfig.endTime) < parseWbTimeToMinutes(nextConfig.startTime)) {
      setWbError(t('workbuddy.autoCheckin.error.endBeforeStart', '结束时间不能早于开始时间'));
      return;
    }

    setWbError(null);
    setWbSaving(true);
    setWbSaveSuccess(false);
    try {
      await saveWorkbuddyAutoCheckinConfigAsync(nextConfig);
      setWbConfig(nextConfig);
      setWbSaveSuccess(true);
      setTimeout(() => setWbSaveSuccess(false), 2500);
    } catch (err) {
      setWbError(err instanceof Error ? err.message : String(err));
    } finally {
      setWbSaving(false);
    }
  };

  const handleTestWb = async () => {
    setWbTesting(true);
    setWbTestMessage(null);
    try {
      const res = await runWorkbuddyAutoCheckinCycleIfNeeded(true);
      setWbTestMessage(
        res === 'completed'
          ? '批量自动签到执行完成，请查看记录'
          : `执行状态: ${res}`,
      );
      setTimeout(() => setWbTestMessage(null), 4000);
    } catch (err) {
      setWbTestMessage(`测试失败: ${String(err)}`);
    } finally {
      setWbTesting(false);
    }
  };

  // Trae actions
  const handleSaveTraeConfig = (nextConfig: TraeAutoCheckinConfig) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextConfig.startTime)) {
      setTraeError(t('workbuddy.autoCheckin.error.invalidTime', '开始时间格式错误'));
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextConfig.endTime)) {
      setTraeError(t('workbuddy.autoCheckin.error.invalidTime', '结束时间格式错误'));
      return;
    }
    if (parseTraeTimeToMinutes(nextConfig.endTime) < parseTraeTimeToMinutes(nextConfig.startTime)) {
      setTraeError(t('workbuddy.autoCheckin.error.endBeforeStart', '结束时间不能早于开始时间'));
      return;
    }

    setTraeError(null);
    setTraeSaving(true);
    setTraeSaveSuccess(false);
    try {
      saveTraeAutoCheckinConfig(nextConfig);
      setTraeConfig(nextConfig);
      setTraeSaveSuccess(true);
      setTimeout(() => setTraeSaveSuccess(false), 2500);
    } catch (err) {
      setTraeError(err instanceof Error ? err.message : String(err));
    } finally {
      setTraeSaving(false);
    }
  };

  const handleTestTrae = async () => {
    setTraeTesting(true);
    setTraeTestMessage(null);
    try {
      await runTraeAutoCheckinCycleIfNeeded(true);
      setTraeTestMessage('Trae 批量自动签到执行完成，请查看记录');
      setTimeout(() => setTraeTestMessage(null), 4000);
    } catch (err) {
      setTraeTestMessage(`测试失败: ${String(err)}`);
    } finally {
      setTraeTesting(false);
    }
  };

  // Qoder actions
  const handleSaveQoderConfig = (nextConfig: QoderAutoCheckinConfig) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextConfig.startTime)) {
      setQoderError(t('workbuddy.autoCheckin.error.invalidTime', '开始时间格式错误'));
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextConfig.endTime)) {
      setQoderError(t('workbuddy.autoCheckin.error.invalidTime', '结束时间格式错误'));
      return;
    }
    if (parseQoderTimeToMinutes(nextConfig.endTime) < parseQoderTimeToMinutes(nextConfig.startTime)) {
      setQoderError(t('workbuddy.autoCheckin.error.endBeforeStart', '结束时间不能早于开始时间'));
      return;
    }

    setQoderError(null);
    setQoderSaving(true);
    setQoderSaveSuccess(false);
    try {
      saveQoderAutoCheckinConfig(nextConfig);
      setQoderConfig(nextConfig);
      setQoderSaveSuccess(true);
      setTimeout(() => setQoderSaveSuccess(false), 2500);
    } catch (err) {
      setQoderError(err instanceof Error ? err.message : String(err));
    } finally {
      setQoderSaving(false);
    }
  };

  const handleTestQoder = async () => {
    setQoderTesting(true);
    setQoderTestMessage(null);
    try {
      await runQoderAutoCheckinCycleIfNeeded(true);
      setQoderTestMessage('Qoder / 千问办公 批量自动签到执行完成，请查看记录');
      setTimeout(() => setQoderTestMessage(null), 4000);
    } catch (err) {
      setQoderTestMessage(`测试失败: ${String(err)}`);
    } finally {
      setQoderTesting(false);
    }
  };

  return (
    <>
      <div
        className="group-title"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}
      >
        <CalendarCheck size={18} />
        <span>{t('settings.autoCheckin.title', '批量定时签到 (统一调度)')}</span>
      </div>

      <div
        style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '16px',
          lineHeight: '1.5',
          background: 'var(--bg-tertiary)',
          padding: '10px 14px',
          borderRadius: '8px',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Users size={16} style={{ flexShrink: 0, color: 'var(--primary)' }} />
        <span>
          {t(
            'settings.autoCheckin.unifiedDesc',
            '统一配置各平台下所有托管账号的每日自动签到。系统会在指定时间窗口内为各个账号随机打散调度（防风控拦截），开机或软件后台常驻时静默执行，无需对单账号重复设置。',
          )}
        </span>
      </div>

      {/* ── CARD 1: WorkBuddy ── */}
      <div className="settings-group">
        {/* Toggle */}
        <div className="settings-row">
          <div className="row-label">
            <div className="row-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>WorkBuddy (腾讯协同版)</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '1px 7px',
                  borderRadius: '12px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: 'var(--primary)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                }}
              >
                已托管 {wbAccounts.length} 个账号
              </span>
            </div>
            <div className="row-desc">
              {t(
                'settings.autoCheckin.wbDesc',
                '开启后每天自动为全部 WorkBuddy 账号完成签到领取额度与积分，账号之间错峰调度。',
              )}
            </div>
          </div>
          <div className="row-control">
            <label className="switch">
              <input
                type="checkbox"
                checked={wbConfig.enabled}
                onChange={(e) => {
                  const next = { ...wbConfig, enabled: e.target.checked };
                  setWbConfig(next);
                  void handleSaveWbConfig(next);
                }}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* Schedule Inputs & Actions */}
        {wbConfig.enabled && (
          <div style={{ animation: 'fadeUp 0.3s ease both' }}>
            <div className="settings-row">
              <div className="row-label">
                <div className="row-title">{t('workbuddy.autoCheckin.timeRange', '签到时间窗口')}</div>
                <div className="row-desc">
                  {t(
                    'workbuddy.autoCheckin.timeRangeDesc',
                    '系统将在此时段内为各账号随机生成独立签到时间，模拟人工错峰。',
                  )}
                </div>
              </div>
              <div className="row-control" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TimeButtonPicker
                    value={wbConfig.startTime}
                    onChange={(v) => setWbConfig({ ...wbConfig, startTime: v })}
                    ariaLabel={t('workbuddy.checkin.startTime', '开始时间')}
                  />
                  <span style={{ color: 'var(--text-secondary)' }}>-</span>
                  <TimeButtonPicker
                    value={wbConfig.endTime}
                    onChange={(v) => setWbConfig({ ...wbConfig, endTime: v })}
                    ariaLabel={t('workbuddy.checkin.endTime', '结束时间')}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleSaveWbConfig(wbConfig)}
                  disabled={wbSaving}
                  title="保存时间设置"
                >
                  {wbSaving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : wbSaveSuccess ? (
                    <CheckCircle2 size={13} style={{ color: 'var(--color-success, #22c55e)' }} />
                  ) : (
                    <Save size={13} />
                  )}
                  <span>{wbSaveSuccess ? '已保存' : '保存'}</span>
                </button>
              </div>
            </div>

            {wbError && (
              <div className="settings-row" style={{ color: 'var(--color-danger, #ef4444)', fontSize: '12px' }}>
                <AlertCircle size={14} />
                <span>{wbError}</span>
              </div>
            )}

            {/* Quick Actions */}
            <div className="settings-row" style={{ background: 'var(--bg-tertiary)', padding: '10px 16px' }}>
              <div className="row-label">
                <div className="row-title" style={{ fontSize: '12px' }}>
                  {wbTestMessage || '测试与明细'}
                </div>
              </div>
              <div className="row-control" style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleTestWb}
                  disabled={wbTesting}
                >
                  {wbTesting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  <span>立即测试运行全部账号</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowWbModal(true)}
                >
                  <History size={12} />
                  <span>详细配置与日志</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── CARD 2: Trae Work CN ── */}
      <div className="settings-group">
        {/* Toggle */}
        <div className="settings-row">
          <div className="row-label">
            <div className="row-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Trae (字节跳动 Work CN)</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '1px 7px',
                  borderRadius: '12px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: 'var(--primary)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                }}
              >
                已托管 {traeAccounts.length} 个账号
              </span>
            </div>
            <div className="row-desc">
              {t(
                'settings.autoCheckin.traeDesc',
                '开启后每天自动为全部 Trae 账号完成签到领取额度与积分，账号之间错峰调度。',
              )}
            </div>
          </div>
          <div className="row-control">
            <label className="switch">
              <input
                type="checkbox"
                checked={traeConfig.enabled}
                onChange={(e) => {
                  const next = { ...traeConfig, enabled: e.target.checked };
                  setTraeConfig(next);
                  handleSaveTraeConfig(next);
                }}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* Schedule Inputs & Actions */}
        {traeConfig.enabled && (
          <div style={{ animation: 'fadeUp 0.3s ease both' }}>
            <div className="settings-row">
              <div className="row-label">
                <div className="row-title">{t('workbuddy.autoCheckin.timeRange', '签到时间窗口')}</div>
                <div className="row-desc">
                  {t(
                    'workbuddy.autoCheckin.timeRangeDesc',
                    '系统将在此时段内为各账号随机生成独立签到时间，模拟人工错峰。',
                  )}
                </div>
              </div>
              <div className="row-control" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TimeButtonPicker
                    value={traeConfig.startTime}
                    onChange={(v) => setTraeConfig({ ...traeConfig, startTime: v })}
                    ariaLabel={t('workbuddy.checkin.startTime', '开始时间')}
                  />
                  <span style={{ color: 'var(--text-secondary)' }}>-</span>
                  <TimeButtonPicker
                    value={traeConfig.endTime}
                    onChange={(v) => setTraeConfig({ ...traeConfig, endTime: v })}
                    ariaLabel={t('workbuddy.checkin.endTime', '结束时间')}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSaveTraeConfig(traeConfig)}
                  disabled={traeSaving}
                  title="保存时间设置"
                >
                  {traeSaving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : traeSaveSuccess ? (
                    <CheckCircle2 size={13} style={{ color: 'var(--color-success, #22c55e)' }} />
                  ) : (
                    <Save size={13} />
                  )}
                  <span>{traeSaveSuccess ? '已保存' : '保存'}</span>
                </button>
              </div>
            </div>

            {traeError && (
              <div className="settings-row" style={{ color: 'var(--color-danger, #ef4444)', fontSize: '12px' }}>
                <AlertCircle size={14} />
                <span>{traeError}</span>
              </div>
            )}

            {/* Quick Actions */}
            <div className="settings-row" style={{ background: 'var(--bg-tertiary)', padding: '10px 16px' }}>
              <div className="row-label">
                <div className="row-title" style={{ fontSize: '12px' }}>
                  {traeTestMessage || '测试与明细'}
                </div>
              </div>
              <div className="row-control" style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleTestTrae}
                  disabled={traeTesting}
                >
                  {traeTesting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  <span>立即测试运行全部账号</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowTraeModal(true)}
                >
                  <History size={12} />
                  <span>详细配置与日志</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── CARD 3: Qoder 与千问办公 (包含国际版、国内版与阿里千问) ── */}
      <div className="settings-group">
        {/* Toggle */}
        <div className="settings-row">
          <div className="row-label">
            <div className="row-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Qoder / 千问办公 (国际版 / 国内版 / 阿里千问)</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '1px 7px',
                  borderRadius: '12px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: 'var(--primary)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                }}
              >
                已托管 {qoderAccounts.length + qoderCnAccounts.length + qwenworkAccounts.length} 个账号
              </span>
            </div>
            <div className="row-desc">
              开启后每天自动为全部 Qoder 国际版、国内版与阿里千问办公账号完成签到领取 Credits 奖励，模拟人工错峰调度。
              <span style={{ marginLeft: '6px', opacity: 0.85 }}>
                (含 国际版 {qoderAccounts.length} · 国内版 {qoderCnAccounts.length} · 千问办公 {qwenworkAccounts.length})
              </span>
            </div>
          </div>
          <div className="row-control">
            <label className="switch">
              <input
                type="checkbox"
                checked={qoderConfig.enabled}
                onChange={(e) => {
                  const next = { ...qoderConfig, enabled: e.target.checked };
                  setQoderConfig(next);
                  handleSaveQoderConfig(next);
                }}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* Schedule Inputs & Actions */}
        {qoderConfig.enabled && (
          <div style={{ animation: 'fadeUp 0.3s ease both' }}>
            <div className="settings-row">
              <div className="row-label">
                <div className="row-title">签到时间窗口</div>
                <div className="row-desc">
                  Qoder 与千问办公每日于 10:00 (SGT/UTC+8) 刷新奖励，系统将在此时段内为各账号错峰执行。
                </div>
              </div>
              <div className="row-control" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TimeButtonPicker
                    value={qoderConfig.startTime}
                    onChange={(v) => setQoderConfig({ ...qoderConfig, startTime: v })}
                    ariaLabel={t('workbuddy.checkin.startTime', '开始时间')}
                  />
                  <span style={{ color: 'var(--text-secondary)' }}>-</span>
                  <TimeButtonPicker
                    value={qoderConfig.endTime}
                    onChange={(v) => setQoderConfig({ ...qoderConfig, endTime: v })}
                    ariaLabel={t('workbuddy.checkin.endTime', '结束时间')}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSaveQoderConfig(qoderConfig)}
                  disabled={qoderSaving}
                  title="保存时间设置"
                >
                  {qoderSaving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : qoderSaveSuccess ? (
                    <CheckCircle2 size={13} style={{ color: 'var(--color-success, #22c55e)' }} />
                  ) : (
                    <Save size={13} />
                  )}
                  <span>{qoderSaveSuccess ? '已保存' : '保存'}</span>
                </button>
              </div>
            </div>

            {qoderError && (
              <div className="settings-row" style={{ color: 'var(--color-danger, #ef4444)', fontSize: '12px' }}>
                <AlertCircle size={14} />
                <span>{qoderError}</span>
              </div>
            )}

            {/* Quick Actions */}
            <div className="settings-row" style={{ background: 'var(--bg-tertiary)', padding: '10px 16px' }}>
              <div className="row-label">
                <div className="row-title" style={{ fontSize: '12px' }}>
                  {qoderTestMessage || '测试与明细'}
                </div>
              </div>
              <div className="row-control" style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleTestQoder}
                  disabled={qoderTesting}
                >
                  {qoderTesting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  <span>立即测试运行全部账号</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowQoderModal(true)}
                >
                  <History size={12} />
                  <span>详细配置与日志</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Embedded Modals */}
      {showWbModal && (
        <WorkbuddyAutoCheckinConfigModal
          config={wbConfig}
          onSave={async (newConfig) => {
            await saveWorkbuddyAutoCheckinConfigAsync(newConfig);
            setWbConfig(newConfig);
          }}
          onClose={() => setShowWbModal(false)}
        />
      )}

      {showTraeModal && (
        <TraeAutoCheckinConfigModal
          config={traeConfig}
          onSave={(newConfig) => {
            saveTraeAutoCheckinConfig(newConfig);
            setTraeConfig(newConfig);
          }}
          onClose={() => setShowTraeModal(false)}
        />
      )}

      {showQoderModal && (
        <QoderAutoCheckinConfigModal
          config={qoderConfig}
          onSave={(newConfig) => {
            saveQoderAutoCheckinConfig(newConfig);
            setQoderConfig(newConfig);
          }}
          onClose={() => setShowQoderModal(false)}
        />
      )}
    </>
  );
}
