use std::time::Instant;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::models::qoder::{QoderAccount, QoderOAuthStartResponse};
use crate::modules::qoder_account::{self, QoderPlatformKind};
use crate::modules::{logger, qoder_oauth, qwenwork_account};

#[tauri::command]
pub async fn list_qwenwork_accounts(app: AppHandle) -> Result<Vec<QoderAccount>, String> {
    let mut accounts = qoder_account::list_accounts_checked_for_platform(QoderPlatformKind::QwenWork)?;
    if accounts.is_empty() {
        if let Ok(Some(account)) = qoder_account::import_from_local_qwenwork() {
            let final_account = if let Some(token) = qwenwork_account::get_fresh_token_for_platform(QoderPlatformKind::QwenWork, &account) {
                qwenwork_account::sync_qwenwork_usage_from_remote(&account.id, &token).await.unwrap_or(account)
            } else {
                account
            };
            let _ = crate::modules::tray::update_tray_menu(&app);
            return Ok(vec![final_account]);
        }
    } else {
        let mut updated_any = false;
        for account in &mut accounts {
            if account.display_name.is_none() || account.credits_total.is_none() || account.credits_total == Some(1000.0) {
                if let Some(token) = qwenwork_account::get_fresh_token_for_platform(QoderPlatformKind::QwenWork, account) {
                    if let Ok(synced) = qwenwork_account::sync_qwenwork_usage_from_remote(&account.id, &token).await {
                        *account = synced;
                        updated_any = true;
                    }
                }
            }
        }
        if updated_any {
            let _ = crate::modules::tray::update_tray_menu(&app);
        }
    }
    Ok(accounts)
}

#[tauri::command]
pub fn delete_qwenwork_account(account_id: String) -> Result<(), String> {
    qoder_account::remove_account_for_platform(QoderPlatformKind::QwenWork, &account_id)
}

#[tauri::command]
pub fn delete_qwenwork_accounts(account_ids: Vec<String>) -> Result<(), String> {
    qoder_account::remove_accounts_for_platform(QoderPlatformKind::QwenWork, &account_ids)
}

#[tauri::command]
pub fn import_qwenwork_from_json(json_content: String) -> Result<Vec<QoderAccount>, String> {
    qoder_account::import_from_json_for_platform(QoderPlatformKind::QwenWork, &json_content)
}

#[tauri::command]
pub async fn import_qwenwork_from_local(app: AppHandle) -> Result<Vec<QoderAccount>, String> {
    match qoder_account::import_from_local_qwenwork()? {
        Some(account) => {
            let final_account = if let Some(token) = qwenwork_account::get_fresh_token_for_platform(QoderPlatformKind::QwenWork, &account) {
                qwenwork_account::sync_qwenwork_usage_from_remote(&account.id, &token).await.unwrap_or(account)
            } else {
                account
            };
            let _ = crate::modules::tray::update_tray_menu(&app);
            Ok(vec![final_account])
        }
        None => Err("未找到本地千问办公登录信息，请先在千问办公客户端登录账号".to_string()),
    }
}

#[tauri::command]
pub async fn qwenwork_oauth_login_start() -> Result<QoderOAuthStartResponse, String> {
    qoder_oauth::start_login_for_platform(QoderPlatformKind::QwenWork).await
}

#[tauri::command]
pub fn qwenwork_oauth_login_peek() -> Option<QoderOAuthStartResponse> {
    qoder_oauth::peek_pending_login_for_platform(QoderPlatformKind::QwenWork)
}

#[tauri::command]
pub async fn qwenwork_oauth_login_complete(
    app: AppHandle,
    login_id: String,
) -> Result<QoderAccount, String> {
    let account = qoder_oauth::complete_login_for_platform(QoderPlatformKind::QwenWork, &login_id).await?;
    let _ = crate::modules::tray::update_tray_menu(&app);
    Ok(account)
}

#[tauri::command]
pub fn qwenwork_oauth_login_cancel(login_id: Option<String>) -> Result<(), String> {
    qoder_oauth::cancel_login_for_platform(QoderPlatformKind::QwenWork, login_id.as_deref())
}

#[tauri::command]
pub fn export_qwenwork_accounts(account_ids: Vec<String>) -> Result<String, String> {
    qoder_account::export_accounts_qwenwork(&account_ids)
}

