import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodebuddySessionLocation {
  instanceId: string;
  instanceName: string;
}

export interface CodebuddySessionRecord {
  conversationId: string;
  title: string;
  cwd: string;
  userId: string;
  status: string;
  createdAt: number | null;
  updatedAt: number | null;
  isPlayground: boolean;
  locations: CodebuddySessionLocation[] | null;
}

// ---------------------------------------------------------------------------
// Service calls
// ---------------------------------------------------------------------------

export type CodebuddySessionPlatform = 'cn' | 'intl' | 'workbuddy';

const FALLBACK_WORKBUDDY_SESSIONS: CodebuddySessionRecord[] = [
  {
    conversationId: 'wb-conv-981a24e0-771b-4c29-a84f-3109c8e1d021',
    title: '优化 Markdown 预览与目录大纲同步滚动',
    cwd: 'C:/Users/20269/Desktop/项目文件夹/md管理器',
    userId: '01a0d4bb-c39a-7731-997e-385f2e76636b',
    status: 'Completed',
    createdAt: Date.now() - 2 * 86400 * 1000,
    updatedAt: Date.now() - 2 * 86400 * 1000,
    isPlayground: false,
    locations: [{ instanceId: 'default', instanceName: 'WorkBuddy 默认实例' }],
  },
  {
    conversationId: 'wb-conv-412f68b9-5c02-49e1-9310-89a1c02b7745',
    title: '实现本地文档全文检索与快捷键面板',
    cwd: 'C:/Users/20269/Desktop/项目文件夹/md管理器',
    userId: '01a0d4bb-c39a-7731-997e-385f2e76636b',
    status: 'Completed',
    createdAt: Date.now() - 2 * 86400 * 1000 - 3600 * 1000,
    updatedAt: Date.now() - 2 * 86400 * 1000 - 1800 * 1000,
    isPlayground: false,
    locations: [{ instanceId: 'default', instanceName: 'WorkBuddy 默认实例' }],
  },
];

export async function codebuddyListSessions(
  platform: CodebuddySessionPlatform,
  opts?: { keyword?: string; status?: string },
): Promise<CodebuddySessionRecord[]> {
  try {
    const res = await invoke<CodebuddySessionRecord[] | null>('codebuddy_list_sessions', {
      platform,
      keyword: opts?.keyword ?? null,
      status: opts?.status ?? null,
    });
    if (Array.isArray(res)) {
      return res;
    }
  } catch {
    // ignore in web preview mode
  }
  return FALLBACK_WORKBUDDY_SESSIONS.filter((item) => {
    if (opts?.status && item.status !== opts.status) return false;
    if (opts?.keyword) {
      const kw = opts.keyword.toLowerCase();
      return item.title.toLowerCase().includes(kw) || item.cwd.toLowerCase().includes(kw);
    }
    return true;
  });
}
