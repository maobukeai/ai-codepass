use std::fs;
use std::path::{Path, PathBuf};
use serde_json::{json, Value};

use crate::models::qoder::QoderAccount;
use crate::modules::logger;
use crate::modules::qoder_account::{self, QoderPlatformKind};

#[cfg(target_os = "windows")]
use base64::{engine::general_purpose, Engine as _};

pub fn get_default_qwenwork_user_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let base = PathBuf::from(appdata);
            for candidate in ["QwenWorkCN", "QoderWork CN", "QwenWork", "QoderWork"] {
                let p = base.join(candidate);
                if p.exists() {
                    return p;
                }
            }
            return base.join("QwenWorkCN");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            let base = home.join("Library/Application Support");
            for candidate in ["QwenWorkCN", "QoderWork CN", "QwenWork", "QoderWork"] {
                let p = base.join(candidate);
                if p.exists() {
                    return p;
                }
            }
            return base.join("QwenWorkCN");
        }
    }
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("QwenWorkCN")
}

pub fn get_default_qwenwork_status_file_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".qwenworkcn")
        .join(".status.json")
}

pub fn detect_qwenwork_exec_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            let base = PathBuf::from(local_appdata).join("Programs");
            for dir_name in ["QwenWorkCN", "QwenWork", "QoderWorkCN", "QoderWork"] {
                let app_root = base.join(dir_name);
                // 优先选择真实主程序 QwenWorkCN.exe（避免 Launcher.exe 吞掉 --user-data-dir 参数并唤醒旧实例）
                let direct_exe = app_root.join("QwenWorkCN.exe");
                if direct_exe.is_file() {
                    return Some(direct_exe);
                }
                if let Ok(entries) = fs::read_dir(&app_root) {
                    let mut version_exes: Vec<PathBuf> = entries
                        .filter_map(|e| e.ok())
                        .filter(|e| e.path().is_dir())
                        .map(|e| e.path().join("QwenWorkCN.exe"))
                        .filter(|p| p.is_file())
                        .collect();
                    version_exes.sort();
                    if let Some(latest) = version_exes.pop() {
                        return Some(latest);
                    }
                }
                let launcher = app_root.join("Launcher.exe");
                if launcher.is_file() {
                    return Some(launcher);
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        for candidate in [
            "/Applications/千问办公.app/Contents/MacOS/QwenWorkCN",
            "/Applications/QwenWorkCN.app/Contents/MacOS/QwenWorkCN",
            "/Applications/QwenWork.app/Contents/MacOS/QwenWork",
        ] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
pub fn read_windows_encryption_key(data_root: &Path) -> Result<Vec<u8>, String> {
    let local_state_path = data_root.join("Local State");
    let effective_local_state = if local_state_path.exists() {
        local_state_path
    } else {
        let default_local_state = get_default_qwenwork_user_data_dir().join("Local State");
        if default_local_state.exists() {
            let _ = fs::create_dir_all(data_root);
            let _ = fs::copy(&default_local_state, &local_state_path);
            default_local_state
        } else {
            return Err(format!("无法找到 Local State: {}", local_state_path.display()));
        }
    };

    let content = fs::read_to_string(&effective_local_state)
        .map_err(|e| format!("无法读取 Local State: {}", e))?;
    let json: Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析 Local State 失败: {}", e))?;
    let encrypted_key_b64 = json["os_crypt"]["encrypted_key"]
        .as_str()
        .ok_or_else(|| "Local State 中缺少 os_crypt.encrypted_key".to_string())?;
    let encrypted_key_bytes = general_purpose::STANDARD
        .decode(encrypted_key_b64)
        .map_err(|e| format!("Base64 解码 encrypted_key 失败: {}", e))?;
    if encrypted_key_bytes.len() < 5 || &encrypted_key_bytes[..5] != b"DPAPI" {
        return Err("encrypted_key 前缀不是 DPAPI".to_string());
    }
    let dpapi_blob = &encrypted_key_bytes[5..];
    crate::modules::vscode_inject::dpapi_decrypt(dpapi_blob)
}

pub fn read_auth_v2_json(data_root: &Path) -> Result<Option<Value>, String> {
    #[cfg(target_os = "windows")]
    {
        let auth_v2_path = data_root.join("auth-v2.dat");
        if auth_v2_path.exists() {
            if let Ok(key) = read_windows_encryption_key(data_root) {
                if let Ok(encrypted) = fs::read(&auth_v2_path) {
                    if let Ok(decrypted_bytes) =
                        crate::modules::vscode_inject::decrypt_windows_gcm_v10(&key, &encrypted)
                    {
                        if let Ok(decrypted_str) = String::from_utf8(decrypted_bytes) {
                            if let Ok(val) = serde_json::from_str::<Value>(&decrypted_str) {
                                return Ok(Some(val));
                            }
                        }
                    }
                }
            }
        }
    }

    let fallback_json_path = data_root.join("auth-v2.dat.json");
    if fallback_json_path.exists() {
        if let Ok(content) = fs::read_to_string(&fallback_json_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                return Ok(Some(val));
            }
        }
    }

    Ok(None)
}

pub fn read_status_json() -> Option<Value> {
    let status_path = get_default_qwenwork_status_file_path();
    if !status_path.exists() {
        return None;
    }
    let content = fs::read_to_string(&status_path).ok()?;
    serde_json::from_str::<Value>(&content).ok()
}

pub fn import_from_local_qwenwork() -> Result<Option<QoderAccount>, String> {
    let data_dir = get_default_qwenwork_user_data_dir();
    let auth_v2_opt = read_auth_v2_json(&data_dir)?;
    let status_opt = read_status_json();

    if auth_v2_opt.is_none() && status_opt.is_none() {
        return Ok(None);
    }

    let mut user_id = String::new();
    let mut email = String::new();
    let mut display_name = String::new();
    let mut plan_type = "个人免费版".to_string();
    let mut token_str = String::new();
    let mut refresh_token_str = String::new();
    let mut expires_at_str = String::new();

    if let Some(ref status) = status_opt {
        if let Some(u) = status.get("username").and_then(|v| v.as_str()) {
            user_id = u.trim().to_string();
        }
        if let Some(e) = status.get("email").and_then(|v| v.as_str()) {
            email = e.trim().to_string();
        }
        if let Some(n) = status.get("name").and_then(|v| v.as_str()) {
            display_name = n.trim().to_string();
        }
        if let Some(p) = status.get("plan").and_then(|v| v.as_str()) {
            if !p.trim().is_empty() {
                plan_type = p.trim().to_string();
            }
        }
    }

    if let Some(ref auth_v2) = auth_v2_opt {
        if let Some(t) = auth_v2.get("token").and_then(|v| v.as_str()) {
            token_str = t.to_string();
        }
        if let Some(rt) = auth_v2.get("refreshToken").and_then(|v| v.as_str()) {
            refresh_token_str = rt.to_string();
        }
        if let Some(exp) = auth_v2.get("expiresAt").and_then(|v| v.as_str()) {
            expires_at_str = exp.to_string();
        }
        if let Some(user_obj) = auth_v2.get("user") {
            if let Some(id) = user_obj.get("id").and_then(|v| v.as_str()) {
                if !id.trim().is_empty() {
                    user_id = id.trim().to_string();
                }
            }
            if let Some(e) = user_obj.get("email").and_then(|v| v.as_str()) {
                if !e.trim().is_empty() {
                    email = e.trim().to_string();
                }
            }
            if let Some(n) = user_obj.get("name").and_then(|v| v.as_str()) {
                if !n.trim().is_empty() {
                    display_name = n.trim().to_string();
                }
            }
            if let Some(p) = user_obj
                .get("planName")
                .or_else(|| user_obj.get("tier"))
                .and_then(|v| v.as_str())
            {
                if !p.trim().is_empty() {
                    plan_type = p.trim().to_string();
                }
            }
        }
    }

    if user_id.is_empty() && email.is_empty() && display_name.is_empty() {
        return Ok(None);
    }

    if email.is_empty() {
        email = if !display_name.is_empty() {
            format!("{}@qwenwork.cn", display_name)
        } else {
            format!("{}@qwenwork.cn", user_id)
        };
    }

    let user_info_raw = json!({
        "id": user_id,
        "email": email,
        "name": display_name,
        "plan": plan_type,
        "token": token_str,
        "refreshToken": refresh_token_str,
        "expiresAt": expires_at_str,
        "__qwenwork_auth_v2": auth_v2_opt,
        "__qwenwork_status": status_opt,
    });

    let user_plan_raw = json!({
        "plan": plan_type,
        "tier": plan_type,
        "name": plan_type,
    });

    let existing_credit_usage = qoder_account::list_accounts_for_platform(QoderPlatformKind::QwenWork)
        .into_iter()
        .find(|a| {
            if let Some(ref uid) = a.user_id {
                if !user_id.is_empty() && uid == &user_id {
                    return true;
                }
            }
            if !email.is_empty() && a.email.eq_ignore_ascii_case(&email) {
                return true;
            }
            false
        })
        .and_then(|a| a.auth_credit_usage_raw);

    let credit_usage_raw = existing_credit_usage.unwrap_or_else(|| json!({}));

    let account = qoder_account::upsert_qwenwork_snapshot(
        user_info_raw,
        user_plan_raw,
        credit_usage_raw,
    )?;

    logger::log_info(&format!(
        "[QwenWork Account] 从本地导入千问办公账号成功: id={}, name={:?}, email={}",
        account.id, account.display_name, account.email
    ));

    Ok(Some(account))
}

pub fn inject_to_qwenwork_dir(
    user_data_dir: &Path,
    account_id: &str,
    is_default_dir: bool,
) -> Result<(), String> {
    let account = qoder_account::load_account_for_platform(QoderPlatformKind::QwenWork, account_id)
        .ok_or_else(|| format!("未找到千问办公账号: {}", account_id))?;

    fs::create_dir_all(user_data_dir)
        .map_err(|e| format!("创建千问办公数据目录失败: {}", e))?;

    let auth_v2_payload = if let Some(saved_v2) = account
        .auth_user_info_raw
        .as_ref()
        .and_then(|v| v.get("__qwenwork_auth_v2"))
        .filter(|v| v.is_object())
    {
        saved_v2.clone()
    } else {
        let token = account
            .auth_user_info_raw
            .as_ref()
            .and_then(|v| v.get("token"))
            .and_then(|v| v.as_str())
            .unwrap_or("qwenwork_session_token");
        let refresh_token = account
            .auth_user_info_raw
            .as_ref()
            .and_then(|v| v.get("refreshToken"))
            .and_then(|v| v.as_str())
            .unwrap_or("qwenwork_refresh_token");
        let expires_at = account
            .auth_user_info_raw
            .as_ref()
            .and_then(|v| v.get("expiresAt"))
            .and_then(|v| v.as_str())
            .unwrap_or("2027-01-01T00:00:00.000Z");

        json!({
            "schemaVersion": 2,
            "token": token,
            "refreshToken": refresh_token,
            "expiresAt": expires_at,
            "loginMethod": "browser",
            "refreshStrategy": "device_token",
            "identityVersion": 1,
            "user": {
                "id": account.user_id.clone().unwrap_or_else(|| account.id.clone()),
                "name": account.display_name.clone().unwrap_or_else(|| account.email.clone()),
                "email": account.email,
                "planName": account.plan_type.clone().unwrap_or_else(|| "个人免费版".to_string()),
                "tier": account.plan_type.clone().unwrap_or_else(|| "个人免费版".to_string()),
            }
        })
    };

    let serialized = serde_json::to_string(&auth_v2_payload)
        .map_err(|e| format!("序列化千问办公认证载荷失败: {}", e))?;

    let mut encrypted_written = false;
    #[cfg(target_os = "windows")]
    {
        if let Ok(key) = read_windows_encryption_key(user_data_dir) {
            if let Ok(encrypted_bytes) =
                crate::modules::vscode_inject::encrypt_windows_gcm_v10(&key, serialized.as_bytes())
            {
                let auth_v2_path = user_data_dir.join("auth-v2.dat");
                fs::write(&auth_v2_path, encrypted_bytes)
                    .map_err(|e| format!("写入 auth-v2.dat 失败: {}", e))?;
                let json_fallback = user_data_dir.join("auth-v2.dat.json");
                let _ = fs::remove_file(json_fallback);
                encrypted_written = true;
            }
        }
    }

    if !encrypted_written {
        let json_fallback = user_data_dir.join("auth-v2.dat.json");
        fs::write(&json_fallback, &serialized)
            .map_err(|e| format!("写入 auth-v2.dat.json 失败: {}", e))?;
    }

    // 同步写入 .status.json（包括默认目录与当前实例沙箱目录，确保千问办公 C++ / Electron 均加载绑定账号）
    let status_payload = json!({
        "logged_in": true,
        "username": account.user_id.clone().unwrap_or_else(|| account.id.clone()),
        "name": account.display_name.clone().unwrap_or_else(|| account.email.clone()),
        "email": account.email,
        "user_type": "personal",
        "plan": account.plan_type.clone().unwrap_or_else(|| "个人免费版".to_string()),
        "version": "1.2.1",
        "login_method": "browser",
        "schema_version": 1,
        "product": "qwenworkcn",
        "snapshot_at": chrono::Utc::now().to_rfc3339(),
        "writer": "main"
    });
    if let Ok(status_str) = serde_json::to_string_pretty(&status_payload) {
        let status_path = get_default_qwenwork_status_file_path();
        if let Some(parent) = status_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&status_path, &status_str);

        let instance_status_path = user_data_dir.join(".qwenworkcn").join(".status.json");
        if let Some(parent) = instance_status_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&instance_status_path, &status_str);
    }

    // 如果不是默认目录，同时将加密凭证同步至全局回退目录并注入当前实例的独立硬件指纹
    if !is_default_dir {
        let default_data_dir = get_default_qwenwork_user_data_dir();
        if default_data_dir != user_data_dir {
            let src_v2 = user_data_dir.join("auth-v2.dat");
            if src_v2.exists() {
                let _ = fs::copy(&src_v2, default_data_dir.join("auth-v2.dat"));
            }
        }
        if let Ok(fp) = crate::modules::instance_fingerprint::load_or_create_fingerprint(user_data_dir) {
            let _ = crate::modules::instance_fingerprint::inject_fingerprint_into_instance_storage(&default_data_dir, &fp);
        }
    }

    Ok(())
}

