import { invoke } from '@tauri-apps/api/core';
import { claimQoderCheckin as claimQoderGlobalCheckin, listQoderAccounts, getQoderCheckinStatus as getQoderGlobalCheckinStatus } from './qoderService';
import { claimQoderCheckin as claimQoderCnCheckin, listQoderAccounts as listQoderCnAccounts, getQoderCheckinStatus as getQoderCnCheckinStatus } from './qoderCnService';
import { claimQwenworkCheckin, listQoderAccounts as listQwenworkAccounts, getQoderCheckinStatus as getQwenworkCheckinStatus } from './qwenworkService';

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

export interface QoderAutoCheckinAccountDetail {
  accountId: string;
  email: string;
  platform: 'qoder' | 'qoder_cn' | 'qwenwork';
  status: 'success' | 'already' | 'failed';
  message: string;
  time?: string;
}

export interface QoderAutoCheckinLogItem {
  id: string;
  timestamp: number;
  date: string;
  totalAccounts: number;
  successCount: number;
  alreadyCheckedCount: number;
  failedCount: number;
  details: QoderAutoCheckinAccountDetail[];
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

const AUTO_CHECKIN_RETRY_DELAY_MS = 5 * 60 * 1000;
const AUTO_CHECKIN_IDLE_RECHECK_DELAY_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let cachedConfig: QoderAutoCheckinConfig | null = null;
let isAutoCheckinCycleRunning = false;

function isValidTime(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function parseTimeToMinutes(timeStr: string): number {
  const [hh, mm] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (hh || 0) * 60 + (mm || 0);
}

export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeOnly(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QoderAutoCheckinLogItem[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((log) => now - log.timestamp <= THIRTY_DAYS_MS);
  } catch {
    return [];
  }
}

export function saveQoderAutoCheckinLogs(logs: QoderAutoCheckinLogItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const valid = logs.filter((log) => now - log.timestamp <= THIRTY_DAYS_MS).slice(0, 50);
    localStorage.setItem(LOGS_KEY, JSON.stringify(valid));
    window.dispatchEvent(new Event(QODER_AUTO_CHECKIN_LOGS_CHANGED_EVENT));
  } catch (err) {
    console.warn('[QoderAutoCheckin] 保存日志失败:', err);
  }
}

export function addQoderAutoCheckinLog(record: QoderAutoCheckinLogItem): void {
  const currentLogs = getQoderAutoCheckinLogs();
  const existingIndex = currentLogs.findIndex((l) => l.date === record.date);

  if (existingIndex < 0) {
    saveQoderAutoCheckinLogs([record, ...currentLogs]);
    return;
  }

  const existing = currentLogs[existingIndex];
  if (!existing) {
    saveQoderAutoCheckinLogs([record, ...currentLogs]);
    return;
  }

  const mergedDetailsMap = new Map<string, QoderAutoCheckinAccountDetail>();
  for (const d of existing.details) {
    mergedDetailsMap.set(`${d.platform}_${d.accountId}`, d);
  }
  for (const d of record.details) {
    mergedDetailsMap.set(`${d.platform}_${d.accountId}`, d);
  }

  const mergedDetails = Array.from(mergedDetailsMap.values());
  let successCount = 0;
  let alreadyCheckedCount = 0;
  let failedCount = 0;

  for (const d of mergedDetails) {
    if (d.status === 'success') successCount++;
    else if (d.status === 'already') alreadyCheckedCount++;
    else if (d.status === 'failed') failedCount++;
  }

  const mergedRecord: QoderAutoCheckinLogItem = {
    id: existing.id,
    timestamp: record.timestamp,
    date: record.date,
    totalAccounts: mergedDetails.length,
    successCount,
    alreadyCheckedCount,
    failedCount,
    details: mergedDetails,
  };

  const updatedLogs = [...currentLogs];
  updatedLogs[existingIndex] = mergedRecord;
  saveQoderAutoCheckinLogs(updatedLogs);
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

/**
 * 为每个账号在时间窗口内分配独立的随机签到分钟数，避免所有账号并发挤占
 */
export function ensureQoderAccountSchedules(
  config: QoderAutoCheckinConfig,
  accounts: Array<{ id: string; email?: string }>,
): QoderAutoCheckinConfig {
  const todayStr = getTodayDateString();
  const startMin = parseTimeToMinutes(config.startTime);
  let endMin = parseTimeToMinutes(config.endTime);
  if (endMin < startMin) endMin = startMin;
  const minRange = Math.max(0, endMin - startMin);

  const existingSchedules = config.accountSchedules ?? {};
  const updatedSchedules: Record<string, QoderAccountScheduleState> = { ...existingSchedules };
  let changed = false;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const existing = existingSchedules[account.id];

    if (
      existing &&
      existing.scheduledDate === todayStr &&
      existing.scheduledMinute >= startMin &&
      existing.scheduledMinute <= endMin
    ) {
      continue;
    }

    // 分配随机打散分钟数
    const randomOffset = minRange > 0 ? Math.floor(Math.random() * (minRange + 1)) : 0;
    const scheduledMinute = startMin + randomOffset;

    updatedSchedules[account.id] = {
      scheduledDate: todayStr,
      scheduledMinute,
      lastCheckedDate: existing?.lastCheckedDate === todayStr ? todayStr : undefined,
    };
    changed = true;
  }

  if (!changed) {
    return config;
  }

  const updatedConfig: QoderAutoCheckinConfig = {
    ...config,
    accountSchedules: updatedSchedules,
  };
  saveQoderAutoCheckinConfig(updatedConfig);
  return updatedConfig;
}

function getMillisecondsUntilNextLocalDay(now: Date): number {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 1, 0);
  return Math.max(1_000, nextDay.getTime() - now.getTime());
}

