import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_PLATFORM_IDS, PlatformId } from '../types/platform';
import {
  exportDataTransferJson,
  importDataTransferJson,
  DataTransferSelection,
  getDataTransferFileNameBase,
} from './dataTransferService';

type LocalStorageMock = {
  store: Record<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  length: number;
};

function createLocalStorageMock(initial: Record<string, string> = {}): LocalStorageMock {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) {
        delete store[k];
      }
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

function setupTestEnvironment(initialLocalStorage: Record<string, string> = {}) {
  const ls = createLocalStorageMock(initialLocalStorage);
  const events: Array<{ type: string; payload?: unknown }> = [];
  const userMemoryDismissed: Record<string, boolean> = {};
  const userMemoryLists: Record<string, string[]> = {};

  const mockInvoke = async (cmd: string, args: any = {}) => {
    switch (cmd) {
      case 'data_transfer_get_user_config':
        return {
          language: 'zh-CN',
          theme: 'dark',
          theme_color: 'default',
          auto_refresh_minutes: 30,
        };
      case 'data_transfer_apply_user_config':
        return false;
      case 'data_transfer_get_instance_store':
        return {
          instances: [
            {
              id: 'inst-1',
              name: '默认实例',
              userDataDir: '/tmp/profile',
              extraArgs: '',
              bindAccountId: 'acc-1',
              createdAt: 1000,
            },
          ],
          defaultSettings: {
            bindAccountId: 'acc-1',
            extraArgs: '',
            followLocalAccount: false,
          },
        };
      case 'data_transfer_replace_instance_store':
        return null;
      case 'load_user_memory':
        return {
          dismissed: { ...userMemoryDismissed },
          lists: { ...userMemoryLists },
        };
      case 'mark_user_memory_dismissed':
        userMemoryDismissed[args.id] = true;
        return { dismissed: userMemoryDismissed, lists: userMemoryLists };
      case 'save_user_memory_list':
        userMemoryLists[args.id] = args.items;
        return { dismissed: userMemoryDismissed, lists: userMemoryLists };
      case 'list_codebuddy_accounts':
      case 'list_codebuddy_cn_accounts':
      case 'list_workbuddy_accounts':
      case 'list_workbuddy_ai_accounts':
        return [
          {
            id: 'wb-acc-1',
            email: 'test@workbuddy.cn',
            uid: 'uid-wb-1',
            domain: 'workbuddy.cn',
          },
        ];
      case 'list_qoder_accounts':
      case 'list_qwenwork_accounts':
        return [
          {
            id: 'qw-acc-1',
            email: 'user@qwenwork.cn',
            user_id: 'qw-uid-1',
          },
        ];
      case 'list_trae_accounts':
        return [
          {
            id: 'trae-global-1',
            email: 'trae@global.com',
            user_id: 'trae-u-1',
            trae_auth_raw: { platform: 'trae' },
          },
          {
            id: 'trae-solo-1',
            email: 'solo@global.com',
            user_id: 'solo-u-1',
            trae_auth_raw: { platform: 'trae_solo' },
          },
          {
            id: 'trae-cn-1',
            email: 'cn@trae.com.cn',
            user_id: 'cn-u-1',
            trae_auth_raw: { platform: 'trae_cn' },
          },
          {
            id: 'trae-solocn-1',
            email: 'solocn@trae.com.cn',
            user_id: 'solocn-u-1',
            trae_auth_raw: { platform: 'trae_solo_cn' },
          },
        ];
      case 'export_codebuddy_accounts':
      case 'export_codebuddy_cn_accounts':
      case 'export_workbuddy_accounts':
      case 'export_workbuddy_ai_accounts':
        return JSON.stringify([
          { id: 'wb-acc-1', email: 'test@workbuddy.cn', uid: 'uid-wb-1' },
        ]);
      case 'export_qoder_accounts':
      case 'export_qwenwork_accounts':
        return JSON.stringify([
          { id: 'qw-acc-1', email: 'user@qwenwork.cn', user_id: 'qw-uid-1' },
        ]);
      case 'export_trae_accounts':
        return JSON.stringify(
          args.accountIds.map((id: string) => ({ id, email: `${id}@trae.com` })),
        );
      case 'import_codebuddy_from_json':
      case 'import_codebuddy_cn_from_json':
      case 'import_workbuddy_from_json':
      case 'import_workbuddy_ai_from_json':
      case 'import_qoder_from_json':
      case 'import_qwenwork_from_json':
      case 'import_trae_from_json':
        return Array.isArray(JSON.parse(args.jsonContent))
          ? JSON.parse(args.jsonContent)
          : [JSON.parse(args.jsonContent)];
      default:
        return null;
    }
  };

  (globalThis as any).localStorage = ls;
  (globalThis as any).window = {
    dispatchEvent: (event: any) => {
      events.push({ type: event?.type || 'unknown' });
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).window.__TAURI_INTERNALS__ = { invoke: mockInvoke };

  return { ls, events, userMemoryDismissed, userMemoryLists };
}

test('ALL_PLATFORM_IDS contains all 11 platforms', () => {
  assert.equal(ALL_PLATFORM_IDS.length, 11);
  const expectedPlatforms: PlatformId[] = [
    'codebuddy',
    'codebuddy_cn',
    'workbuddy',
    'workbuddy_ai',
    'qoder',
    'qoder_cn',
    'qwenwork',
    'trae',
    'trae_solo',
    'trae_cn',
    'trae_solo_cn',
  ];
  for (const p of expectedPlatforms) {
    assert.ok(ALL_PLATFORM_IDS.includes(p), `Missing platform in ALL_PLATFORM_IDS: ${p}`);
  }
});

test('getDataTransferFileNameBase reflects selection', () => {
  assert.equal(getDataTransferFileNameBase({ includeAccounts: true, includeConfig: true }), 'aipass_data_backup');
  assert.equal(getDataTransferFileNameBase({ includeAccounts: true, includeConfig: false }), 'aipass_accounts_backup');
  assert.equal(getDataTransferFileNameBase({ includeAccounts: false, includeConfig: true }), 'aipass_config_backup');
});

test('full exportDataTransferJson captures all 11 platforms and all configuration state', async () => {
  const initialStorage: Record<string, string> = {
    // Auto check-in configs
    'agtools.qoder.auto_checkin_config': JSON.stringify({ enabled: true, startTime: '10:05', endTime: '14:00' }),
    'agtools.trae.auto_checkin_config': JSON.stringify({ enabled: true, startTime: '09:00', endTime: '12:00' }),
    'agtools.workbuddy.auto_checkin_config': JSON.stringify({ enabled: true, startTime: '08:30', endTime: '11:00' }),
    // Auto check-in logs
    'agtools.qoder.auto_checkin_logs': JSON.stringify([{ id: 'log-1', successCount: 1 }]),
    'agtools.trae.auto_checkin_logs': JSON.stringify([{ id: 'log-2', successCount: 2 }]),
    'agtools.workbuddy.auto_checkin_logs': JSON.stringify([{ id: 'log-3', successCount: 3 }]),
    // Historical checkin dates
    'agtools.qoder.checkin_dates.acc1': JSON.stringify(['2026-09-25']),
    'agtools.qwenwork.checkin_dates.qw-acc-1': JSON.stringify(['2026-09-26']),
    // Current accounts
    'agtools.qwenwork.current_account_id': 'qw-acc-1',
    'agtools.workbuddy_ai.current_account_id': 'wb-acc-1',
    'agtools.trae.current_account_id': 'trae-global-1',
    // UI preferences & overview filters
    'privacy_mode_enabled': '1',
    'dashboard_view_mode': 'compact',
    'agtools.side_nav.layout.v1': JSON.stringify({ collapsed: true }),
    'agtools.accounts_overview_filter.qwenwork.enabled': 'true',
    'agtools.accounts_overview_filter.qwenwork.status': JSON.stringify(['active']),
    'agtools.qwenwork.flow_notice_collapsed': '1',
    'agtools.current_account_refresh_overrides.v1': JSON.stringify({ 'acc-custom': 15 }),
  };

  setupTestEnvironment(initialStorage);
  const selection: DataTransferSelection = { includeAccounts: true, includeConfig: true };
  const json = await exportDataTransferJson(selection);

  const bundle = JSON.parse(json);
  assert.equal(bundle.schema, 'cockpit-tools.data-transfer');
  assert.equal(bundle.version, 1);
  assert.ok(bundle.accounts);
  assert.ok(bundle.config);

  // Verify accounts section contains all 11 platforms
  for (const platform of ALL_PLATFORM_IDS) {
    assert.ok(
      bundle.accounts.platforms[platform],
      `Platform ${platform} missing from exported accounts`,
    );
  }

  // Verify Trae platform filtering (no duplication)
  // Each Trae platform should only have 1 account exported, not all 4!
  assert.equal(bundle.accounts.platforms['trae'].account_count, 1);
  assert.equal(bundle.accounts.platforms['trae_solo'].account_count, 1);
  assert.equal(bundle.accounts.platforms['trae_cn'].account_count, 1);
  assert.equal(bundle.accounts.platforms['trae_solo_cn'].account_count, 1);

  // Verify Qwenwork and WorkBuddy AI are included
  assert.equal(bundle.accounts.platforms['qwenwork'].account_count, 1);
  assert.equal(bundle.accounts.platforms['workbuddy_ai'].account_count, 1);

  // Verify config section
  const cfg = bundle.config;
  assert.ok(cfg.auto_checkin_configs['agtools.qoder.auto_checkin_config']);
  assert.ok(cfg.auto_checkin_configs['agtools.trae.auto_checkin_config']);
  assert.ok(cfg.auto_checkin_configs['agtools.workbuddy.auto_checkin_config']);
  assert.ok(cfg.auto_checkin_logs['agtools.qoder.auto_checkin_logs']);
  assert.ok(cfg.checkin_dates_records['agtools.qwenwork.checkin_dates.qw-acc-1']);
  assert.ok(cfg.current_account_refs['qwenwork']);
  assert.ok(cfg.current_account_refs['workbuddy_ai']);
  assert.ok(cfg.overview_filters['agtools.accounts_overview_filter.qwenwork.enabled']);
  assert.equal(cfg.ui_preferences['privacy_mode_enabled'], '1');
  assert.equal(cfg.ui_preferences['dashboard_view_mode'], 'compact');
  assert.equal(cfg.ui_preferences['agtools.qwenwork.flow_notice_collapsed'], '1');
});

test('importDataTransferJson accurately restores accounts, configs, logs, dates, and preferences', async () => {
  setupTestEnvironment({
    'agtools.qoder.auto_checkin_config': JSON.stringify({ enabled: true, startTime: '11:11' }),
    'agtools.qoder.auto_checkin_logs': JSON.stringify([{ id: 'log-imported-1' }]),
    'agtools.qwenwork.checkin_dates.qw-acc-1': JSON.stringify(['2026-09-26']),
    'agtools.qwenwork.current_account_id': 'qw-acc-1',
    'privacy_mode_enabled': '1',
    'dashboard_view_mode': 'cards',
  });

  const exportedJson = await exportDataTransferJson({ includeAccounts: true, includeConfig: true });

  // Now clear localStorage and import into a clean environment
  const targetEnv = setupTestEnvironment({});
  assert.equal(targetEnv.ls.getItem('agtools.qoder.auto_checkin_config'), null);
  assert.equal(targetEnv.ls.getItem('privacy_mode_enabled'), null);

  const importResult = await importDataTransferJson(exportedJson, {
    includeAccounts: true,
    includeConfig: true,
  });

  assert.equal(importResult.detected_format, 'data_bundle');
  assert.ok(importResult.account_result);
  assert.ok(importResult.config_result);
  assert.equal(importResult.config_result.applied, true);

  // Verify restored configs
  assert.ok(targetEnv.ls.getItem('agtools.qoder.auto_checkin_config'));
  assert.ok(targetEnv.ls.getItem('agtools.qoder.auto_checkin_logs'));
  assert.ok(targetEnv.ls.getItem('agtools.qwenwork.checkin_dates.qw-acc-1'));
  assert.equal(targetEnv.ls.getItem('privacy_mode_enabled'), '1');
  assert.equal(targetEnv.ls.getItem('dashboard_view_mode'), 'cards');
  assert.equal(targetEnv.ls.getItem('agtools.qwenwork.current_account_id'), 'qw-acc-1');

  // Verify events dispatched
  const eventTypes = targetEnv.events.map((e) => e.type);
  assert.ok(eventTypes.includes('qoder-auto-checkin-config-changed'));
  assert.ok(eventTypes.includes('qoder-auto-checkin-logs-changed'));
  assert.ok(eventTypes.includes('config-updated'));
});
