use crate::modules::webhook_notify::{
    get_webhook_config, save_webhook_config, send_webhook_payload, WebhookConfig,
};

#[tauri::command]
pub fn get_webhook_settings() -> Result<WebhookConfig, String> {
    get_webhook_config()
}

#[tauri::command]
pub fn save_webhook_settings(config: WebhookConfig) -> Result<(), String> {
    save_webhook_config(&config)
}

#[tauri::command]
pub async fn test_webhook_settings(config: WebhookConfig) -> Result<String, String> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let title = "🔔 [AI CodePass] 通知连通性测试";
    let content = format!(
        "### 验证结果：通道连接正常 ✅\n- **推送通道**：{}\n- **测试时间**：{}\n- **安全设置**：{}\n\n### 📋 服务就绪说明\n> • AI CodePass 批量错峰定时签到汇报（CodeBuddy / Trae / Qoder）已准备就绪\n> • 每日自动打卡完成后将实时推送格式化明细卡片至此群聊\n\n---\n*AI CodePass 每日自动为您守护算力额度*",
        config.channel,
        now,
        if config.secret.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some() {
            "已开启 HMAC-SHA256 安全加签 🔒"
        } else {
            "标准 Webhook"
        }
    );
    send_webhook_payload(&config, title, &content).await
}

#[tauri::command]
pub async fn send_auto_checkin_notification(title: String, summary: String) -> Result<(), String> {
    crate::modules::webhook_notify::send_auto_checkin_notification(&title, &summary).await;
    Ok(())
}
