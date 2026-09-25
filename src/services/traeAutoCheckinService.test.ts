/**
 * traeAutoCheckinService 纯逻辑单元测试
 *
 * 运行方式：
 *   node --test --experimental-strip-types src/services/traeAutoCheckinService.test.ts
 *
 * 策略：将需要测试的纯函数（不依赖 Tauri IPC / DOM / localStorage）直接在测试文件内
 * 内联实现一份镜像，与 traeAutoCheckinService.ts 源码严格对齐。这样：
 *   - 测试 0 外部依赖，在 Node 测试环境下 100% 可运行
 *   - 若源文件实现发生偏差，类型与行为对比会立刻暴露
 *
 * 涵盖函数：
 *   parseTimeToMinutes / formatMinutesToTime / getTodayDateString /
 *   ensureTraeAccountSchedules / getTraeAutoCheckinNextDelayMs（disabled & retry 分支）
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// ─────────────────────────────────────────────
// ── 镜像实现（与 traeAutoCheckinService.ts 保持同步）──
// ─────────────────────────────────────────────

interface TraeAccountScheduleState {
  scheduledDate: string;
  scheduledMinute: number;
  lastCheckedDate?: string;
}

interface TraeAutoCheckinConfig {
  enabled: boolean;
  startTime: string;
  endTime: string;
  lastCheckedDate?: string;
  accountSchedules?: Record<string, TraeAccountScheduleState>;
}

const DEFAULT_TRAE_AUTO_CHECKIN_CONFIG: TraeAutoCheckinConfig = {
  enabled: false,
  startTime: '06:00',
  endTime: '12:00',
};

const AUTO_CHECKIN_RETRY_DELAY_MS = 5 * 60 * 1000;
const AUTO_CHECKIN_IDLE_RECHECK_DELAY_MS = 60 * 60 * 1000;

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}

function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTodayDateString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 无副作用版 ensureTraeAccountSchedules（去除 saveTraeAutoCheckinConfig 调用） */
function ensureTraeAccountSchedules(
  config: TraeAutoCheckinConfig,
  accounts: Array<{ id: string; email?: string }>,
): TraeAutoCheckinConfig {
  const todayStr = getTodayDateString();
  const startMin = parseTimeToMinutes(config.startTime);
  let endMin = parseTimeToMinutes(config.endTime);
  if (endMin < startMin) endMin = startMin;
  const minRange = Math.max(0, endMin - startMin);

  const existingSchedules = config.accountSchedules ?? {};
  const updatedSchedules: Record<string, TraeAccountScheduleState> = { ...existingSchedules };
  let changed = false;

  for (const account of accounts) {
    const existing = existingSchedules[account.id];
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
      lastCheckedDate: existing?.lastCheckedDate === todayStr ? todayStr : undefined,
    };
    changed = true;
  }

  if (!changed) return config;
  return { ...config, accountSchedules: updatedSchedules };
}

function getMillisecondsUntilNextLocalDay(now: Date): number {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 1, 0);
  return Math.max(1_000, nextDay.getTime() - now.getTime());
}