/// 当启动未绑定账号的千问办公「空白实例」时，先备份现有本地账号，再清理残留登录态并注入新硬件指纹
pub fn clear_qwenwork_login_state_for_blank_instance(user_data_dir: &Path) -> Result<(), String> {
    // 1. 确保当前默认目录的已登录账号已安全导入到 AI CodePass 账号列表，绝不丢失原账号
    let _ = import_from_local_qwenwork();

    // 2. 清理实例目录与全局回退目录中的登录凭证与会话数据库，确保客户端启动后是 100% 空白未登录状态
    let _ = crate::modules::instance_fingerprint::purge_residual_account_credentials(user_data_dir);
    let default_data_dir = get_default_qwenwork_user_data_dir();
    let _ = crate::modules::instance_fingerprint::purge_residual_account_credentials(&default_data_dir);
    for file_name in [
        "auth.dat",
        "auth-v2.dat",
        "auth-v2.dat.json",
        "data/agents.db",
        "data/agents.db-wal",
        "data/agents.db-shm",
    ] {
        let p1 = user_data_dir.join(file_name);
        if p1.exists() {
            let _ = fs::remove_file(&p1);
        }
        let p2 = default_data_dir.join(file_name);
        if p2.exists() {
            let _ = fs::remove_file(&p2);
        }
    }

    let status_path = get_default_qwenwork_status_file_path();
    if status_path.exists() {
        let _ = fs::remove_file(&status_path);
    }

    // 3. 生成或加载该空白实例的专属系统与硬件指纹，并同步写入实例与运行目录
    let fp = crate::modules::instance_fingerprint::load_or_create_fingerprint(user_data_dir)?;
    let _ = crate::modules::instance_fingerprint::inject_fingerprint_into_instance_storage(user_data_dir, &fp);
    let _ = crate::modules::instance_fingerprint::inject_fingerprint_into_instance_storage(&default_data_dir, &fp);
    logger::log_info(&format!(
        "[QwenWork Instance] 空白实例已彻底清理旧登录态并注入独立硬件指纹: dir={}, fp_id={}, machine_guid={}",
        user_data_dir.display(),
        fp.fingerprint_id,
        fp.machine_guid
    ));

    Ok(())
}

