use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::{json, Value};

use crate::models::workbuddy::{WorkbuddyAccount, WorkbuddyOAuthCompletePayload};
use crate::modules::account;

const ACCOUNTS_INDEX_FILE: &str = "workbuddy_ai_accounts.json";
const ACCOUNTS_DIR: &str = "workbuddy_ai_accounts";
const WORKBUDDY_AI_AUTH_FILE_NAME: &str = "workbuddy-desktop-ai.info";

lazy_static::lazy_static! {
    static ref WORKBUDDY_AI_ACCOUNT_INDEX_LOCK: Mutex<()> = Mutex::new(());
    static ref WORKBUDDY_AI_QUOTA_ALERT_LAST_SENT: Mutex<HashMap<String, i64>> = Mutex::new(HashMap::new());
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn get_data_dir() -> Result<PathBuf, String> {
    account::get_data_dir()
}

fn get_accounts_dir() -> Result<PathBuf, String> {
    let dir = get_data_dir()?.join(ACCOUNTS_DIR);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建 WorkBuddyAI 账号目录失败: {}", e))?;
    }
    Ok(dir)
}

fn get_index_path() -> Result<PathBuf, String> {
    Ok(get_data_dir()?.join(ACCOUNTS_INDEX_FILE))
}

fn get_account_path(id: &str) -> Result<PathBuf, String> {
    Ok(get_accounts_dir()?.join(format!("{}.json", id)))
}

fn get_workbuddy_shared_auth_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;

    #[cfg(target_os = "macos")]
    {
        return Some(
            home.join("Library")
                .join("Application Support")
                .join("CodeBuddyExtension")
                .join("Data")
                .join("Public")
                .join("auth"),
        );
    }

    #[cfg(target_os = "windows")]
    {
        return Some(
            home.join("AppData")
                .join("Local")
                .join("CodeBuddyExtension")
                .join("Data")
                .join("Public")
                .join("auth"),
        );
    }

    #[cfg(target_os = "linux")]
    {
        return Some(
            home.join(".local")
                .join("share")
                .join("CodeBuddyExtension")
                .join("Data")
                .join("Public")
                .join("auth"),
        );
    }

    #[allow(unreachable_code)]
    None
}

pub fn get_default_workbuddy_ai_auth_file_path() -> Option<PathBuf> {
    get_workbuddy_shared_auth_dir().map(|dir| dir.join(WORKBUDDY_AI_AUTH_FILE_NAME))
}

fn workbuddy_ai_logout_marker_path(auth_file: &Path) -> PathBuf {
    PathBuf::from(format!("{}.logged-out", auth_file.to_string_lossy()))
}

fn parse_local_access_token(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Array(arr) => arr.iter().find_map(parse_local_access_token),
        Value::Object(obj) => {
            let direct = obj
                .get("token")
                .or_else(|| obj.get("access_token"))
                .or_else(|| obj.get("accessToken"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            if let Some(token) = direct {
                return Some(token);
            }

            let auth_token = obj
                .get("auth")
                .and_then(|v| v.as_object())
                .and_then(|auth| {
                    auth.get("accessToken")
                        .or_else(|| auth.get("access_token"))
                        .and_then(|v| v.as_str())
                })
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            if let Some(token) = auth_token {
                return Some(token);
            }

            None
        }
        _ => None,
    }
}

fn normalize_local_token(token: &str) -> Option<String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some((_, suffix)) = trimmed.split_once('+') {
        let suffix = suffix.trim();
        if !suffix.is_empty() {
            return Some(suffix.to_string());
        }
    }
    Some(trimmed.to_string())
}

