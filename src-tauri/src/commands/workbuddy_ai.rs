use tauri::{AppHandle, Emitter};

use crate::models::workbuddy::{WorkbuddyAccount, WorkbuddyOAuthStartResponse};
use crate::modules::{logger, workbuddy_ai_account, workbuddy_ai_oauth};

#[tauri::command]
pub fn list_workbuddy_ai_accounts() -> Result<Vec<WorkbuddyAccount>, String> {
    Ok(workbuddy_ai_account::list_accounts())
}

#[tauri::command]
pub fn delete_workbuddy_ai_account(account_id: String) -> Result<(), String> {
    workbuddy_ai_account::remove_account(&account_id)
}

#[tauri::command]
pub fn delete_workbuddy_ai_accounts(account_ids: Vec<String>) -> Result<(), String> {
    for id in account_ids {
        workbuddy_ai_account::remove_account(&id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn import_workbuddy_ai_from_json(json_content: String) -> Result<Vec<WorkbuddyAccount>, String> {
    let accounts: Vec<WorkbuddyAccount> = serde_json::from_str(&json_content)
        .map_err(|e| format!("解析导入的 WorkBuddyAI 账号 JSON 失败: {}", e))?;
    
    let mut imported = Vec::new();
    for acc in accounts {
        let payload = crate::models::workbuddy::WorkbuddyOAuthCompletePayload {
            email: acc.email,
            uid: acc.uid,
            nickname: acc.nickname,
            enterprise_id: acc.enterprise_id,
            enterprise_name: acc.enterprise_name,
            access_token: acc.access_token,
            refresh_token: acc.refresh_token,
            token_type: acc.token_type,
            expires_at: acc.expires_at,
            domain: acc.domain,
            plan_type: acc.plan_type,
            dosage_notify_code: acc.dosage_notify_code,
            dosage_notify_zh: acc.dosage_notify_zh,
            dosage_notify_en: acc.dosage_notify_en,
            payment_type: acc.payment_type,
            quota_raw: acc.quota_raw,
            auth_raw: acc.auth_raw,
            profile_raw: acc.profile_raw,
            usage_raw: acc.usage_raw,
            status: acc.status,
            status_reason: acc.status_reason,
        };
        if let Ok(saved) = workbuddy_ai_account::upsert_account(payload) {
            imported.push(saved);
        }
    }
    Ok(imported)
}

#[tauri::command]
pub async fn import_workbuddy_ai_from_local(app: AppHandle) -> Result<Vec<WorkbuddyAccount>, String> {
    let local_payload = match workbuddy_ai_account::import_payload_from_local()? {
        Some(payload) => payload,
        None => return Err("未在本机 WorkBuddyAI 客户端中找到登录信息 (workbuddy-desktop-ai.info)".to_string()),
    };

    let payload = match workbuddy_ai_oauth::build_payload_from_token(&local_payload.access_token).await {
        Ok(mut remote) => {
            if remote.uid.is_none() {
                remote.uid = local_payload.uid.clone();
            }
            if remote.nickname.is_none() {
                remote.nickname = local_payload.nickname.clone();
            }
            if remote.email.is_empty() {
                remote.email = local_payload.email.clone();
            }
            if remote.refresh_token.as_ref().map_or(true, |s| s.is_empty()) {
                remote.refresh_token = local_payload.refresh_token.clone();
            }
            remote
        }
        Err(e) => {
            logger::log_warn(&format!("[WorkBuddyAI] 远程拉取用户信息失败，使用本地缓存: {}", e));
            local_payload
        }
    };

    let account = workbuddy_ai_account::upsert_account(payload)?;
    let _ = app.emit("workbuddy-ai-accounts-changed", ());
    Ok(vec![account])
}

#[tauri::command]
pub fn export_workbuddy_ai_accounts() -> Result<String, String> {
    let accounts = workbuddy_ai_account::list_accounts();
    serde_json::to_string_pretty(&accounts)
        .map_err(|e| format!("导出 WorkBuddyAI 账号失败: {}", e))
}

#[tauri::command]
pub async fn refresh_workbuddy_ai_token(account_id: String) -> Result<WorkbuddyAccount, String> {
    let accounts = workbuddy_ai_account::list_accounts();
    let account = accounts
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| format!("未找到指定的 WorkBuddyAI 账号: {}", account_id))?;

    let (payload, _) = workbuddy_ai_oauth::refresh_payload_for_account(&account).await?;
    let updated = workbuddy_ai_account::upsert_account(payload)?;
    Ok(updated)
}

#[tauri::command]
pub async fn refresh_all_workbuddy_ai_tokens() -> Result<Vec<WorkbuddyAccount>, String> {
    let accounts = workbuddy_ai_account::list_accounts();
    let mut results = Vec::new();
    for acc in accounts {
        match workbuddy_ai_oauth::refresh_payload_for_account(&acc).await {
            Ok((payload, _)) => {
                if let Ok(updated) = workbuddy_ai_account::upsert_account(payload) {
                    results.push(updated);
                }
            }
            Err(_) => {
                results.push(acc);
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn workbuddy_ai_oauth_login_start() -> Result<WorkbuddyOAuthStartResponse, String> {
    workbuddy_ai_oauth::start_login().await
}

#[tauri::command]
pub async fn workbuddy_ai_oauth_login_complete(
    app: AppHandle,
    login_id: String,
) -> Result<WorkbuddyAccount, String> {
    let payload = workbuddy_ai_oauth::complete_login(&login_id).await?;
    let account = workbuddy_ai_account::upsert_account(payload)?;
    let _ = app.emit("workbuddy-ai-accounts-changed", ());
    Ok(account)
}

#[tauri::command]
pub fn workbuddy_ai_oauth_login_cancel() -> Result<(), String> {
    workbuddy_ai_oauth::cancel_login();
    Ok(())
}

#[tauri::command]
pub async fn add_workbuddy_ai_account_with_token(
    access_token: String,
) -> Result<WorkbuddyAccount, String> {
    let payload = workbuddy_ai_oauth::build_payload_from_token(&access_token).await?;
    let account = workbuddy_ai_account::upsert_account(payload)?;
    Ok(account)
}

#[tauri::command]
pub fn inject_workbuddy_ai_to_client(account_id: String) -> Result<(), String> {
    let accounts = workbuddy_ai_account::list_accounts();
    let account = accounts
        .into_iter()
        .find(|a| a.id == account_id)
        .ok_or_else(|| format!("未找到指定的 WorkBuddyAI 账号: {}", account_id))?;

    workbuddy_ai_account::close_workbuddy_ai_processes();
    workbuddy_ai_account::write_account_to_default_client(&account)?;
    let _ = crate::modules::provider_current_state::set_current_account_id(
        "workbuddy_ai",
        Some(account.id.as_str()),
    );
    if let Err(err) = workbuddy_ai_account::start_workbuddy_ai_client() {
        logger::log_warn(&format!(
            "[WorkBuddyAI Switch] 凭据已写入，但启动客户端失败: {}",
            err
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn update_workbuddy_ai_account_tags(
    account_id: String,
    tags: Vec<String>,
) -> Result<WorkbuddyAccount, String> {
    workbuddy_ai_account::update_account_tags(&account_id, tags)
}

#[tauri::command]
pub async fn checkin_workbuddy_ai(
    app: AppHandle,
    account_id: String,
) -> Result<crate::modules::codebuddy_cn_oauth::CheckinResponse, String> {
    use std::time::Instant;

    let started_at = Instant::now();
    logger::log_info(&format!(
        "[WorkBuddy AI Checkin] 执行签到开始: account_id={}",
        account_id
    ));

    let account = workbuddy_ai_account::load_account(&account_id)
        .ok_or_else(|| format!("账号不存在: {}", account_id))?;

    let response = crate::modules::codebuddy_cn_oauth::perform_checkin(
        &account.access_token,
        account.uid.as_deref(),
        account.enterprise_id.as_deref(),
        account.domain.as_deref().or(Some("www.workbuddy.ai")),
    )
    .await?;

    if response.success {
        let now = chrono::Utc::now().timestamp();
        let streak = response
            .streak_days
            .and_then(|value| i32::try_from(value).ok())
            .unwrap_or_else(|| account.checkin_streak.unwrap_or(0).saturating_add(1));
        let reward = response.reward.clone().or_else(|| {
            response
                .credit
                .map(|credit| serde_json::json!({ "credit": credit }))
        });
        workbuddy_ai_account::update_checkin_info(&account_id, Some(now), streak, reward.clone())
            .map_err(|e| {
                logger::log_warn(&format!(
                    "[WorkBuddy AI Checkin] 更新签到信息失败: account_id={}, error={}",
                    account_id, e
                ));
                format!("签到成功但更新状态失败: {}", e)
            })?;

        let _ = crate::modules::tray::update_tray_menu(&app);
        let _ = app.emit(
            "workbuddy_ai:checkin_completed",
            serde_json::json!({
                "accountId": account_id,
                "success": true,
                "reward": reward,
                "credit": response.credit,
                "streakDays": response.streak_days,
                "isStreakDay": response.is_streak_day,
                "streak": streak,
            }),
        );
    }

    logger::log_info(&format!(
        "[WorkBuddy AI Checkin] 执行签到完成: account_id={}, success={}, elapsed={}ms",
        account_id,
        response.success,
        started_at.elapsed().as_millis()
    ));

    Ok(response)
}

#[tauri::command]
pub async fn get_checkin_status_workbuddy_ai(
    account_id: String,
) -> Result<crate::modules::codebuddy_cn_oauth::CheckinStatusResponse, String> {
    let account = workbuddy_ai_account::load_account(&account_id)
        .ok_or_else(|| format!("账号不存在: {}", account_id))?;

    crate::modules::codebuddy_cn_oauth::get_checkin_status(
        &account.access_token,
        account.uid.as_deref(),
        account.enterprise_id.as_deref(),
        account.domain.as_deref().or(Some("www.workbuddy.ai")),
    )
    .await
}
