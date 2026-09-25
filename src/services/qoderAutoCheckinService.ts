import { invoke } from '@tauri-apps/api/core';
import { claimQoderCheckin as claimQoderGlobalCheckin, listQoderAccounts } from './qoderService';
import { claimQoderCheckin as claimQoderCnCheckin, listQoderAccounts as listQoderCnAccounts } from './qoderCnService';
import { claimQwenworkCheckin, listQoderAccounts as listQwenworkAccounts } from './qwenworkService';

export interface QoderAccountScheduleState {
  scheduledDate: string;        // "YYYY-MM-DD"
  scheduledMinute: number;      // Minutes from midnight (0..1439)
  lastCheckedDate?: string;     // "YYYY-MM-DD" when checked in
}

export interface QoderAutoCheckinConfig {
  enabled: boolean;
  startTime: string; // HH:mm, e.g. "10:05" (Qoder resets daily at 10:00)
  endTime: string;   // HH:mm, e.g. "14:00"
  lastCheckedDate?: string; // "YYYY-MM-DD"
  accountSchedules?: Record<string, QoderAccountScheduleState>;
}

export interface QoderAutoCheckinLogItem {
  id: string;
  timestamp: number;
  date: string;
  totalAccounts: number;
  successCount: number;
  alreadyCheckedCount: number;
  failedCount: number;
  details: Array<{
    accountId: string;
    email: string;
    platform: 'qoder' | 'qoder_cn' | 'qwenwork';
    status: 'success' | 'already' | 'failed';
    message: string;
  }>;
}

export const DEFAULT_QODER_AUTO_CHECKIN_CONFIG: QoderAutoCheckinConfig = {
  enabled: false,
  startTime: '10:05',
  endTime: '14:00',
};

const CONFIG_KEY = 'agtools.qoder.auto_checkin_config';
const LOGS_KEY = 'agtools.qoder.auto_checkin_logs';
export const QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT = 'qoder-auto-checkin-config-changed';
export const QODER_AUTO_CHECKIN_LOGS_CHANGED_EVENT = 'qoder-auto-checkin-logs-changed';

export type QoderAutoCheckinCycleResult = 'disabled' | 'waiting' | 'completed' | 'retry';

let cachedConfig: QoderAutoCheckinConfig | null = null;

function isValidTime(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function parseTimeToMinutes(timeStr: string): number {
  const [hh, mm] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (hh || 0) * 60 + (mm || 0);
}

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getQoderAutoCheckinConfig(): QoderAutoCheckinConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  if (typeof window === 'undefined') {
    return DEFAULT_QODER_AUTO_CHECKIN_CONFIG;
  }
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      return DEFAULT_QODER_AUTO_CHECKIN_CONFIG;
    }
    const parsed = JSON.parse(raw);
    const config: QoderAutoCheckinConfig = {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : false,
      startTime: isValidTime(parsed.startTime) ? parsed.startTime : '10:05',
      endTime: isValidTime(parsed.endTime) ? parsed.endTime : '14:00',
      lastCheckedDate: typeof parsed.lastCheckedDate === 'string' ? parsed.lastCheckedDate : undefined,
      accountSchedules: typeof parsed.accountSchedules === 'object' && parsed.accountSchedules !== null ? parsed.accountSchedules : undefined,
    };
    cachedConfig = config;
    return config;
  } catch {
    return DEFAULT_QODER_AUTO_CHECKIN_CONFIG;
  }
}

export function saveQoderAutoCheckinConfig(config: QoderAutoCheckinConfig): void {
  cachedConfig = config;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event(QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT));
  } catch (err) {
    console.warn('[QoderAutoCheckin] 保存配置失败:', err);
  }
}

export function getQoderAutoCheckinLogs(): QoderAutoCheckinLogItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQoderAutoCheckinLogs(logs: QoderAutoCheckinLogItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 50)));
    window.dispatchEvent(new Event(QODER_AUTO_CHECKIN_LOGS_CHANGED_EVENT));
  } catch (err) {
    console.warn('[QoderAutoCheckin] 保存日志失败:', err);
  }
}

export function clearQoderAutoCheckinLogs(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LOGS_KEY);
    window.dispatchEvent(new Event(QODER_AUTO_CHECKIN_LOGS_CHANGED_EVENT));
  } catch (err) {
    console.warn('[QoderAutoCheckin] 清空日志失败:', err);
  }
}