fn extract_uid_from_jwt(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let decoded = URL_SAFE_NO_PAD
        .decode(parts[1])
        .or_else(|_| base64::engine::general_purpose::STANDARD.decode(parts[1]))
        .ok()?;
    let value: Value = serde_json::from_slice(&decoded).ok()?;
    value
        .get("sub")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn import_payload_from_local() -> Result<Option<WorkbuddyOAuthCompletePayload>, String> {
    let auth_file = match get_default_workbuddy_ai_auth_file_path() {
        Some(path) => path,
        None => return Ok(None),
    };
    if !auth_file.exists() || workbuddy_ai_logout_marker_path(&auth_file).exists() {
        return Ok(None);
    }

    let secret = fs::read_to_string(&auth_file)
        .map_err(|e| format!("读取本机 WorkBuddyAI 登录信息失败: {}", e))?;

    let parsed_json = serde_json::from_str::<Value>(&secret).ok();
    let token_candidate = parsed_json
        .as_ref()
        .and_then(parse_local_access_token)
        .or_else(|| {
            let raw = secret.trim();
            if raw.is_empty() {
                None
            } else {
                Some(raw.to_string())
            }
        });

    let Some(raw_token) = token_candidate else {
        return Err("本地 WorkBuddyAI 登录信息解析失败: 未找到 access token".to_string());
    };

    let Some(access_token) = normalize_local_token(&raw_token) else {
        return Err("本地 WorkBuddyAI 登录信息解析失败: access token 为空".to_string());
    };

    let uid = extract_uid_from_jwt(&raw_token);
    let mut payload = WorkbuddyOAuthCompletePayload {
        email: String::new(),
        uid,
        nickname: None,
        enterprise_id: None,
        enterprise_name: None,
        access_token: access_token.clone(),
        refresh_token: None,
        token_type: Some("bearer".to_string()),
        expires_at: Some(chrono::Utc::now().timestamp_millis() + 86400 * 30 * 1000),
        domain: Some("www.workbuddy.ai".to_string()),
        plan_type: Some("free".to_string()),
        dosage_notify_code: None,
        dosage_notify_zh: None,
        dosage_notify_en: None,
        payment_type: None,
        quota_raw: None,
        auth_raw: parsed_json.clone(),
        profile_raw: None,
        usage_raw: None,
        status: Some("active".to_string()),
        status_reason: None,
    };

    if let Some(json_val) = &parsed_json {
        if let Some(acc) = json_val.get("account").and_then(Value::as_object) {
            if let Some(email_str) = acc.get("email").and_then(Value::as_str) {
                payload.email = email_str.to_string();
            }
            if let Some(nick) = acc.get("nickname").and_then(Value::as_str) {
                payload.nickname = Some(nick.to_string());
            }
            if payload.uid.is_none() {
                if let Some(uid_val) = acc.get("uid").and_then(Value::as_str) {
                    payload.uid = Some(uid_val.to_string());
                }
            }
            payload.profile_raw = Some(Value::Object(acc.clone()));
        }
        if let Some(auth_obj) = json_val.get("auth").and_then(Value::as_object) {
            if let Some(rt) = auth_obj.get("refreshToken").and_then(Value::as_str) {
                payload.refresh_token = Some(rt.to_string());
            }
            if let Some(exp) = auth_obj.get("expiresAt").and_then(Value::as_i64) {
                payload.expires_at = Some(exp);
            }
            if let Some(dom) = auth_obj.get("domain").and_then(Value::as_str) {
                payload.domain = Some(dom.to_string());
            }
        }
    }

    Ok(Some(payload))
}

pub fn list_accounts() -> Vec<WorkbuddyAccount> {
    let _lock = WORKBUDDY_AI_ACCOUNT_INDEX_LOCK.lock().unwrap();
    let index_path = match get_index_path() {
        Ok(path) => path,
        Err(_) => return Vec::new(),
    };

    if !index_path.exists() {
        return Vec::new();
    }

    let content = match fs::read_to_string(&index_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let ids: Vec<String> = match serde_json::from_str(&content) {
        Ok(i) => i,
        Err(_) => return Vec::new(),
    };

    let mut accounts = Vec::new();
    for id in ids {
        if let Ok(path) = get_account_path(&id) {
            if path.exists() {
                if let Ok(c) = fs::read_to_string(&path) {
                    if let Ok(account) = serde_json::from_str::<WorkbuddyAccount>(&c) {
                        accounts.push(account);
                    }
                }
            }
        }
    }

    accounts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    accounts
}

pub fn upsert_account(payload: WorkbuddyOAuthCompletePayload) -> Result<WorkbuddyAccount, String> {
    let _lock = WORKBUDDY_AI_ACCOUNT_INDEX_LOCK.lock().unwrap();
    let now = now_ts();

    let account_id = if let Some(ref uid) = payload.uid {
        format!("wb_ai_{}", uid)
    } else {
        format!("wb_ai_{}", payload.email.replace('@', "_").replace('.', "_"))
    };

    let account_path = get_account_path(&account_id)?;
    let mut account = if account_path.exists() {
        let content = fs::read_to_string(&account_path)
            .map_err(|e| format!("读取现有 WorkBuddyAI 账号失败: {}", e))?;
        serde_json::from_str::<WorkbuddyAccount>(&content)
            .map_err(|e| format!("解析现有 WorkBuddyAI 账号失败: {}", e))?
    } else {
        WorkbuddyAccount {
            id: account_id.clone(),
            email: payload.email.clone(),
            uid: payload.uid.clone(),
            nickname: payload.nickname.clone(),
            enterprise_id: payload.enterprise_id.clone(),
            enterprise_name: payload.enterprise_name.clone(),
            access_token: payload.access_token.clone(),
            refresh_token: payload.refresh_token.clone(),
            token_type: payload.token_type.clone(),
            expires_at: payload.expires_at,
            domain: payload.domain.clone(),
            plan_type: payload.plan_type.clone(),
            dosage_notify_code: payload.dosage_notify_code.clone(),
            dosage_notify_zh: payload.dosage_notify_zh.clone(),
            dosage_notify_en: payload.dosage_notify_en.clone(),
            payment_type: payload.payment_type.clone(),
            quota_raw: payload.quota_raw.clone(),
            auth_raw: payload.auth_raw.clone(),
            profile_raw: payload.profile_raw.clone(),
            usage_raw: payload.usage_raw.clone(),
            status: payload.status.clone().or_else(|| Some("active".to_string())),
            status_reason: payload.status_reason.clone(),
            quota_query_last_error: None,
            quota_query_last_error_at: None,
            usage_updated_at: None,
            last_checkin_time: None,
            checkin_streak: None,
            checkin_rewards: None,
            created_at: now,
            last_used: now,
            web_session_enabled: None,
            tags: Some(Vec::new()),
        }
    };

    account.email = payload.email;
    account.uid = payload.uid;
    account.nickname = payload.nickname;
    account.access_token = payload.access_token;
    if payload.refresh_token.is_some() {
        account.refresh_token = payload.refresh_token;
    }
    account.expires_at = payload.expires_at;
    account.domain = payload.domain;
    account.quota_raw = payload.quota_raw;
    if payload.plan_type.is_some() {
        account.plan_type = payload.plan_type;
    }
    if payload.payment_type.is_some() {
        account.payment_type = payload.payment_type;
    }
    if payload.dosage_notify_code.is_some() {
        account.dosage_notify_code = payload.dosage_notify_code;
    }
    if payload.dosage_notify_zh.is_some() {
        account.dosage_notify_zh = payload.dosage_notify_zh;
    }
    if payload.dosage_notify_en.is_some() {
        account.dosage_notify_en = payload.dosage_notify_en;
    }
    account.usage_updated_at = Some(now);
    account.last_used = now;

    let account_json = serde_json::to_string_pretty(&account)
        .map_err(|e| format!("序列化账号失败: {}", e))?;
    fs::write(&account_path, account_json)
        .map_err(|e| format!("写入账号文件失败: {}", e))?;

    let index_path = get_index_path()?;
    let mut ids: Vec<String> = if index_path.exists() {
        let content = fs::read_to_string(&index_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    if !ids.contains(&account_id) {
        ids.push(account_id);
        let index_json = serde_json::to_string_pretty(&ids)
            .map_err(|e| format!("序列化索引失败: {}", e))?;
        fs::write(&index_path, index_json)
            .map_err(|e| format!("更新索引文件失败: {}", e))?;
    }

    Ok(account)
}

pub fn remove_account(id: &str) -> Result<(), String> {
    let _lock = WORKBUDDY_AI_ACCOUNT_INDEX_LOCK.lock().unwrap();
    let account_path = get_account_path(id)?;
    if account_path.exists() {
        fs::remove_file(&account_path)
            .map_err(|e| format!("删除账号文件失败: {}", e))?;
    }

    let index_path = get_index_path()?;
    if index_path.exists() {
        let content = fs::read_to_string(&index_path).unwrap_or_default();
        let mut ids: Vec<String> = serde_json::from_str(&content).unwrap_or_default();
        if let Some(pos) = ids.iter().position(|x| x == id) {
            ids.remove(pos);
            let index_json = serde_json::to_string_pretty(&ids)
                .map_err(|e| format!("序列化索引失败: {}", e))?;
            fs::write(&index_path, index_json)
                .map_err(|e| format!("更新索引失败: {}", e))?;
        }
    }

    Ok(())
}

fn build_workbuddy_ai_account_object(account: &WorkbuddyAccount) -> Value {
    let mut obj = account
        .profile_raw
        .as_ref()
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    let uid = account.uid.clone().unwrap_or_default();
    let nickname = account
        .nickname
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| account.email.clone());

    obj.insert("uid".to_string(), Value::String(uid));
    obj.insert("nickname".to_string(), Value::String(nickname));
    if !account.email.is_empty() {
        obj.insert("email".to_string(), Value::String(account.email.clone()));
    }
    obj.entry("uin".to_string())
        .or_insert_with(|| Value::String(String::new()));
    obj.insert("type".to_string(), Value::String("personal".to_string()));
    obj.insert("lastLogin".to_string(), Value::Bool(true));
    obj.entry("isCreator".to_string())
        .or_insert_with(|| Value::Bool(false));
    obj.entry("isAdmin".to_string())
        .or_insert_with(|| Value::Bool(false));
    obj.insert("pluginEnabled".to_string(), Value::Bool(true));
    obj.entry("deployStatus".to_string()).or_insert_with(|| {
        json!({
            "statusCode": 0,
            "statusMsg": "",
            "detailMsg": ""
        })
    });
    obj.insert("accountType".to_string(), Value::String(String::new()));
    obj.entry("sso".to_string()).or_insert_with(|| {
        json!({
            "domain": "",
            "domainModifiedTimes": 0
        })
    });
    obj.entry("idp".to_string())
        .or_insert_with(|| Value::String(String::new()));
    obj.insert("areaInfoComplete".to_string(), Value::Bool(true));
    obj.insert("oneidAccountId".to_string(), Value::String(String::new()));
    obj.insert("isCurrentOneIdEnterprise".to_string(), Value::Bool(false));
    obj.insert("isCurrentOneIdPersonal".to_string(), Value::Bool(false));
    obj.insert("isFirstLogin".to_string(), Value::Bool(false));

    Value::Object(obj)
}

pub fn close_workbuddy_ai_processes() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "WorkBuddyAI.exe"])
            .creation_flags(0x08000000)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("pkill")
            .args(["-f", "WorkBuddyAI"])
            .output();
    }
    std::thread::sleep(std::time::Duration::from_millis(450));
}

