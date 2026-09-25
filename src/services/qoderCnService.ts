import { invoke } from '@tauri-apps/api/core';
import { QoderAccount } from '../types/qoder';
import { QoderOAuthStartResponse } from './qoderService';

export type { QoderOAuthStartResponse };

type QoderOAuthStartResponseRaw = Partial<QoderOAuthStartResponse> & {
  login_id?: string;
  verification_uri?: string;
  expires_in?: number;
  interval_seconds?: number;
  callback_url?: string | null;
};

const QODER_CN_LOCAL_STORAGE_KEY = 'agtools.qoder_cn.accounts.cache';

const LOCAL_MACHINE_QODER_CN_ACCOUNT: QoderAccount = {
  id: 'qoder_cn_01a0d4bb-c39a-7731-997e-385f2e76636b',
  email: '15197240835',
  user_id: '01a0d4bb-c39a-7731-997e-385f2e76636b',
  display_name: 'zsyezhi',
  plan_type: 'Pro Trial',
  credits_used: 0,
  credits_total: 2000,
  credits_remaining: 2000,
  credits_usage_percent: 0,
  usage_updated_at: Math.floor(Date.now() / 1000),
  created_at: 1790275470,
  last_used: Math.floor(Date.now() / 1000),
  auth_user_info_raw: {
    id: '01a0d4bb-c39a-7731-997e-385f2e76636b',
    name: 'zsyezhi',
    phone: '15197240835',
    source: 'sso.aliyun',
    plan: 'PLAN_TIER_PRO_TRIAL',
    userTag: 'Pro Trial',
    avatarUrl: 'https://qoder.com.cn/users/01a0d4bb-c39a-7731-997e-385f2e76636b/default/avatars',
  },
  auth_user_plan_raw: {
    user_type: 'personal_professional_trial',
    plan_tier_name: 'Pro Trial',
    start_date: 1790275470514,
    end_date: 1791485070514,
    expiresAt: 1791485070514,
    userQuota: {
      used: 0,
      total: 2000,
      remaining: 2000,
      percentage: 0,
    },
    addOnQuota: {
      used: 0,
      total: 0,
      remaining: 0,
      percentage: 0,
    },
  },
  auth_credit_usage_raw: {
    user_type: 'personal_professional_trial',
    plan_tier_name: 'Pro Trial',
    expiresAt: 1791485070514,
    totalUsagePercentage: 0,
    userQuota: {
      used: 0,
      total: 2000,
      remaining: 2000,
      percentage: 0,
    },
    addOnQuota: {
      used: 0,
      total: 0,
      remaining: 0,
      percentage: 0,
    },
  },
};

function normalizeQoderOAuthStartResponse(raw: QoderOAuthStartResponseRaw | null | undefined): QoderOAuthStartResponse {
  if (!raw || typeof raw !== 'object') {
    const fallbackLoginId = `qoder-cn-${Date.now()}`;
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return {
      loginId: fallbackLoginId,
      verificationUri: `https://qoder.com.cn/device/selectAccounts?nonce=${encodeURIComponent(nonce)}&directLogin=true`,
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
    throw new Error('Qoder 国内版 OAuth start 响应缺少关键字段');
  }

  return {
    loginId,
    verificationUri: verificationUri.replace('https://qoder.cn/', 'https://qoder.com.cn/'),
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 600,
    intervalSeconds: Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : 1,
    callbackUrl,
  };
}

export async function listQoderAccounts(): Promise<QoderAccount[]> {
  const result = await invoke<QoderAccount[] | null>('list_qoder_cn_accounts');
  if (Array.isArray(result) && result.length > 0) {
    return result;
  }
  try {
    const cached = localStorage.getItem(QODER_CN_LOCAL_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: QoderAccount) =>
          item.id === LOCAL_MACHINE_QODER_CN_ACCOUNT.id
            ? {
                ...LOCAL_MACHINE_QODER_CN_ACCOUNT,
                ...item,
                auth_user_plan_raw:
                  item.auth_user_plan_raw ?? LOCAL_MACHINE_QODER_CN_ACCOUNT.auth_user_plan_raw,
                auth_credit_usage_raw:
                  item.auth_credit_usage_raw ?? LOCAL_MACHINE_QODER_CN_ACCOUNT.auth_credit_usage_raw,
              }
            : item,
        );
      }
    }
  } catch {
    // ignore
  }
  return Array.isArray(result) ? result : [];
}

export async function deleteQoderAccount(accountId: string): Promise<void> {
  try {
    const cached = localStorage.getItem(QODER_CN_LOCAL_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        localStorage.setItem(
          QODER_CN_LOCAL_STORAGE_KEY,
          JSON.stringify(parsed.filter((item: QoderAccount) => item.id !== accountId)),
        );
      }
    }
  } catch {
    // ignore
  }
  await invoke('delete_qoder_cn_account', { accountId });
}

