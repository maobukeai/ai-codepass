use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::Utc;
use uuid::Uuid;

use crate::models::{DefaultInstanceSettings, InstanceProfile, InstanceStore};
use crate::modules;
use crate::modules::instance::InstanceDefaults;
use crate::modules::instance_store;
use crate::modules::qoder_account::QoderPlatformKind;

pub use crate::modules::instance_store::{CreateInstanceParams, UpdateInstanceParams};

static QODER_INSTANCE_STORE_LOCK: std::sync::LazyLock<Mutex<()>> =
    std::sync::LazyLock::new(|| Mutex::new(()));
static QODER_CN_INSTANCE_STORE_LOCK: std::sync::LazyLock<Mutex<()>> =
    std::sync::LazyLock::new(|| Mutex::new(()));
static QWENWORK_INSTANCE_STORE_LOCK: std::sync::LazyLock<Mutex<()>> =
    std::sync::LazyLock::new(|| Mutex::new(()));

const QODER_INSTANCES_FILE: &str = "qoder_instances.json";
const QODER_CN_INSTANCES_FILE: &str = "qoder_cn_instances.json";
const QWENWORK_INSTANCES_FILE: &str = "qwenwork_instances.json";

fn get_instance_store_lock(kind: QoderPlatformKind) -> &'static Mutex<()> {
    match kind {
        QoderPlatformKind::Global => &QODER_INSTANCE_STORE_LOCK,
        QoderPlatformKind::Cn => &QODER_CN_INSTANCE_STORE_LOCK,
        QoderPlatformKind::QwenWork => &QWENWORK_INSTANCE_STORE_LOCK,
    }
}

fn instances_file_name(kind: QoderPlatformKind) -> &'static str {
    match kind {
        QoderPlatformKind::Global => QODER_INSTANCES_FILE,
        QoderPlatformKind::Cn => QODER_CN_INSTANCES_FILE,
        QoderPlatformKind::QwenWork => QWENWORK_INSTANCES_FILE,
    }
}

fn instances_path_for_platform(kind: QoderPlatformKind) -> Result<PathBuf, String> {
    let data_dir = modules::account::get_data_dir()?;
    Ok(data_dir.join(instances_file_name(kind)))
}

fn instances_path() -> Result<PathBuf, String> {
    instances_path_for_platform(QoderPlatformKind::Global)
}

pub fn load_instance_store_for_platform(kind: QoderPlatformKind) -> Result<InstanceStore, String> {
    let path = instances_path_for_platform(kind)?;
    instance_store::load_instance_store(&path, instances_file_name(kind))
}

pub fn load_instance_store() -> Result<InstanceStore, String> {
    load_instance_store_for_platform(QoderPlatformKind::Global)
}

pub fn load_instance_store_cn() -> Result<InstanceStore, String> {
    load_instance_store_for_platform(QoderPlatformKind::Cn)
}

pub fn load_instance_store_qwenwork() -> Result<InstanceStore, String> {
    load_instance_store_for_platform(QoderPlatformKind::QwenWork)
}

pub fn save_instance_store_for_platform(kind: QoderPlatformKind, store: &InstanceStore) -> Result<(), String> {
    let path = instances_path_for_platform(kind)?;
    instance_store::save_instance_store(&path, instances_file_name(kind), store)
}

pub fn save_instance_store(store: &InstanceStore) -> Result<(), String> {
    save_instance_store_for_platform(QoderPlatformKind::Global, store)
}

pub fn save_instance_store_cn(store: &InstanceStore) -> Result<(), String> {
    save_instance_store_for_platform(QoderPlatformKind::Cn, store)
}

pub fn save_instance_store_qwenwork(store: &InstanceStore) -> Result<(), String> {
    save_instance_store_for_platform(QoderPlatformKind::QwenWork, store)
}

pub fn load_default_settings_for_platform(kind: QoderPlatformKind) -> Result<DefaultInstanceSettings, String> {
    let store = load_instance_store_for_platform(kind)?;
    Ok(store.default_settings)
}

pub fn load_default_settings() -> Result<DefaultInstanceSettings, String> {
    load_default_settings_for_platform(QoderPlatformKind::Global)
}

pub fn load_default_settings_cn() -> Result<DefaultInstanceSettings, String> {
    load_default_settings_for_platform(QoderPlatformKind::Cn)
}

