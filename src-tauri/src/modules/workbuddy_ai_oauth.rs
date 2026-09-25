use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

use crate::models::workbuddy::{WorkbuddyOAuthCompletePayload, WorkbuddyOAuthStartResponse};
use crate::modules::logger;

pub const WORKBUDDY_AI_API_ENDPOINT: &str = "https://www.workbuddy.ai";
const WORKBUDDY_AI_API_PREFIX: &str = "/v2/plugin";
const WORKBUDDY_AI_PLATFORM: &str = "workbuddy";
const WORKBUDDY_AI_HTTP_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const OAUTH_TIMEOUT_SECONDS: u64 = 600;
const OAUTH_POLL_INTERVAL_MS: u64 = 1500;

#[derive(Clone)]
struct PendingOAuthState {
    login_id: String,
    expires_at: i64,
    state: String,
    cancelled: bool,
}

lazy_static::lazy_static! {
    static ref PENDING_OAUTH_STATE: Arc<Mutex<Option<PendingOAuthState>>> = Arc::new(Mutex::new(None));
}

fn now_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

fn generate_login_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen::<u8>()).collect();
    format!(
        "wb_ai_{}",
        bytes
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>()
    )
}

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(WORKBUDDY_AI_HTTP_USER_AGENT)
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

fn resolve_endpoint(domain: Option<&str>) -> String {
    match domain {
        Some(d) if !d.trim().is_empty() => {
            let trimmed = d.trim();
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                trimmed.to_string()
            } else {
                format!("https://{}", trimmed)
            }
        }
        _ => WORKBUDDY_AI_API_ENDPOINT.to_string(),
    }
}

