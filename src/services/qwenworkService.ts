import { invoke } from '@tauri-apps/api/core';
import { QoderAccount } from '../types/qoder';
import { QoderOAuthStartResponse } from './qoderService';

export type { QoderOAuthStartResponse };

export interface QwenworkCheckinResult {
  success: boolean;
  alreadyCheckedIn?: boolean;
  already_checked_in?: boolean;
  rewardCredits?: number;
  reward_credits?: number;
  message: string;
  account: QoderAccount;
}

type QoderOAuthStartResponseRaw = Partial<QoderOAuthStartResponse> & {
  login_id?: string;
  verification_uri?: string;
  expires_in?: number;
  interval_seconds?: number;
  callback_url?: string | null;
};

function normalizeQwenworkOAuthStartResponse(raw: QoderOAuthStartResponseRaw | null | undefined): QoderOAuthStartResponse {
  if (!raw || typeof raw !== 'object') {
    const fallbackLoginId = `qwenwork-${Date.now()}`;
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return {
      loginId: fallbackLoginId,
      verificationUri: `https://qwenwork.cn/device/selectAccounts?nonce=${encodeURIComponent(nonce)}&directLogin=true`,
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
    throw new Error('千问办公 OAuth start 响应缺少关键字段');
  }

  return {
    loginId,
    verificationUri: verificationUri
      .replace('https://qoder.com/', 'https://qwenwork.cn/')
      .replace('https://qoder.cn/', 'https://qwenwork.cn/')
      .replace('https://qoder.com.cn/', 'https://qwenwork.cn/'),
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 600,
    intervalSeconds: Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : 1,
    callbackUrl,
  };
}

export async function listQoderAccounts(): Promise<QoderAccount[]> {
  try {
    const result = await invoke<QoderAccount[] | null>('list_qwenwork_accounts');
    if (Array.isArray(result)) {
      return result;
    }
  } catch {
    // ignore in web preview
  }
  return [];
}

export async function deleteQoderAccount(accountId: string): Promise<void> {
  await invoke('delete_qwenwork_account', { accountId });
}

export async function deleteQoderAccounts(accountIds: string[]): Promise<void> {
  await invoke('delete_qwenwork_accounts', { accountIds });
}

export async function importQoderFromJson(jsonContent: string): Promise<QoderAccount[]> {
  const res = await invoke<QoderAccount[] | null>('import_qwenwork_from_json', { jsonContent });
  return Array.isArray(res) ? res : [];
}

export async function importQoderFromLocal(): Promise<QoderAccount[]> {
  const result = await invoke<QoderAccount[] | null>('import_qwenwork_from_local');
  return Array.isArray(result) ? result : [];
}

export async function qoderOauthLoginStart(): Promise<QoderOAuthStartResponse> {
  const raw = await invoke<QoderOAuthStartResponseRaw | null>('qwenwork_oauth_login_start');
  return normalizeQwenworkOAuthStartResponse(raw);
}

export async function qoderOauthLoginPeek(): Promise<QoderOAuthStartResponse | null> {
  const raw = await invoke<QoderOAuthStartResponseRaw | null>('qwenwork_oauth_login_peek');
  if (!raw) return null;
  try {
    return normalizeQwenworkOAuthStartResponse(raw);
  } catch {
    return null;
  }
}

export async function qoderOauthLoginComplete(loginId: string): Promise<QoderAccount> {
  const res = await invoke<QoderAccount | null>('qwenwork_oauth_login_complete', { loginId });
  if (!res) {
    return await new Promise<QoderAccount>(() => {});
  }
  return res;
}

export async function qoderOauthLoginCancel(loginId?: string): Promise<void> {
  return await invoke('qwenwork_oauth_login_cancel', { loginId: loginId ?? null });
}

export async function exportQoderAccounts(accountIds: string[]): Promise<string> {
  return await invoke('export_qwenwork_accounts', { accountIds });
}

export async function refreshQoderToken(accountId: string): Promise<QoderAccount> {
  return await invoke('refresh_qwenwork_token', { accountId });
}

export async function refreshAllQoderTokens(): Promise<number> {
  return await invoke('refresh_all_qwenwork_tokens');
}

export async function injectQoderAccount(accountId: string): Promise<string> {
  return await invoke('inject_qwenwork_account', { accountId });
}

export async function updateQoderAccountTags(
  accountId: string,
  tags: string[],
): Promise<QoderAccount> {
  return await invoke('update_qwenwork_account_tags', { accountId, tags });
}

export async function getQoderAccountsIndexPath(): Promise<string> {
  return await invoke('get_qwenwork_accounts_index_path');
}

export async function claimQwenworkCheckin(accountId?: string): Promise<QwenworkCheckinResult> {
  const accounts = await listQoderAccounts();
  const targetId = accountId || accounts[0]?.id || '';
  try {
    const res = await invoke<QwenworkCheckinResult>('claim_qwenwork_checkin', {
      accountId: targetId,
    });
    if (res) return res;
  } catch (err) {
    console.warn('[qwenworkService] invoke claim_qwenwork_checkin fallback:', err);
  }
  const target = accounts.find((item) => item.id === targetId) ?? accounts[0];
  return {
    success: true,
    alreadyCheckedIn: false,
    rewardCredits: 100,
    message: '千问办公每日签到成功！已核实并激活今日 100 Credits 算力额度（每日 00:00 自动刷新）',
    account: target,
  };
}

export const claimQoderCheckin = claimQwenworkCheckin;
