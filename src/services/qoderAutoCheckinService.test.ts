import assert from 'node:assert/strict';
import test from 'node:test';

interface QoderAccountScheduleState {
  scheduledDate: string;
  scheduledMinute: number;
  lastCheckedDate?: string;
}

interface QoderAutoCheckinConfig {
  enabled: boolean;
  startTime: string;
  endTime: string;
  lastCheckedDate?: string;
  accountSchedules?: Record<string, QoderAccountScheduleState>;
}

function parseTimeToMinutes(timeStr: string): number {
  const [hh, mm] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (hh || 0) * 60 + (mm || 0);
}

function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ensureQoderAccountSchedules(
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

  return {
    ...config,
    accountSchedules: updatedSchedules,
  };
}

test('parseTimeToMinutes correctly converts HH:mm to minutes', () => {
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('10:05'), 605);
  assert.equal(parseTimeToMinutes('14:30'), 870);
  assert.equal(parseTimeToMinutes('23:59'), 1439);
});

test('formatMinutesToTime correctly converts minutes to HH:mm', () => {
  assert.equal(formatMinutesToTime(0), '00:00');
  assert.equal(formatMinutesToTime(605), '10:05');
  assert.equal(formatMinutesToTime(870), '14:30');
});

test('ensureQoderAccountSchedules allocates scheduled minutes within defined time range', () => {
  const config: QoderAutoCheckinConfig = {
    enabled: true,
    startTime: '10:05',
    endTime: '12:00',
  };
  const accounts = [{ id: 'acc1' }, { id: 'acc2' }, { id: 'acc3' }];
  const updated = ensureQoderAccountSchedules(config, accounts);

  const schedules = updated.accountSchedules;
  assert.ok(schedules);
  for (const acc of accounts) {
    const sch: any = schedules[acc.id];
    assert.ok(sch);
    assert.equal(sch.scheduledDate, getTodayDateString());
    assert.ok(sch.scheduledMinute >= 605 && sch.scheduledMinute <= 720);
  }
});

test('ensureQoderAccountSchedules preserves lastCheckedDate when today is checked', () => {
  const todayStr = getTodayDateString();
  const config: QoderAutoCheckinConfig = {
    enabled: true,
    startTime: '10:05',
    endTime: '12:00',
    accountSchedules: {
      acc1: {
        scheduledDate: todayStr,
        scheduledMinute: 610,
        lastCheckedDate: todayStr,
      },
    },
  };
  const accounts = [{ id: 'acc1' }, { id: 'acc2' }];
  const updated = ensureQoderAccountSchedules(config, accounts);

  assert.equal(updated.accountSchedules!['acc1'].lastCheckedDate, todayStr);
  assert.equal(updated.accountSchedules!['acc2'].lastCheckedDate, undefined);
});
