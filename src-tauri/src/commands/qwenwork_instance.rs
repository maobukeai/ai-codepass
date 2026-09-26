use std::path::Path;
use std::process::Command;

use crate::models::InstanceProfileView;
use crate::modules;
use crate::modules::qoder_account::QoderPlatformKind;

const DEFAULT_INSTANCE_ID: &str = "__default__";

fn is_profile_initialized(user_data_dir: &str) -> bool {
    let path = Path::new(user_data_dir);
    if !path.exists() {
        return false;
    }
    match std::fs::read_dir(path) {
        Ok(mut iter) => iter.next().is_some(),
        Err(_) => false,
    }
}

fn resolve_running_pid(last_pid: Option<u32>, _user_data_dir: Option<&str>) -> Option<u32> {
    if let Some(pid) = last_pid {
        if modules::process::is_pid_running(pid) {
            return Some(pid);
        }
    }
    None
}

pub fn close_qwenwork_native_processes() {
    #[cfg(target_os = "windows")]
    {
        for exe_name in ["QwenWorkCN.exe", "QwenWork.exe", "QoderWorkCN.exe"] {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/IM", exe_name, "/T"])
                .output();
        }
    }
    #[cfg(target_os = "macos")]
    {
        for proc_name in ["QwenWorkCN", "QwenWork"] {
            let _ = std::process::Command::new("pkill")
                .args(["-f", proc_name])
                .output();
        }
    }
}