export async function runQoderAutoCheckinCycleIfNeeded(force = false): Promise<QoderAutoCheckinCycleResult> {
  const config = getQoderAutoCheckinConfig();
  if (!config.enabled && !force) {
    return 'disabled';
  }

  const now = new Date();
  const todayStr = getTodayString();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(config.startTime);
  const endMinutes = parseTimeToMinutes(config.endTime);

  if (!force) {
    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      return 'waiting';
    }
    if (config.lastCheckedDate === todayStr) {
      return 'completed';
    }
  }

  const [globalAccounts, cnAccounts, qwenworkAccounts] = await Promise.all([
    listQoderAccounts().catch(() => []),
    listQoderCnAccounts().catch(() => []),
    listQwenworkAccounts().catch(() => []),
  ]);

  const allAccounts = [
    ...globalAccounts.map((acc) => ({ ...acc, platformKind: 'qoder' as const })),
    ...cnAccounts.map((acc) => ({ ...acc, platformKind: 'qoder_cn' as const })),
    ...qwenworkAccounts.map((acc) => ({ ...acc, platformKind: 'qwenwork' as const })),
  ];

  if (allAccounts.length === 0) {
    return 'completed';
  }

  let successCount = 0;
  let alreadyCheckedCount = 0;
  let failedCount = 0;
  const details: QoderAutoCheckinLogItem['details'] = [];

  for (const acc of allAccounts) {
    try {
      const claimFn =
        acc.platformKind === 'qoder'
          ? claimQoderGlobalCheckin
          : acc.platformKind === 'qoder_cn'
          ? claimQoderCnCheckin
          : claimQwenworkCheckin;
      const res = await claimFn(acc.id);
      if (res.alreadyCheckedIn || (res as any).already_checked_in) {
        alreadyCheckedCount++;
        details.push({
          accountId: acc.id,
          email: acc.email,
          platform: acc.platformKind,
          status: 'already',
          message: res.message || '今日已完成签到',
        });
      } else if (res.success) {
        successCount++;
        details.push({
          accountId: acc.id,
          email: acc.email,
          platform: acc.platformKind,
          status: 'success',
          message: res.message || '签到成功 +100 Credits',
        });
      } else {
        failedCount++;
        details.push({
          accountId: acc.id,
          email: acc.email,
          platform: acc.platformKind,
          status: 'failed',
          message: res.message || '未获得签到奖励',
        });
      }
    } catch (err: any) {
      failedCount++;
      details.push({
        accountId: acc.id,
        email: acc.email,
        platform: acc.platformKind,
        status: 'failed',
        message: err?.message || String(err),
      });
    }
  }

  const logItem: QoderAutoCheckinLogItem = {
    id: `${todayStr}-${Date.now()}`,
    timestamp: Date.now(),
    date: todayStr,
    totalAccounts: allAccounts.length,
    successCount,
    alreadyCheckedCount,
    failedCount,
    details,
  };

  const logs = getQoderAutoCheckinLogs();
  saveQoderAutoCheckinLogs([logItem, ...logs]);

  saveQoderAutoCheckinConfig({
    ...config,
    lastCheckedDate: todayStr,
  });

  // 触发 Webhook 自动打卡结果推送
  if (allAccounts.length > 0) {
    const detailLines = details
      .map((d) => {
        const icon = d.status === 'success' ? '✅' : d.status === 'already' ? 'ℹ️' : '❌';
        const platName =
          d.platform === 'qwenwork'
            ? '千问办公'
            : d.platform === 'qoder_cn'
            ? 'Qoder 国内版'
            : 'Qoder 国际版';
        return `> • **[${platName}] ${d.email || d.accountId}**：${icon} ${d.message}`;
      })
      .join('\n');

    const summaryText = `### 📊 签到统计\n- **执行日期**：${todayStr}\n- **处理账号**：${allAccounts.length} 个账号\n- **执行结果**：成功 ${successCount} | 今日已签 ${alreadyCheckedCount} | 失败 ${failedCount}\n\n### 📋 账号明细\n${detailLines || '> • 无待处理账号'}\n\n---\n*AI CodePass 每日自动为您守护算力额度*`;

    void invoke('send_auto_checkin_notification', {
      title: '🎉 [AI CodePass] Qoder / 千问办公 自动打卡汇报',
      summary: summaryText,
    }).catch((e) => {
      console.warn('[QoderAutoCheckin] 发送打卡通知失败:', e);
    });
  }

  return 'completed';
}