pub fn update_default_settings_for_platform(
    kind: QoderPlatformKind,
    bind_account_id: Option<Option<String>>,
    extra_args: Option<String>,
    follow_local_account: Option<bool>,
) -> Result<DefaultInstanceSettings, String> {
    let _lock = get_instance_store_lock(kind)
        .lock()
        .map_err(|_| "无法获取实例锁")?;
    let mut store = load_instance_store_for_platform(kind)?;
    let settings = &mut store.default_settings;

    // Qoder 实例不支持“跟随当前账号”，直接忽略 follow_local_account。
    if follow_local_account == Some(true) {
        settings.follow_local_account = false;
    }

    if let Some(bind) = bind_account_id {
        settings.bind_account_id = bind;
        settings.follow_local_account = false;
    }

    if let Some(args) = extra_args {
        settings.extra_args = args.trim().to_string();
    }

    let updated = settings.clone();
    save_instance_store_for_platform(kind, &store)?;
    Ok(updated)
}

pub fn update_default_settings(
    bind_account_id: Option<Option<String>>,
    extra_args: Option<String>,
    follow_local_account: Option<bool>,
) -> Result<DefaultInstanceSettings, String> {
    update_default_settings_for_platform(QoderPlatformKind::Global, bind_account_id, extra_args, follow_local_account)
}

pub fn update_default_settings_cn(
    bind_account_id: Option<Option<String>>,
    extra_args: Option<String>,
    follow_local_account: Option<bool>,
) -> Result<DefaultInstanceSettings, String> {
    update_default_settings_for_platform(QoderPlatformKind::Cn, bind_account_id, extra_args, follow_local_account)
}

pub fn get_default_qoder_user_data_dir_for_platform(kind: QoderPlatformKind) -> Result<PathBuf, String> {
    if kind == QoderPlatformKind::QwenWork {
        return Ok(crate::modules::qwenwork_account::get_default_qwenwork_user_data_dir());
    }

    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir().ok_or("无法获取用户主目录")?;
        match kind {
            QoderPlatformKind::Global => {
                let stable = home.join("Library/Application Support/com.qoder.app.stable");
                if stable.exists() {
                    return Ok(stable);
                }
                Ok(home.join("Library/Application Support/Qoder"))
            }
            QoderPlatformKind::Cn | QoderPlatformKind::QwenWork => {
                let candidates = [
                    home.join("Library/Application Support/com.qodercn.app.stable"),
                    home.join("Library/Application Support/QoderCN"),
                    home.join("Library/Application Support/Qoder CN"),
                ];
                for candidate in candidates {
                    if candidate.exists() {
                        return Ok(candidate);
                    }
                }
                let vscode_lingma = home.join(".vscode/extensions");
                if vscode_lingma.exists() {
                    let storage = home.join("Library/Application Support/Code/User/globalStorage/alibaba-cloud.tongyi-lingma");
                    if storage.exists() {
                        return Ok(home.join("Library/Application Support/Code"));
                    }
                }
                Ok(home.join("Library/Application Support/com.qodercn.app.stable"))
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let appdata =
            std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA 环境变量".to_string())?;
        let appdata_path = PathBuf::from(appdata);
        return match kind {
            QoderPlatformKind::Global => {
                let candidates = [
                    appdata_path.join("com.qoder.app.stable"),
                    appdata_path.join("Qoder"),
                ];
                for candidate in candidates {
                    if candidate.exists() {
                        return Ok(candidate);
                    }
                }
                Ok(appdata_path.join("com.qoder.app.stable"))
            }
            QoderPlatformKind::Cn | QoderPlatformKind::QwenWork => {
                let candidates = [
                    appdata_path.join("com.qodercn.app.stable"),
                    appdata_path.join("QoderCN"),
                    appdata_path.join("Qoder CN"),
                    appdata_path.join("Qoder-CN"),
                ];
                for candidate in candidates {
                    if candidate.exists() {
                        return Ok(candidate);
                    }
                }
                Ok(appdata_path.join("com.qodercn.app.stable"))
            }
        };
    }

    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir().ok_or("无法获取用户主目录")?;
        match kind {
            QoderPlatformKind::Global => {
                let stable = home.join(".config/com.qoder.app.stable");
                if stable.exists() {
                    return Ok(stable);
                }
                Ok(home.join(".config/Qoder"))
            }
            QoderPlatformKind::Cn | QoderPlatformKind::QwenWork => {
                let candidates = [
                    home.join(".config/com.qodercn.app.stable"),
                    home.join(".config/QoderCN"),
                ];
                for candidate in candidates {
                    if candidate.exists() {
                        return Ok(candidate);
                    }
                }
                Ok(home.join(".config/com.qodercn.app.stable"))
            }
        }
    }

    #[allow(unreachable_code)]
    Err("Qoder 应用多开仅支持 macOS、Windows 和 Linux".to_string())
}