fn inject_bound_account_for_instance_start(
    instance_id: &str,
    user_data_dir: &str,
    bind_account_id: Option<&str>,
    is_default: bool,
) -> Result<(), String> {
    modules::instance_fingerprint::sync_qoder_family_active_profile_on_start(
        QoderPlatformKind::QwenWork,
        instance_id,
        Path::new(user_data_dir),
        bind_account_id,
    )?;

    let bind_id = bind_account_id
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let Some(bind_id) = bind_id else {
        if !is_default {
            modules::qwenwork_account::clear_qwenwork_login_state_for_blank_instance(Path::new(user_data_dir))?;
        }
        return Ok(());
    };

    modules::qwenwork_account::inject_to_qwenwork_dir(
        Path::new(user_data_dir),
        bind_id,
        is_default,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn qwenwork_get_instance_defaults() -> Result<modules::instance::InstanceDefaults, String> {
    modules::qoder_instance::get_instance_defaults_for_platform(QoderPlatformKind::QwenWork)
}

#[tauri::command]
pub async fn qwenwork_list_instances() -> Result<Vec<InstanceProfileView>, String> {
    let store = modules::qoder_instance::load_instance_store_for_platform(QoderPlatformKind::QwenWork)?;
    let default_dir = modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(QoderPlatformKind::QwenWork)?;
    let default_dir_str = default_dir.to_string_lossy().to_string();

    let default_settings = store.default_settings.clone();

    let mut result: Vec<InstanceProfileView> = store
        .instances
        .into_iter()
        .map(|instance| {
            let running_pid = resolve_running_pid(instance.last_pid, Some(&instance.user_data_dir));
            let running = running_pid.is_some();
            let initialized = is_profile_initialized(&instance.user_data_dir);
            let mut view = InstanceProfileView::from_profile(instance, running, initialized);
            view.last_pid = running_pid;
            view
        })
        .collect();

    let default_pid = resolve_running_pid(default_settings.last_pid, None);
    result.push(InstanceProfileView {
        id: DEFAULT_INSTANCE_ID.to_string(),
        name: String::new(),
        user_data_dir: default_dir_str,
        working_dir: None,
        extra_args: default_settings.extra_args.clone(),
        bind_account_id: default_settings.bind_account_id.clone(),
        created_at: 0,
        last_launched_at: None,
        last_pid: default_pid,
        running: default_pid.is_some(),
        initialized: is_profile_initialized(&default_dir.to_string_lossy()),
        is_default: true,
        follow_local_account: false,
    });

    Ok(result)
}

#[tauri::command]
pub async fn qwenwork_create_instance(
    name: String,
    user_data_dir: String,
    extra_args: Option<String>,
    bind_account_id: Option<String>,
    copy_source_instance_id: Option<String>,
    init_mode: Option<String>,
) -> Result<InstanceProfileView, String> {
    let instance = modules::qoder_instance::create_instance_for_platform(
        QoderPlatformKind::QwenWork,
        modules::qoder_instance::CreateInstanceParams {
            working_dir: None,
            name,
            user_data_dir,
            extra_args: extra_args.unwrap_or_default(),
            bind_account_id,
            copy_source_instance_id,
            init_mode,
        },
    )?;

    let initialized = is_profile_initialized(&instance.user_data_dir);
    Ok(InstanceProfileView::from_profile(
        instance,
        false,
        initialized,
    ))
}

#[tauri::command]
pub async fn qwenwork_update_instance(
    instance_id: String,
    name: Option<String>,
    extra_args: Option<String>,
    bind_account_id: Option<Option<String>>,
    follow_local_account: Option<bool>,
) -> Result<InstanceProfileView, String> {
    if instance_id == DEFAULT_INSTANCE_ID {
        let default_dir = modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(QoderPlatformKind::QwenWork)?;
        let default_dir_str = default_dir.to_string_lossy().to_string();
        let updated = modules::qoder_instance::update_default_settings_for_platform(
            QoderPlatformKind::QwenWork,
            bind_account_id,
            extra_args,
            follow_local_account,
        )?;
        let running_pid = resolve_running_pid(updated.last_pid, None);
        return Ok(InstanceProfileView {
            id: DEFAULT_INSTANCE_ID.to_string(),
            name: String::new(),
            user_data_dir: default_dir_str,
            working_dir: None,
            extra_args: updated.extra_args,
            bind_account_id: updated.bind_account_id,
            created_at: 0,
            last_launched_at: None,
            last_pid: running_pid,
            running: running_pid.is_some(),
            initialized: is_profile_initialized(&default_dir.to_string_lossy()),
            is_default: true,
            follow_local_account: false,
        });
    }

    let wants_bind = bind_account_id
        .as_ref()
        .and_then(|next| next.as_deref())
        .map(str::trim)
        .is_some_and(|value| !value.is_empty());
    if wants_bind {
        let store = modules::qoder_instance::load_instance_store_for_platform(QoderPlatformKind::QwenWork)?;
        if let Some(target) = store
            .instances
            .iter()
            .find(|item| item.id == instance_id)
        {
            if !is_profile_initialized(&target.user_data_dir) {
                let _ = std::fs::create_dir_all(&target.user_data_dir);
            }
        }
    }

    let instance = modules::qoder_instance::update_instance_for_platform(
        QoderPlatformKind::QwenWork,
        modules::qoder_instance::UpdateInstanceParams {
            working_dir: None,
            instance_id,
            name,
            extra_args,
            bind_account_id,
        },
    )?;

    let running_pid = resolve_running_pid(instance.last_pid, Some(&instance.user_data_dir));
    let running = running_pid.is_some();
    let initialized = is_profile_initialized(&instance.user_data_dir);
    let mut view = InstanceProfileView::from_profile(instance, running, initialized);
    view.last_pid = running_pid;
    Ok(view)
}

#[tauri::command]
pub async fn qwenwork_delete_instance(instance_id: String) -> Result<(), String> {
    if instance_id == DEFAULT_INSTANCE_ID {
        return Err("默认实例不可删除".to_string());
    }
    modules::qoder_instance::delete_instance_for_platform(QoderPlatformKind::QwenWork, &instance_id)
}

#[tauri::command]
pub async fn qwenwork_start_instance(instance_id: String) -> Result<InstanceProfileView, String> {
    let exec_path = modules::qwenwork_account::detect_qwenwork_exec_path()
        .ok_or_else(|| "APP_PATH_NOT_FOUND:qwenwork".to_string())?;

    if instance_id == DEFAULT_INSTANCE_ID {
        let default_dir = modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(QoderPlatformKind::QwenWork)?;
        let default_dir_str = default_dir.to_string_lossy().to_string();
        let default_settings = modules::qoder_instance::load_default_settings_for_platform(QoderPlatformKind::QwenWork)?;

        if let Some(pid) = resolve_running_pid(default_settings.last_pid, None) {
            let _ = modules::process::close_pid(pid, 20);
        }
        close_qwenwork_native_processes();
        let _ = modules::qoder_instance::update_default_pid_for_platform(QoderPlatformKind::QwenWork, None);

        inject_bound_account_for_instance_start(
            DEFAULT_INSTANCE_ID,
            &default_dir_str,
            default_settings.bind_account_id.as_deref(),
            true,
        )?;

        let mut cmd = Command::new(&exec_path);
        let extra_args = modules::process::parse_extra_args(&default_settings.extra_args);
        if !extra_args.is_empty() {
            cmd.args(&extra_args);
        }
        crate::modules::process::apply_managed_proxy_env_to_command(&mut cmd);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            if crate::modules::process::should_detach_child() {
                cmd.creation_flags(0x08000000 | 0x00000200 | 0x00000008);
                cmd.stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null());
            } else {
                cmd.creation_flags(0x08000000);
            }
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("启动千问办公失败: {}", e))?;
        let pid = child.id();
        let _ = modules::qoder_instance::update_default_pid_for_platform(QoderPlatformKind::QwenWork, Some(pid))?;

        return Ok(InstanceProfileView {
            id: DEFAULT_INSTANCE_ID.to_string(),
            name: String::new(),
            user_data_dir: default_dir_str,
            working_dir: None,
            extra_args: default_settings.extra_args,
            bind_account_id: default_settings.bind_account_id,
            created_at: 0,
            last_launched_at: None,
            last_pid: Some(pid),
            running: true,
            initialized: is_profile_initialized(&default_dir.to_string_lossy()),
            is_default: true,
            follow_local_account: false,
        });
    }

    let store = modules::qoder_instance::load_instance_store_for_platform(QoderPlatformKind::QwenWork)?;
    let instance = store
        .instances
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or("实例不存在")?;

    if let Some(pid) = resolve_running_pid(instance.last_pid, Some(&instance.user_data_dir)) {
        let _ = modules::process::close_pid(pid, 20);
        let _ = modules::qoder_instance::update_instance_pid_for_platform(
            QoderPlatformKind::QwenWork,
            &instance.id,
            None,
        );
    }
    close_qwenwork_native_processes();
    let _ = modules::qoder_instance::update_default_pid_for_platform(QoderPlatformKind::QwenWork, None);

    inject_bound_account_for_instance_start(
        &instance.id,
        &instance.user_data_dir,
        instance.bind_account_id.as_deref(),
        false,
    )?;

    let mut cmd = Command::new(&exec_path);
    cmd.arg(format!("--user-data-dir={}", instance.user_data_dir));
    let is_unbound = instance
        .bind_account_id
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty();
    modules::instance_fingerprint::apply_instance_isolation_and_fingerprint_to_command(
        &mut cmd,
        &instance.user_data_dir,
        is_unbound,
        false,
    );
    let extra_args = modules::process::parse_extra_args(&instance.extra_args);
    if !extra_args.is_empty() {
        cmd.args(&extra_args);
    }
    crate::modules::process::apply_managed_proxy_env_to_command(&mut cmd);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if crate::modules::process::should_detach_child() {
            cmd.creation_flags(0x08000000 | 0x00000200 | 0x00000008);
            cmd.stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
        } else {
            cmd.creation_flags(0x08000000);
        }
    }
    let child = cmd
        .spawn()
        .map_err(|e| format!("启动千问办公实例失败: {}", e))?;
    let pid = child.id();
    let updated = modules::qoder_instance::update_instance_after_start_for_platform(
        QoderPlatformKind::QwenWork,
        &instance.id,
        pid,
    )?;
    let initialized = is_profile_initialized(&updated.user_data_dir);
    Ok(InstanceProfileView::from_profile(
        updated,
        true,
        initialized,
    ))
}

