use std::time::Instant;
use tauri::{AppHandle, Emitter};

use crate::models::qoder::{QoderAccount, QoderOAuthStartResponse};
use crate::modules::{logger, qoder_account, qoder_oauth};

#[tauri::command]
pub fn list_qoder_cn_accounts() -> Result<Vec<QoderAccount>, String> {
    qoder_account::list_accounts_checked_cn()
}

#[tauri::command]
pub fn delete_qoder_cn_account(account_id: String) -> Result<(), String> {
    qoder_account::remove_account_cn(&account_id)
}

#[tauri::command]
pub fn delete_qoder_cn_accounts(account_ids: Vec<String>) -> Result<(), String> {
    qoder_account::remove_accounts_cn(&account_ids)
}

#[tauri::command]
pub fn import_qoder_cn_from_json(json_content: String) -> Result<Vec<QoderAccount>, String> {
    qoder_account::import_from_json_cn(&json_content)
}

#[tauri::command]
pub async fn import_qoder_cn_from_local(app: AppHandle) -> Result<Vec<QoderAccount>, String> {
    match qoder_account::import_from_local_cn()? {
        Some(account) => {
            let final_account = match qoder_oauth::refresh_account_from_openapi_cn(&account.id).await {
                Ok(refreshed) => refreshed,
                Err(_) => account,
            };
            let _ = crate::modules::tray::update_tray_menu(&app);
            Ok(vec![final_account])
        }
        None => Err("未找到本地 Qoder 国内版登录信息".to_string()),
    }
}

#[tauri::command]
pub async fn qoder_cn_oauth_login_start() -> Result<QoderOAuthStartResponse, String> {
    let started_at = Instant::now();
    logger::log_info("[Qoder CN OAuth] start 命令触发");
    let result = qoder_oauth::start_login_cn().await;
    match &result {
        Ok(response) => logger::log_info(&format!(
            "[Qoder CN OAuth] start 命令完成: login_id={}, verification_uri_len={}, callback_url={}, elapsed={}ms",
            response.login_id,
            response.verification_uri.len(),
            response.callback_url.as_deref().unwrap_or("<none>"),
            started_at.elapsed().as_millis()
        )),
        Err(err) => logger::log_warn(&format!(
            "[Qoder CN OAuth] start 命令失败: elapsed={}ms, error={}",
            started_at.elapsed().as_millis(),
            err
        )),
    }
    result
}

#[tauri::command]
pub fn qoder_cn_oauth_login_peek() -> Option<QoderOAuthStartResponse> {
    let pending = qoder_oauth::peek_pending_login_cn();
    if let Some(state) = pending.as_ref() {
        logger::log_info(&format!(
            "[Qoder CN OAuth] peek 命令命中会话: login_id={}, verification_uri_len={}",
            state.login_id,
            state.verification_uri.len()
        ));
    } else {
        logger::log_info("[Qoder CN OAuth] peek 命令未命中会话");
    }
    pending
}

#[tauri::command]
pub async fn qoder_cn_oauth_login_complete(
    app: AppHandle,
    login_id: String,
) -> Result<QoderAccount, String> {
    let started_at = Instant::now();
    logger::log_info(&format!(
        "[Qoder CN OAuth] complete 命令触发: login_id={}",
        login_id
    ));
    let account = match qoder_oauth::complete_login_cn(&login_id).await {
        Ok(account) => account,
        Err(err) => {
            logger::log_warn(&format!(
                "[Qoder CN OAuth] complete 命令失败: login_id={}, elapsed={}ms, error={}",
                login_id,
                started_at.elapsed().as_millis(),
                err
            ));
            return Err(err);
        }
    };
    let _ = crate::modules::tray::update_tray_menu(&app);
    logger::log_info(&format!(
        "[Qoder CN OAuth] complete 命令完成: login_id={}, account_id={}, elapsed={}ms",
        login_id,
        account.id,
        started_at.elapsed().as_millis()
    ));
    Ok(account)
}

#[tauri::command]
pub fn qoder_cn_oauth_login_cancel(login_id: Option<String>) -> Result<(), String> {
    logger::log_info(&format!(
        "[Qoder CN OAuth] cancel 命令触发: login_id={}",
        login_id.as_deref().unwrap_or("<none>")
    ));
    qoder_oauth::cancel_login_cn(login_id.as_deref())
}

#[tauri::command]
pub fn export_qoder_cn_accounts(account_ids: Vec<String>) -> Result<String, String> {
    qoder_account::export_accounts_cn(&account_ids)
}