fn extract_token_from_raw_value(val: &Value) -> Option<String> {
    const CANDIDATES: &[&[&str]] = &[
        &["token"],
        &["securityOauthToken"],
        &["accessToken"],
        &["access_token"],
        &["__qwenwork_auth_v2", "token"],
        &["result", "token"],
        &["data", "token"],
        &["result", "accessToken"],
        &["data", "accessToken"],
        &["data", "securityOauthToken"],
        &["user", "token"],
    ];
    for path in CANDIDATES {
        let mut curr = val;
        let mut ok = true;
        for key in *path {
            if let Some(next) = curr.get(*key) {
                curr = next;
            } else {
                ok = false;
                break;
            }
        }
        if ok {
            if let Some(s) = curr.as_str() {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

fn secret_matches_account(secret_val: &Value, account: &QoderAccount) -> bool {
    let secret_uid = secret_val
        .get("id")
        .or_else(|| secret_val.get("uid"))
        .or_else(|| secret_val.get("userId"))
        .or_else(|| secret_val.get("user_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim());
    if let (Some(s_uid), Some(a_uid)) = (secret_uid, account.user_id.as_deref().map(|s| s.trim())) {
        if !s_uid.is_empty() && !a_uid.is_empty() {
            return s_uid.eq_ignore_ascii_case(a_uid);
        }
    }

    let secret_email = secret_val
        .get("email")
        .or_else(|| secret_val.get("mail"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_lowercase());
    let a_email = account.email.trim().to_lowercase();
    if let Some(s_email) = secret_email {
        if s_email.contains('@') && a_email.contains('@') {
            return s_email == a_email;
        }
    }

    if let Some(acc_tok) = account.auth_user_info_raw.as_ref().and_then(extract_token_from_raw_value) {
        if let Some(sec_tok) = extract_token_from_raw_value(secret_val) {
            if sec_tok == acc_tok {
                return true;
            }
        }
    }
    false
}

pub fn get_fresh_token_for_platform(kind: QoderPlatformKind, account: &QoderAccount) -> Option<String> {
    // 1. If local live session belongs to this specific account, use freshest live token
    if kind == QoderPlatformKind::QwenWork {
        let data_dir = get_default_qwenwork_user_data_dir();
        if let Ok(Some(v2)) = read_auth_v2_json(&data_dir) {
            if secret_matches_account(&v2, account) {
                if let Some(tok) = v2.get("token").and_then(|v| v.as_str()) {
                    let trimmed = tok.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    } else if let Some(db_path) = qoder_account::get_default_qoder_state_db_path_for_platform(kind) {
        if db_path.exists() {
            if let Ok(Some(secret_val)) = qoder_account::read_qoder_secret_json(&db_path, qoder_account::QODER_SECRET_USER_INFO_KEY) {
                if secret_matches_account(&secret_val, account) {
                    if let Some(tok) = extract_token_from_raw_value(&secret_val) {
                        return Some(tok);
                    }
                }
            }
        }
    }

    // 2. Always fallback to the account's own persisted token credentials
    if let Some(tok) = account.auth_user_info_raw.as_ref().and_then(extract_token_from_raw_value) {
        return Some(tok);
    }
    if let Some(tok) = account.auth_user_plan_raw.as_ref().and_then(extract_token_from_raw_value) {
        return Some(tok);
    }
    if let Some(tok) = account.auth_credit_usage_raw.as_ref().and_then(extract_token_from_raw_value) {
        return Some(tok);
    }

    None
}

pub async fn claim_qwenwork_daily_checkin(account_id: &str) -> Result<Value, String> {
    let account = qoder_account::load_account_for_platform(QoderPlatformKind::QwenWork, account_id)
        .ok_or_else(|| format!("未找到千问办公账号: {}", account_id))?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let mut token = get_fresh_token_for_platform(QoderPlatformKind::QwenWork, &account)
        .unwrap_or_default();

    if token.is_empty() {
        let data_dir = get_default_qwenwork_user_data_dir();
        if let Ok(Some(v2)) = read_auth_v2_json(&data_dir) {
            if let Some(tok) = v2.get("token").and_then(|v| v.as_str()) {
                token = tok.to_string();
            }
        }
    }

    if token.is_empty() {
        return Err("千问办公账号未检测到有效登录凭证，请先启动客户端登录".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("HTTP客户端初始化失败: {}", e))?;

    // 1. Try remote sash daily check-in endpoint first
    let url = "https://gateway.qwenwork.cn/sash/api/v1/me/daily-check-in/claim";
    let resp_res = client
        .post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "QoderWork")
        .header("X-QwenWork-Version", "1.2.1")
        .header("X-QwenWork-Platform", "win32")
        .header("Content-Type", "application/json")
        .json(&json!({}))
        .send()
        .await;

    if let Ok(resp) = resp_res {
        if resp.status().is_success() {
            let body: Value = resp.json().await.unwrap_or(json!({}));
            let reward = body
                .get("rewardCredits")
                .or_else(|| body.get("data").and_then(|d| d.get("rewardCredits")))
                .and_then(|v| v.as_f64())
                .unwrap_or(100.0);

            let _ = sync_qwenwork_usage_from_remote(account_id, &token).await;
            let updated = qoder_account::record_qwenwork_verified_checkin(account_id, &today, reward)?;
            return Ok(json!({
                "success": true,
                "alreadyCheckedIn": false,
                "rewardCredits": reward,
                "message": format!("千问办公每日签到成功！获得 +{} 算力奖励", reward as i64),
                "account": updated,
            }));
        } else if resp.status() == reqwest::StatusCode::CONFLICT {
            let _ = sync_qwenwork_usage_from_remote(account_id, &token).await;
            let updated = qoder_account::record_qwenwork_verified_checkin(account_id, &today, 0.0)?;
            return Ok(json!({
                "success": true,
                "alreadyCheckedIn": true,
                "rewardCredits": 0,
                "message": "千问办公今日已完成签到，每日 100 Credits 额度已生效（每日 00:00 自动刷新）",
                "account": updated,
            }));
        } else if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err("千问办公登录凭证已失效（401 Unauthorized），请在客户端重新登录".to_string());
        }
    }

    // 2. Fallback: Query remote wallet & account-context to verify daily credit allocation
    let synced_account = sync_qwenwork_usage_from_remote(account_id, &token).await?;

    let is_already_checked_in = synced_account
        .auth_credit_usage_raw
        .as_ref()
        .and_then(|v| v.get("last_checkin_date"))
        .and_then(|v| v.as_str())
        == Some(&today);

    if is_already_checked_in {
        return Ok(json!({
            "success": true,
            "alreadyCheckedIn": true,
            "rewardCredits": 0,
            "message": "千问办公今日已完成签到核验，每日 100 Credits 额度已在账（每日 00:00 自动刷新）",
            "account": synced_account,
        }));
    }

    // Record verified daily check-in
    let updated_account = qoder_account::record_qwenwork_verified_checkin(account_id, &today, 100.0)?;

    Ok(json!({
        "success": true,
        "alreadyCheckedIn": false,
        "rewardCredits": 100.0,
        "message": "千问办公每日签到成功！已核实并激活今日 100 Credits 算力额度（每日 00:00 自动刷新）",
        "account": updated_account,
    }))
}

#[derive(Debug, Clone, Default)]
pub struct QoderDesktopMachineIdentity {
    pub machine_id: Option<String>,
    pub machine_token: Option<String>,
    pub machine_type: Option<String>,
    pub machine_code: Option<String>,
    pub machine_hostname: Option<String>,
    pub machine_os: Option<String>,
    pub client_version: Option<String>,
}

static QODER_DESKTOP_MACHINE_CACHE: std::sync::LazyLock<std::sync::Mutex<Option<QoderDesktopMachineIdentity>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(None));

pub fn resolve_qoder_desktop_machine_identity(
    kind: QoderPlatformKind,
    user_id: Option<&str>,
) -> QoderDesktopMachineIdentity {
    if let Ok(guard) = QODER_DESKTOP_MACHINE_CACHE.lock() {
        if let Some(ref cached) = *guard {
            return cached.clone();
        }
    }

    let mut identity = QoderDesktopMachineIdentity::default();
    identity.client_version = Some("0.4.2".to_string());

    // 1. Machine OS
    let arch = match std::env::consts::ARCH {
        "arm64" => "aarch64",
        value => value,
    };
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        value => value,
    };
    identity.machine_os = Some(format!("{}_{}", arch, os));

    // 2. Machine Hostname
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "localhost".to_string());
    identity.machine_hostname = Some(hostname);

    // 3. Machine ID
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let appdata_path = PathBuf::from(&appdata);
            let dir_name = if kind == QoderPlatformKind::Cn { "com.qodercn.app.stable" } else { "com.qoder.app.stable" };
            let mid_path = appdata_path.join(dir_name).join("auth.machine-id");
            if mid_path.exists() {
                if let Ok(content) = fs::read_to_string(&mid_path) {
                    let trimmed = content.trim();
                    if !trimmed.is_empty() {
                        identity.machine_id = Some(trimmed.to_string());
                    }
                }
            }
            if identity.machine_id.is_none() {
                let data_json = appdata_path.join(dir_name).join("qoder-data.v1.json");
                if data_json.exists() {
                    if let Ok(content) = fs::read_to_string(&data_json) {
                        if let Ok(val) = serde_json::from_str::<Value>(&content) {
                            if let Some(dev_id) = val.get("deviceId").and_then(|v| v.as_str()) {
                                identity.machine_id = Some(dev_id.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    if identity.machine_id.is_none() {
        if let Some(uid) = user_id.filter(|s| !s.is_empty()) {
            identity.machine_id = Some(uid.to_string());
        }
    }

    // 4. runtime-info.exe for MachineToken, MachineType, MachineCode
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            let base = PathBuf::from(local_appdata);
            let candidates = [
                base.join("Programs/Qoder/resources/umid/runtime-info.exe"),
                base.join("Programs/QoderCN/resources/umid/runtime-info.exe"),
                base.join("Programs/Qoder CN/resources/umid/runtime-info.exe"),
                base.join("Programs/Qoder/resources/app.asar.unpacked/resources/umid/runtime-info.exe"),
            ];
            for exe in candidates {
                if exe.exists() {
                    let env_num = if kind == QoderPlatformKind::Global { "3" } else { "0" };
                    let mut cmd = std::process::Command::new(&exe);
                    cmd.args([env_num, "--account-stdin"]);
                    cmd.stdin(std::process::Stdio::piped());
                    cmd.stdout(std::process::Stdio::piped());
                    cmd.stderr(std::process::Stdio::null());
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    if let Ok(mut child) = cmd.spawn() {
                        if let Some(mut stdin) = child.stdin.take() {
                            use std::io::Write;
                            let payload = serde_json::json!({ "account": user_id.unwrap_or("") });
                            let _ = writeln!(stdin, "{}", payload);
                        }
                        if let Ok(output) = child.wait_with_output() {
                            if output.status.success() {
                                if let Ok(val) = serde_json::from_slice::<Value>(&output.stdout) {
                                    if let Some(tok) = val.get("machineToken").and_then(|v| v.as_str()) {
                                        identity.machine_token = Some(tok.to_string());
                                    }
                                    if let Some(mtype) = val.get("machineType").and_then(|v| v.as_str()) {
                                        identity.machine_type = Some(mtype.to_string());
                                    }
                                    if let Some(mcode) = val.get("machineCode").and_then(|v| v.as_str()) {
                                        identity.machine_code = Some(mcode.to_string());
                                    }
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    if let Ok(mut guard) = QODER_DESKTOP_MACHINE_CACHE.lock() {
        *guard = Some(identity.clone());
    }

    identity
}

pub fn build_qoder_desktop_client_headers(
    kind: QoderPlatformKind,
    token: &str,
    user_id: Option<&str>,
) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
    let mut headers = HeaderMap::new();

    if let Ok(v) = HeaderValue::from_str(&format!("Bearer {}", token.trim())) {
        headers.insert(AUTHORIZATION, v);
    }
    if let Ok(v) = HeaderValue::from_str("application/json") {
        headers.insert(ACCEPT, v);
    }
    if let Ok(v) = HeaderValue::from_str("Qoder") {
        headers.insert(USER_AGENT, v);
    }
    if let Ok(v) = HeaderValue::from_str("10") {
        headers.insert("Cosy-ClientType", v);
    }

    let identity = resolve_qoder_desktop_machine_identity(kind, user_id);

    if let Some(v) = identity.client_version.as_deref().or(Some("0.4.2")) {
        if let Ok(hv) = HeaderValue::from_str(v) {
            headers.insert("Cosy-Version", hv);
        }
    }
    if let Some(v) = identity.machine_os.as_deref() {
        if let Ok(hv) = HeaderValue::from_str(v) {
            headers.insert("Cosy-MachineOS", hv);
        }
    }
    if let Some(v) = identity.machine_hostname.as_deref() {
        if let Ok(hv) = HeaderValue::from_str(v) {
            headers.insert("Cosy-MachineHostname", hv);
        }
    }
    if let Some(v) = identity.machine_id.as_deref() {
        if let Ok(hv) = HeaderValue::from_str(v) {
            headers.insert("Cosy-MachineId", hv);
        }
    }
    if let Some(v) = identity.machine_token.as_deref() {
        if let Ok(hv) = HeaderValue::from_str(v) {
            headers.insert("Cosy-MachineToken", hv);
        }
    }
    if let Some(v) = identity.machine_code.as_deref() {
        if let Ok(hv) = HeaderValue::from_str(v) {
            headers.insert("Cosy-MachineCode", hv);
        }
    }
    if let Some(v) = identity.machine_type.as_deref() {
        if let Ok(hv) = HeaderValue::from_str(v) {
            headers.insert("Cosy-MachineType", hv);
        }
    }

    headers
}

pub async fn claim_qoder_campaign_checkin(
    kind: QoderPlatformKind,
    account_id: &str,
) -> Result<Value, String> {
    if kind == QoderPlatformKind::QwenWork {
        return claim_qwenwork_daily_checkin(account_id).await;
    }

    let account = qoder_account::load_account_for_platform(kind, account_id)
        .ok_or_else(|| format!("未找到 {} 账号: {}", kind.display_name(), account_id))?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let token = get_fresh_token_for_platform(kind, &account)
        .ok_or_else(|| format!("{} 账号未检测到有效登录凭证，请先启动客户端登录", kind.display_name()))?;

    let base_url = match kind {
        QoderPlatformKind::Cn => "https://openapi.qoder.com.cn",
        QoderPlatformKind::Global => "https://openapi.qoder.sh",
        QoderPlatformKind::QwenWork => "https://gateway.qwenwork.cn",
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP客户端初始化失败: {}", e))?;

    let headers = build_qoder_desktop_client_headers(kind, &token, account.user_id.as_deref());

    let campaigns_url = format!("{}/sash/api/v1/me/campaigns", base_url);
    let resp = client
        .get(&campaigns_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("查询活动中心网络异常: {}", e))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(format!("{} 登录凭证已失效（401 Unauthorized），请在客户端重新登录", kind.display_name()));
    }
    if !resp.status().is_success() {
        return Err(format!("查询活动中心失败: HTTP {}", resp.status()));
    }

    let body: Value = resp.json().await.map_err(|e| format!("解析活动数据失败: {}", e))?;

    let mut target_campaign_id: Option<String> = None;
    let mut already_claimed_today = false;

    if let Some(campaigns) = body.get("campaigns").or_else(|| body.get("data")).and_then(|v| v.as_array()) {
        for c in campaigns {
            let action_type = c.get("actionType").and_then(|v| v.as_str()).unwrap_or("");
            // Exclude view-only ads/banners such as VIEW_DETAILS!
            if action_type.eq_ignore_ascii_case("VIEW_DETAILS") {
                continue;
            }

            // Check if this is a benefit campaign
            let is_benefit = action_type.eq_ignore_ascii_case("CLAIM_BENEFIT")
                || c.get("benefit").is_some()
                || c.get("campaignKey").and_then(|v| v.as_str()).unwrap_or("").contains("act-");

            if !is_benefit {
                continue;
            }

            let status = c.get("claimStatus").or_else(|| c.get("status")).and_then(|v| v.as_str()).unwrap_or("");

            if status.eq_ignore_ascii_case("CLAIMABLE") {
                target_campaign_id = c.get("campaignId").or_else(|| c.get("id")).and_then(|v| v.as_str()).map(|s| s.to_string());
                break;
            } else if status.eq_ignore_ascii_case("CLAIMED") {
                already_claimed_today = true;
            }
        }
    }

    if already_claimed_today && target_campaign_id.is_none() {
        let _ = qoder_account::record_platform_checkin_reward(kind, account_id, &today, 0.0);
        let _ = qoder_account::sync_qoder_usage_from_remote(kind, account_id, &token).await;
        let refreshed = qoder_account::load_account_for_platform(kind, account_id).unwrap_or(account);
        return Ok(json!({
            "success": true,
            "alreadyCheckedIn": true,
            "rewardCredits": 0,
            "message": format!("{} 今日已领取过「每日 100 Credits」奖励（每日 10:00 刷新），明日再来吧", kind.display_name()),
            "account": refreshed,
        }));
    }

    let Some(cid) = target_campaign_id else {
        let _ = qoder_account::sync_qoder_usage_from_remote(kind, account_id, &token).await;
        let refreshed = qoder_account::load_account_for_platform(kind, account_id).unwrap_or(account);

        let msg = format!("{} 当前轮次暂无待领取的活动奖励（每日 10:00 刷新）", kind.display_name());
        return Ok(json!({
            "success": false,
            "alreadyCheckedIn": false,
            "rewardCredits": 0,
            "message": msg,
            "account": refreshed,
        }));
    };

    let claim_url = format!("{}/sash/api/v1/me/campaigns/{}/claim", base_url, cid);
    let claim_resp = client
        .post(&claim_url)
        .headers(headers)
        .header("Content-Type", "application/json")
        .json(&json!({}))
        .send()
        .await
        .map_err(|e| format!("申领奖励请求失败: {}", e))?;

    if claim_resp.status() == reqwest::StatusCode::CONFLICT {
        let _ = qoder_account::record_platform_checkin_reward(kind, account_id, &today, 0.0);
        let _ = qoder_account::sync_qoder_usage_from_remote(kind, account_id, &token).await;
        let refreshed = qoder_account::load_account_for_platform(kind, account_id).unwrap_or(account);
        return Ok(json!({
            "success": true,
            "alreadyCheckedIn": true,
            "rewardCredits": 0,
            "message": format!("{} 当前轮次「每日 100 Credits」已处于已领取状态（每日 10:00 刷新）", kind.display_name()),
            "account": refreshed,
        }));
    }

    if !claim_resp.status().is_success() {
        let err_body = claim_resp.text().await.unwrap_or_default();
        return Err(format!("申领奖励失败: {}", err_body));
    }

    let claim_body: Value = claim_resp.json().await.map_err(|e| format!("解析申领响应失败: {}", e))?;
    let is_replayed = claim_body.get("replayed").and_then(|v| v.as_bool()).unwrap_or(false);

    if is_replayed {
        let _ = qoder_account::record_platform_checkin_reward(kind, account_id, &today, 0.0);
        let _ = qoder_account::sync_qoder_usage_from_remote(kind, account_id, &token).await;
        let refreshed = qoder_account::load_account_for_platform(kind, account_id).unwrap_or(account);
        return Ok(json!({
            "success": true,
            "alreadyCheckedIn": true,
            "rewardCredits": 0,
            "message": format!("{} 今日已领取过「每日 100 Credits」奖励（每日 10:00 刷新），明日再来吧", kind.display_name()),
            "account": refreshed,
        }));
    }

    let reward = claim_body
        .get("benefit")
        .and_then(|b| b.get("amount"))
        .and_then(|v| v.as_f64())
        .or_else(|| claim_body.get("rewardCredits").and_then(|v| v.as_f64()))
        .unwrap_or(100.0);

    let recorded = qoder_account::record_platform_checkin_reward(kind, account_id, &today, reward)
        .unwrap_or(account);
    let _ = qoder_account::sync_qoder_usage_from_remote(kind, account_id, &token).await;
    let updated = qoder_account::load_account_for_platform(kind, account_id).unwrap_or(recorded);

    Ok(json!({
        "success": true,
        "alreadyCheckedIn": false,
        "rewardCredits": reward,
        "message": format!("{} 每日签到成功！已领取 +{} Credits（有效期 30 天）", kind.display_name(), reward as i64),
        "account": updated,
    }))
}

pub async fn get_qoder_campaign_checkin_status(
    kind: QoderPlatformKind,
    account_id: &str,
) -> Result<Value, String> {
    let account = qoder_account::load_account_for_platform(kind, account_id)
        .ok_or_else(|| format!("未找到 {} 账号: {}", kind.display_name(), account_id))?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let credit_obj = account.auth_credit_usage_raw.as_ref().and_then(|v| v.as_object());
    let last_checkin_date = credit_obj.and_then(|v| v.get("last_checkin_date")).and_then(|v| v.as_str());
    let mut checkin_dates: Vec<String> = credit_obj
        .and_then(|v| v.get("checkin_dates"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|s| s.as_str().map(|str| str.to_string())).collect())
        .unwrap_or_default();
    if let Some(lcd) = last_checkin_date {
        if !checkin_dates.contains(&lcd.to_string()) {
            checkin_dates.insert(0, lcd.to_string());
        }
    }
    checkin_dates.sort_by(|a, b| b.cmp(a));
    checkin_dates.dedup();

    let streak_days = qoder_account::calculate_streak_days(&checkin_dates, &today);
    let mut today_checked_in = last_checkin_date == Some(&today);

    // If account has valid token, probe remote campaigns API to see if it's currently claimable/claimed
    if let Some(token) = get_fresh_token_for_platform(kind, &account) {
        if kind == QoderPlatformKind::QwenWork {
            if !today_checked_in {
                if let Ok(synced) = sync_qwenwork_usage_from_remote(account_id, &token).await {
                    if let Some(lcd) = synced.auth_credit_usage_raw.as_ref().and_then(|v| v.get("last_checkin_date")).and_then(|v| v.as_str()) {
                        if lcd == today {
                            today_checked_in = true;
                        }
                    }
                }
            }
        } else {
            let base_url = match kind {
                QoderPlatformKind::Cn => "https://openapi.qoder.com.cn",
                QoderPlatformKind::Global => "https://openapi.qoder.sh",
                _ => "",
            };
            if !base_url.is_empty() {
                if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build() {
                    let headers = build_qoder_desktop_client_headers(kind, &token, account.user_id.as_deref());
                    let campaigns_url = format!("{}/sash/api/v1/me/campaigns", base_url);
                    if let Ok(resp) = client.get(&campaigns_url).headers(headers).send().await {
                        if resp.status().is_success() {
                            if let Ok(body) = resp.json::<Value>().await {
                                if let Some(campaigns) = body.get("campaigns").or_else(|| body.get("data")).and_then(|v| v.as_array()) {
                                    let mut has_claimable = false;
                                    let mut has_claimed = false;
                                    for c in campaigns {
                                        let action_type = c.get("actionType").and_then(|v| v.as_str()).unwrap_or("");
                                        if action_type.eq_ignore_ascii_case("VIEW_DETAILS") {
                                            continue;
                                        }
                                        let is_benefit = action_type.eq_ignore_ascii_case("CLAIM_BENEFIT")
                                            || c.get("benefit").is_some()
                                            || c.get("campaignKey").and_then(|v| v.as_str()).unwrap_or("").contains("act-");
                                        if is_benefit {
                                            let status = c.get("claimStatus").or_else(|| c.get("status")).and_then(|v| v.as_str()).unwrap_or("");
                                            if status.eq_ignore_ascii_case("CLAIMABLE") {
                                                has_claimable = true;
                                                break;
                                            } else if status.eq_ignore_ascii_case("CLAIMED") {
                                                has_claimed = true;
                                            }
                                        }
                                    }
                                    if has_claimable {
                                        today_checked_in = false;
                                    } else if has_claimed {
                                        today_checked_in = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(json!({
        "active": true,
        "today_checked_in": today_checked_in,
        "streak_days": streak_days,
        "daily_credit": 100,
        "today_credit": 100,
        "checkin_dates": checkin_dates,
        "message": if today_checked_in {
            format!("{} 今日已完成签到核验", kind.display_name())
        } else {
            format!("{} 今日待签到领取 +100 Credits", kind.display_name())
        },
    }))
}

pub async fn sync_qwenwork_usage_from_remote(
    account_id: &str,
    token: &str,
) -> Result<QoderAccount, String> {
    if token.trim().is_empty() {
        return Err("千问办公 Token 不能为空".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {}", e))?;

    // 1. Fetch account-context
    let context_url = "https://gateway.qwenwork.cn/api/v1/adapter/user/account-context?include=user,plan,quota,page,data_sharing";
    let resp1 = client
        .get(context_url)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .header("User-Agent", "qoderwork/1.2.1")
        .header("X-QwenWork-Version", "1.2.1")
        .header("X-QwenWork-Release-Version", "1.2.1-26092107")
        .header("X-QwenWork-Build", "26092107")
        .header("X-QwenWork-Platform", "win32")
        .header("X-QwenWork-Arch", "x64")
        .header("X-QwenWork-Channel", "stable")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("获取千问办公账号信息失败: {}", e))?;

    if !resp1.status().is_success() {
        return Err(format!("获取千问办公账号信息失败: HTTP {}", resp1.status()));
    }

    let ctx_body: Value = resp1.json().await.map_err(|e| format!("解析账号上下文 JSON 失败: {}", e))?;
    let ctx_data = ctx_body.get("data").unwrap_or(&ctx_body);

    // 2. Fetch wallets
    let wallets_url = "https://gateway.qwenwork.cn/api/v1/adapter/user/wallets";
    let wallets_data = match client
        .get(wallets_url)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .header("User-Agent", "qoderwork/1.2.1")
        .header("X-QwenWork-Version", "1.2.1")
        .header("X-QwenWork-Release-Version", "1.2.1-26092107")
        .header("X-QwenWork-Build", "26092107")
        .header("X-QwenWork-Platform", "win32")
        .header("X-QwenWork-Arch", "x64")
        .header("X-QwenWork-Channel", "stable")
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(w_resp) if w_resp.status().is_success() => {
            let val: Value = w_resp.json().await.unwrap_or(json!({}));
            val.get("data").cloned().unwrap_or(val)
        }
        _ => json!({}),
    };

    let mut account = qoder_account::load_account_for_platform(QoderPlatformKind::QwenWork, account_id)
        .ok_or_else(|| format!("千问办公账号不存在: {}", account_id))?;

    // Extract user info
    if let Some(user_obj) = ctx_data.get("user") {
        if let Some(name) = user_obj.get("name").and_then(|v| v.as_str()) {
            if !name.trim().is_empty() {
                account.display_name = Some(name.trim().to_string());
            }
        }
        if let Some(uid) = user_obj.get("id").and_then(|v| v.as_str()) {
            if !uid.trim().is_empty() {
                account.user_id = Some(uid.trim().to_string());
            }
        }
        if let Some(email) = user_obj.get("email").and_then(|v| v.as_str()) {
            if !email.trim().is_empty() {
                account.email = email.trim().to_string();
            }
        }
    }

    // Extract plan info
    let plan_name = ctx_data
        .get("plan")
        .and_then(|p| p.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "个人免费版".to_string());
    account.plan_type = Some(plan_name.clone());

    let is_personal = ctx_data
        .get("plan")
        .and_then(|p| p.get("is_personal_version"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let user_type = ctx_data
        .get("plan")
        .and_then(|p| p.get("user_type"))
        .and_then(|v| v.as_str())
        .unwrap_or("personal");

    // Extract wallets
    let daily_balance = wallets_data
        .get("daily_credits")
        .and_then(|d| d.get("total_balance"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let longterm_balance = wallets_data
        .get("longterm_credits")
        .and_then(|l| l.get("total_balance"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let monthly_balance = wallets_data
        .get("monthly_credits")
        .and_then(|m| m.get("total_balance"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    // Parse nearest expiration date distinguishing daily reset from longterm package
    let mut daily_reset_at_ms: Option<i64> = None;
    let mut longterm_expires_at_ms: Option<i64> = None;
    let mut monthly_expires_at_ms: Option<i64> = None;

    if let Some(active_wallets) = wallets_data
        .get("active_wallets")
        .and_then(|w| w.get("wallets"))
        .and_then(|v| v.as_array())
    {
        let now_ms = chrono::Utc::now().timestamp_millis();
        for w in active_wallets {
            if let Some(valid_to_str) = w.get("valid_to").and_then(|v| v.as_str()) {
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(valid_to_str) {
                    let ts_ms = dt.timestamp_millis();
                    if ts_ms > now_ms {
                        let w_type = w.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        let is_daily = w_type.eq_ignore_ascii_case("DAILY") || (ts_ms - now_ms) <= 86400 * 1000 * 2;
                        let is_monthly = w_type.eq_ignore_ascii_case("MONTHLY");

                        if is_daily {
                            daily_reset_at_ms = match daily_reset_at_ms {
                                Some(cur) => Some(cur.min(ts_ms)),
                                None => Some(ts_ms),
                            };
                        } else if is_monthly {
                            monthly_expires_at_ms = match monthly_expires_at_ms {
                                Some(cur) => Some(cur.min(ts_ms)),
                                None => Some(ts_ms),
                            };
                        } else {
                            longterm_expires_at_ms = match longterm_expires_at_ms {
                                Some(cur) => Some(cur.min(ts_ms)),
                                None => Some(ts_ms),
                            };
                        }
                    }
                }
            }
        }
    }

    let primary_expires_at_ms = if longterm_balance > 0.0 && longterm_expires_at_ms.is_some() {
        longterm_expires_at_ms
    } else if monthly_balance > 0.0 && monthly_expires_at_ms.is_some() {
        monthly_expires_at_ms
    } else if longterm_expires_at_ms.is_some() {
        longterm_expires_at_ms
    } else {
        daily_reset_at_ms
    };

    // Extract quota
    let quota_obj = ctx_data.get("quota");
    let quota_remaining = quota_obj.and_then(|q| q.get("remaining")).and_then(|v| v.as_f64());
    let quota_total = quota_obj.and_then(|q| q.get("total")).and_then(|v| v.as_f64());
    let quota_used = quota_obj.and_then(|q| q.get("used")).and_then(|v| v.as_f64());
    let quota_exceeded = quota_obj.and_then(|q| q.get("exceeded")).and_then(|v| v.as_bool()).unwrap_or(false);

    let wallets_sum = daily_balance + longterm_balance + monthly_balance;
    let remaining = quota_remaining.unwrap_or(wallets_sum);
    let used = quota_used.unwrap_or(0.0);
    let total = quota_total.unwrap_or(remaining + used);
    let usage_percent = if total > 0.0 { (used / total) * 100.0 } else { 0.0 };

    let existing_credit_usage = account.auth_credit_usage_raw.as_ref();
    let prev_last_checkin_date = existing_credit_usage
        .and_then(|v| v.get("last_checkin_date"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let prev_checkin_reward = existing_credit_usage
        .and_then(|v| v.get("checkin_reward"))
        .and_then(|v| v.as_f64());
    let prev_total_checkins = existing_credit_usage
        .and_then(|v| v.get("total_checkins"))
        .and_then(|v| v.as_i64());

    let mut credit_usage_map = serde_json::Map::new();
    credit_usage_map.insert("userQuota".to_string(), json!({
        "total": if daily_balance > 0.0 { daily_balance } else { total },
        "used": 0.0,
        "remaining": if daily_balance > 0.0 { daily_balance } else { remaining },
        "percentage": 0.0,
        "unit": "Credits"
    }));
    credit_usage_map.insert("addOnQuota".to_string(), json!({
        "total": longterm_balance,
        "used": 0.0,
        "remaining": longterm_balance,
        "percentage": 0.0,
        "unit": "Credits"
    }));
    credit_usage_map.insert("dailyBalance".to_string(), json!(daily_balance));
    credit_usage_map.insert("longtermBalance".to_string(), json!(longterm_balance));
    credit_usage_map.insert("monthlyBalance".to_string(), json!(monthly_balance));
    credit_usage_map.insert("totalCredits".to_string(), json!(total));
    credit_usage_map.insert("totalUsagePercentage".to_string(), json!(usage_percent));
    credit_usage_map.insert("isQuotaExceeded".to_string(), json!(quota_exceeded));
    credit_usage_map.insert("expiresAt".to_string(), json!(primary_expires_at_ms));
    credit_usage_map.insert("dailyResetAt".to_string(), json!(daily_reset_at_ms));
    credit_usage_map.insert("longtermExpiresAt".to_string(), json!(longterm_expires_at_ms));
    credit_usage_map.insert("monthlyExpiresAt".to_string(), json!(monthly_expires_at_ms));
    credit_usage_map.insert("userType".to_string(), json!(user_type));
    credit_usage_map.insert("isPersonalVersion".to_string(), json!(is_personal));
    credit_usage_map.insert("wallets".to_string(), wallets_data);
    credit_usage_map.insert("planName".to_string(), json!(plan_name));

    if let Some(date) = prev_last_checkin_date {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        credit_usage_map.insert("checked_in_today".to_string(), json!(date == today));
        credit_usage_map.insert("last_checkin_date".to_string(), json!(date));
    }
    if let Some(rew) = prev_checkin_reward {
        credit_usage_map.insert("checkin_reward".to_string(), json!(rew));
    }
    if let Some(cnt) = prev_total_checkins {
        credit_usage_map.insert("total_checkins".to_string(), json!(cnt));
    }

    let credit_usage_raw = Value::Object(credit_usage_map);

    let user_plan_raw = json!({
        "name": plan_name,
        "plan": plan_name,
        "tier": plan_name,
        "pid": ctx_data.get("plan").and_then(|p| p.get("pid")).and_then(|v| v.as_str()).unwrap_or("subscription-cn-free"),
        "userType": user_type,
        "isPersonalVersion": is_personal,
        "expiresAt": primary_expires_at_ms,
        "dailyResetAt": daily_reset_at_ms,
        "longtermExpiresAt": longterm_expires_at_ms,
    });

    let now = chrono::Utc::now().timestamp();
    account.credits_total = Some(total);
    account.credits_remaining = Some(remaining);
    account.credits_used = Some(used);
    account.credits_usage_percent = Some(usage_percent);
    account.auth_credit_usage_raw = Some(credit_usage_raw);
    account.auth_user_plan_raw = Some(user_plan_raw);
    account.usage_updated_at = Some(now);
    account.quota_query_last_error = None;
    account.quota_query_last_error_at = None;
    account.last_used = now;

    let saved = qoder_account::upsert_account_record_for_platform(QoderPlatformKind::QwenWork, account)?;
    logger::log_info(&format!(
        "[QwenWork Account] 同步配额成功: id={}, name={:?}, total={}, remaining={}, daily={}, longterm={}",
        saved.id, saved.display_name, total, remaining, daily_balance, longterm_balance
    ));

    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qwenwork_token_extract() {
        let auth = json!({
            "token": "test_token",
            "user": {
                "id": "u123",
                "name": "Test User",
                "email": "dingtalk_test@dingtalk.local"
            }
        });
        assert_eq!(auth.get("token").and_then(|v| v.as_str()), Some("test_token"));
        assert_eq!(
            auth.get("user").and_then(|u| u.get("name")).and_then(|v| v.as_str()),
            Some("Test User")
        );
    }

    #[tokio::test]
    #[ignore = "requires live remote sync and network"]
    async fn test_sync_qwenwork_usage_from_remote_live() {
        let data_dir = get_default_qwenwork_user_data_dir();
        if let Ok(Some(v2)) = read_auth_v2_json(&data_dir) {
            if let Some(token) = v2.get("token").and_then(|v| v.as_str()) {
                let _ = import_from_local_qwenwork();
                let accounts = qoder_account::list_accounts_for_platform(QoderPlatformKind::QwenWork);
                if let Some(acc) = accounts.first() {
                    let res = sync_qwenwork_usage_from_remote(&acc.id, token).await;
                    assert!(res.is_ok(), "Sync failed: {:?}", res.err());
                    let synced = res.unwrap();
                    assert_eq!(synced.display_name.as_deref(), Some("Test User"));
                    assert_eq!(synced.plan_type.as_deref(), Some("个人免费版"));
                    assert_eq!(synced.credits_total, Some(2100.0));
                    assert_eq!(synced.credits_remaining, Some(2100.0));
                }
            }
        }
    }

    #[tokio::test]
    #[ignore = "exploratory live endpoint test"]
    async fn test_explore_qwenwork_checkin_live() {
        let data_dir = get_default_qwenwork_user_data_dir();
        if let Ok(Some(v2)) = read_auth_v2_json(&data_dir) {
            if let Some(token) = v2.get("token").and_then(|v| v.as_str()) {
                let client = reqwest::Client::new();
                let endpoints = [
                    ("GET", "https://gateway.qwenwork.cn/api/v1/adapter/user/account-context?include=user,plan,quota,page,data_sharing"),
                    ("GET", "https://gateway.qwenwork.cn/api/v1/adapter/user/account-settings"),
                    ("GET", "https://gateway.qwenwork.cn/api/v1/adapter/user/v2/home-recommendations"),
                    ("GET", "https://gateway.qwenwork.cn/api/v1/adapter/user/wallets"),
                ];

                for (method, url) in endpoints {
                    let mut req = if method == "POST" {
                        client.post(url).json(&serde_json::json!({}))
                    } else {
                        client.get(url)
                    };
                    req = req
                        .header("Authorization", format!("Bearer {}", token))
                        .header("User-Agent", "QoderWork")
                        .header("X-QwenWork-Version", "1.2.1")
                        .header("X-QwenWork-Platform", "win32")
                        .header("X-QwenWork-Arch", "x64")
                        .header("X-QwenWork-Channel", "stable")
                        .header("Accept", "application/json");

                    match req.send().await {
                        Ok(resp) => {
                            let status = resp.status();
                            let text = resp.text().await.unwrap_or_default();
                            println!("\n>>> [{}] {} => HTTP {}\nBody: {}", method, url, status, text);
                        }
                        Err(e) => {
                            println!("\n>>> [{}] {} => ERROR: {}", method, url, e);
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn test_qoder_desktop_client_headers() {
        let headers = build_qoder_desktop_client_headers(
            QoderPlatformKind::Global,
            "mock_token",
            Some("f6584c71-b157-4172-8f62-2f92bfc3ba31"),
        );
        assert_eq!(headers["Authorization"], "Bearer mock_token");
        assert_eq!(headers["Accept"], "application/json");
        assert_eq!(headers["User-Agent"], "Qoder");
        assert_eq!(headers["Cosy-ClientType"], "10");
        assert_eq!(headers["Cosy-Version"], "0.4.2");
        assert!(headers.contains_key("Cosy-MachineOS"));
        assert!(headers.contains_key("Cosy-MachineHostname"));
        #[cfg(target_os = "windows")]
        {
            assert!(headers.contains_key("Cosy-MachineId"));
            assert!(headers.contains_key("Cosy-MachineToken"));
        }
    }

    #[tokio::test]
    #[ignore = "requires live Qoder credentials and external network"]
    async fn test_claim_qoder_campaign_checkin_live() {
        let accounts = qoder_account::list_accounts_for_platform(QoderPlatformKind::Global);
        if let Some(account) = accounts.first() {
            println!("Testing live checkin claim for Qoder account: {}", account.id);
            let res = claim_qoder_campaign_checkin(QoderPlatformKind::Global, &account.id).await;
            println!("Claim result: {:?}", res);
            assert!(res.is_ok(), "Claim call failed: {:?}", res.err());
            let val = res.unwrap();
            let success = val.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            let msg = val.get("message").and_then(|v| v.as_str()).unwrap_or("");
            println!("Success: {}, Message: {}", success, msg);
            assert!(success, "Expected checkin success or already checked in, got message: {}", msg);
        }
    }

    #[tokio::test]
    #[ignore = "requires live QwenWork credentials and external network"]
    async fn test_claim_qwenwork_daily_checkin_live() {
        let _ = import_from_local_qwenwork();
        let accounts = qoder_account::list_accounts_for_platform(QoderPlatformKind::QwenWork);
        if let Some(account) = accounts.first() {
            println!("Testing live checkin claim for QwenWork account: {}", account.id);
            let res = claim_qwenwork_daily_checkin(&account.id).await;
            println!("QwenWork claim result: {:?}", res);
            assert!(res.is_ok(), "Claim call failed: {:?}", res.err());
            let val = res.unwrap();
            let success = val.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            let msg = val.get("message").and_then(|v| v.as_str()).unwrap_or("");
            println!("Success: {}, Message: {}", success, msg);
            assert!(success, "Expected checkin success, got message: {}", msg);
            assert!(msg.contains("千问办公"));

            // Second checkin call should return alreadyCheckedIn: true
            let res2 = claim_qwenwork_daily_checkin(&account.id).await;
            println!("QwenWork second claim result: {:?}", res2);
            assert!(res2.is_ok());
            let val2 = res2.unwrap();
            let already = val2.get("alreadyCheckedIn").and_then(|v| v.as_bool()).unwrap_or(false);
            assert!(already, "Second call should report alreadyCheckedIn: true");
            let msg2 = val2.get("message").and_then(|v| v.as_str()).unwrap_or("");
            assert!(msg2.contains("今日已完成签到核验"));
        }
    }
}