export function getQoderAutoCheckinNextDelayMs(
  result?: QoderAutoCheckinCycleResult,
  accounts: Array<{ id: string }> = [],
): number {
  if (result === 'retry') {
    return AUTO_CHECKIN_RETRY_DELAY_MS;
  }

  const config = getQoderAutoCheckinConfig();
  if (!config.enabled) {
    return AUTO_CHECKIN_IDLE_RECHECK_DELAY_MS;
  }

  const now = new Date();
  const todayStr = getTodayDateString();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  const updatedConfig = accounts.length > 0
    ? ensureQoderAccountSchedules(config, accounts)
    : config;
  const schedules = updatedConfig.accountSchedules;

  if (schedules && Object.keys(schedules).length > 0) {
    let nextScheduledMinute: number | null = null;

    for (const accId of Object.keys(schedules)) {
      const sch = schedules[accId];
      if (!sch) continue;
      if (sch.lastCheckedDate === todayStr) continue;

      if (nextScheduledMinute === null || sch.scheduledMinute < nextScheduledMinute) {
        nextScheduledMinute = sch.scheduledMinute;
      }
    }

    if (nextScheduledMinute === null) {
      return getMillisecondsUntilNextLocalDay(now);
    }

    if (currentMinute >= nextScheduledMinute) {
      return 1_000;
    }

    const scheduledAt = new Date(now);
    scheduledAt.setHours(
      Math.floor(nextScheduledMinute / 60),
      nextScheduledMinute % 60,
      0,
      0,
    );
    return Math.max(1_000, scheduledAt.getTime() - now.getTime());
  }

  if (updatedConfig.lastCheckedDate === todayStr) {
    return getMillisecondsUntilNextLocalDay(now);
  }

  const startMin = parseTimeToMinutes(updatedConfig.startTime);
  const endMin = Math.max(startMin, parseTimeToMinutes(updatedConfig.endTime));

  if (currentMinute < startMin) {
    const scheduledAt = new Date(now);
    scheduledAt.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    return Math.max(1_000, scheduledAt.getTime() - now.getTime());
  }

  if (currentMinute >= endMin) {
    return getMillisecondsUntilNextLocalDay(now);
  }

  return 1_000;
}

