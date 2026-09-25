//! 多渠道 Webhook 签到与系统通知模块
//! 支持飞书、钉钉、企业微信、Server酱、Telegram、PushDeer、Bark 及自定义 Webhook

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use ring::hmac;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::modules::{config, logger};

static WEBHOOK_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookConfig {
    pub enabled: bool,
    /// 支持: feishu, dingtalk, wecom, serverchan, telegram, pushdeer, bark, custom
    pub channel: String,
    pub webhook_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub telegram_chat_id: Option<String>,
}

impl Default for WebhookConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            channel: "feishu".to_string(),
            webhook_url: String::new(),
            secret: None,
            telegram_chat_id: None,
        }
    }
}

fn get_webhook_config_path() -> PathBuf {
    config::get_shared_dir().join("webhook_config.json")
}

pub fn get_webhook_config() -> Result<WebhookConfig, String> {
    let _lock = WEBHOOK_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    let path = get_webhook_config_path();
    if !path.exists() {
        return Ok(WebhookConfig::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("读取通知配置失败: {}", e))?;
    let config: WebhookConfig =
        serde_json::from_str(&content).unwrap_or_else(|_| WebhookConfig::default());
    Ok(config)
}

pub fn save_webhook_config(config: &WebhookConfig) -> Result<(), String> {
    let _lock = WEBHOOK_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    let path = get_webhook_config_path();

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let json_str = serde_json::to_string_pretty(config)
        .map_err(|e| format!("序列化通知配置失败: {}", e))?;
    fs::write(&path, json_str).map_err(|e| format!("写入通知配置失败: {}", e))?;
    Ok(())
}

fn create_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

pub async fn send_webhook_payload(
    cfg: &WebhookConfig,
    title: &str,
    content: &str,
) -> Result<String, String> {
    if cfg.webhook_url.trim().is_empty() {
        return Err("Webhook URL 不能为空".to_string());
    }

    let client = create_http_client()?;
    let url = cfg.webhook_url.trim();

    match cfg.channel.as_str() {
        "feishu" => {
            let (timestamp_str, sign_b64, sign_desc) = if let Some(secret) = cfg
                .secret
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                let timestamp = chrono::Utc::now().timestamp();
                let string_to_sign = format!("{}\n{}", timestamp, secret);
                let key = hmac::Key::new(hmac::HMAC_SHA256, string_to_sign.as_bytes());
                let signature = hmac::sign(&key, b"");
                let b64 = BASE64_STANDARD.encode(signature.as_ref());
                (Some(timestamp.to_string()), Some(b64), " (已开启签名校验)")
            } else {
                (None, None, "")
            };

            // 优先使用飞书精美交互卡片（支持 Markdown 排版与品牌蓝标）
            let mut interactive_body = json!({
                "msg_type": "interactive",
                "card": {
                    "header": {
                        "title": {
                            "tag": "plain_text",
                            "content": title
                        },
                        "template": "blue"
                    },
                    "elements": [
                        {
                            "tag": "markdown",
                            "content": content
                        }
                    ]
                }
            });
            if let (Some(ts), Some(sg)) = (&timestamp_str, &sign_b64) {
                if let Some(obj) = interactive_body.as_object_mut() {
                    obj.insert("timestamp".to_string(), json!(ts));
                    obj.insert("sign".to_string(), json!(sg));
                }
            }

            let resp = client.post(url).json(&interactive_body).send().await;
            let success = match &resp {
                Ok(r) if r.status().is_success() => true,
                _ => false,
            };

            if success {
                let resp_unwrapped = resp.unwrap();
                let text = resp_unwrapped.text().await.unwrap_or_default();
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(code) = v.get("code").and_then(|c| c.as_i64()) {
                        if code == 0 {
                            return Ok(format!("飞书通知发送成功{}", sign_desc));
                        }
                    }
                }
            }

            // 降级使用标准文本格式（兼容未开启卡片权限的旧版飞书机器人）
            let mut text_body = json!({
                "msg_type": "text",
                "content": {
                    "text": format!("{}\n\n{}", title, content)
                }
            });
            if let (Some(ts), Some(sg)) = (&timestamp_str, &sign_b64) {
                if let Some(obj) = text_body.as_object_mut() {
                    obj.insert("timestamp".to_string(), json!(ts));
                    obj.insert("sign".to_string(), json!(sg));
                }
            }
            let resp2 = client
                .post(url)
                .json(&text_body)
                .send()
                .await
                .map_err(|e| format!("飞书通知发送失败: {}", e))?;
            let status = resp2.status();
            let text = resp2.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(format!("飞书响应错误 (HTTP {}): {}", status, text));
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(code) = v.get("code").and_then(|c| c.as_i64()) {
                    if code != 0 {
                        let msg = v.get("msg").and_then(|m| m.as_str()).unwrap_or("未知错误");
                        return Err(format!("飞书机器人错误 [code: {}]: {}", code, msg));
                    }
                }
            }
            Ok(format!("飞书通知发送成功{}", sign_desc))
        }
        "dingtalk" => {
            let markdown_text = format!("### {}\n\n{}", title, content);
            let body = json!({
                "msgtype": "markdown",
                "markdown": {
                    "title": title,
                    "text": markdown_text
                }
            });

            let (target_url, sign_desc) = if let Some(secret) = cfg
                .secret
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                let timestamp = chrono::Utc::now().timestamp_millis();
                let string_to_sign = format!("{}\n{}", timestamp, secret);
                let key = hmac::Key::new(hmac::HMAC_SHA256, secret.as_bytes());
                let signature = hmac::sign(&key, string_to_sign.as_bytes());
                let sign_b64 = BASE64_STANDARD.encode(signature.as_ref());
                let sign_encoded = urlencoding::encode(&sign_b64);
                let sep = if url.contains('?') { '&' } else { '?' };
                (
                    format!("{}{}timestamp={}&sign={}", url, sep, timestamp, sign_encoded),
                    " (已开启加签校验)",
                )
            } else {
                (url.to_string(), "")
            };

            let resp = client
                .post(&target_url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("钉钉通知发送失败: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(format!("钉钉响应错误 (HTTP {}): {}", status, text));
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(errcode) = v.get("errcode").and_then(|c| c.as_i64()) {
                    if errcode != 0 {
                        let errmsg = v.get("errmsg").and_then(|m| m.as_str()).unwrap_or("未知错误");
                        return Err(format!("钉钉机器人错误 [errcode: {}]: {}", errcode, errmsg));
                    }
                }
            }
            Ok(format!("钉钉通知发送成功{}", sign_desc))
        }
        "wecom" => {
            let body = json!({
                "msgtype": "markdown",
                "markdown": {
                    "content": format!("### {}\n\n{}", title, content)
                }
            });
            let resp = client
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("企业微信通知发送失败: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(format!("企业微信响应错误 (HTTP {}): {}", status, text));
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(errcode) = v.get("errcode").and_then(|c| c.as_i64()) {
                    if errcode != 0 {
                        let errmsg = v.get("errmsg").and_then(|m| m.as_str()).unwrap_or("未知错误");
                        return Err(format!("企业微信机器人错误 [errcode: {}]: {}", errcode, errmsg));
                    }
                }
            }
            Ok("企业微信通知发送成功".to_string())
        }
        "serverchan" => {
            let body = json!({
                "title": title,
                "desp": content
            });
            let resp = client
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Server酱通知发送失败: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(format!("Server酱响应错误 (HTTP {}): {}", status, text));
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(code) = v.get("code").and_then(|c| c.as_i64()) {
                    if code != 0 {
                        let msg = v
                            .get("message")
                            .or_else(|| v.get("errmsg"))
                            .and_then(|m| m.as_str())
                            .unwrap_or("未知错误");
                        return Err(format!("Server酱错误 [code: {}]: {}", code, msg));
                    }
                }
            }
            Ok("Server酱通知发送成功".to_string())
        }
        "telegram" => {
            let chat_id = cfg
                .telegram_chat_id
                .as_deref()
                .unwrap_or("")
                .trim();
            if chat_id.is_empty() {
                return Err("Telegram 需配置 Chat ID".to_string());
            }
            // 使用 HTML 模式并转义基础符号，彻底防止 Markdown 特殊字符（如 _ * [ ` 等）引发 Telegram 400 实体解析拒绝
            let safe_title = title.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
            let safe_content = content.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
            let body = json!({
                "chat_id": chat_id,
                "text": format!("<b>{}</b>\n\n{}", safe_title, safe_content),
                "parse_mode": "HTML"
            });
            let resp = client
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Telegram 通知发送失败: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(format!("Telegram 响应错误 ({}): {}", status, text));
            }
            Ok("Telegram 通知发送成功".to_string())
        }
        "pushdeer" => {
            let body = json!({
                "text": title,
                "desp": content,
                "type": "markdown"
            });
            let resp = client
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("PushDeer 通知发送失败: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(format!("PushDeer 响应错误 ({}): {}", status, text));
            }
            Ok("PushDeer 通知发送成功".to_string())
        }
        "bark" => {
            let body = json!({
                "title": title,
                "body": content,
                "group": "AI CodePass"
            });
            let resp = client
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Bark 通知发送失败: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(format!("Bark 响应错误 ({}): {}", status, text));
            }
            Ok("Bark 通知发送成功".to_string())
        }
        _ => {
            // custom 通用 webhook
            let body = json!({
                "title": title,
                "content": content,
                "timestamp": chrono::Utc::now().timestamp(),
                "source": "AI CodePass"
            });
            let mut req = client.post(url).json(&body);
            if let Some(secret) = cfg
                .secret
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                req = req.header("X-Webhook-Secret", secret);
            }
            let resp = req
                .send()
                .await
                .map_err(|e| format!("自定义 Webhook 发送失败: {}", e))?;
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(format!("自定义 Webhook 响应错误 (HTTP {}): {}", status, text));
            }
            Ok("自定义 Webhook 发送成功".to_string())
        }
    }
}