pub fn get_default_qoder_user_data_dir() -> Result<PathBuf, String> {
    get_default_qoder_user_data_dir_for_platform(QoderPlatformKind::Global)
}

pub fn get_default_qoder_user_data_dir_cn() -> Result<PathBuf, String> {
    get_default_qoder_user_data_dir_for_platform(QoderPlatformKind::Cn)
}

pub fn get_default_instances_root_dir_for_platform(kind: QoderPlatformKind) -> Result<PathBuf, String> {
    let sub = match kind {
        QoderPlatformKind::Global => "qoder",
        QoderPlatformKind::Cn => "qoder_cn",
        QoderPlatformKind::QwenWork => "qwenwork",
    };

    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir().ok_or("无法获取用户主目录")?;
        return Ok(home.join(format!(".ai_codepass/instances/{}", sub)));
    }

    #[cfg(target_os = "windows")]
    {
        let appdata =
            std::env::var("APPDATA").map_err(|_| "无法获取 APPDATA 环境变量".to_string())?;
        return Ok(PathBuf::from(appdata).join(format!(".ai_codepass\\instances\\{}", sub)));
    }

    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir().ok_or("无法获取用户主目录")?;
        return Ok(home.join(format!(".ai_codepass/instances/{}", sub)));
    }

    #[allow(unreachable_code)]
    Err("Qoder 应用多开仅支持 macOS、Windows 和 Linux".to_string())
}

pub fn get_default_instances_root_dir() -> Result<PathBuf, String> {
    get_default_instances_root_dir_for_platform(QoderPlatformKind::Global)
}

pub fn get_default_instances_root_dir_cn() -> Result<PathBuf, String> {
    get_default_instances_root_dir_for_platform(QoderPlatformKind::Cn)
}

pub fn get_instance_defaults_for_platform(kind: QoderPlatformKind) -> Result<InstanceDefaults, String> {
    let root_dir = get_default_instances_root_dir_for_platform(kind)?;
    let default_user_data_dir = get_default_qoder_user_data_dir_for_platform(kind)?;
    Ok(InstanceDefaults {
        root_dir: root_dir.to_string_lossy().to_string(),
        default_user_data_dir: default_user_data_dir.to_string_lossy().to_string(),
    })
}

pub fn get_instance_defaults() -> Result<InstanceDefaults, String> {
    get_instance_defaults_for_platform(QoderPlatformKind::Global)
}

pub fn get_instance_defaults_cn() -> Result<InstanceDefaults, String> {
    get_instance_defaults_for_platform(QoderPlatformKind::Cn)
}