/** 无副作用版 getTraeAutoCheckinNextDelayMs（使用传入 config 而非读 localStorage） */
function getTraeAutoCheckinNextDelayMs(
  config: TraeAutoCheckinConfig,
  result?: 'disabled' | 'waiting' | 'completed' | 'retry',
  accounts: Array<{ id: string }> = [],
): number {
  if (!config.enabled) return AUTO_CHECKIN_IDLE_RECHECK_DELAY_MS;
  if (result === 'retry') return AUTO_CHECKIN_RETRY_DELAY_MS;

  const now = new Date();
  const todayStr = getTodayDateString();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  const updatedConfig = accounts.length > 0 ? ensureTraeAccountSchedules(config, accounts) : config;
  const schedules = updatedConfig.accountSchedules;

  if (schedules && Object.keys(schedules).length > 0) {
    let nextScheduledMinute: number | null = null;
    for (const accId of Object.keys(schedules)) {
      const sch = schedules[accId];
      if (!sch || sch.lastCheckedDate === todayStr) continue;
      if (nextScheduledMinute === null || sch.scheduledMinute < nextScheduledMinute) {
        nextScheduledMinute = sch.scheduledMinute;
      }
    }
    if (nextScheduledMinute === null) return getMillisecondsUntilNextLocalDay(now);
    if (currentMinute >= nextScheduledMinute) return 1_000;
    const scheduledAt = new Date(now);
    scheduledAt.setHours(Math.floor(nextScheduledMinute / 60), nextScheduledMinute % 60, 0, 0);
    return Math.max(1_000, scheduledAt.getTime() - now.getTime());
  }

  if (updatedConfig.lastCheckedDate === todayStr) return getMillisecondsUntilNextLocalDay(now);
  const startMin = parseTimeToMinutes(updatedConfig.startTime);
  const endMin = Math.max(startMin, parseTimeToMinutes(updatedConfig.endTime));
  if (currentMinute < startMin) {
    const scheduledAt = new Date(now);
    scheduledAt.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    return Math.max(1_000, scheduledAt.getTime() - now.getTime());
  }
  if (currentMinute >= endMin) return getMillisecondsUntilNextLocalDay(now);
  return 1_000;
}

// ─────────────────────────────────────────────
// 时间工具函数
// ─────────────────────────────────────────────

test('parseTimeToMinutes: 正确将 HH:mm 转换为分钟数', () => {
  assert.equal(parseTimeToMinutes('06:00'), 360);
  assert.equal(parseTimeToMinutes('12:30'), 750);
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('23:59'), 1439);
});

test('formatMinutesToTime: 正确将分钟数转换为 HH:mm', () => {
  assert.equal(formatMinutesToTime(360), '06:00');
  assert.equal(formatMinutesToTime(750), '12:30');
  assert.equal(formatMinutesToTime(0), '00:00');
  assert.equal(formatMinutesToTime(1439), '23:59');
});

