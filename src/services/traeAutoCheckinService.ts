/**
 * Trae Work CN 自动签到服务
 *
 * 基于 workbuddyAutoCheckinService 模式，适配 Trae 的签到 API。
 * 改进点：
 *  - 账号级随机调度：在配置时间窗口内为每个账号随机分配独立签到时间（对齐 WorkBuddy）
 *  - 修复：无账号时同样更新 lastCheckedDate，防止每次轮询重跑
 *  - 精准延迟计算：根据下一个未签到账号的调度时间计算等待毫秒数
 */

import { invoke } from '@tauri-apps/api/core';
import { listTraeAccounts, getTraeCheckinStatus, claimTraeCheckin } from './traeService';
import { useTraeAccountStore } from '../stores/useTraeAccountStore';
import { isTraeCnAccountPlatform } from '../types/trae';

// ─────────────────────────────────────────────
// 类型与常量
// ─────────────────────────────────────────────

export interface TraeAccountScheduleState {
  scheduledDate: string;    // "YYYY-MM-DD"
  scheduledMinute: number;  // 距午夜分钟数（0..1439）
  lastCheckedDate?: string; // "YYYY-MM-DD" 签到完成日期
}

export interface TraeAutoCheckinConfig {
  enabled: boolean;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  lastCheckedDate?: string; // "YYYY-MM-DD"（整体层面，仅用于兼容旧数据）
  accountSchedules?: Record<string, TraeAccountScheduleState>;
}

export const DEFAULT_TRAE_AUTO_CHECKIN_CONFIG: TraeAutoCheckinConfig = {
  enabled: false,
  startTime: '00:30',
  endTime: '05:30',
};

const CONFIG_KEY = 'agtools.trae.auto_checkin_config';
export const TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT = 'trae-auto-checkin-config-changed';
const AUTO_CHECKIN_RETRY_DELAY_MS = 5 * 60 * 1000;
const AUTO_CHECKIN_IDLE_RECHECK_DELAY_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type TraeAutoCheckinCycleResult = 'disabled' | 'waiting' | 'completed' | 'retry';

// ─────────────────────────────────────────────
// 配置读写
// ─────────────────────────────────────────────

function isValidTime(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function getTraeAutoCheckinConfig(): TraeAutoCheckinConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_TRAE_AUTO_CHECKIN_CONFIG;
  }
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      return DEFAULT_TRAE_AUTO_CHECKIN_CONFIG;
    }
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : false,
      startTime: isValidTime(parsed.startTime) ? parsed.startTime : '00:30',
      endTime: isValidTime(parsed.endTime) ? parsed.endTime : '05:30',
      lastCheckedDate: typeof parsed.lastCheckedDate === 'string' ? parsed.lastCheckedDate : undefined,
      accountSchedules:
        typeof parsed.accountSchedules === 'object' && parsed.accountSchedules !== null
          ? (parsed.accountSchedules as Record<string, TraeAccountScheduleState>)
          : undefined,
    };
  } catch {
    return DEFAULT_TRAE_AUTO_CHECKIN_CONFIG;
  }
}

export function saveTraeAutoCheckinConfig(config: TraeAutoCheckinConfig): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event(TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT));
  } catch (err) {
    console.warn('[TraeAutoCheckin] 保存配置失败:', err);
  }
}

// ─────────────────────────────────────────────
// 时间工具函数
// ─────────────────────────────────────────────

export function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}

export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatTimeOnly(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatFormattedTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ─────────────────────────────────────────────
// 账号级随机调度（对齐 WorkBuddy）
// ─────────────────────────────────────────────

/**
 * 为尚无当日有效调度的账号在时间窗口内随机分配签到分钟数。
 * 已有当日有效调度的账号不受影响。
 * 若配置有变更则返回更新后的配置，否则返回原配置引用。
 */
export function ensureTraeAccountSchedules(
  config: TraeAutoCheckinConfig,
  accounts: Array<{ id: string; email?: string }>,
): TraeAutoCheckinConfig {
  const todayStr = getTodayDateString();
  const startMin = parseTimeToMinutes(config.startTime);
  let endMin = parseTimeToMinutes(config.endTime);
  if (endMin < startMin) {
    endMin = startMin;
  }
  const minRange = Math.max(0, endMin - startMin);

  const existingSchedules = config.accountSchedules ?? {};
  const updatedSchedules: Record<string, TraeAccountScheduleState> = { ...existingSchedules };
  let changed = false;

  for (const account of accounts) {
    const existing = existingSchedules[account.id];

    // 如果当日调度已分配且在有效时间窗口内，跳过
    if (
      existing &&
      existing.scheduledDate === todayStr &&
      existing.scheduledMinute >= startMin &&
      existing.scheduledMinute <= endMin
    ) {
      continue;
    }

    const randomOffset = minRange > 0 ? Math.floor(Math.random() * (minRange + 1)) : 0;
    const scheduledMinute = startMin + randomOffset;

    updatedSchedules[account.id] = {
      scheduledDate: todayStr,
      scheduledMinute,
      // 保留当日已签到标记，不重置
      lastCheckedDate: existing?.lastCheckedDate === todayStr ? todayStr : undefined,
    };
    changed = true;
  }

  if (!changed) {
    return config;
  }

  const updatedConfig: TraeAutoCheckinConfig = {
    ...config,
    accountSchedules: updatedSchedules,
  };
  saveTraeAutoCheckinConfig(updatedConfig);
  return updatedConfig;
}

// ─────────────────────────────────────────────
// 下次延迟计算
// ─────────────────────────────────────────────

let isAutoCheckinCycleRunning = false;

function getMillisecondsUntilNextLocalDay(now: Date): number {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 1, 0);
  return Math.max(1_000, nextDay.getTime() - now.getTime());
}