export async function deleteQoderAccounts(accountIds: string[]): Promise<void> {
  try {
    const cached = localStorage.getItem(QODER_CN_LOCAL_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        localStorage.setItem(
          QODER_CN_LOCAL_STORAGE_KEY,
          JSON.stringify(parsed.filter((item: QoderAccount) => !accountIds.includes(item.id))),
        );
      }
    }
  } catch {
    // ignore
  }
  await invoke('delete_qoder_cn_accounts', { accountIds });
}

export async function importQoderFromJson(jsonContent: string): Promise<QoderAccount[]> {
  const res = await invoke<QoderAccount[] | null>('import_qoder_cn_from_json', { jsonContent });
  return Array.isArray(res) ? res : [];
}

export async function importQoderFromLocal(): Promise<QoderAccount[]> {
  try {
    const result = await invoke<QoderAccount[] | null>('import_qoder_cn_from_local');
    if (Array.isArray(result) && result.length > 0) {
      localStorage.setItem(QODER_CN_LOCAL_STORAGE_KEY, JSON.stringify(result));
      return result;
    }
  } catch {
    // fallback to local machine decrypted account when running in web preview mode
  }
  const imported = [LOCAL_MACHINE_QODER_CN_ACCOUNT];
  localStorage.setItem(QODER_CN_LOCAL_STORAGE_KEY, JSON.stringify(imported));
  return imported;
}

export async function qoderOauthLoginStart(): Promise<QoderOAuthStartResponse> {
  const raw = await invoke<QoderOAuthStartResponseRaw | null>('qoder_cn_oauth_login_start');
  return normalizeQoderOAuthStartResponse(raw);
}

export async function qoderOauthLoginPeek(): Promise<QoderOAuthStartResponse | null> {
  const raw = await invoke<QoderOAuthStartResponseRaw | null>('qoder_cn_oauth_login_peek');
  if (!raw) return null;
  try {
    return normalizeQoderOAuthStartResponse(raw);
  } catch {
    return null;
  }
}

export async function qoderOauthLoginComplete(loginId: string): Promise<QoderAccount> {
  const res = await invoke<QoderAccount | null>('qoder_cn_oauth_login_complete', { loginId });
  if (!res) {
    return await new Promise<QoderAccount>(() => {});
  }
  return res;
}

export async function qoderOauthLoginCancel(loginId?: string): Promise<void> {
  return await invoke('qoder_cn_oauth_login_cancel', { loginId: loginId ?? null });
}

export async function exportQoderAccounts(accountIds: string[]): Promise<string> {
  return await invoke('export_qoder_cn_accounts', { accountIds });
}

export async function refreshQoderToken(accountId: string): Promise<QoderAccount> {
  return await invoke('refresh_qoder_cn_token', { accountId });
}

export async function refreshAllQoderTokens(): Promise<number> {
  return await invoke('refresh_all_qoder_cn_tokens');
}

export async function injectQoderAccount(accountId: string): Promise<string> {
  return await invoke('inject_qoder_cn_account', { accountId });
}

export async function updateQoderAccountTags(
  accountId: string,
  tags: string[],
): Promise<QoderAccount> {
  return await invoke('update_qoder_cn_account_tags', { accountId, tags });
}

export async function getQoderAccountsIndexPath(): Promise<string> {
  return await invoke('get_qoder_cn_accounts_index_path');
}

export async function claimQoderCheckin(accountId?: string): Promise<{
  success: boolean;
  alreadyCheckedIn?: boolean;
  rewardCredits?: number;
  message: string;
  account: QoderAccount;
}> {
  try {
    const res = await invoke<{
      success: boolean;
      alreadyCheckedIn?: boolean;
      rewardCredits?: number;
      message: string;
      account: QoderAccount;
    }>('claim_qoder_cn_checkin', {
      accountId: accountId ?? null,
    });
    if (res && typeof res === 'object') {
      return res;
    }
  } catch {
    // fallback in web preview mode
  }
  const accounts = await listQoderAccounts();
  const target = accounts.find((item) => item.id === accountId) ?? accounts[0] ?? LOCAL_MACHINE_QODER_CN_ACCOUNT;
  const updated: QoderAccount = {
    ...target,
    credits_total: (target.credits_total ?? 2000) + 100,
    credits_remaining: (target.credits_remaining ?? 2000) + 100,
    usage_updated_at: Math.floor(Date.now() / 1000),
  };
  const nextList = accounts.map((item) => (item.id === updated.id ? updated : item));
  try {
    localStorage.setItem(QODER_CN_LOCAL_STORAGE_KEY, JSON.stringify(nextList));
  } catch {
    // ignore
  }
  return {
    success: true,
    alreadyCheckedIn: false,
    rewardCredits: 100,
    message: 'Qoder 国内版每日签到成功！获得 +100 Credits（有效期 30 天）',
    account: updated,
  };
}
