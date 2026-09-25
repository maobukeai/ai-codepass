mod commands;
pub mod error;
mod models;
mod modules;
mod utils;

use modules::config::CloseWindowBehavior;
use modules::logger;
use std::sync::OnceLock;
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::RunEvent;
use tauri::WindowEvent;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tracing::info;

/// 全局 AppHandle 存储
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// 获取全局 AppHandle
pub fn get_app_handle() -> Option<&'static tauri::AppHandle> {
    APP_HANDLE.get()
}

#[cfg(test)]
mod tests {
    use super::{
        has_enabled_periodic_account_refresh, should_hide_startup_minimized_window,
        should_preserve_main_window_for_background_refresh,
        should_preserve_main_window_for_menu_bar_refresh,
    };
    use crate::modules::config::UserConfig;

    #[test]
    fn startup_minimized_does_not_hide_when_disabled() {
        let mut config = UserConfig::default();
        config.startup_minimized = false;
        config.hide_dock_icon = true;

        assert!(!should_hide_startup_minimized_window(&config, true));
    }

    #[test]
    fn startup_minimized_hides_on_macos_when_dock_icon_is_hidden() {
        let mut config = UserConfig::default();
        config.startup_minimized = true;
        config.hide_dock_icon = true;

        assert!(should_hide_startup_minimized_window(&config, true));
    }

    #[test]
    fn startup_minimized_does_not_hide_when_dock_icon_is_available() {
        let mut config = UserConfig::default();
        config.startup_minimized = true;
        config.hide_dock_icon = false;

        assert!(!should_hide_startup_minimized_window(&config, true));
    }

    #[test]
    fn menu_bar_refresh_keeps_macos_main_webview_alive() {
        assert!(should_preserve_main_window_for_menu_bar_refresh(true, true));
        assert!(!should_preserve_main_window_for_menu_bar_refresh(
            true, false
        ));
    }

    #[test]
    fn menu_bar_refresh_does_not_change_non_macos_close_behavior() {
        assert!(!should_preserve_main_window_for_menu_bar_refresh(
            false, true
        ));
    }

    fn disable_all_periodic_refresh(config: &mut UserConfig) {
        config.auto_refresh_minutes = -1;
        config.codebuddy_auto_refresh_minutes = -1;
        config.codebuddy_cn_auto_refresh_minutes = -1;
        config.workbuddy_auto_refresh_minutes = -1;
        config.workbuddy_ai_auto_refresh_minutes = -1;
        config.qoder_auto_refresh_minutes = -1;
        config.qoder_cn_auto_refresh_minutes = -1;
        config.trae_auto_refresh_minutes = -1;
        config.trae_solo_auto_refresh_minutes = -1;
        config.trae_cn_auto_refresh_minutes = -1;
        config.trae_solo_cn_auto_refresh_minutes = -1;
    }

    #[test]
    fn windows_periodic_refresh_keeps_main_webview_alive() {
        let config = UserConfig::default();
        assert!(has_enabled_periodic_account_refresh(&config));
        assert!(should_preserve_main_window_for_background_refresh(
            false, true, false, &config
        ));
    }

    #[test]
    fn windows_without_periodic_refresh_keeps_destroy_behavior() {
        let mut config = UserConfig::default();
        disable_all_periodic_refresh(&mut config);
        assert!(!has_enabled_periodic_account_refresh(&config));
        assert!(!should_preserve_main_window_for_background_refresh(
            false, true, false, &config
        ));
    }