#[tauri::command]
pub async fn refresh_qoder_cn_token(
    app: AppHandle,
    account_id: String,
) -> Result<QoderAccount, String> {
    let started_at = Instant::now();
    logger::log_info(&format!(
        "[Qoder CN Command] 手动刷新账号开始: account_id={}",
        account_id
    ));
    match qoder_oauth::refresh_account_from_openapi_cn(&account_id).await {
        Ok(account) => {
            let _ = crate::modules::tray::update_tray_menu(&app);
            logger::log_info(&format!(
                "[Qoder CN Command] 刷新完成: account_id={}, email={}, elapsed={}ms",
                account.id,
                account.email,
                started_at.elapsed().as_millis()
            ));
            Ok(account)
        }
        Err(err) => {
            logger::log_warn(&format!(
                "[Qoder CN Command] 刷新失败: account_id={}, elapsed={}ms, error={}",
                account_id,
                started_at.elapsed().as_millis(),
                err
            ));
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn refresh_all_qoder_cn_tokens(app: AppHandle) -> Result<i32, String> {
    let started_at = Instant::now();
    logger::log_info("[Qoder CN Command] 批量刷新开始");
    let refreshed = qoder_oauth::refresh_all_accounts_from_openapi_cn().await?;
    let _ = crate::modules::tray::update_tray_menu(&app);
    logger::log_info(&format!(
        "[Qoder CN Command] 批量刷新完成: refreshed={}, elapsed={}ms",
        refreshed,
        started_at.elapsed().as_millis()
    ));
    Ok(refreshed)
}

#[tauri::command]
pub async fn inject_qoder_cn_account(app: AppHandle, account_id: String) -> Result<String, String> {
    let started_at = Instant::now();
    logger::log_info(&format!(
        "[Qoder CN Switch] 开始切换账号: account_id={}",
        account_id
    ));

    let account = qoder_account::load_account_cn(&account_id)
        .ok_or_else(|| format!("Qoder 国内版账号不存在: {}", account_id))?;

    let default_dir = crate::modules::qoder_instance::get_default_qoder_user_data_dir_cn()
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();
    let _ = crate::modules::process::close_qoder_cn_instances(&[default_dir], 20);
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    qoder_account::inject_to_qoder_cn(&account_id)?;
    crate::modules::provider_current_state::set_current_account_id(
        "qoder_cn",
        Some(account_id.as_str()),
    )?;

    if let Err(err) = crate::modules::qoder_instance::update_default_settings_cn(
        Some(Some(account_id.clone())),
        None,
        Some(false),
    ) {
        logger::log_warn(&format!("更新 Qoder 国内版默认实例绑定账号失败: {}", err));
    }

    let launch_warning = match crate::commands::qoder_cn_instance::qoder_cn_start_instance(
        "__default__".to_string(),
    )
    .await
    {
        Ok(_) => None,
        Err(err) => {
            if err.starts_with("APP_PATH_NOT_FOUND:") || err.contains("启动 Qoder 国内版失败") || err.contains("启动 Qoder 失败") {
                logger::log_warn(&format!("Qoder 国内版默认实例启动失败: {}", err));
                if err.starts_with("APP_PATH_NOT_FOUND:") || err.contains("APP_PATH_NOT_FOUND:") {
                    let _ = app.emit(
                        "app:path_missing",
                        serde_json::json!({ "app": "qoder_cn", "retry": { "kind": "default" } }),
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
        logger::log_warn(&format!(
            "[Qoder CN Switch] 切号完成但启动失败: account_id={}, email={}, elapsed={}ms, error={}",
            account.id,
            account.email,
            started_at.elapsed().as_millis(),
            err
        ));
        Ok(format!("切换完成，但 Qoder 国内版启动失败: {}", err))
    } else {
        logger::log_info(&format!(
            "[Qoder CN Switch] 切号成功: account_id={}, email={}, elapsed={}ms",
            account.id,
            account.email,
            started_at.elapsed().as_millis()
        ));
        Ok(format!("切换完成: {}", account.email))
    }
}

#[tauri::command]
pub fn update_qoder_cn_account_tags(
    account_id: String,
    tags: Vec<String>,
) -> Result<QoderAccount, String> {
    qoder_account::update_account_tags_cn(&account_id, tags)
}

#[tauri::command]
pub fn get_qoder_cn_accounts_index_path() -> Result<String, String> {
    qoder_account::accounts_index_path_string_cn()
}

#[tauri::command]
pub async fn claim_qoder_cn_checkin(account_id: Option<String>) -> Result<serde_json::Value, String> {
    let target_id = match account_id.filter(|s| !s.trim().is_empty()) {
        Some(id) => id,
        None => qoder_account::list_accounts_for_platform(qoder_account::QoderPlatformKind::Cn)
            .into_iter()
            .next()
            .map(|a| a.id)
            .ok_or_else(|| "暂无 Qoder 国内版账号可签到".to_string())?,
    };
    crate::modules::qwenwork_account::claim_qoder_campaign_checkin(
        qoder_account::QoderPlatformKind::Cn,
        &target_id,
    )
    .await
}
