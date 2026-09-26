import React from "react";
import ReactDOM from "react-dom/client";
import { initI18n } from "./i18n";
import { AppRuntimeGuard } from "./components/AppRuntimeGuard";
import {
  captureError,
  initErrorReporter,
  markFrontendReady,
  recordFrontendStage,
} from "./utils/errorReporter";
import { setBootSplashStage } from "./utils/bootSplash";
import { hydrateUiPreferences } from "./utils/uiPreferences";

// Provide safe web browser fallback for external DevTools preview & debug
if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
  (window as any).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, _args: any) => {
      if (cmd === 'plugin:event|listen') return Math.floor(Math.random() * 10000);
      if (cmd === 'plugin:event|unlisten') return;
      if (cmd.startsWith('plugin:webview|')) return;
      if (cmd.startsWith('list_') || cmd.includes('accounts')) return [];
      if (cmd === 'claim_qoder_checkin' || cmd === 'claim_qoder_cn_checkin' || cmd === 'claim_qwenwork_checkin') {
        return {
          success: true,
          alreadyCheckedIn: false,
          rewardCredits: 100,
          message: `${cmd === 'claim_qwenwork_checkin' ? '千问办公' : cmd === 'claim_qoder_checkin' ? 'Qoder 国际版' : 'Qoder 国内版'}每日签到成功！获得 +100 Credits（有效期 30 天）`,
          account: null,
        };
      }
      if (cmd.endsWith('_get_instance_defaults') || cmd === 'get_instance_defaults') {
        const sub = cmd.replace('_get_instance_defaults', '') || 'qoder';
        return {
          root_dir: `C:\\Users\\Developer\\AppData\\Roaming\\.ai_codepass\\instances\\${sub}`,
          default_user_data_dir: `C:\\Users\\Developer\\AppData\\Roaming\\${sub === 'qwenwork' ? 'QwenWorkCN' : sub}`,
        };
      }
      const mockStoreKey = '__CODEPASS_MOCK_INSTANCES__';
      if (!(window as any)[mockStoreKey]) {
        (window as any)[mockStoreKey] = [
          {
            id: '__default__',
            name: '',
            user_data_dir: 'C:\\Users\\Developer\\AppData\\Roaming\\QwenWorkCN',
            working_dir: null,
            extra_args: '',
            bind_account_id: 'qoder_uid_dingtalk_demo',
            created_at: 0,
            last_launched_at: Date.now() - 3600000,
            last_pid: 18420,
            running: true,
            initialized: true,
            is_default: true,
            follow_local_account: false,
          },
          {
            id: 'inst_blank_isolated_01',
            name: '空白活动号-03 (硬件指纹隔离)',
            userDataDir: 'C:\\Users\\Developer\\AppData\\Roaming\\.ai_codepass\\instances\\qwenwork\\blank-03',
            user_data_dir: 'C:\\Users\\Developer\\AppData\\Roaming\\.ai_codepass\\instances\\qwenwork\\blank-03',
            workingDir: null,
            working_dir: null,
            extraArgs: '',
            extra_args: '',
            bindAccountId: null,
            bind_account_id: null,
            createdAt: Date.now() - 1800000,
            created_at: Date.now() - 1800000,
            lastLaunchedAt: Date.now() - 600000,
            last_launched_at: Date.now() - 600000,
            lastPid: null,
            last_pid: null,
            running: false,
            initialized: true,
            isDefault: false,
            is_default: false,
            followLocalAccount: false,
            follow_local_account: false,
          },
        ];
      }
      if (cmd.endsWith('_list_instances') || cmd === 'list_instances') {
        return (window as any)[mockStoreKey];
      }
      if (cmd.endsWith('_create_instance') || cmd === 'create_instance') {
        const userDataDir = _args?.userDataDir || _args?.user_data_dir || `C:\\Users\\Developer\\AppData\\Roaming\\.ai_codepass\\instances\\qwenwork\\${_args?.name || 'new'}`;
        const bindAccountId = (_args?.initMode || _args?.init_mode) === 'empty' ? null : (_args?.bindAccountId || null);
        const extraArgs = _args?.extraArgs || _args?.extra_args || '';
        const created = {
          id: `inst_${Date.now()}`,
          name: _args?.name || '新建空白隔离实例',
          userDataDir,
          user_data_dir: userDataDir,
          workingDir: null,
          working_dir: null,
          extraArgs,
          extra_args: extraArgs,
          bindAccountId,
          bind_account_id: bindAccountId,
          createdAt: Date.now(),
          created_at: Date.now(),
          lastLaunchedAt: null,
          last_launched_at: null,
          lastPid: null,
          last_pid: null,
          running: false,
          initialized: true,
          isDefault: false,
          is_default: false,
          followLocalAccount: false,
          follow_local_account: false,
        };
        (window as any)[mockStoreKey] = [created, ...(window as any)[mockStoreKey]];
        return created;
      }
      if (cmd.startsWith('list_') || cmd.includes('accounts')) return [];
      if (cmd.startsWith('get_instances')) return [];
      if (cmd === 'get_general_config') return { ui_scale: 1, language: 'zh-CN', theme: 'system' };
      if (cmd === 'get_network_config') {
        return {
          ws_enabled: true,
          ws_port: 19528,
          actual_port: 19528,
          default_port: 19528,
          report_enabled: false,
          report_port: 18081,
          report_actual_port: null,
          report_default_port: 18081,
          report_token: '',
          global_proxy_enabled: false,
          global_proxy_url: '',
          global_proxy_no_proxy: '',
        };
      }
      if (cmd === 'get_diagnostics_config') {
        return {
          errorReportingEnabled: true,
          errorReportingDebug: false,
          endpointConfigured: false,
        };
      }
      if (cmd === 'get_auto_backup_settings') {
        return {
          enabled: true,
          include_accounts: true,
          include_config: true,
          retention_days: 30,
          last_backup_at: null,
          directory_path: '',
        };
      }
      if (cmd === 'get_available_terminals') return ['system'];
      if (cmd.includes('checkin_status')) {
        return { checked_in: false, today_checked_in: false, consecutive_days: 0, credits_earned_today: 0 };
      }
      if (cmd === 'logs_get_snapshot') {
        return {
          log_dir_path: 'C:\\Users\\AI\\AppData\\Roaming\\AI CodePass\\logs',
          log_file_path: 'C:\\Users\\AI\\AppData\\Roaming\\AI CodePass\\logs\\ai-codepass.log',
          log_file_name: 'ai-codepass.log',
          content: '[2026-09-25 12:00:00.123] [INFO] [App] AI CodePass started successfully.\n[2026-09-25 12:00:01.456] [INFO] [Scheduler] Daily check-in service initialized.\n[2026-09-25 12:00:02.789] [INFO] [Network] Local websocket and proxy service ready.',
          line_limit: 200,
          file_size: 256,
          modified_at_ms: Date.now(),
          available_files: [
            {
              log_file_name: 'ai-codepass.log',
              log_file_path: 'C:\\Users\\AI\\AppData\\Roaming\\AI CodePass\\logs\\ai-codepass.log',
              file_size: 256,
              modified_at_ms: Date.now(),
            },
          ],
        };
      }
      return null;
    },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main', windowLabel: 'main' },
    },
    transformCallback: (_callback?: any, _once?: boolean) => {
      return Math.floor(Math.random() * 100000);
    },
    unregisterCallback: (_id?: number) => {},
  };
}

if (typeof window !== 'undefined' && !(window as any).__TAURI_EVENT_PLUGIN_INTERNALS__) {
  (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (_event: string, _eventId: number) => {},
  };
}

initErrorReporter();
recordFrontendStage("script_loaded");
setBootSplashStage("script_loaded");
void initI18n();

void (async () => {
  const { default: App } = await import("./App");

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    const error = new Error("Root element not found");
    captureError(error, { source: "frontend_boot", phase: "root_lookup" });
    throw error;
  }

  recordFrontendStage("react_mount_start");
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppRuntimeGuard>
        <App />
      </AppRuntimeGuard>
    </React.StrictMode>,
  );

  window.requestAnimationFrame(() => {
    setBootSplashStage("react_mounted");
    markFrontendReady("react_mounted");
  });
  // Durable preferences hydrate in the background; never block the first render.
  void hydrateUiPreferences();
})();