/**
 * 核心自动签到周期：
 * 满足用户明确诉求：“一个个账号签到，不是一起签到，避免账号漏签之类的”
 * - 串行执行各账号签到，账号间插入抖动延迟
 * - 错误账号独立重试，不影响后续账号
 * - 仅当所有账号均完成时才关闭今日轮次
 */
export async function runQoderAutoCheckinCycleIfNeeded(force = false): Promise<QoderAutoCheckinCycleResult> {
  const config = getQoderAutoCheckinConfig();
  if (!config.enabled && !force) {
    return 'disabled';
  }

  if (isAutoCheckinCycleRunning) {
    return 'waiting';
  }

  isAutoCheckinCycleRunning = true;
  const startTime = Date.now();
  const todayStr = getTodayDateString();

  try {
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
      saveQoderAutoCheckinConfig({ ...config, lastCheckedDate: todayStr });
      return 'completed';
    }

    const scheduledConfig = ensureQoderAccountSchedules(config, allAccounts);
    const schedules = scheduledConfig.accountSchedules ?? {};
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();

    // 筛选当前需要处理的账号（单账号逐个触发，或 force 时全部未签账号）
    const targetAccounts = force
      ? allAccounts
      : allAccounts.filter((acc) => {
          const sch = schedules[acc.id];
          if (!sch) return false;
          if (sch.lastCheckedDate === todayStr) return false;
          return sch.scheduledDate === todayStr && currentMinute >= sch.scheduledMinute;
        });

    if (targetAccounts.length === 0) {
      // 检查是否所有账号均已签完
      const allDone = allAccounts.every((acc) => schedules[acc.id]?.lastCheckedDate === todayStr);
      if (allDone && config.lastCheckedDate !== todayStr) {
        saveQoderAutoCheckinConfig({ ...scheduledConfig, lastCheckedDate: todayStr });
      }
      return 'completed';
    }

    let retryNeeded = false;
    let successCount = 0;
    let alreadyCheckedCount = 0;
    let failedCount = 0;
    const details: QoderAutoCheckinAccountDetail[] = [];
    const newSchedules = { ...schedules };

    // 顺序逐个账号签到，严格单线程打散，避免漏签与高并发封禁
    for (let i = 0; i < targetAccounts.length; i++) {
      const acc = targetAccounts[i];
      const emailDisplay = acc.email || acc.id;
      const checkinTime = formatTimeOnly(new Date());

      // 账号间防风控延迟（首个账号不等待，后续账号间隔 1500-2500ms）
      if (i > 0) {
        const jitter = 1500 + Math.floor(Math.random() * 1000);
        await new Promise((resolve) => setTimeout(resolve, jitter));
      }

      const claimFn =
        acc.platformKind === 'qoder'
          ? claimQoderGlobalCheckin
          : acc.platformKind === 'qoder_cn'
          ? claimQoderCnCheckin
          : claimQwenworkCheckin;

      const statusFn =
        acc.platformKind === 'qoder'
          ? getQoderGlobalCheckinStatus
          : acc.platformKind === 'qoder_cn'
          ? getQoderCnCheckinStatus
          : getQwenworkCheckinStatus;

      let attemptSuccess = false;
      let lastErrMsg = '';

      // 单账号重试机制（最多重试 1 次）
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          // 先尝试获取最新状态，避免重复申领
          const currentStatus = await statusFn(acc.id).catch(() => null);
          if (currentStatus?.today_checked_in) {
            alreadyCheckedCount++;
            details.push({
              accountId: acc.id,
              email: emailDisplay,
              platform: acc.platformKind,
              status: 'already',
              message: currentStatus.message || '今日已完成签到核验',
              time: checkinTime,
            });
            newSchedules[acc.id] = {
              ...(newSchedules[acc.id] ?? {
                scheduledDate: todayStr,
                scheduledMinute: currentMinute,
              }),
              lastCheckedDate: todayStr,
            };
            attemptSuccess = true;
            break;
          }

          // 执行签到
          const res = await claimFn(acc.id);
          if (res.alreadyCheckedIn || (res as any).already_checked_in) {
            alreadyCheckedCount++;
            details.push({
              accountId: acc.id,
              email: emailDisplay,
              platform: acc.platformKind,
              status: 'already',
              message: res.message || '今日已完成签到',
              time: checkinTime,
            });
            newSchedules[acc.id] = {
              ...(newSchedules[acc.id] ?? {
                scheduledDate: todayStr,
                scheduledMinute: currentMinute,
              }),
              lastCheckedDate: todayStr,
            };
            attemptSuccess = true;
            break;
          } else if (res.success) {
            successCount++;
            details.push({
              accountId: acc.id,
              email: emailDisplay,
              platform: acc.platformKind,
              status: 'success',
              message: res.message || '签到成功 +100 Credits',
              time: checkinTime,
            });
            newSchedules[acc.id] = {
              ...(newSchedules[acc.id] ?? {
                scheduledDate: todayStr,
                scheduledMinute: currentMinute,
              }),
              lastCheckedDate: todayStr,
            };
            attemptSuccess = true;
            break;
          } else {
            lastErrMsg = res.message || '未获得签到奖励';
          }
        } catch (err: any) {
          lastErrMsg = err?.message || String(err);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      if (!attemptSuccess) {
        failedCount++;
        retryNeeded = true;
        details.push({
          accountId: acc.id,
          email: emailDisplay,
          platform: acc.platformKind,
          status: 'failed',
          message: lastErrMsg || '签到异常',
          time: checkinTime,
        });
      }
    }

    // 检查所有账号是否均已完成今日签到
    const allDone = allAccounts.every((acc) => newSchedules[acc.id]?.lastCheckedDate === todayStr);

    saveQoderAutoCheckinConfig({
      ...scheduledConfig,
      lastCheckedDate: allDone ? todayStr : undefined,
      accountSchedules: newSchedules,
    });

    const logItem: QoderAutoCheckinLogItem = {
      id: `${todayStr}-${startTime}`,
      timestamp: startTime,
      date: todayStr,
      totalAccounts: targetAccounts.length,
      successCount,
      alreadyCheckedCount,
      failedCount,
      details,
    };

    addQoderAutoCheckinLog(logItem);

    // 触发系统与 Webhook 通知
    if (targetAccounts.length > 0) {
      const detailLines = details
        .map((d) => {
          const icon = d.status === 'success' ? '✅' : d.status === 'already' ? 'ℹ️' : '❌';
          const platName =
            d.platform === 'qwenwork'
              ? '千问办公'
              : d.platform === 'qoder_cn'
              ? 'Qoder 国内版'
              : 'Qoder 国际版';
          return `> • **[${platName}] ${d.email}**：${icon} ${d.message}`;
        })
        .join('\n');

      const summaryText = `### 📊 签到统计\n- **执行日期**：${todayStr}\n- **本轮处理**：${targetAccounts.length} 个账号\n- **执行结果**：成功 ${successCount} | 今日已签 ${alreadyCheckedCount} | 失败 ${failedCount}\n\n### 📋 账号明细\n${detailLines || '> • 无待处理账号'}\n\n---\n*AI CodePass 每日自动为您守护算力额度*`;

      void invoke('send_auto_checkin_notification', {
        title: '🎉 [AI CodePass] Qoder / 千问办公 自动打卡汇报',
        summary: summaryText,
      }).catch((e) => {
        console.warn('[QoderAutoCheckin] 发送打卡通知失败:', e);
      });
    }

    return retryNeeded ? 'retry' : 'completed';
  } finally {
    isAutoCheckinCycleRunning = false;
  }
}