pub fn create_instance_for_platform(
    kind: QoderPlatformKind,
    params: CreateInstanceParams,
) -> Result<InstanceProfile, String> {
    let _lock = get_instance_store_lock(kind)
        .lock()
        .map_err(|_| "无法获取实例锁")?;
    let mut store = load_instance_store_for_platform(kind)?;

    let name = instance_store::normalize_name(&params.name)?;
    let user_data_dir = params.user_data_dir.trim().to_string();
    if user_data_dir.is_empty() {
        return Err("实例目录不能为空".to_string());
    }

    instance_store::ensure_unique(&store, &name, &user_data_dir, None)?;

    let user_dir_path = PathBuf::from(&user_data_dir);
    let init_mode = params
        .init_mode
        .as_deref()
        .unwrap_or("copy")
        .to_ascii_lowercase();
    let create_empty = init_mode == "empty";
    let use_existing_dir = init_mode == "existingdir" || init_mode == "existing_dir";

    if use_existing_dir {
        if !user_dir_path.exists() {
            let resolved = instance_store::display_path(&user_dir_path);
            return Err(format!("所选目录不存在: {}", resolved));
        }
        if !user_dir_path.is_dir() {
            return Err("所选路径不是目录".to_string());
        }
    } else if create_empty {
        if user_dir_path.exists() {
            let mut has_entries = false;
            if let Ok(mut iter) = fs::read_dir(&user_dir_path) {
                if iter.next().is_some() {
                    has_entries = true;
                }
            }
            if has_entries {
                let resolved_path = instance_store::display_path(&user_dir_path);
                return Err(format!("空白实例需要目标目录为空: {}", resolved_path));
            }
        }
        fs::create_dir_all(&user_dir_path).map_err(|e| format!("创建实例目录失败: {}", e))?;
    } else {
        let source_dir = match params.copy_source_instance_id.as_deref() {
            Some("__default__") | None => get_default_qoder_user_data_dir_for_platform(kind)?,
            Some(source_id) => {
                let source_instance = store
                    .instances
                    .iter()
                    .find(|item| item.id == source_id)
                    .ok_or("复制来源实例不存在")?;
                PathBuf::from(&source_instance.user_data_dir)
            }
        };

        if user_dir_path.exists() {
            let mut has_entries = false;
            if let Ok(mut iter) = fs::read_dir(&user_dir_path) {
                if iter.next().is_some() {
                    has_entries = true;
                }
            }
            if has_entries {
                let resolved_path = instance_store::display_path(&user_dir_path);
                modules::logger::log_info(&format!(
                    "[{}] 复制来源实例需要空目录，但目标已存在: {}",
                    kind.display_name(),
                    resolved_path
                ));
                return Err(format!("复制来源实例需要目标目录为空: {}", resolved_path));
            }
        }

        if !source_dir.exists() {
            return Err("未找到复制来源目录，请先确保来源实例已初始化".to_string());
        }

        instance_store::copy_dir_recursive(&source_dir, &user_dir_path)?;
    }

    let instance = InstanceProfile {
        id: Uuid::new_v4().to_string(),
        name,
        user_data_dir,
        working_dir: params.working_dir,
        extra_args: params.extra_args.trim().to_string(),
        bind_account_id: if create_empty {
            None
        } else {
            params.bind_account_id
        },
        model_routing: None,
        launch_mode: crate::models::InstanceLaunchMode::App,
        app_speed: crate::models::instance::CodexAppSpeed::Standard,
        created_at: Utc::now().timestamp_millis(),
        last_launched_at: None,
        last_pid: None,
    };

    store.instances.push(instance.clone());
    save_instance_store_for_platform(kind, &store)?;
    Ok(instance)
}

pub fn create_instance(params: CreateInstanceParams) -> Result<InstanceProfile, String> {
    create_instance_for_platform(QoderPlatformKind::Global, params)
}

pub fn create_instance_cn(params: CreateInstanceParams) -> Result<InstanceProfile, String> {
    create_instance_for_platform(QoderPlatformKind::Cn, params)
}

pub fn update_instance_for_platform(
    kind: QoderPlatformKind,
    params: UpdateInstanceParams,
) -> Result<InstanceProfile, String> {
    let _lock = get_instance_store_lock(kind)
        .lock()
        .map_err(|_| "无法获取实例锁")?;
    let mut store = load_instance_store_for_platform(kind)?;
    let index = store
        .instances
        .iter()
        .position(|instance| instance.id == params.instance_id)
        .ok_or("实例不存在")?;

    let current_id = store.instances[index].id.clone();
    let current_dir = store.instances[index].user_data_dir.clone();
    let next_name = params
        .name
        .as_ref()
        .map(|name| instance_store::normalize_name(name))
        .transpose()?;

    if let Some(ref normalized) = next_name {
        instance_store::ensure_unique(&store, normalized, &current_dir, Some(&current_id))?;
    }

    let instance = &mut store.instances[index];
    if let Some(normalized) = next_name {
        instance.name = normalized;
    }
    if let Some(ref extra_args) = params.extra_args {
        instance.extra_args = extra_args.trim().to_string();
    }
    if let Some(bind) = params.bind_account_id.clone() {
        instance.bind_account_id = bind;
    }

    let updated = instance.clone();
    save_instance_store_for_platform(kind, &store)?;
    Ok(updated)
}

pub fn update_instance(params: UpdateInstanceParams) -> Result<InstanceProfile, String> {
    update_instance_for_platform(QoderPlatformKind::Global, params)
}

pub fn update_instance_cn(params: UpdateInstanceParams) -> Result<InstanceProfile, String> {
    update_instance_for_platform(QoderPlatformKind::Cn, params)
}

pub fn delete_instance_for_platform(kind: QoderPlatformKind, instance_id: &str) -> Result<(), String> {
    let _lock = get_instance_store_lock(kind)
        .lock()
        .map_err(|_| "无法获取实例锁")?;
    let mut store = load_instance_store_for_platform(kind)?;
    let index = store
        .instances
        .iter()
        .position(|instance| instance.id == instance_id)
        .ok_or("实例不存在")?;
    let user_data_dir = store.instances[index].user_data_dir.clone();

    if !user_data_dir.trim().is_empty() {
        let dir_path = PathBuf::from(&user_data_dir);
        modules::instance::delete_instance_directory(&dir_path)?;
    }

    store.instances.remove(index);
    save_instance_store_for_platform(kind, &store)?;
    Ok(())
}