pub fn detect_workbuddy_ai_exec_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let mut candidates = Vec::new();
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let base = PathBuf::from(&local_app_data).join("Programs");
            candidates.push(base.join("WorkBuddyAI").join("WorkBuddyAI.exe"));
            candidates.push(base.join("WorkBuddy AI").join("WorkBuddyAI.exe"));
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            let base = PathBuf::from(&program_files);
            candidates.push(base.join("WorkBuddyAI").join("WorkBuddyAI.exe"));
            candidates.push(base.join("WorkBuddy AI").join("WorkBuddyAI.exe"));
        }
        for path in candidates {
            if path.is_file() {
                return Some(path);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        for path in [
            "/Applications/WorkBuddy AI.app/Contents/MacOS/WorkBuddy AI",
            "/Applications/WorkBuddyAI.app/Contents/MacOS/WorkBuddyAI",
        ] {
            let p = PathBuf::from(path);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

pub fn start_workbuddy_ai_client() -> Result<(), String> {
    let exec_path = detect_workbuddy_ai_exec_path()
        .ok_or_else(|| "未检测到本机 WorkBuddyAI 客户端安装路径 (WorkBuddyAI.exe)".to_string())?;

    let mut cmd = std::process::Command::new(&exec_path);
    if let Some(parent) = exec_path.parent() {
        cmd.current_dir(parent);
    }

    let user_config = crate::modules::config::get_user_config();
    let proxy_url = user_config.global_proxy_url.trim();
    if user_config.global_proxy_enabled && !proxy_url.is_empty() {
        for key in [
            "http_proxy",
            "https_proxy",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "all_proxy",
            "ALL_PROXY",
        ] {
            cmd.env(key, proxy_url);
        }
        cmd.arg(format!("--proxy-server={}", proxy_url));

        let no_proxy = crate::modules::config::merge_local_no_proxy(
            user_config.global_proxy_no_proxy.trim(),
        );
        if !no_proxy.is_empty() {
            cmd.env("no_proxy", &no_proxy);
            cmd.env("NO_PROXY", &no_proxy);
            cmd.arg(format!("--proxy-bypass-list={}", no_proxy));
        }
        crate::modules::logger::log_info(&format!(
            "[WorkBuddyAI Start] 已为 WorkBuddyAI 注入全局代理: proxy={}, no_proxy={}",
            proxy_url, no_proxy
        ));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000 | 0x00000200 | 0x00000008);
        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
    }

    cmd.spawn()
        .map_err(|e| format!("启动 WorkBuddyAI 客户端失败: {}", e))?;

    Ok(())
}

pub fn write_account_to_default_client(account: &WorkbuddyAccount) -> Result<(), String> {
    let auth_file = get_default_workbuddy_ai_auth_file_path()
        .ok_or_else(|| "无法定位默认 WorkBuddyAI 登录信息路径".to_string())?;

    let marker_path = workbuddy_ai_logout_marker_path(&auth_file);
    let now_ms = chrono::Utc::now().timestamp_millis();
    let expires_at = account
        .expires_at
        .filter(|&ts| ts > now_ms)
        .unwrap_or(now_ms + 86400 * 30 * 1000);
    let expires_in = std::cmp::max(3600, (expires_at - now_ms) / 1000);
    let account_obj = build_workbuddy_ai_account_object(account);

    let session_json = json!({
        "account": account_obj,
        "auth": {
            "accessToken": account.access_token,
            "refreshToken": account.refresh_token.clone().unwrap_or_default(),
            "domain": account.domain.clone().unwrap_or_else(|| "www.workbuddy.ai".to_string()),
            "tokenType": "Bearer",
            "scope": "openid profile offline_access email",
            "lastRefreshTime": now_ms,
            "expiresAt": expires_at,
            "refreshExpiresAt": expires_at,
            "expiresIn": expires_in,
            "refreshExpiresIn": expires_in,
        },
        "accounts": [account_obj],
        "allAccounts": [account_obj]
    });

    let content = serde_json::to_string_pretty(&session_json)
        .map_err(|e| format!("序列化 WorkBuddyAI 登录信息失败: {}", e))?;

    if let Some(parent) = auth_file.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
        }
    }

    crate::modules::atomic_write::write_string_atomic(&auth_file, &content)
        .map_err(|e| format!("写入 WorkBuddyAI 凭据文件失败: {}", e))?;

    if marker_path.exists() {
        let _ = fs::remove_file(&marker_path);
    }

    if let Some(home) = dirs::home_dir() {
        let snapshot_path = home
            .join(".workbuddy-ai")
            .join("storage")
            .join("skeleton")
            .join("account-snapshot.json");
        if let Some(parent) = snapshot_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let nickname = account
            .nickname
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| account.email.clone());
        let is_pro = account
            .plan_type
            .as_deref()
            .is_some_and(|p| p.eq_ignore_ascii_case("pro") || p.eq_ignore_ascii_case("enterprise"));
        let snapshot_json = json!({
            "primary": {
                "version": 1,
                "uid": account.uid.clone().unwrap_or_default(),
                "nickname": nickname,
                "type": "personal",
                "editionType": if is_pro { "pro" } else { "free" },
                "isPro": is_pro,
                "oneidAccountId": "",
                "enableArdotDesign": false,
                "savedAt": now_ms
            }
        });
        if let Ok(snap_str) = serde_json::to_string_pretty(&snapshot_json) {
            let _ = crate::modules::atomic_write::write_string_atomic(&snapshot_path, &snap_str);
        }
    }

    Ok(())
}