pub async fn refresh_token(
    access_token: &str,
    refresh_token: &str,
    domain: Option<&str>,
) -> Result<Value, String> {
    let client = build_client()?;
    let endpoint = resolve_endpoint(domain);
    let url = format!("{}{}/auth/token/refresh", endpoint, WORKBUDDY_AI_API_PREFIX);

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&json!({
            "refreshToken": refresh_token
        }))
        .send()
        .await
        .map_err(|e| format!("刷新 WorkBuddyAI token 失败: {}", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析刷新响应失败: {}", e))?;

    Ok(body)
}

pub async fn fetch_dosage_notify(
    access_token: &str,
    uid: Option<&str>,
    enterprise_id: Option<&str>,
    domain: Option<&str>,
) -> Result<Value, String> {
    let client = build_client()?;
    let endpoint = resolve_endpoint(domain);
    let url = format!("{}/v2/billing/meter/dosage-notify", endpoint);

    let mut req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json");

    if let Some(uid_val) = uid {
        req = req.header("X-User-Id", uid_val);
    }
    if let Some(eid) = enterprise_id {
        req = req.header("X-Enterprise-Id", eid);
    }

    let resp = req
        .json(&json!({}))
        .send()
        .await
        .map_err(|e| format!("请求 dosage-notify 失败: {}", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 dosage-notify 响应失败: {}", e))?;

    Ok(body)
}

pub async fn fetch_payment_type(
    access_token: &str,
    uid: Option<&str>,
    enterprise_id: Option<&str>,
    domain: Option<&str>,
) -> Result<Value, String> {
    let client = build_client()?;
    let endpoint = resolve_endpoint(domain);
    let url = format!("{}/v2/billing/meter/get-payment-type", endpoint);

    let mut req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json");

    if let Some(uid_val) = uid {
        req = req.header("X-User-Id", uid_val);
    }
    if let Some(eid) = enterprise_id {
        req = req.header("X-Enterprise-Id", eid);
    }

    let resp = req
        .json(&json!({}))
        .send()
        .await
        .map_err(|e| format!("请求 payment-type 失败: {}", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 payment-type 响应失败: {}", e))?;

    Ok(body)
}

pub async fn fetch_user_resource(
    access_token: &str,
    uid: Option<&str>,
    enterprise_id: Option<&str>,
    domain: Option<&str>,
) -> Result<Value, String> {
    let client = build_client()?;
    let endpoint = resolve_endpoint(domain);
    let url = format!("{}/v2/billing/meter/get-user-resource", endpoint);

    let mut req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json");

    if let Some(uid_val) = uid {
        req = req.header("X-User-Id", uid_val);
    }
    if let Some(eid) = enterprise_id {
        req = req.header("X-Enterprise-Id", eid);
    }

    let resp = req
        .json(&json!({
            "PageNumber": 1,
            "PageSize": 100,
            "ProductCode": "p_tcaca",
            "Status": [0, 3],
            "OnlyValidPeriod": true
        }))
        .send()
        .await
        .map_err(|e| format!("请求 user resource 失败: {}", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 user resource 响应失败: {}", e))?;

    Ok(body)
}

pub async fn start_login() -> Result<WorkbuddyOAuthStartResponse, String> {
    let client = build_client()?;
    let url = format!(
        "{}{}/auth/state?platform={}",
        WORKBUDDY_AI_API_ENDPOINT, WORKBUDDY_AI_API_PREFIX, WORKBUDDY_AI_PLATFORM
    );

    logger::log_info(&format!("[WorkBuddy AI OAuth] 请求 auth/state: {}", url));

    let resp = client
        .post(&url)
        .header("X-No-Authorization", "true")
        .header("X-No-User-Id", "true")
        .header("X-No-Enterprise-Id", "true")
        .header("X-No-Department-Info", "true")
        .json(&json!({}))
        .send()
        .await
        .map_err(|e| format!("请求 auth/state 失败: {}", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 auth/state 响应失败: {}", e))?;

    let data = body.get("data").ok_or_else(|| {
        let mut keys = body
            .as_object()
            .map(|obj| obj.keys().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        keys.sort();
        format!("auth/state 响应缺少 data 字段: body_keys={:?}", keys)
    })?;

    let state = data
        .get("state")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "auth/state 响应缺少 state".to_string())?
        .to_string();

    let auth_url = data
        .get("authUrl")
        .or_else(|| data.get("auth_url"))
        .or_else(|| data.get("url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let login_id = generate_login_id();
    let login_url = if auth_url.is_empty() {
        format!(
            "{}/login?platform={}&state={}",
            WORKBUDDY_AI_API_ENDPOINT, WORKBUDDY_AI_PLATFORM, state
        )
    } else {
        auth_url
    };

    let expires_at = now_timestamp() + (OAUTH_TIMEOUT_SECONDS as i64);

    {
        let mut state_lock = PENDING_OAUTH_STATE
            .lock()
            .map_err(|_| "获取锁失败".to_string())?;
        *state_lock = Some(PendingOAuthState {
            login_id: login_id.clone(),
            expires_at,
            state: state.clone(),
            cancelled: false,
        });
    }

    logger::log_info(&format!(
        "[WorkBuddy AI OAuth] 登录已启动: login_id={}, state={}",
        login_id, state
    ));

    Ok(WorkbuddyOAuthStartResponse {
        login_id,
        verification_uri: login_url.clone(),
        verification_uri_complete: Some(login_url),
        expires_in: OAUTH_TIMEOUT_SECONDS,
        interval_seconds: (OAUTH_POLL_INTERVAL_MS / 1000).max(1),
    })
}

pub async fn complete_login(login_id: &str) -> Result<WorkbuddyOAuthCompletePayload, String> {
    let client = build_client()?;
    let start = now_timestamp();

    loop {
        let state_info = {
            let state_lock = PENDING_OAUTH_STATE
                .lock()
                .map_err(|_| "获取锁失败".to_string())?;
            match state_lock.as_ref() {
                None => return Err("没有待处理的登录请求".to_string()),
                Some(s) => {
                    if s.login_id != login_id {
                        return Err("login_id 不匹配".to_string());
                    }
                    if s.cancelled {
                        return Err("登录已取消".to_string());
                    }
                    if now_timestamp() > s.expires_at {
                        return Err("登录超时，请重试".to_string());
                    }
                    s.clone()
                }
            }
        };

        let poll_url = format!(
            "{}{}/auth/token?state={}",
            WORKBUDDY_AI_API_ENDPOINT, WORKBUDDY_AI_API_PREFIX, state_info.state
        );
        let resp = client
            .get(&poll_url)
            .header("X-No-Authorization", "true")
            .header("X-No-User-Id", "true")
            .header("X-No-Enterprise-Id", "true")
            .header("X-No-Department-Info", "true")
            .send()
            .await;

        if let Ok(response) = resp {
            if let Ok(body) = response.json::<Value>().await {
                let code = body.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
                if code == 0 || code == 200 {
                    if let Some(data) = body.get("data") {
                        let access_token = data
                            .get("accessToken")
                            .or_else(|| data.get("access_token"))
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        if !access_token.is_empty() {
                            logger::log_info("[WorkBuddy AI OAuth] 获取 token 成功");
                            let refresh_token = data
                                .get("refreshToken")
                                .or_else(|| data.get("refresh_token"))
                                .and_then(Value::as_str)
                                .map(|s| s.to_string());
                            let mut payload = build_payload_from_token(access_token).await?;
                            if refresh_token.is_some() {
                                payload.refresh_token = refresh_token;
                            }
                            if let Some(exp) = data.get("expiresAt").and_then(Value::as_i64) {
                                payload.expires_at = Some(exp);
                            }
                            if let Ok(mut state_lock) = PENDING_OAUTH_STATE.lock() {
                                *state_lock = None;
                            }
                            return Ok(payload);
                        }
                    }
                }
            }
        }

        if now_timestamp() - start > (OAUTH_TIMEOUT_SECONDS as i64) {
            return Err("轮询登录结果超时".to_string());
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(OAUTH_POLL_INTERVAL_MS)).await;
    }
}

pub fn cancel_login() {
    if let Ok(mut state_lock) = PENDING_OAUTH_STATE.lock() {
        if let Some(ref mut state) = *state_lock {
            state.cancelled = true;
        }
    }
}

pub async fn build_payload_from_token(
    access_token: &str,
) -> Result<WorkbuddyOAuthCompletePayload, String> {
    let client = build_client()?;
    let url = format!("{}{}/accounts", WORKBUDDY_AI_API_ENDPOINT, WORKBUDDY_AI_API_PREFIX);

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("请求 WorkBuddyAI accounts 失败: {}", e))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 accounts 响应失败: {}", e))?;

    let accounts = body
        .get("data")
        .and_then(|d| d.get("accounts"))
        .and_then(|a| a.as_array());

    let account_data = accounts
        .and_then(|arr| {
            arr.iter().find(|a| {
                a.get("lastLogin")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
        })
        .or_else(|| accounts.and_then(|arr| arr.first()))
        .cloned()
        .unwrap_or(json!({}));

    let uid = account_data
        .get("uid")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let nickname = account_data
        .get("nickname")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let email = account_data
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let enterprise_id = account_data
        .get("enterpriseId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let enterprise_name = account_data
        .get("enterpriseName")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let dosage = fetch_dosage_notify(access_token, uid.as_deref(), enterprise_id.as_deref(), None)
        .await
        .ok();

    let payment = fetch_payment_type(access_token, uid.as_deref(), enterprise_id.as_deref(), None)
        .await
        .ok();

    let user_resource = fetch_user_resource(access_token, uid.as_deref(), enterprise_id.as_deref(), None)
        .await
        .ok();

    let dosage_data = dosage.as_ref().and_then(|v| v.get("data"));
    let dosage_notify_code = dosage_data
        .and_then(|d| d.get("dosageNotifyCode"))
        .map(|v| match v {
            Value::String(s) => s.clone(),
            Value::Number(n) => n.to_string(),
            _ => String::new(),
        });
    let dosage_notify_zh = dosage_data
        .and_then(|d| d.get("dosageNotifyZh"))
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let dosage_notify_en = dosage_data
        .and_then(|d| d.get("dosageNotifyEn"))
        .and_then(Value::as_str)
        .map(|s| s.to_string());

    let payment_type = payment
        .as_ref()
        .and_then(|v| v.pointer("/data/paymentType"))
        .and_then(Value::as_str)
        .map(|s| s.to_string());

    let plan_type = if enterprise_id.is_some() {
        Some("enterprise".to_string())
    } else if let Some(ref pt) = payment_type {
        Some(pt.clone())
    } else {
        Some("free".to_string())
    };

    Ok(WorkbuddyOAuthCompletePayload {
        email,
        uid,
        nickname,
        enterprise_id,
        enterprise_name,
        access_token: access_token.to_string(),
        refresh_token: None,
        token_type: Some("bearer".to_string()),
        expires_at: Some(chrono::Utc::now().timestamp_millis() + 86400 * 30 * 1000),
        domain: Some("www.workbuddy.ai".to_string()),
        plan_type,
        dosage_notify_code,
        dosage_notify_zh,
        dosage_notify_en,
        payment_type,
        quota_raw: user_resource,
        auth_raw: None,
        profile_raw: Some(account_data),
        usage_raw: None,
        status: Some("active".to_string()),
        status_reason: None,
    })
}

pub async fn refresh_payload_for_account(
    account: &crate::models::workbuddy::WorkbuddyAccount,
) -> Result<(WorkbuddyOAuthCompletePayload, Option<String>), String> {
    let domain = account.domain.as_deref().or(Some("www.workbuddy.ai"));
    
    let (new_access_token, new_refresh_token, new_expires_at) = if let Some(ref rt_val) = account.refresh_token.as_ref().filter(|s| !s.trim().is_empty()) {
        match refresh_token(&account.access_token, rt_val, domain).await {
            Ok(body) => {
                let token_data = body.get("data");
                let at = token_data
                    .and_then(|d| d.get("accessToken"))
                    .and_then(Value::as_str)
                    .unwrap_or(&account.access_token)
                    .to_string();
                let rt = token_data
                    .and_then(|d| d.get("refreshToken"))
                    .and_then(Value::as_str)
                    .map(|s| s.to_string())
                    .or_else(|| account.refresh_token.clone());
                let exp = token_data.and_then(|d| d.get("expiresAt")).and_then(Value::as_i64);
                (at, rt, exp)
            }
            Err(e) => {
                logger::log_warn(&format!("[WorkBuddyAI] 刷新 token 失败: {}, 尝试直接使用旧 token", e));
                (account.access_token.clone(), account.refresh_token.clone(), account.expires_at)
            }
        }
    } else {
        (account.access_token.clone(), account.refresh_token.clone(), account.expires_at)
    };

    let mut payload = build_payload_from_token(&new_access_token).await?;
    payload.refresh_token = new_refresh_token;
    if new_expires_at.is_some() {
        payload.expires_at = new_expires_at;
    }
    payload.domain = Some(domain.unwrap_or("www.workbuddy.ai").to_string());

    Ok((payload, None))
}