#[tauri::command]
pub async fn qwenwork_stop_instance(instance_id: String) -> Result<InstanceProfileView, String> {
    if instance_id == DEFAULT_INSTANCE_ID {
        let default_dir = modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(QoderPlatformKind::QwenWork)?;
        let default_dir_str = default_dir.to_string_lossy().to_string();
        let default_settings = modules::qoder_instance::load_default_settings_for_platform(QoderPlatformKind::QwenWork)?;
        if let Some(pid) = default_settings.last_pid {
            let _ = modules::process::close_pid(pid, 10);
        }
        let _ = modules::qoder_instance::update_default_pid_for_platform(QoderPlatformKind::QwenWork, None)?;
        return Ok(InstanceProfileView {
            id: DEFAULT_INSTANCE_ID.to_string(),
            name: String::new(),
            user_data_dir: default_dir_str,
            working_dir: None,
            extra_args: default_settings.extra_args,
            bind_account_id: default_settings.bind_account_id,
            created_at: 0,
            last_launched_at: None,
            last_pid: None,
            running: false,
            initialized: is_profile_initialized(&default_dir.to_string_lossy()),
            is_default: true,
            follow_local_account: false,
        });
    }

    let store = modules::qoder_instance::load_instance_store_for_platform(QoderPlatformKind::QwenWork)?;
    let instance = store
        .instances
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or("实例不存在")?;

    if let Some(pid) = instance.last_pid {
        let _ = modules::process::close_pid(pid, 10);
    }
    let updated = modules::qoder_instance::update_instance_pid_for_platform(
        QoderPlatformKind::QwenWork,
        &instance.id,
        None,
    )?;
    let initialized = is_profile_initialized(&updated.user_data_dir);
    Ok(InstanceProfileView::from_profile(
        updated,
        false,
        initialized,
    ))
}