pub fn resolve_current_account_id(accounts: &[WorkbuddyAccount]) -> Option<String> {
    if let Some(auth_file) = get_default_workbuddy_ai_auth_file_path() {
        if auth_file.exists() && !workbuddy_ai_logout_marker_path(&auth_file).exists() {
            if let Ok(content) = fs::read_to_string(&auth_file) {
                if let Ok(parsed) = serde_json::from_str::<Value>(&content) {
                    let local_uid = parsed
                        .get("account")
                        .and_then(|acc| acc.get("uid"))
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty());
                    if let Some(uid_val) = local_uid {
                        if let Some(matched) = accounts
                            .iter()
                            .find(|a| a.uid.as_deref() == Some(uid_val))
                        {
                            return Some(matched.id.clone());
                        }
                    }
                }
            }
        }
    }

    match import_payload_from_local() {
        Ok(Some(payload)) => {
            if let Some(account) = accounts.iter().find(|a| {
                if let (Some(u1), Some(u2)) = (a.uid.as_ref(), payload.uid.as_ref()) {
                    if u1 == u2 {
                        return true;
                    }
                }
                if !payload.email.is_empty() && a.email.eq_ignore_ascii_case(&payload.email) {
                    return true;
                }
                false
            }) {
                return Some(account.id.clone());
            }
        }
        _ => {}
    }

    crate::modules::provider_current_state::resolve_existing_current_account_id(
        "workbuddy_ai",
        accounts.iter().map(|account| account.id.as_str()),
    )
}

