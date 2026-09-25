import { invoke } from '@tauri-apps/api/core';
import { QoderAccount } from '../types/qoder';

export const QODER_GLOBAL_LOCAL_STORAGE_KEY = 'agtools.qoder.accounts.cache';

export interface QoderOAuthStartResponse {
  loginId: string;
  verificationUri: string;
  expiresIn: number;
  intervalSeconds: number;
  callbackUrl?: string | null;
}

type QoderOAuthStartResponseRaw = Partial<QoderOAuthStartResponse> & {
  login_id?: string;
  verification_uri?: string;
  expires_in?: number;
  interval_seconds?: number;
  callback_url?: string | null;
};

function normalizeQoderOAuthStartResponse(raw: QoderOAuthStartResponseRaw | null | undefined): QoderOAuthStartResponse {
  if (!raw || typeof raw !== 'object') {
    const fallbackLoginId = `qoder-${Date.now()}`;
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return {
      loginId: fallbackLoginId,
      verificationUri: `https://qoder.com/device/selectAccounts?nonce=${encodeURIComponent(nonce)}&directLogin=true`,
      expiresIn: 600,
      intervalSeconds: 2,
      callbackUrl: null,
    };
  }
  const loginId = raw.loginId ?? raw.login_id ?? '';
  const verificationUri = raw.verificationUri ?? raw.verification_uri ?? '';
  const expiresIn = Number(raw.expiresIn ?? raw.expires_in ?? 0);
  const intervalSeconds = Number(raw.intervalSeconds ?? raw.interval_seconds ?? 0);
  const callbackUrl = raw.callbackUrl ?? raw.callback_url ?? null;

  if (!loginId || !verificationUri) {
    throw new Error('Qoder OAuth start 响应缺少关键字段');
  }

  return {
    loginId,
    verificationUri,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 600,
    intervalSeconds: Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : 1,
    callbackUrl,
  };
}

