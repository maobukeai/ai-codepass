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
      if (cmd === 'list_qoder_accounts') {
        try {
          const cached = localStorage.getItem('agtools.qoder.accounts.cache');
          if (cached) return JSON.parse(cached);
        } catch {}
      }
      if (cmd === 'list_qoder_cn_accounts') {
        try {
          const cached = localStorage.getItem('agtools.qoder_cn.accounts.cache');
          if (cached) return JSON.parse(cached);
        } catch {}
      }
      if (cmd === 'list_qwenwork_accounts' || cmd === 'import_qwenwork_from_local') {
        if (cmd === 'list_qwenwork_accounts') {
          try {
            const cached = localStorage.getItem('agtools.qwenwork.accounts.cache');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
          } catch {}
        }
        const initial = [
          {
            id: 'qoder_uid_a11a07be-fcd7-4609-9076-79aac166a6e7',
            email: 'dingtalk_a11a07be-fcd7-4609-9076-79aac166a6e7@dingtalk.local',
            user_id: 'a11a07be-fcd7-4609-9076-79aac166a6e7',
            display_name: '猫步可爱',
            plan_type: '个人免费版',
            credits_total: 2100,
            credits_remaining: 2100,
            credits_used: 0,
            credits_usage_percent: 0,
            usage_updated_at: Math.floor(Date.now() / 1000),
            last_used: Math.floor(Date.now() / 1000),
            created_at: Math.floor(Date.now() / 1000),
            auth_user_plan_raw: {
              name: '个人免费版',
              isPersonalVersion: true,
            },
            auth_credit_usage_raw: {
              dailyBalance: 100,
              longtermBalance: 2000,
              totalCredits: 2100,
              userQuota: { total: 100, used: 0, remaining: 100 },
              addOnQuota: { total: 2000, used: 0, remaining: 2000 },
              expiresAt: 1792944000000,
            },
          },
        ];
        try {
          localStorage.setItem('agtools.qwenwork.accounts.cache', JSON.stringify(initial));
        } catch {}
        return initial;
      }
      if (cmd === 'claim_qoder_checkin' || cmd === 'claim_qoder_cn_checkin' || cmd === 'claim_qwenwork_checkin') {
        return {
          success: true,
          alreadyCheckedIn: false,
          rewardCredits: 100,
          message: `${cmd === 'claim_qwenwork_checkin' ? '千问办公' : cmd === 'claim_qoder_checkin' ? 'Qoder 国际版' : 'Qoder 国内版'}每日签到成功！获得 +100 Credits（有效期 30 天）`,
          account: null,
        };
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