/**
 * 根据当前签到结果与账号调度，计算下次触发的等待毫秒数。
 */
export function getTraeAutoCheckinNextDelayMs(
  result?: TraeAutoCheckinCycleResult,
  accounts: Array<{ id: string }> = [],
): number {
  if (result === 'retry') {
    return AUTO_CHECKIN_RETRY_DELAY_MS;
  }

  const config = getTraeAutoCheckinConfig();
  if (!config.enabled) {
    return AUTO_CHECKIN_IDLE_RECHECK_DELAY_MS;
  }

  const now = new Date();
  const todayStr = getTodayDateString();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  // 若有账号调度信息，精确计算下一个待签账号的等待时间
  const updatedConfig = accounts.length > 0
    ? ensureTraeAccountSchedules(config, accounts)
    : config;
  const schedules = updatedConfig.accountSchedules;

  if (schedules && Object.keys(schedules).length > 0) {
    let nextScheduledMinute: number | null = null;

    for (const accId of Object.keys(schedules)) {
      const sch = schedules[accId];
      if (!sch) continue;
      if (sch.lastCheckedDate === todayStr) continue; // 今日已签，跳过

      if (nextScheduledMinute === null || sch.scheduledMinute < nextScheduledMinute) {
        nextScheduledMinute = sch.scheduledMinute;
      }
    }

    if (nextScheduledMinute === null) {
      // 所有账号今日已签完
      return getMillisecondsUntilNextLocalDay(now);
    }

    if (currentMinute >= nextScheduledMinute) {
      return 1_000; // 立即触发
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

  // 兼容旧模式（无账号调度信息）：整体 lastCheckedDate 判断
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

// ─────────────────────────────────────────────
// 日志读写
// ─────────────────────────────────────────────

export interface TraeAutoCheckinAccountDetail {
  accountId: string;
  email: string;
  status: 'success' | 'already_checked' | 'failed' | 'inactive';
  time?: string;
  message?: string;
  credit?: number;
}

export interface TraeAutoCheckinLogRecord {
  id: string;
  timestamp: string;
  date: string;
  durationMs: number;
  totalAccounts: number;
  successCount: number;
  alreadyCheckedCount: number;
  failedCount: number;
  status: 'success' | 'partial' | 'failed' | 'no_accounts';
  details: TraeAutoCheckinAccountDetail[];
}

const LOGS_KEY = 'agtools.trae.auto_checkin_logs';
export const TRAE_AUTO_CHECKIN_LOGS_CHANGED_EVENT = 'trae-auto-checkin-logs-changed';

export function getTraeAutoCheckinLogs(): TraeAutoCheckinLogRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as TraeAutoCheckinLogRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    const now = Date.now();
    const validLogs = parsed.filter((log) => {
      const logTime = new Date(log.timestamp.replace(' ', 'T')).getTime();
      return !isNaN(logTime) && now - logTime <= THIRTY_DAYS_MS;
    });

    if (validLogs.length !== parsed.length) {
      localStorage.setItem(LOGS_KEY, JSON.stringify(validLogs));
    }
    return validLogs;
  } catch {
    return [];
  }
}

export function saveTraeAutoCheckinLogs(logs: TraeAutoCheckinLogRecord[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const now = Date.now();
    const validLogs = logs.filter((log) => {
      const logTime = new Date(log.timestamp.replace(' ', 'T')).getTime();
      return !isNaN(logTime) && now - logTime <= THIRTY_DAYS_MS;
    });
    localStorage.setItem(LOGS_KEY, JSON.stringify(validLogs));
    window.dispatchEvent(new Event(TRAE_AUTO_CHECKIN_LOGS_CHANGED_EVENT));
  } catch (err) {
    console.warn('[TraeAutoCheckin] 保存自动签到日志失败:', err);
  }
}

export function addTraeAutoCheckinLog(record: TraeAutoCheckinLogRecord): void {
  const currentLogs = getTraeAutoCheckinLogs();
  const existingIndex = currentLogs.findIndex((l) => l.date === record.date);

  if (existingIndex < 0) {
    saveTraeAutoCheckinLogs([record, ...currentLogs]);
    return;
  }

  const existing = currentLogs[existingIndex];
  if (!existing) {
    saveTraeAutoCheckinLogs([record, ...currentLogs]);
    return;
  }

  const mergedDetailsMap = new Map<string, TraeAutoCheckinAccountDetail>();
  for (const d of existing.details) {
    mergedDetailsMap.set(d.accountId, d);
  }
  for (const d of record.details) {
    mergedDetailsMap.set(d.accountId, d);
  }

  const mergedDetails = Array.from(mergedDetailsMap.values());
  let successCount = 0;
  let alreadyCheckedCount = 0;
  let failedCount = 0;

  for (const d of mergedDetails) {
    if (d.status === 'success') successCount++;
    else if (d.status === 'already_checked') alreadyCheckedCount++;
    else if (d.status === 'failed') failedCount++;
  }

  const totalAccounts = mergedDetails.length;
  const overallStatus: TraeAutoCheckinLogRecord['status'] =
    totalAccounts === 0
      ? 'no_accounts'
      : failedCount === 0
        ? 'success'
        : successCount > 0 || alreadyCheckedCount > 0
          ? 'partial'
          : 'failed';

  const mergedRecord: TraeAutoCheckinLogRecord = {
    id: existing.id,
    timestamp: record.timestamp,
    date: record.date,
    durationMs: existing.durationMs + record.durationMs,
    totalAccounts,
    successCount,
    alreadyCheckedCount,
    failedCount,
    status: overallStatus,
    details: mergedDetails,
  };

  const updatedLogs = [...currentLogs];
  updatedLogs[existingIndex] = mergedRecord;
  saveTraeAutoCheckinLogs(updatedLogs);
}

export function clearTraeAutoCheckinLogs(): void {
  saveTraeAutoCheckinLogs([]);
}

// ─────────────────────────────────────────────
// 核心签到周期
// ─────────────────────────────────────────────

export async function runTraeAutoCheckinCycleIfNeeded(
  force = false,
): Promise<TraeAutoCheckinCycleResult> {
  const config = getTraeAutoCheckinConfig();
  if (!config.enabled && !force) {
    return 'disabled';
  }

  if (isAutoCheckinCycleRunning) {
    return 'waiting';
  }

  isAutoCheckinCycleRunning = true;
  const startTime = Date.now();
  const startTimestampStr = formatFormattedTimestamp(new Date(startTime));
  const todayStr = getTodayDateString();

  try {
    console.log('[TraeAutoCheckin] 检查签到任务...');
    const allAccounts = await listTraeAccounts();
    // 自动签到仅对国内版账号生效（国际版为月度重置，无每日签到活动）
    const accounts = allAccounts.filter(isTraeCnAccountPlatform);

    if (accounts.length === 0) {
      // Bug Fix：无账号时也需更新 lastCheckedDate，防止每次轮询都重跑
      saveTraeAutoCheckinConfig({ ...config, lastCheckedDate: todayStr });
      if (force) {
        addTraeAutoCheckinLog({
          id: `log_${startTime}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: startTimestampStr,
          date: todayStr,
          durationMs: Date.now() - startTime,
          totalAccounts: 0,
          successCount: 0,
          alreadyCheckedCount: 0,
          failedCount: 0,
          status: 'no_accounts',
          details: [],
        });
      }
      return 'completed';
    }

    // 初始化/刷新每账号的随机调度，保存最新配置
    const scheduledConfig = ensureTraeAccountSchedules(config, accounts);
    const schedules = scheduledConfig.accountSchedules ?? {};
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();

    // 筛选本次应处理的账号
    const targetAccounts = force
      ? accounts
      : accounts.filter((account) => {
          const sch = schedules[account.id];
          if (!sch) return false;
          if (sch.lastCheckedDate === todayStr) return false; // 今日已签
          return sch.scheduledDate === todayStr && currentMinute >= sch.scheduledMinute;
        });

    if (targetAccounts.length === 0) {
      // 还没到任何账号的签到时间
      return 'completed';
    }

    let retryNeeded = false;
    let successCount = 0;
    let alreadyCheckedCount = 0;
    let failedCount = 0;
    let didCheckinAny = false;
    const details: TraeAutoCheckinAccountDetail[] = [];
    const newSchedules = { ...schedules };

    for (const account of targetAccounts) {
      const emailDisplay = account.email || account.id;
      const accountCheckinTime = formatTimeOnly(new Date());
      try {
        const status = await getTraeCheckinStatus(account.id);
        if (status.checked_in) {
          alreadyCheckedCount++;
          details.push({
            accountId: account.id,
            email: emailDisplay,
            status: 'already_checked',
            time: accountCheckinTime,
            message: '今日已完成签到',
          });
          // 标记当日已处理，防止重复检查
          newSchedules[account.id] = {
            ...(newSchedules[account.id] ?? {
              scheduledDate: todayStr,
              scheduledMinute: currentMinute,
            }),
            lastCheckedDate: todayStr,
          };
        } else {
          console.log(`[TraeAutoCheckin] 为账号 ${emailDisplay} 执行签到...`);
          const result = await claimTraeCheckin(account.id);
          didCheckinAny = true;
          successCount++;
          details.push({
            accountId: account.id,
            email: emailDisplay,
            status: 'success',
            time: accountCheckinTime,
            message: result.message || '签到成功',
            credit: result.total_credits,
          });
          newSchedules[account.id] = {
            ...(newSchedules[account.id] ?? {
              scheduledDate: todayStr,
              scheduledMinute: currentMinute,
            }),
            lastCheckedDate: todayStr,
          };
        }
      } catch (accountErr) {
        const errMsg = accountErr instanceof Error ? accountErr.message : String(accountErr);
        console.warn(`[TraeAutoCheckin] 账号 ${account.id} 签到异常:`, accountErr);
        retryNeeded = true;
        failedCount++;
        details.push({
          accountId: account.id,
          email: emailDisplay,
          status: 'failed',
          time: accountCheckinTime,
          message: errMsg,
        });
      }
    }

    // 持久化更新后的调度状态（含 lastCheckedDate 标记）
    saveTraeAutoCheckinConfig({
      ...scheduledConfig,
      lastCheckedDate: todayStr,
      accountSchedules: newSchedules,
    });

    const durationMs = Date.now() - startTime;
    const overallStatus: TraeAutoCheckinLogRecord['status'] =
      failedCount === 0
        ? 'success'
        : successCount > 0 || alreadyCheckedCount > 0
          ? 'partial'
          : 'failed';

    addTraeAutoCheckinLog({
      id: `log_${startTime}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: startTimestampStr,
      date: todayStr,
      durationMs,
      totalAccounts: targetAccounts.length,
      successCount,
      alreadyCheckedCount,
      failedCount,
      status: overallStatus,
      details,
    });

    // 触发 Webhook 自动打卡结果推送
    if (targetAccounts.length > 0) {
      const detailLines = details
        .map((d) => {
          const icon = d.status === 'success' ? '✅' : d.status === 'already_checked' ? 'ℹ️' : '❌';
          return `> • **${d.email || d.accountId}**：${icon} ${d.message || (d.status === 'success' ? '签到成功' : '今日已完成签到')}`;
        })
        .join('\n');

      const summaryText = `### 📊 签到统计\n- **执行日期**：${todayStr}\n- **处理账号**：${targetAccounts.length} 个账号\n- **执行结果**：成功 ${successCount} | 今日已签 ${alreadyCheckedCount} | 失败 ${failedCount}\n- **执行耗时**：${durationMs} ms\n\n### 📋 账号明细\n${detailLines || '> • 无待处理账号'}\n\n---\n*AI CodePass 每日自动为您守护算力额度*`;

      void invoke('send_auto_checkin_notification', {
        title: '🎉 [AI CodePass] Trae 自动打卡汇报',
        summary: summaryText,
      }).catch((e) => {
        console.warn('[TraeAutoCheckin] 发送打卡通知失败:', e);
      });
    }

    if (didCheckinAny) {
      void useTraeAccountStore.getState().fetchAccounts().catch((err) => {
        console.warn('[TraeAutoCheckin] 刷新账号列表失败:', err);
      });
    }
    return retryNeeded ? 'retry' : 'completed';
  } catch (err) {
    console.error('[TraeAutoCheckin] 自动签到周期失败:', err);
    return 'retry';
  } finally {
    isAutoCheckinCycleRunning = false;
  }
}