pub fn update_account_tags(account_id: &str, tags: Vec<String>) -> Result<WorkbuddyAccount, String> {
    let _lock = WORKBUDDY_AI_ACCOUNT_INDEX_LOCK.lock().unwrap();
    let account_path = get_account_path(account_id)?;
    if !account_path.exists() {
        return Err("账号不存在".to_string());
    }
    let content = fs::read_to_string(&account_path)
        .map_err(|e| format!("读取账号失败: {}", e))?;
    let mut account: WorkbuddyAccount = serde_json::from_str(&content)
        .map_err(|e| format!("解析账号失败: {}", e))?;
    account.tags = Some(tags);
    let updated_json = serde_json::to_string_pretty(&account)
        .map_err(|e| format!("序列化账号失败: {}", e))?;
    fs::write(&account_path, updated_json)
        .map_err(|e| format!("写入账号失败: {}", e))?;
    Ok(account)
}

pub fn load_account(account_id: &str) -> Option<WorkbuddyAccount> {
    let _lock = WORKBUDDY_AI_ACCOUNT_INDEX_LOCK.lock().unwrap();
    let account_path = get_account_path(account_id).ok()?;
    if !account_path.exists() {
        return None;
    }
    let content = fs::read_to_string(&account_path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn update_checkin_info(
    account_id: &str,
    last_checkin_time: Option<i64>,
    streak: i32,
    rewards: Option<serde_json::Value>,
) -> Result<WorkbuddyAccount, String> {
    let _lock = WORKBUDDY_AI_ACCOUNT_INDEX_LOCK.lock().unwrap();
    let account_path = get_account_path(account_id)?;
    if !account_path.exists() {
        return Err("账号不存在".to_string());
    }
    let content = fs::read_to_string(&account_path)
        .map_err(|e| format!("读取账号失败: {}", e))?;
    let mut account: WorkbuddyAccount = serde_json::from_str(&content)
        .map_err(|e| format!("解析账号失败: {}", e))?;

    if let Some(time) = last_checkin_time {
        account.last_checkin_time = Some(time);
    }
    account.checkin_streak = Some(streak);
    account.checkin_rewards = rewards;
    account.last_used = now_ts();

    let updated_json = serde_json::to_string_pretty(&account)
        .map_err(|e| format!("序列化账号失败: {}", e))?;
    fs::write(&account_path, updated_json)
        .map_err(|e| format!("写入账号失败: {}", e))?;

    crate::modules::logger::log_info(&format!(
        "[WorkBuddy AI Checkin] 签到信息已更新: account_id={}, streak={}",
        account.id, streak
    ));

    Ok(account)
}