#[tauri::command]
pub async fn qwenwork_open_instance_window(instance_id: String) -> Result<(), String> {
    if instance_id == DEFAULT_INSTANCE_ID {
        let default_settings = modules::qoder_instance::load_default_settings_for_platform(QoderPlatformKind::QwenWork)?;
        if let Some(pid) = default_settings.last_pid {
            modules::process::focus_process_pid(pid)
                .map_err(|err| format!("定位千问办公默认实例窗口失败: {}", err))?;
            return Ok(());
        }
        return Err("默认实例未运行".to_string());
    }

    let store = modules::qoder_instance::load_instance_store_for_platform(QoderPlatformKind::QwenWork)?;
    let instance = store
        .instances
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or("实例不存在")?;
    if let Some(pid) = instance.last_pid {
        modules::process::focus_process_pid(pid).map_err(|err| {
            format!(
                "定位千问办公实例窗口失败: instance_id={}, error={}",
                instance.id, err
            )
        })?;
        return Ok(());
    }
    Err("实例未运行".to_string())
}

#[tauri::command]
pub async fn qwenwork_close_all_instances() -> Result<(), String> {
    let store = modules::qoder_instance::load_instance_store_for_platform(QoderPlatformKind::QwenWork)?;
    if let Some(pid) = store.default_settings.last_pid {
        let _ = modules::process::close_pid(pid, 10);
    }
    for instance in &store.instances {
        if let Some(pid) = instance.last_pid {
            let _ = modules::process::close_pid(pid, 10);
        }
    }
    let _ = modules::qoder_instance::clear_all_pids_for_platform(QoderPlatformKind::QwenWork);
    Ok(())
}