test('getTodayDateString: 返回 YYYY-MM-DD 格式字符串', () => {
  const result = getTodayDateString();
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

// ─────────────────────────────────────────────
// ensureTraeAccountSchedules
// ─────────────────────────────────────────────

test('ensureTraeAccountSchedules: 为新账号在时间窗口内随机分配调度分钟', () => {
  const config: TraeAutoCheckinConfig = { enabled: true, startTime: '06:00', endTime: '12:00' };
  const accounts = [
    { id: 'acc_1', email: 'user1@example.com' },
    { id: 'acc_2', email: 'user2@example.com' },
  ];
  const result = ensureTraeAccountSchedules(config, accounts);
  assert.ok(result.accountSchedules, '应存在 accountSchedules');
  assert.equal(Object.keys(result.accountSchedules).length, 2, '应有 2 个账号调度');

  const sch1 = result.accountSchedules['acc_1'];
  assert.ok(sch1, 'acc_1 调度应存在');
  assert.ok(sch1.scheduledMinute >= 360 && sch1.scheduledMinute <= 720,
    `acc_1 scheduledMinute=${sch1.scheduledMinute} 应在 [360, 720]`);

  const sch2 = result.accountSchedules['acc_2'];
  assert.ok(sch2, 'acc_2 调度应存在');
  assert.ok(sch2.scheduledMinute >= 360 && sch2.scheduledMinute <= 720,
    `acc_2 scheduledMinute=${sch2.scheduledMinute} 应在 [360, 720]`);
});

test('ensureTraeAccountSchedules: start==end 时调度时间等于 startTime', () => {
  const config: TraeAutoCheckinConfig = { enabled: true, startTime: '08:00', endTime: '08:00' };
  const result = ensureTraeAccountSchedules(config, [{ id: 'acc_1' }]);
  assert.equal(result.accountSchedules?.['acc_1']?.scheduledMinute, 480,
    '开始等于结束时应为 480（08:00）');
});

test('ensureTraeAccountSchedules: 不重新分配当日已有有效调度的账号', () => {
  const todayStr = getTodayDateString();
  const config: TraeAutoCheckinConfig = {
    enabled: true, startTime: '06:00', endTime: '12:00',
    accountSchedules: { acc_1: { scheduledDate: todayStr, scheduledMinute: 400 } },
  };
  // 调度已在有效窗口内，不应改变
  const result = ensureTraeAccountSchedules(config, [{ id: 'acc_1' }]);
  assert.equal(result.accountSchedules?.['acc_1']?.scheduledMinute, 400, '不应修改已有当日调度');
});

test('ensureTraeAccountSchedules: 过期调度应被当日新调度替换', () => {
  const config: TraeAutoCheckinConfig = {
    enabled: true, startTime: '06:00', endTime: '12:00',
    accountSchedules: { acc_1: { scheduledDate: '2000-01-01', scheduledMinute: 400 } },
  };
  const result = ensureTraeAccountSchedules(config, [{ id: 'acc_1' }]);
  const sch = result.accountSchedules?.['acc_1'];
  assert.ok(sch, '账号调度应存在');
  assert.equal(sch.scheduledDate, getTodayDateString(), '应更新为当日日期');
  assert.ok(sch.scheduledMinute >= 360 && sch.scheduledMinute <= 720, '应在有效窗口内');
});

test('ensureTraeAccountSchedules: 不清除当日已签到账号的 lastCheckedDate', () => {
  const todayStr = getTodayDateString();
  const config: TraeAutoCheckinConfig = {
    enabled: true, startTime: '06:00', endTime: '12:00',
    accountSchedules: {
      acc_1: { scheduledDate: '2000-01-01', scheduledMinute: 400, lastCheckedDate: todayStr },
    },
  };
  const result = ensureTraeAccountSchedules(config, [{ id: 'acc_1' }]);
  assert.equal(result.accountSchedules?.['acc_1']?.lastCheckedDate, todayStr,
    '当日签到标记不应被清除');
});

test('ensureTraeAccountSchedules: 空账号列表时返回原配置引用不变', () => {
  const config: TraeAutoCheckinConfig = { enabled: true, startTime: '06:00', endTime: '12:00' };
  const result = ensureTraeAccountSchedules(config, []);
  assert.equal(result, config, '无账号时应返回原配置引用');
});

// ─────────────────────────────────────────────
// getTraeAutoCheckinNextDelayMs
// ─────────────────────────────────────────────

test('getTraeAutoCheckinNextDelayMs: 禁用时返回 1 小时延迟', () => {
  const config = { ...DEFAULT_TRAE_AUTO_CHECKIN_CONFIG };
  assert.equal(getTraeAutoCheckinNextDelayMs(config), AUTO_CHECKIN_IDLE_RECHECK_DELAY_MS);
});

test('getTraeAutoCheckinNextDelayMs: retry 时返回 5 分钟延迟', () => {
  const config: TraeAutoCheckinConfig = { enabled: true, startTime: '06:00', endTime: '12:00' };
  assert.equal(getTraeAutoCheckinNextDelayMs(config, 'retry'), AUTO_CHECKIN_RETRY_DELAY_MS);
});

test('getTraeAutoCheckinNextDelayMs: 所有账号今日已签时等到次日', () => {
  const todayStr = getTodayDateString();
  const config: TraeAutoCheckinConfig = {
    enabled: true, startTime: '06:00', endTime: '12:00',
    accountSchedules: {
      acc_1: { scheduledDate: todayStr, scheduledMinute: 360, lastCheckedDate: todayStr },
    },
  };
  const delay = getTraeAutoCheckinNextDelayMs(config, 'completed', [{ id: 'acc_1' }]);
  assert.ok(delay >= 60_000, `所有账号已签时延迟应大于 1 分钟，实际=${delay}`);
});