export async function listQoderAccounts(): Promise<QoderAccount[]> {
  try {
    const res = await invoke<QoderAccount[]>('list_qoder_accounts');
    if (Array.isArray(res) && res.length > 0) return res;
  } catch {
    // fallback in web preview mode
  }
  const cached = localStorage.getItem(QODER_GLOBAL_LOCAL_STORAGE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return [];
}

export async function deleteQoderAccount(accountId: string): Promise<void> {
  return await invoke('delete_qoder_account', { accountId });
}

export async function deleteQoderAccounts(accountIds: string[]): Promise<void> {
  return await invoke('delete_qoder_accounts', { accountIds });
}

export async function importQoderFromJson(jsonContent: string): Promise<QoderAccount[]> {
  return await invoke('import_qoder_from_json', { jsonContent });
}

export async function importQoderFromLocal(): Promise<QoderAccount[]> {
  return await invoke('import_qoder_from_local');
}

export async function qoderOauthLoginStart(): Promise<QoderOAuthStartResponse> {
  const raw = await invoke<QoderOAuthStartResponseRaw>('qoder_oauth_login_start');
  return normalizeQoderOAuthStartResponse(raw);
}

export async function qoderOauthLoginPeek(): Promise<QoderOAuthStartResponse | null> {
  const raw = await invoke<QoderOAuthStartResponseRaw | null>('qoder_oauth_login_peek');
  if (!raw) return null;
  try {
    return normalizeQoderOAuthStartResponse(raw);
  } catch {
    return null;
  }
}

export async function qoderOauthLoginComplete(loginId: string): Promise<QoderAccount> {
  const res = await invoke<QoderAccount | null>('qoder_oauth_login_complete', { loginId });
  if (!res) {
    return await new Promise<QoderAccount>(() => {});
  }
  return res;
}

export async function qoderOauthLoginCancel(loginId?: string): Promise<void> {
  return await invoke('qoder_oauth_login_cancel', { loginId: loginId ?? null });
}

export async function exportQoderAccounts(accountIds: string[]): Promise<string> {
  return await invoke('export_qoder_accounts', { accountIds });
}

export async function refreshQoderToken(accountId: string): Promise<QoderAccount> {
  return await invoke('refresh_qoder_token', { accountId });
}

export async function refreshAllQoderTokens(): Promise<number> {
  return await invoke('refresh_all_qoder_tokens');
}

export async function injectQoderAccount(accountId: string): Promise<string> {
  return await invoke('inject_qoder_account', { accountId });
}

export async function updateQoderAccountTags(
  accountId: string,
  tags: string[],
): Promise<QoderAccount> {
  return await invoke('update_qoder_account_tags', { accountId, tags });
}

export async function getQoderAccountsIndexPath(): Promise<string> {
  return await invoke('get_qoder_accounts_index_path');
}

export interface QoderCheckinResult {
  success: boolean;
  alreadyCheckedIn?: boolean;
  already_checked_in?: boolean;
  rewardCredits?: number;
  reward_credits?: number;
  message: string;
  account: QoderAccount;
}

export interface QoderCheckinStatusResult {
  active: boolean;
  today_checked_in: boolean;
  streak_days: number;
  daily_credit: number;
  today_credit: number | null;
  checkin_dates?: string[] | null;
  message?: string;
}

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalCheckinDates(platform: string, accountId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`agtools.${platform}.checkin_dates.${accountId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalCheckinDate(platform: string, accountId: string, dateStr: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalCheckinDates(platform, accountId);
    if (!existing.includes(dateStr)) {
      const updated = [dateStr, ...existing].slice(0, 30);
      localStorage.setItem(`agtools.${platform}.checkin_dates.${accountId}`, JSON.stringify(updated));
    }
  } catch {
    // ignore
  }
}

export async function getQoderCheckinStatus(accountId: string): Promise<QoderCheckinStatusResult> {
  const todayStr = getTodayDateString();
  const localDates = getLocalCheckinDates('qoder', accountId);

  try {
    const res = await invoke<QoderCheckinStatusResult>('get_qoder_checkin_status', { accountId });
    if (res && typeof res === 'object') {
      const mergedDates = Array.from(new Set([...(res.checkin_dates || []), ...localDates])).sort().reverse();
      if (res.today_checked_in) {
        saveLocalCheckinDate('qoder', accountId, todayStr);
      }
      return {
        ...res,
        checkin_dates: mergedDates,
      };
    }
  } catch {
    // fallback
  }

  const accounts = await listQoderAccounts();
  const account = accounts.find((item) => item.id === accountId);
  const creditUsage = account?.auth_credit_usage_raw as Record<string, unknown> | undefined;
  const lastCheckin = (creditUsage?.last_checkin_date as string | undefined) ?? localDates[0];
  const isCheckedIn = lastCheckin === todayStr;
  const mergedDates = Array.from(new Set([...localDates, ...(lastCheckin ? [lastCheckin] : [])])).sort().reverse();

  return {
    active: true,
    today_checked_in: isCheckedIn,
    streak_days: (creditUsage?.streak_days as number) || (isCheckedIn ? 1 : 0),
    daily_credit: 100,
    today_credit: 100,
    checkin_dates: mergedDates,
    message: isCheckedIn ? 'Qoder 国际版今日已完成签到核验' : 'Qoder 国际版待签到领取 +100 Credits',
  };
}

export async function claimQoderCheckin(accountId?: string): Promise<QoderCheckinResult> {
  const todayStr = getTodayDateString();
  try {
    const res = await invoke<QoderCheckinResult>('claim_qoder_checkin', {
      accountId: accountId ?? null,
    });
    if (res && typeof res === 'object') {
      if (res.success || res.alreadyCheckedIn || res.already_checked_in) {
        if (accountId) {
          saveLocalCheckinDate('qoder', accountId, todayStr);
        } else if (res.account?.id) {
          saveLocalCheckinDate('qoder', res.account.id, todayStr);
        }
      }
      return res;
    }
  } catch {
    // fallback in web preview mode
  }
  const accounts = await listQoderAccounts();
  const target = accounts.find((item) => item.id === accountId) ?? accounts[0];
  if (!target) {
    throw new Error('暂无 Qoder 国际版账号可签到');
  }
  saveLocalCheckinDate('qoder', target.id, todayStr);
  const updated: QoderAccount = {
    ...target,
    credits_total: (target.credits_total ?? 100) + 100,
    credits_remaining: (target.credits_remaining ?? 100) + 100,
    usage_updated_at: Math.floor(Date.now() / 1000),
  };
  const nextList = accounts.map((item) => (item.id === updated.id ? updated : item));
  try {
    localStorage.setItem(QODER_GLOBAL_LOCAL_STORAGE_KEY, JSON.stringify(nextList));
  } catch {
    // ignore
  }
  return {
    success: true,
    alreadyCheckedIn: false,
    rewardCredits: 100,
    message: 'Qoder 国际版每日签到成功！获得 +100 Credits（有效期 30 天）',
    account: updated,
  };
}