#[tauri::command]
pub async fn refresh_qwenwork_token(
    app: AppHandle,
    account_id: String,
) -> Result<QoderAccount, String> {
    let _ = qoder_account::import_from_local_qwenwork();
    let acc = qoder_account::load_account_for_platform(QoderPlatformKind::QwenWork, &account_id)
        .ok_or_else(|| format!("千问办公账号不存在: {}", account_id))?;

    let final_acc = if let Some(token) = qwenwork_account::get_fresh_token_for_platform(QoderPlatformKind::QwenWork, &acc) {
        qwenwork_account::sync_qwenwork_usage_from_remote(&acc.id, &token).await.unwrap_or(acc)
    } else {
        acc
    };

    let _ = crate::modules::tray::update_tray_menu(&app);
    Ok(final_acc)
}

#[tauri::command]
pub async fn refresh_all_qwenwork_tokens(app: AppHandle) -> Result<i32, String> {
    let _ = qoder_account::import_from_local_qwenwork();
    let accounts = qoder_account::list_accounts_for_platform(QoderPlatformKind::QwenWork);
    for acc in &accounts {
        if let Some(token) = qwenwork_account::get_fresh_token_for_platform(QoderPlatformKind::QwenWork, acc) {
            let _ = qwenwork_account::sync_qwenwork_usage_from_remote(&acc.id, &token).await;
        }
    }
    let _ = crate::modules::tray::update_tray_menu(&app);
    Ok(accounts.len() as i32)
}

#[tauri::command]
pub async fn inject_qwenwork_account(app: AppHandle, account_id: String) -> Result<String, String> {
    let started_at = Instant::now();
    logger::log_info(&format!(
        "[QwenWork Switch] 开始切换千问办公账号: account_id={}",
        account_id
    ));

    let account = qoder_account::load_account_for_platform(QoderPlatformKind::QwenWork, &account_id)
        .ok_or_else(|| format!("千问办公账号不存在: {}", account_id))?;

    crate::commands::qwenwork_instance::close_qwenwork_native_processes();
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    qoder_account::inject_to_qwenwork(&account_id)?;
    crate::modules::provider_current_state::set_current_account_id(
        "qwenwork",
        Some(account_id.as_str()),
    )?;

    let _ = crate::modules::qoder_instance::update_default_settings_for_platform(
        QoderPlatformKind::QwenWork,
        Some(Some(account_id.clone())),
        None,
        Some(false),
    );

    let launch_warning = match crate::commands::qwenwork_instance::qwenwork_start_instance(
        "__default__".to_string(),
    )
    .await
    {
        Ok(_) => None,
        Err(err) => {
            if err.starts_with("APP_PATH_NOT_FOUND:") || err.contains("启动") {
                logger::log_warn(&format!("千问办公默认实例启动提示: {}", err));
                if err.starts_with("APP_PATH_NOT_FOUND:") {
                    let _ = app.emit(
                        "app:path_missing",
                        serde_json::json!({ "app": "qwenwork", "retry": { "kind": "default" } }),
                    );
                }
                Some(err)
            } else {
                return Err(err);
            }
        }
    };

    let _ = crate::modules::tray::update_tray_menu(&app);

    if let Some(err) = launch_warning {
        Ok(format!("切换完成，但千问办公启动提示: {}", err))
    } else {
        logger::log_info(&format!(
            "[QwenWork Switch] 切号成功: account_id={}, email={}, elapsed={}ms",
            account.id,
            account.email,
            started_at.elapsed().as_millis()
        ));
        Ok(format!("切换完成: {}", account.email))
    }
}

#[tauri::command]
pub fn update_qwenwork_account_tags(
    account_id: String,
    tags: Vec<String>,
) -> Result<QoderAccount, String> {
    qoder_account::update_account_tags_for_platform(QoderPlatformKind::QwenWork, &account_id, tags)
}

#[tauri::command]
pub fn get_qwenwork_accounts_index_path() -> Result<String, String> {
    qoder_account::accounts_index_path_string_for_platform(QoderPlatformKind::QwenWork)
}

#[tauri::command]
pub async fn claim_qwenwork_checkin(
    app: AppHandle,
    account_id: String,
) -> Result<Value, String> {
    let result = qwenwork_account::claim_qwenwork_daily_checkin(&account_id).await?;
    let _ = crate::modules::tray::update_tray_menu(&app);
    Ok(result)
}