pub fn delete_instance(instance_id: &str) -> Result<(), String> {
    delete_instance_for_platform(QoderPlatformKind::Global, instance_id)
}

pub fn delete_instance_cn(instance_id: &str) -> Result<(), String> {
    delete_instance_for_platform(QoderPlatformKind::Cn, instance_id)
}

pub fn update_instance_after_start_for_platform(
    kind: QoderPlatformKind,
    instance_id: &str,
    pid: u32,
) -> Result<InstanceProfile, String> {
    let _lock = get_instance_store_lock(kind)
        .lock()
        .map_err(|_| "无法获取实例锁")?;
    let mut store = load_instance_store_for_platform(kind)?;
    let mut updated = None;
    for instance in &mut store.instances {
        if instance.id == instance_id {
            instance.last_launched_at = Some(Utc::now().timestamp_millis());
            instance.last_pid = Some(pid);
            updated = Some(instance.clone());
            break;
        }
    }
    let updated = updated.ok_or("实例不存在")?;
    save_instance_store_for_platform(kind, &store)?;
    Ok(updated)
}

pub fn update_instance_after_start(instance_id: &str, pid: u32) -> Result<InstanceProfile, String> {
    update_instance_after_start_for_platform(QoderPlatformKind::Global, instance_id, pid)
}

pub fn update_instance_after_start_cn(instance_id: &str, pid: u32) -> Result<InstanceProfile, String> {
    update_instance_after_start_for_platform(QoderPlatformKind::Cn, instance_id, pid)
}

pub fn update_instance_pid_for_platform(
    kind: QoderPlatformKind,
    instance_id: &str,
    pid: Option<u32>,
) -> Result<InstanceProfile, String> {
    let _lock = get_instance_store_lock(kind)
        .lock()
        .map_err(|_| "无法获取实例锁")?;
    let mut store = load_instance_store_for_platform(kind)?;
    let mut updated = None;
    for instance in &mut store.instances {
        if instance.id == instance_id {
            instance.last_pid = pid;
            updated = Some(instance.clone());
            break;
        }
    }
    let updated = updated.ok_or("实例不存在")?;
    save_instance_store_for_platform(kind, &store)?;
    Ok(updated)
}

pub fn update_instance_pid(instance_id: &str, pid: Option<u32>) -> Result<InstanceProfile, String> {
    update_instance_pid_for_platform(QoderPlatformKind::Global, instance_id, pid)
}

pub fn update_instance_pid_cn(instance_id: &str, pid: Option<u32>) -> Result<InstanceProfile, String> {
    update_instance_pid_for_platform(QoderPlatformKind::Cn, instance_id, pid)
}

pub fn update_default_pid_for_platform(
    kind: QoderPlatformKind,
    pid: Option<u32>,
) -> Result<DefaultInstanceSettings, String> {
    let _lock = get_instance_store_lock(kind)
        .lock()
        .map_err(|_| "无法获取实例锁")?;
    let mut store = load_instance_store_for_platform(kind)?;
    store.default_settings.last_pid = pid;
    let updated = store.default_settings.clone();
    save_instance_store_for_platform(kind, &store)?;
    Ok(updated)
}

pub fn update_default_pid(pid: Option<u32>) -> Result<DefaultInstanceSettings, String> {
    update_default_pid_for_platform(QoderPlatformKind::Global, pid)
}

pub fn update_default_pid_cn(pid: Option<u32>) -> Result<DefaultInstanceSettings, String> {
    update_default_pid_for_platform(QoderPlatformKind::Cn, pid)
}

pub fn clear_all_pids_for_platform(kind: QoderPlatformKind) -> Result<(), String> {
    let _lock = get_instance_store_lock(kind)
        .lock()
        .map_err(|_| "无法获取实例锁")?;
    let mut store = load_instance_store_for_platform(kind)?;
    store.default_settings.last_pid = None;
    for instance in &mut store.instances {
        instance.last_pid = None;
    }
    save_instance_store_for_platform(kind, &store)?;
    Ok(())
}

pub fn clear_all_pids() -> Result<(), String> {
    clear_all_pids_for_platform(QoderPlatformKind::Global)
}

pub fn clear_all_pids_cn() -> Result<(), String> {
    clear_all_pids_for_platform(QoderPlatformKind::Cn)
}