/// 触发全局签到结果通知（如已启用）
pub async fn send_auto_checkin_notification(title: &str, summary: &str) {
    if let Ok(cfg) = get_webhook_config() {
        if cfg.enabled && !cfg.webhook_url.trim().is_empty() {
            logger::log_info(&format!("[Webhook] 正在推送签到通知至通道: {}", cfg.channel));
            match send_webhook_payload(&cfg, title, summary).await {
                Ok(msg) => logger::log_info(&format!("[Webhook] 推送结果: {}", msg)),
                Err(err) => logger::log_warn(&format!("[Webhook] 推送失败: {}", err)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dingtalk_signing() {
        let secret = "SEC6f9bd42bd52cfdad14e7d122b99852c1572a4f6e45f1678d3829c8f4fd3dfb26";
        let timestamp: i64 = 1790344393964;
        let string_to_sign = format!("{}\n{}", timestamp, secret);
        let key = hmac::Key::new(hmac::HMAC_SHA256, secret.as_bytes());
        let signature = hmac::sign(&key, string_to_sign.as_bytes());
        let sign_b64 = BASE64_STANDARD.encode(signature.as_ref());
        let sign_encoded = urlencoding::encode(&sign_b64);
        assert_eq!(sign_encoded, "qeljPqPSHBZtoqgGX640aaUsmiZ6csC1qpHQUYBCdEs%3D");
    }
}


