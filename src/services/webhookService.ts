import { invoke } from '@tauri-apps/api/core';

export interface WebhookConfig {
  enabled: boolean;
  channel: 'feishu' | 'dingtalk' | 'wecom' | 'serverchan' | 'telegram' | 'pushdeer' | 'bark' | 'custom';
  webhookUrl: string;
  secret?: string;
  telegramChatId?: string;
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  enabled: false,
  channel: 'feishu',
  webhookUrl: '',
};

export async function getWebhookSettings(): Promise<WebhookConfig> {
  try {
    return await invoke<WebhookConfig>('get_webhook_settings');
  } catch (err) {
    console.error('[WebhookService] 获取配置失败:', err);
    return DEFAULT_WEBHOOK_CONFIG;
  }
}

export async function saveWebhookSettings(config: WebhookConfig): Promise<void> {
  await invoke('save_webhook_settings', { config });
}

export async function testWebhookSettings(config: WebhookConfig): Promise<string> {
  return await invoke<string>('test_webhook_settings', { config });
}