    #[test]
    fn periodic_refresh_does_not_change_non_windows_close_behavior() {
        let config = UserConfig::default();
        assert!(!should_preserve_main_window_for_background_refresh(
            false, false, false, &config
        ));
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn raise_process_file_descriptor_limit() {
    const TARGET_NOFILE_LIMIT: libc::rlim_t = 4096;

    unsafe {
        let mut limit = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        if libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit) != 0 {
            logger::log_warn(&format!(
                "[Startup] 读取进程文件句柄上限失败: {}",
                std::io::Error::last_os_error()
            ));
            return;
        }

        let target = if limit.rlim_max == libc::RLIM_INFINITY {
            TARGET_NOFILE_LIMIT
        } else {
            TARGET_NOFILE_LIMIT.min(limit.rlim_max)
        };
        if target <= limit.rlim_cur || target == 0 {
            return;
        }

        let previous = limit.rlim_cur;
        limit.rlim_cur = target;
        if libc::setrlimit(libc::RLIMIT_NOFILE, &limit) == 0 {
            logger::log_info(&format!(
                "[Startup] 已提升进程文件句柄软限制: {} -> {}",
                previous, target
            ));
        } else {
            logger::log_warn(&format!(
                "[Startup] 提升进程文件句柄软限制失败: {} -> {}, error={}",
                previous,
                target,
                std::io::Error::last_os_error()
            ));
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn raise_process_file_descriptor_limit() {}

fn should_hide_startup_minimized_window(
    config: &modules::config::UserConfig,
    is_macos: bool,
) -> bool {
    config.startup_minimized && is_macos && config.hide_dock_icon
}

fn should_preserve_main_window_for_menu_bar_refresh(
    is_macos: bool,
    menu_bar_quota_enabled: bool,
) -> bool {
    is_macos && menu_bar_quota_enabled
}

fn has_enabled_periodic_account_refresh(config: &modules::config::UserConfig) -> bool {
    [
        config.auto_refresh_minutes,
        config.codebuddy_auto_refresh_minutes,
        config.codebuddy_cn_auto_refresh_minutes,
        config.workbuddy_auto_refresh_minutes,
        config.workbuddy_ai_auto_refresh_minutes,
        config.qoder_auto_refresh_minutes,
        config.qoder_cn_auto_refresh_minutes,
        config.trae_auto_refresh_minutes,
        config.trae_solo_auto_refresh_minutes,
        config.trae_cn_auto_refresh_minutes,
        config.trae_solo_cn_auto_refresh_minutes,
    ]
    .into_iter()
    .any(|minutes| minutes > 0)
}

fn should_preserve_main_window_for_background_refresh(
    is_macos: bool,
    is_windows: bool,
    menu_bar_quota_enabled: bool,
    config: &modules::config::UserConfig,
) -> bool {
    should_preserve_main_window_for_menu_bar_refresh(is_macos, menu_bar_quota_enabled)
        || (is_windows && has_enabled_periodic_account_refresh(config))
}

fn apply_startup_minimized(app: &tauri::AppHandle) {
    let config = modules::config::get_user_config();
    if !config.startup_minimized {
        return;
    }

    let should_hide = should_hide_startup_minimized_window(&config, cfg!(target_os = "macos"));
    let Some(window) = app.get_webview_window("main") else {
        logger::log_warn("[Window] 启动后自动最小化失败: main window not found");
        return;
    };

    let (result, action_label) = if should_hide {
        (window.hide(), "隐藏")
    } else {
        (window.minimize(), "最小化")
    };

    match result {
        Ok(()) => logger::log_info(&format!("[Window] 启动后已自动{}主窗口", action_label)),
        Err(err) => logger::log_warn(&format!("[Window] 启动后自动最小化失败: {}", err)),
    }
}

#[cfg(target_os = "macos")]
fn apply_macos_activation_policy(app: &tauri::AppHandle) {
    let config = modules::config::get_user_config();
    let (policy, dock_visible, policy_label) = if config.hide_dock_icon {
        (ActivationPolicy::Accessory, false, "hidden")
    } else {
        (ActivationPolicy::Regular, true, "visible")
    };

    if let Err(err) = app.set_activation_policy(policy) {
        logger::log_warn(&format!("[Window] 设置 macOS 激活策略失败: {}", err));
        return;
    }

    if let Err(err) = app.set_dock_visibility(dock_visible) {
        logger::log_warn(&format!("[Window] 设置 macOS Dock 可见性失败: {}", err));
    }

    if dock_visible {
        let _ = app.show();
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
        }
    }

    info!("[Window] 已应用 macOS Dock 图标策略: {}", policy_label);
}

fn summarize_deep_link_args(args: &[String]) -> Vec<String> {
    args.to_vec()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logger::init_logger();
    modules::diagnostics::install_panic_hook();
    modules::diagnostics::start_frontend_ready_watchdog();
    raise_process_file_descriptor_limit();
    // 启动时先加载一次配置，确保进程级代理环境与用户设置同步。
    let _ = modules::config::get_user_config();

    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            logger::log_info("[Linux] 设置 WEBKIT_DISABLE_DMABUF_RENDERER=1");
        }
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            logger::log_info(&format!(
                "[SingleInstance] 收到唤起请求: arg_count={}",
                args.len()
            ));
            let handled = modules::external_import::handle_external_import_args(
                app,
                &args,
                "single-instance",
            );
            logger::log_info(&format!(
                "[SingleInstance] 外部导入处理结果: handled={}",
                handled
            ));
            if handled {
                return;
            }
            if let Err(err) = modules::floating_card_window::show_main_window(app) {
                logger::log_warn(&format!("[Window] 单实例唤起恢复主窗口失败: {}", err));
            }
        }))
        .setup(|app| {
            info!("AI CodePass 启动...");
            let current_exe = std::env::current_exe()
                .map(|path| path.display().to_string())
                .unwrap_or_else(|err| format!("unknown: {}", err));
            let build_mode = if cfg!(debug_assertions) {
                "debug"
            } else {
                "release"
            };
            logger::log_info(&format!(
                "[Startup] 启动诊断: marker=tray-diagnostics-v1, version={}, mode={}, exe={}",
                env!("CARGO_PKG_VERSION"),
                build_mode,
                current_exe
            ));

            // 存储全局 AppHandle
            let _ = APP_HANDLE.set(app.handle().clone());

            if let Err(err) = modules::app_lifecycle::install_system_shutdown_listener() {
                logger::log_warn(&format!("[Lifecycle] 安装系统关机监听失败: {}", err));
            }

            // 启动时清理 WebKit LocalStorage WAL，防止无限膨胀
            std::thread::spawn(|| {
                modules::webkit_cache_maintenance::checkpoint_webkit_localstorage();
            });

            // 初始化 Updater 插件
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None::<Vec<&'static str>>,
                ))?;
                info!("[Updater] Tauri Updater + Process 插件已初始化");
            }

            // 启动时同步设置合并（移至后台线程，不阻塞窗口显示）
            std::thread::spawn(|| {
                let current_config = modules::config::get_user_config();
                if let Some(merged_language) = modules::sync_settings::merge_setting_on_startup(
                    "language",
                    &current_config.language,
                    None,
                ) {
                    info!(
                        "[SyncSettings] 启动时合并语言设置: {} -> {}",
                        current_config.language, merged_language
                    );
                    if let Err(e) = modules::config::patch_user_config(|config| {
                        config.language = merged_language;
                        Ok(())
                    }) {
                        logger::log_error(&format!("[SyncSettings] 保存合并后的配置失败: {}", e));
                    }
                }
            });

            // 启动 WebSocket 服务（使用 Tauri 的 async runtime）
            tauri::async_runtime::spawn(async {
                modules::websocket::start_server().await;
            });

            // 启动网页查询服务（网络服务配置中的独立模块）
            tauri::async_runtime::spawn(async {
                modules::web_report::start_server().await;
            });

            {
                let _app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    modules::trae_oauth::restore_pending_oauth_listener();
                });
            }

            modules::provider_token_keeper::ensure_started(app.handle().clone());
            modules::auto_local_import::ensure_started(app.handle().clone());

            #[cfg(target_os = "macos")]
            apply_macos_activation_policy(&app.handle());

            #[cfg(any(windows, target_os = "linux"))]
            {
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    if let Err(err) = app_handle.deep_link().register_all() {
                        logger::log_warn(&format!("[DeepLink] register_all 失败: {}", err));
                    } else {
                        logger::log_info("[DeepLink] register_all 已完成");
                    }
                });
            }

            {
                let app_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls = event.urls();
                    let args: Vec<String> = urls.iter().map(|url| url.to_string()).collect();
                    logger::log_info(&format!(
                        "[DeepLink] 收到 on_open_url 事件: url_count={}, urls={:?}",
                        args.len(),
                        summarize_deep_link_args(&args)
                    ));
                    let handled = modules::external_import::handle_external_import_args(
                        &app_handle,
                        &args,
                        "deep-link-open-url",
                    );
                    logger::log_info(&format!(
                        "[DeepLink] on_open_url 外部导入处理结果: handled={}",
                        handled
                    ));
                });
            }

            {
                let app_handle = app.handle().clone();
                std::thread::spawn(move || match app_handle.deep_link().get_current() {
                    Ok(Some(urls)) => {
                        let args: Vec<String> = urls.iter().map(|url| url.to_string()).collect();
                        logger::log_info(&format!(
                            "[DeepLink] 启动时 get_current 命中: url_count={}, urls={:?}",
                            args.len(),
                            summarize_deep_link_args(&args)
                        ));
                        let handled = modules::external_import::handle_external_import_args(
                            &app_handle,
                            &args,
                            "deep-link-current",
                        );
                        logger::log_info(&format!(
                            "[DeepLink] get_current 外部导入处理结果: handled={}",
                            handled
                        ));
                    }
                    Ok(None) => {
                        logger::log_info("[DeepLink] 启动时 get_current: empty");
                    }
                    Err(err) => {
                        logger::log_warn(&format!("[DeepLink] get_current 失败: {}", err));
                    }
                });
            }

            // 创建骨架托盘（无账号文件 I/O，秒出）
            if let Err(e) = modules::tray::create_tray_skeleton(app.handle()) {
                logger::log_error(&format!("[Tray] 创建骨架托盘失败: {}", e));
            }

            #[cfg(target_os = "macos")]
            {
                let tray_app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    if let Err(err) = modules::tray::apply_tray_icon_style(&tray_app_handle) {
                        logger::log_warn(&format!(
                            "[Tray] macOS 启动后重应用菜单栏图标样式失败: {}",
                            err
                        ));
                    }
                });
            }

            let startup_args: Vec<String> = std::env::args().collect();
            let startup_external_import_handled =
                modules::external_import::handle_external_import_args(
                    app.handle(),
                    &startup_args,
                    "startup",
                );
            logger::log_info(&format!(
                "[Startup] 外部导入处理结果: handled={}",
                startup_external_import_handled
            ));

            // Restore last main-window size/position before optional startup minimize (#948 / #1132).
            if let Some(main) = app.get_webview_window("main") {
                modules::main_window_state::restore_to_window(&main);
            }

            apply_startup_minimized(&app.handle());
            modules::workbuddy_auto_checkin::start_auto_checkin_scheduler(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                if window.label() != "main" {
                    return;
                }
                // Always snapshot geometry before close / tray-destroy / quit.
                modules::main_window_state::capture_and_save_from_window_handle(window);
                let config = modules::config::get_user_config();

                match config.close_behavior {
                    CloseWindowBehavior::Minimize => {
                        api.prevent_close();
                        let preserve_for_menu_bar =
                            should_preserve_main_window_for_menu_bar_refresh(
                                cfg!(target_os = "macos"),
                                config.menu_bar_quota_enabled,
                            );
                        let preserve_for_background_refresh = cfg!(target_os = "windows")
                            && has_enabled_periodic_account_refresh(&config);
                        if should_preserve_main_window_for_background_refresh(
                            cfg!(target_os = "macos"),
                            cfg!(target_os = "windows"),
                            config.menu_bar_quota_enabled,
                            &config,
                        ) {
                            // Keep the WebView alive so its configured quota refresh
                            // scheduler can continue updating the native menu bar.
                            if let Err(err) = window.hide() {
                                modules::logger::log_warn(&format!(
                                    "[Window] 隐藏主窗口失败，回退为销毁 WebView: {}",
                                    err
                                ));
                                if let Err(destroy_err) =
                                    modules::floating_card_window::destroy_main_window_to_tray(
                                        window,
                                    )
                                {
                                    modules::logger::log_warn(&format!(
                                        "[Window] 销毁主窗口 WebView 失败: {}",
                                        destroy_err
                                    ));
                                }
                            } else {
                                let _ = modules::tray::update_tray_menu(window.app_handle());
                                if preserve_for_menu_bar {
                                    info!("[Window] 主窗口已隐藏到托盘，保留 WebView 以刷新菜单栏额度");
                                } else if preserve_for_background_refresh {
                                    info!("[Window] 主窗口已隐藏到托盘，保留 WebView 以继续后台额度刷新");
                                } else {
                                    info!("[Window] 主窗口已隐藏到托盘");
                                }
                                modules::process_memory::trim_idle_process_memory();
                            }
                        } else if let Err(err) =
                            modules::floating_card_window::destroy_main_window_to_tray(window)
                        {
                            // Full #686 behavior: destroy main WebView, keep tray process alive.
                            modules::logger::log_warn(&format!(
                                "[Window] 销毁主窗口 WebView 失败，回退为隐藏: {}",
                                err
                            ));
                            let _ = window.hide();
                            modules::process_memory::trim_idle_process_memory();
                        } else {
                            info!("[Window] 窗口已关闭到托盘");
                        }
                    }
                    CloseWindowBehavior::Quit => {
                        modules::floating_card_window::request_app_exit();
                        info!("[Window] 用户选择退出应用");
                        window.app_handle().exit(0);
                    }
                    CloseWindowBehavior::Ask => {
                        api.prevent_close();
                        let _ = window.emit("window:close_requested", ());
                        info!("[Window] 等待用户选择关闭行为");
                    }
                }
            }
            WindowEvent::Focused(focused) => {
                if !focused && window.label() == "main" {
                    std::thread::spawn(|| {
                        std::thread::sleep(std::time::Duration::from_millis(1500));
                        modules::process_memory::trim_idle_process_memory();
                    });
                }
            }
            WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                if window.label() == "main" {
                    modules::main_window_state::capture_and_save_from_window_handle_debounced(
                        window,
                    );
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            // OAuth Commands
            commands::oauth::start_oauth_login,
            commands::oauth::prepare_oauth_url,
            commands::oauth::complete_oauth_login,
            commands::oauth::submit_oauth_callback_url,
            commands::oauth::cancel_oauth_login,
            // Import/Export Commands
            commands::import::import_from_old_tools,
            commands::import::import_from_local,
            commands::import::import_from_json,
            commands::import::import_from_files,
            commands::import::export_accounts,
            commands::data_transfer::data_transfer_get_user_config,
            commands::data_transfer::data_transfer_apply_user_config,
            commands::data_transfer::data_transfer_get_instance_store,
            commands::data_transfer::data_transfer_replace_instance_store,
            commands::provider_current::get_provider_current_account_id,
            // System Commands
            commands::system::trim_memory,
            commands::system::open_data_folder,
            commands::system::open_local_path,
            commands::system::windows_elevated_close_processes,
            commands::system::save_text_file,
            commands::system::get_downloads_dir,
            commands::system::get_auto_backup_settings,
            commands::system::save_auto_backup_settings,
            commands::system::update_auto_backup_last_run,
            commands::system::write_auto_backup_file,
            commands::system::read_auto_backup_file,
            commands::system::copy_auto_backup_file,
            commands::system::list_auto_backup_files,
            commands::system::delete_auto_backup_file,
            commands::system::cleanup_auto_backup_files,
            commands::system::open_auto_backup_dir,
            commands::system::get_backup_usage,
            commands::system::preview_backup_directory_change,
            commands::system::change_backup_directory,
            commands::system::cancel_backup_directory_change,
            commands::system::cleanup_behavior_backups,
            commands::system::get_webdav_sync_settings,
            commands::system::save_webdav_sync_settings,
            commands::system::test_webdav_sync_connection,
            commands::system::upload_auto_backup_to_webdav,
            commands::system::list_webdav_backup_files,
            commands::system::read_webdav_backup_file,
            commands::system::delete_webdav_backup_file,
            commands::system::get_network_config,
            commands::system::save_network_config,
            commands::system::get_diagnostics_config,
            commands::system::save_diagnostics_config,
            commands::system::diagnostics_frontend_stage,
            commands::system::diagnostics_frontend_ready,
            commands::system::diagnostics_capture_event,
            commands::system::get_general_config,
            commands::system::get_available_terminals,
            commands::system::patch_general_config,
            commands::system::scan_auto_local_import,
            commands::system::save_refresh_interval_config,
            commands::system::save_tray_platform_layout,
            commands::system::set_app_path,
            commands::system::set_trae_app_scan_roots,
            commands::system::detect_app_path,
            commands::system::scan_app_launch_targets,
            commands::system::handle_window_close,
            commands::system::main_window_take_pending_navigation,
            commands::system::show_floating_card_window,
            commands::system::show_instance_floating_card_window,
            commands::system::get_floating_card_context,
            commands::system::hide_floating_card_window,
            commands::system::hide_current_floating_card_window,
            commands::system::set_floating_card_always_on_top,
            commands::system::set_current_floating_card_window_always_on_top,
            commands::system::set_floating_card_confirm_on_close,
            commands::system::save_floating_card_position,
            commands::system::show_main_window_and_navigate,
            commands::system::external_import_take_pending,
            commands::system::external_import_fetch_import_url,
            commands::system::open_folder,
            commands::system::delete_corrupted_file,
            commands::system::load_user_memory,
            commands::system::mark_user_memory_dismissed,
            commands::system::save_user_memory_list,
            commands::system::load_ui_preferences,
            commands::system::save_ui_preferences,
            // Logs Commands
            commands::logs::logs_get_snapshot,
            commands::logs::logs_open_log_directory,
            // Update Commands
            commands::update::should_check_updates,
            commands::update::update_last_check_time,
            commands::update::get_update_settings,
            commands::update::patch_update_settings,
            commands::update::save_pending_update_notes,
            commands::update::check_version_jump,
            commands::update::get_release_history,
            commands::update::update_log,
            commands::update::get_update_runtime_info,
            commands::update::install_linux_update,
            // CodeBuddy Commands
            commands::codebuddy::list_codebuddy_accounts,
            commands::codebuddy::delete_codebuddy_account,
            commands::codebuddy::delete_codebuddy_accounts,
            commands::codebuddy::import_codebuddy_from_json,
            commands::codebuddy::import_codebuddy_from_local,
            commands::codebuddy::export_codebuddy_accounts,
            commands::codebuddy::refresh_codebuddy_token,
            commands::codebuddy::refresh_all_codebuddy_tokens,
            commands::codebuddy::codebuddy_oauth_login_start,
            commands::codebuddy::codebuddy_oauth_login_complete,
            commands::codebuddy::codebuddy_oauth_login_cancel,
            commands::codebuddy::add_codebuddy_account_with_token,
            commands::codebuddy::update_codebuddy_account_tags,
            commands::codebuddy::get_codebuddy_accounts_index_path,
            commands::codebuddy::inject_codebuddy_to_vscode,
            commands::codebuddy_session::codebuddy_list_sessions,
            // CodeBuddy Instance Commands
            commands::codebuddy_instance::codebuddy_get_instance_defaults,
            commands::codebuddy_instance::codebuddy_list_instances,
            commands::codebuddy_instance::codebuddy_create_instance,
            commands::codebuddy_instance::codebuddy_update_instance,
            commands::codebuddy_instance::codebuddy_delete_instance,
            commands::codebuddy_instance::codebuddy_start_instance,
            commands::codebuddy_instance::codebuddy_stop_instance,
            commands::codebuddy_instance::codebuddy_open_instance_window,
            commands::codebuddy_instance::codebuddy_close_all_instances,
            // CodeBuddy CN Commands
            commands::codebuddy_cn::list_codebuddy_cn_accounts,
            commands::codebuddy_cn::delete_codebuddy_cn_account,
            commands::codebuddy_cn::delete_codebuddy_cn_accounts,
            commands::codebuddy_cn::import_codebuddy_cn_from_json,
            commands::codebuddy_cn::import_codebuddy_cn_from_local,
            commands::codebuddy_cn::export_codebuddy_cn_accounts,
            commands::codebuddy_cn::refresh_codebuddy_cn_token,
            commands::codebuddy_cn::refresh_all_codebuddy_cn_tokens,
            commands::codebuddy_cn::codebuddy_cn_oauth_login_start,
            commands::codebuddy_cn::codebuddy_cn_oauth_login_complete,
            commands::codebuddy_cn::codebuddy_cn_oauth_login_cancel,
            commands::codebuddy_cn::add_codebuddy_cn_account_with_token,
            commands::codebuddy_cn::update_codebuddy_cn_account_tags,
            commands::codebuddy_cn::get_codebuddy_cn_accounts_index_path,
            commands::codebuddy_cn::inject_codebuddy_cn_to_vscode,
            commands::codebuddy_cn::sync_codebuddy_cn_to_workbuddy,
            // CodeBuddy CN Instance Commands
            commands::codebuddy_cn_instance::codebuddy_cn_get_instance_defaults,
            commands::codebuddy_cn_instance::codebuddy_cn_list_instances,
            commands::codebuddy_cn_instance::codebuddy_cn_create_instance,
            commands::codebuddy_cn_instance::codebuddy_cn_update_instance,
            commands::codebuddy_cn_instance::codebuddy_cn_delete_instance,
            commands::codebuddy_cn_instance::codebuddy_cn_start_instance,
            commands::codebuddy_cn_instance::codebuddy_cn_stop_instance,
            commands::codebuddy_cn_instance::codebuddy_cn_open_instance_window,
            commands::codebuddy_cn_instance::codebuddy_cn_close_all_instances,
            // WorkBuddy Commands
            commands::workbuddy::list_workbuddy_accounts,
            commands::workbuddy::delete_workbuddy_account,
            commands::workbuddy::delete_workbuddy_accounts,
            commands::workbuddy::import_workbuddy_from_json,
            commands::workbuddy::import_workbuddy_from_local,
            commands::workbuddy::export_workbuddy_accounts,
            commands::workbuddy::refresh_workbuddy_token,
            commands::workbuddy::refresh_all_workbuddy_tokens,
            commands::workbuddy::workbuddy_oauth_login_start,
            commands::workbuddy::workbuddy_oauth_login_complete,
            commands::workbuddy::workbuddy_oauth_login_cancel,
            commands::workbuddy::add_workbuddy_account_with_token,
            commands::workbuddy::update_workbuddy_account_tags,
            commands::workbuddy::get_workbuddy_accounts_index_path,
            commands::workbuddy::inject_workbuddy_to_vscode,
            commands::workbuddy::sync_workbuddy_to_codebuddy_cn,
            commands::workbuddy::get_checkin_status_workbuddy,
            commands::workbuddy::checkin_workbuddy,
            // WorkBuddy AI (国际版) Commands
            commands::workbuddy_ai::list_workbuddy_ai_accounts,
            commands::workbuddy_ai::delete_workbuddy_ai_account,
            commands::workbuddy_ai::delete_workbuddy_ai_accounts,
            commands::workbuddy_ai::import_workbuddy_ai_from_json,
            commands::workbuddy_ai::import_workbuddy_ai_from_local,
            commands::workbuddy_ai::export_workbuddy_ai_accounts,
            commands::workbuddy_ai::refresh_workbuddy_ai_token,
            commands::workbuddy_ai::refresh_all_workbuddy_ai_tokens,
            commands::workbuddy_ai::workbuddy_ai_oauth_login_start,
            commands::workbuddy_ai::workbuddy_ai_oauth_login_complete,
            commands::workbuddy_ai::workbuddy_ai_oauth_login_cancel,
            commands::workbuddy_ai::add_workbuddy_ai_account_with_token,
            commands::workbuddy_ai::inject_workbuddy_ai_to_client,
            commands::workbuddy_ai::update_workbuddy_ai_account_tags,
            commands::workbuddy_ai::get_checkin_status_workbuddy_ai,
            commands::workbuddy_ai::checkin_workbuddy_ai,
            // WorkBuddy WebView (网页会话) Commands
            modules::workbuddy_webview::is_workbuddy_webview_supported,
            modules::workbuddy_webview::open_workbuddy_webview,
            modules::workbuddy_webview::close_workbuddy_webview,
            modules::workbuddy_webview::list_workbuddy_webview_sessions,
            commands::workbuddy::get_workbuddy_auto_checkin_config,
            commands::workbuddy::migrate_workbuddy_auto_checkin_config,
            commands::workbuddy::save_workbuddy_auto_checkin_config,
            commands::workbuddy::get_workbuddy_auto_checkin_logs,
            commands::workbuddy::clear_workbuddy_auto_checkin_logs,
            commands::workbuddy::run_workbuddy_auto_checkin_now,
            // WorkBuddy Instance Commands
            commands::workbuddy_instance::workbuddy_get_instance_defaults,
            commands::workbuddy_instance::workbuddy_list_instances,
            commands::workbuddy_instance::workbuddy_create_instance,
            commands::workbuddy_instance::workbuddy_update_instance,
            commands::workbuddy_instance::workbuddy_delete_instance,
            commands::workbuddy_instance::workbuddy_start_instance,
            commands::workbuddy_instance::workbuddy_stop_instance,
            commands::workbuddy_instance::workbuddy_open_instance_window,
            commands::workbuddy_instance::workbuddy_close_all_instances,
            // Qoder Commands
            commands::qoder::list_qoder_accounts,
            commands::qoder::delete_qoder_account,
            commands::qoder::delete_qoder_accounts,
            commands::qoder::import_qoder_from_json,
            commands::qoder::import_qoder_from_local,
            commands::qoder::qoder_oauth_login_start,
            commands::qoder::qoder_oauth_login_peek,
            commands::qoder::qoder_oauth_login_complete,
            commands::qoder::qoder_oauth_login_cancel,
            commands::qoder::export_qoder_accounts,
            commands::qoder::refresh_qoder_token,
            commands::qoder::refresh_all_qoder_tokens,
            commands::qoder::inject_qoder_account,
            commands::qoder::update_qoder_account_tags,
            commands::qoder::get_qoder_accounts_index_path,
            commands::qoder::claim_qoder_checkin,
            // Qoder Instance Commands
            commands::qoder_instance::qoder_get_instance_defaults,
            commands::qoder_instance::qoder_list_instances,
            commands::qoder_instance::qoder_create_instance,
            commands::qoder_instance::qoder_update_instance,
            commands::qoder_instance::qoder_delete_instance,
            commands::qoder_instance::qoder_start_instance,
            commands::qoder_instance::qoder_stop_instance,
            commands::qoder_instance::qoder_open_instance_window,
            commands::qoder_instance::qoder_close_all_instances,
            // Qoder CN Commands
            commands::qoder_cn::list_qoder_cn_accounts,
            commands::qoder_cn::delete_qoder_cn_account,
            commands::qoder_cn::delete_qoder_cn_accounts,
            commands::qoder_cn::import_qoder_cn_from_json,
            commands::qoder_cn::import_qoder_cn_from_local,
            commands::qoder_cn::qoder_cn_oauth_login_start,
            commands::qoder_cn::qoder_cn_oauth_login_peek,
            commands::qoder_cn::qoder_cn_oauth_login_complete,
            commands::qoder_cn::qoder_cn_oauth_login_cancel,
            commands::qoder_cn::export_qoder_cn_accounts,
            commands::qoder_cn::refresh_qoder_cn_token,
            commands::qoder_cn::refresh_all_qoder_cn_tokens,
            commands::qoder_cn::inject_qoder_cn_account,
            commands::qoder_cn::update_qoder_cn_account_tags,
            commands::qoder_cn::get_qoder_cn_accounts_index_path,
            commands::qoder_cn::claim_qoder_cn_checkin,
            // Qoder CN Instance Commands
            commands::qoder_cn_instance::qoder_cn_get_instance_defaults,
            commands::qoder_cn_instance::qoder_cn_list_instances,
            commands::qoder_cn_instance::qoder_cn_create_instance,
            commands::qoder_cn_instance::qoder_cn_update_instance,
            commands::qoder_cn_instance::qoder_cn_delete_instance,
            commands::qoder_cn_instance::qoder_cn_start_instance,
            commands::qoder_cn_instance::qoder_cn_stop_instance,
            commands::qoder_cn_instance::qoder_cn_open_instance_window,
            commands::qoder_cn_instance::qoder_cn_close_all_instances,
            // QwenWork Commands
            commands::qwenwork::list_qwenwork_accounts,
            commands::qwenwork::delete_qwenwork_account,
            commands::qwenwork::delete_qwenwork_accounts,
            commands::qwenwork::import_qwenwork_from_json,
            commands::qwenwork::import_qwenwork_from_local,
            commands::qwenwork::qwenwork_oauth_login_start,
            commands::qwenwork::qwenwork_oauth_login_peek,
            commands::qwenwork::qwenwork_oauth_login_complete,
            commands::qwenwork::qwenwork_oauth_login_cancel,
            commands::qwenwork::export_qwenwork_accounts,
            commands::qwenwork::refresh_qwenwork_token,
            commands::qwenwork::refresh_all_qwenwork_tokens,
            commands::qwenwork::inject_qwenwork_account,
            commands::qwenwork::update_qwenwork_account_tags,
            commands::qwenwork::get_qwenwork_accounts_index_path,
            commands::qwenwork::claim_qwenwork_checkin,
            // QwenWork Instance Commands
            commands::qwenwork_instance::qwenwork_get_instance_defaults,
            commands::qwenwork_instance::qwenwork_list_instances,
            commands::qwenwork_instance::qwenwork_create_instance,
            commands::qwenwork_instance::qwenwork_update_instance,
            commands::qwenwork_instance::qwenwork_delete_instance,
            commands::qwenwork_instance::qwenwork_start_instance,
            commands::qwenwork_instance::qwenwork_stop_instance,
            commands::qwenwork_instance::qwenwork_open_instance_window,
            commands::qwenwork_instance::qwenwork_close_all_instances,
            // Trae Commands
            commands::trae::list_trae_accounts,
            commands::trae::delete_trae_account,
            commands::trae::delete_trae_accounts,
            commands::trae::import_trae_from_json,
            commands::trae::import_trae_from_local,
            commands::trae::trae_oauth_login_start,
            commands::trae::trae_oauth_login_complete,
            commands::trae::trae_oauth_submit_callback_url,
            commands::trae::trae_oauth_login_cancel,
            commands::trae::export_trae_accounts,
            commands::trae::refresh_trae_token,
            commands::trae::refresh_all_trae_tokens,
            commands::trae::refresh_trae_tokens_for_platform,
            commands::trae::add_trae_account_with_token,
            commands::trae::update_trae_account_tags,
            commands::trae::get_trae_accounts_index_path,
            commands::trae::inject_trae_account,
            commands::trae::get_trae_checkin_status,
            commands::trae::claim_trae_checkin,
            // Trae Instance Commands
            commands::trae_instance::trae_get_instance_defaults,
            commands::trae_instance::trae_list_instances,
            commands::trae_instance::trae_create_instance,
            commands::trae_instance::trae_update_instance,
            commands::trae_instance::trae_delete_instance,
            commands::trae_instance::trae_start_instance,
            commands::trae_instance::trae_stop_instance,
            commands::trae_instance::trae_open_instance_window,
            commands::trae_instance::trae_close_all_instances,
            // Instance Commands
            commands::instance::get_instance_defaults,
            commands::instance::list_instances,
            commands::instance::create_instance,
            commands::instance::update_instance,
            commands::instance::delete_instance,
            commands::instance::start_instance,
            commands::instance::stop_instance,
            commands::instance::open_instance_window,
            commands::instance::close_all_instances,
            // Webhook Commands
            commands::webhook::get_webhook_settings,
            commands::webhook::save_webhook_settings,
            commands::webhook::test_webhook_settings,
            commands::webhook::send_auto_checkin_notification,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match &event {
            RunEvent::ExitRequested { api, .. } => {
                if modules::floating_card_window::should_keep_alive_after_main_window_destroyed()
                    && !modules::app_lifecycle::is_shutdown_started()
                {
                    api.prevent_exit();
                    modules::logger::log_info("[Window] 主窗口已销毁，应用继续在托盘运行");
                } else {
                    let _ = modules::app_lifecycle::begin_shutdown();
                }
            }
            RunEvent::Exit => {
                let _ = modules::app_lifecycle::begin_shutdown();
            }
            _ => {}
        }

        #[cfg(target_os = "macos")]
        {
            match event {
                RunEvent::Reopen { .. } => {
                    if let Err(err) = modules::floating_card_window::show_main_window(app_handle) {
                        logger::log_warn(&format!("[Window] Dock 重新打开主窗口失败: {}", err));
                    }
                }
                RunEvent::Opened { urls } => {
                    let args: Vec<String> = urls.iter().map(|url| url.to_string()).collect();
                    logger::log_info(&format!(
                        "[RunEvent] 收到 Opened 事件: url_count={}, urls={:?}",
                        args.len(),
                        summarize_deep_link_args(&args)
                    ));
                    let handled = modules::external_import::handle_external_import_args(
                        app_handle,
                        &args,
                        "run-event-opened",
                    );
                    logger::log_info(&format!(
                        "[RunEvent] Opened 外部导入处理结果: handled={}",
                        handled
                    ));
                }
                _ => {}
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app_handle, event);
        }
    });
}
