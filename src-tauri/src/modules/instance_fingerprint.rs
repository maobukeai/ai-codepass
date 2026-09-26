use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

use crate::modules::logger;

const FINGERPRINT_FILE_NAME: &str = ".codepass_fingerprint.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceFingerprintProfile {
    pub fingerprint_id: String,
    pub machine_guid: String,
    pub telemetry_machine_id: String,
    pub dev_device_id: String,
    pub sqm_id: String,
    pub service_machine_id: String,
    pub mac_address: String,
    pub smbios_uuid: String,
    pub disk_serial: String,
    pub hostname: String,
    pub os_build: String,
    pub cpu_model: String,
    pub gpu_renderer: String,
    pub isolation_level: String,
    pub sandbox_enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

fn deterministic_or_random_seed(seed_hint: Option<&str>) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(Uuid::new_v4().as_bytes());
    hasher.update(Utc::now().timestamp_nanos_opt().unwrap_or(0).to_le_bytes());
    if let Some(hint) = seed_hint {
        hasher.update(hint.as_bytes());
    }
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

pub fn generate_fingerprint_profile(seed_hint: Option<&str>) -> InstanceFingerprintProfile {
    let bytes = deterministic_or_random_seed(seed_hint);
    let now = Utc::now().timestamp_millis();

    let machine_guid = Uuid::new_v4().to_string().to_lowercase();
    let dev_device_id = Uuid::new_v4().to_string().to_lowercase();
    let service_machine_id = Uuid::new_v4().to_string().to_lowercase();
    let sqm_id = format!("{{{}}}", Uuid::new_v4().to_string().to_uppercase());
    let smbios_uuid = Uuid::new_v4().to_string().to_uppercase();

    let mut machine_id_hasher = Sha256::new();
    machine_id_hasher.update(machine_guid.as_bytes());
    machine_id_hasher.update(&bytes);
    let telemetry_machine_id = format!("{:x}", machine_id_hasher.finalize());

    let fingerprint_id = format!("FP-{}", &telemetry_machine_id[..8].to_uppercase());

    // Realistic IEEE OUI prefixes (Intel, Realtek, ASUS, Gigabyte)
    let oui_prefixes: [&[u8; 3]; 4] = [
        &[0x00, 0xE0, 0x4C],
        &[0xA8, 0xA1, 0x59],
        &[0xD8, 0xBB, 0xC1],
        &[0x04, 0xD4, 0xC4],
    ];
    let oui = oui_prefixes[(bytes[0] as usize) % oui_prefixes.len()];
    let mac_address = format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        oui[0], oui[1], oui[2], bytes[1], bytes[2], bytes[3]
    );

    let alphanum: &[u8] = b"0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let mut host_suffix = String::with_capacity(7);
    for i in 0..7 {
        let idx = (bytes[4 + i] as usize) % alphanum.len();
        host_suffix.push(alphanum[idx] as char);
    }
    let hostname = format!("DESKTOP-{}", host_suffix);

    let mut serial_suffix = String::with_capacity(8);
    for i in 0..8 {
        let idx = (bytes[12 + i] as usize) % alphanum.len();
        serial_suffix.push(alphanum[idx] as char);
    }
    let disk_serial = format!("S69ENX0{}", serial_suffix);

    let os_builds = [
        "10.0.22631.4317",
        "10.0.22631.4169",
        "10.0.26100.2033",
        "10.0.26100.2314",
        "10.0.22621.3880",
    ];
    let os_build = os_builds[(bytes[20] as usize) % os_builds.len()].to_string();

    let cpu_models = [
        "13th Gen Intel(R) Core(TM) i7-13700K",
        "14th Gen Intel(R) Core(TM) i7-14700KF",
        "AMD Ryzen 7 7800X3D 8-Core Processor",
        "AMD Ryzen 9 7950X 16-Core Processor",
        "Intel(R) Core(TM) Ultra 7 155H",
    ];
    let cpu_model = cpu_models[(bytes[21] as usize) % cpu_models.len()].to_string();

    let gpu_renderers = [
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
    ];
    let gpu_renderer = gpu_renderers[(bytes[22] as usize) % gpu_renderers.len()].to_string();

    InstanceFingerprintProfile {
        fingerprint_id,
        machine_guid,
        telemetry_machine_id,
        dev_device_id,
        sqm_id,
        service_machine_id,
        mac_address,
        smbios_uuid,
        disk_serial,
        hostname,
        os_build,
        cpu_model,
        gpu_renderer,
        isolation_level: "L2_SYSTEM_HARDWARE_SANDBOX".to_string(),
        sandbox_enabled: true,
        created_at: now,
        updated_at: now,
    }
}

pub fn fingerprint_file_path(user_data_dir: &Path) -> PathBuf {
    user_data_dir.join(FINGERPRINT_FILE_NAME)
}

pub fn load_or_create_fingerprint(user_data_dir: &Path) -> Result<InstanceFingerprintProfile, String> {
    if !user_data_dir.exists() {
        fs::create_dir_all(user_data_dir)
            .map_err(|e| format!("创建实例目录失败 ({}): {}", user_data_dir.display(), e))?;
    }

    let fp_path = fingerprint_file_path(user_data_dir);
    if fp_path.exists() {
        if let Ok(raw) = fs::read_to_string(&fp_path) {
            if let Ok(profile) = serde_json::from_str::<InstanceFingerprintProfile>(&raw) {
                return Ok(profile);
            }
        }
    }

    let profile = generate_fingerprint_profile(Some(&user_data_dir.to_string_lossy()));
    save_fingerprint(user_data_dir, &profile)?;
    let _ = inject_fingerprint_into_instance_storage(user_data_dir, &profile);
    Ok(profile)
}

pub fn regenerate_fingerprint(user_data_dir: &Path) -> Result<InstanceFingerprintProfile, String> {
    if !user_data_dir.exists() {
        fs::create_dir_all(user_data_dir)
            .map_err(|e| format!("创建实例目录失败 ({}): {}", user_data_dir.display(), e))?;
    }

    let mut profile = generate_fingerprint_profile(None);
    if let Ok(existing) = load_or_create_fingerprint(user_data_dir) {
        profile.created_at = existing.created_at;
    }
    save_fingerprint(user_data_dir, &profile)?;
    let _ = purge_residual_account_credentials(user_data_dir);
    let _ = fs::remove_file(user_data_dir.join(".codepass_slot_initialized"));
    inject_fingerprint_into_instance_storage(user_data_dir, &profile)?;

    // 若该目录对应的实例当前处于活跃槽位，同步刷新实时运行目录中的硬件指纹与未登录状态
    for kind in [
        crate::modules::qoder_account::QoderPlatformKind::Global,
        crate::modules::qoder_account::QoderPlatformKind::Cn,
        crate::modules::qoder_account::QoderPlatformKind::QwenWork,
    ] {
        if let Ok(default_dir) =
            crate::modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(kind)
        {
            if default_dir == user_data_dir {
                inject_qoder_family_fingerprint(kind, &default_dir, user_data_dir, &profile);
            } else if let Ok(store) =
                crate::modules::qoder_instance::load_instance_store_for_platform(kind)
            {
                let active_id = fs::read_to_string(default_dir.join(".codepass_active_instance_id"))
                    .ok()
                    .map(|s| s.trim().to_string());
                if let Some(inst) = store
                    .instances
                    .iter()
                    .find(|i| Path::new(i.user_data_dir.trim()) == user_data_dir)
                {
                    if active_id.as_deref() == Some(inst.id.as_str()) {
                        if inst.bind_account_id.as_deref().map(str::trim).unwrap_or("").is_empty() {
                            clear_qoder_family_live_state(kind, &default_dir, true);
                        }
                        inject_qoder_family_fingerprint(kind, &default_dir, user_data_dir, &profile);
                    }
                }
            }
        }
    }

    logger::log_info(&format!(
        "[Fingerprint] 实例硬件指纹已重置: dir={}, fp_id={}, machine_guid={}, mac={}",
        user_data_dir.display(),
        profile.fingerprint_id,
        profile.machine_guid,
        profile.mac_address
    ));
    Ok(profile)
}

pub fn save_fingerprint(
    user_data_dir: &Path,
    profile: &InstanceFingerprintProfile,
) -> Result<(), String> {
    if !user_data_dir.exists() {
        fs::create_dir_all(user_data_dir)
            .map_err(|e| format!("创建实例目录失败 ({}): {}", user_data_dir.display(), e))?;
    }
    let fp_path = fingerprint_file_path(user_data_dir);
    let content = serde_json::to_string_pretty(profile)
        .map_err(|e| format!("序列化硬件指纹失败: {}", e))?;
    fs::write(&fp_path, content).map_err(|e| format!("写入硬件指纹档案失败: {}", e))
}

/// 深度清理空白实例或待重置实例中的残留账号状态与聊天会话数据（防止读取或残留旧账号数据）
pub fn purge_residual_account_credentials(user_data_dir: &Path) -> Result<(), String> {
    if !user_data_dir.exists() {
        return Ok(());
    }

    // 1. 清理 Qoder / Qoder CN / QwenWork / WorkBuddy / Electron 加密凭证与本地会话数据库
    for rel in [
        "auth.dat",
        "auth.v1.dat",
        "auth.v1.lock",
        "auth-v2.dat",
        "auth-v2.dat.json",
        "auth-profile-overlays.v1.dat",
        "qoder-data.v1.json",
        "qoder-data.v1.ext.json",
        "main.sqlite",
        "main.sqlite-wal",
        "main.sqlite-shm",
        "chat-session-turn-payload-buffer.sqlite",
        "chat-session-turn-payload-buffer.sqlite-wal",
        "chat-session-turn-payload-buffer.sqlite-shm",
        "sessionMigration.sqlite",
        "memoryMigration.sqlite",
        "first-launch-onboarding.v1.json",
        "data/agents.db",
        "data/agents.db-wal",
        "data/agents.db-shm",
        ".migration-state.json",
        ".builtin-defaults-state-v3.json",
        ".qoder-app-status.json",
        ".status.json",
        ".qwenworkcn/.status.json",
        ".sandbox/home/.qwenworkcn/.status.json",
        ".sandbox/home/.qoder/.qoder-app-status.json",
        ".sandbox/home/.qoder-cn/.qoder-app-status.json",
        ".sandbox/appdata/Roaming/QwenWorkCN/auth.dat",
        ".sandbox/appdata/Roaming/QwenWorkCN/auth-v2.dat",
        ".sandbox/appdata/Roaming/QwenWorkCN/auth-v2.dat.json",
        "keyblob",
        "user-state.json",
        "workbuddy.db",
        "workbuddy.db-wal",
        "workbuddy.db-shm",
        "edge-sync-mapping-v4.db",
        "edge-sync-mapping-v4.db-wal",
        "edge-sync-mapping-v4.db-shm",
        "workspace-state.json",
        "last-launch.json",
        "Network/Cookies",
        "Network/Cookies-journal",
        "Network/Trust Tokens",
        "Network/Trust Tokens-journal",
        "Network/TransportSecurity",
        "SharedStorage",
        "SharedStorage-wal",
        "app/Network/Cookies",
        "app/Network/Cookies-journal",
        "app/Network/Trust Tokens",
        "app/Network/Trust Tokens-journal",
        "app/Network/TransportSecurity",
        "app/SharedStorage",
        "app/SharedStorage-wal",
    ] {
        let target = user_data_dir.join(rel);
        if target.exists() {
            let _ = fs::remove_file(&target);
        }
    }

    // 清理 Chromium / Electron 及 WorkBuddy 持久化的 WebView 登录态与会话目录
    for dir_rel in [
        "Session Storage",
        "Local Storage",
        "WebStorage",
        "IndexedDB",
        "local_storage",
        "storage",
        "sessions",
        "app/Session Storage",
        "app/Local Storage",
        "app/WebStorage",
        "app/IndexedDB",
    ] {
        let dir_target = user_data_dir.join(dir_rel);
        if dir_target.is_dir() {
            let _ = fs::remove_dir_all(&dir_target);
        }
    }

    // 2. 清理 storage.json 中的账号字段（保留新的指纹字段）
    for storage_rel in [
        PathBuf::from("User").join("globalStorage").join("storage.json"),
        PathBuf::from("storage.json"),
        PathBuf::from("app")
            .join("User")
            .join("globalStorage")
            .join("storage.json"),
        PathBuf::from("app").join("storage.json"),
    ] {
        let storage_path = user_data_dir.join(storage_rel);
        if storage_path.exists() {
            if let Ok(content) = fs::read_to_string(&storage_path) {
                if let Ok(mut val) = serde_json::from_str::<Value>(&content) {
                    if let Some(obj) = val.as_object_mut() {
                        let keys_to_remove: Vec<String> = obj
                            .keys()
                            .filter(|k| {
                                let lower = k.to_ascii_lowercase();
                                lower.contains("icubeauth")
                                    || lower.contains("icubeserver")
                                    || lower.contains("aicoding.auth")
                                    || lower.contains("coding-copilot")
                                    || lower.contains("planning-genie")
                                    || lower.contains("oauth")
                                    || lower.contains("qoder")
                                    || lower.contains("lingma")
                                    || lower.contains("tongyi")
                                    || lower.contains("trae")
                                    || lower.contains("marscode")
                                    || lower.contains("codebuddy")
                                    || lower.contains("workbuddy")
                                    || lower.contains("antigravity.auth")
                            })
                            .cloned()
                            .collect();
                        for k in keys_to_remove {
                            obj.remove(&k);
                        }
                        if let Ok(updated) = serde_json::to_string_pretty(&val) {
                            let _ = fs::write(&storage_path, updated);
                        }
                    }
                }
            }
        }
    }

    // 3. 清理 state.vscdb 中的残留登录态 secret 与账号状态
    for db_rel in [
        PathBuf::from("User").join("globalStorage").join("state.vscdb"),
        PathBuf::from("globalStorage").join("state.vscdb"),
        PathBuf::from("state.vscdb"),
        PathBuf::from("app")
            .join("User")
            .join("globalStorage")
            .join("state.vscdb"),
    ] {
        let db_path = user_data_dir.join(db_rel);
        if db_path.is_file() {
            if let Ok(conn) = Connection::open(&db_path) {
                let _ = conn.execute(
                    "DELETE FROM ItemTable WHERE key LIKE 'secret://%' OR key LIKE '%aicoding.auth%' OR key LIKE '%coding-copilot%' OR key LIKE '%planning-genie%' OR key LIKE '%iCubeAuth%' OR key LIKE '%qoder%' OR key LIKE '%lingma%' OR key LIKE '%trae%' OR key LIKE '%antigravity.auth%' OR key LIKE '%jetski%'",
                    [],
                );
            }
        }
    }

    Ok(())
}

/// 将系统与硬件指纹写入实例目录的 storage.json、state.vscdb、auth.machine-id 与沙箱设备描述文件
pub fn inject_fingerprint_into_instance_storage(
    user_data_dir: &Path,
    profile: &InstanceFingerprintProfile,
) -> Result<(), String> {
    let global_storage_dir = user_data_dir.join("User").join("globalStorage");
    fs::create_dir_all(&global_storage_dir)
        .map_err(|e| format!("创建 globalStorage 目录失败: {}", e))?;

    // 确保独立的 extensions 目录存在，防止回退加载宿主机全局插件与插件缓存
    let extensions_dir = user_data_dir.join("extensions");
    let _ = fs::create_dir_all(&extensions_dir);

    let storage_path = global_storage_dir.join("storage.json");
    let mut root_obj: Map<String, Value> = if storage_path.exists() {
        fs::read_to_string(&storage_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default()
    } else {
        Map::new()
    };

    root_obj.insert(
        "telemetry.machineId".to_string(),
        Value::String(profile.telemetry_machine_id.clone()),
    );
    root_obj.insert(
        "telemetry.macMachineId".to_string(),
        Value::String(profile.telemetry_machine_id.clone()),
    );
    root_obj.insert(
        "telemetry.devDeviceId".to_string(),
        Value::String(profile.dev_device_id.clone()),
    );
    root_obj.insert(
        "telemetry.sqmId".to_string(),
        Value::String(profile.sqm_id.clone()),
    );
    root_obj.insert(
        "storage.serviceMachineId".to_string(),
        Value::String(profile.service_machine_id.clone()),
    );
    root_obj.insert(
        "device.machineGuid".to_string(),
        Value::String(profile.machine_guid.clone()),
    );
    root_obj.insert(
        "device.macAddress".to_string(),
        Value::String(profile.mac_address.clone()),
    );
    root_obj.insert(
        "device.smbiosUuid".to_string(),
        Value::String(profile.smbios_uuid.clone()),
    );
    root_obj.insert(
        "device.diskSerial".to_string(),
        Value::String(profile.disk_serial.clone()),
    );
    root_obj.insert(
        "device.hostname".to_string(),
        Value::String(profile.hostname.clone()),
    );

    let updated_json = serde_json::to_string_pretty(&Value::Object(root_obj))
        .map_err(|e| format!("序列化 storage.json 失败: {}", e))?;
    fs::write(&storage_path, &updated_json)
        .map_err(|e| format!("写入 storage.json 失败: {}", e))?;

    // 同步写入根目录 storage.json、auth.machine-id 与 machineid (兼容 Qoder 0.4.2+ / VS Code 变体)
    let root_storage_path = user_data_dir.join("storage.json");
    let _ = fs::write(&root_storage_path, &updated_json);
    let _ = fs::write(
        user_data_dir.join("auth.machine-id"),
        &profile.telemetry_machine_id,
    );
    let _ = fs::write(user_data_dir.join("machineid"), &profile.machine_guid);
    let _ = fs::write(
        user_data_dir.join("machine-id"),
        &profile.telemetry_machine_id,
    );

    // 兼容 WorkBuddy / CodeBuddy 独立设备码 (device-id / qimei-cache.json / .legacy-localstorage-migration.done)
    let _ = fs::write(user_data_dir.join("device-id"), &profile.dev_device_id);
    let qimei36: String = profile.telemetry_machine_id.chars().take(36).collect();
    let qimei_json = json!({ "qimei36": qimei36 });
    if let Ok(qimei_str) = serde_json::to_string(&qimei_json) {
        let _ = fs::write(user_data_dir.join("qimei-cache.json"), qimei_str);
    }
    let migration_done = json!({
        "schemaVersion": 1,
        "migrationVersion": 1,
        "status": "applied",
        "completedAt": chrono::Utc::now().timestamp_millis()
    });
    if let Ok(mig_str) = serde_json::to_string_pretty(&migration_done) {
        let _ = fs::write(
            user_data_dir.join(".legacy-localstorage-migration.done"),
            &mig_str,
        );
        let app_subdir = user_data_dir.join("app");
        if app_subdir.is_dir() {
            let _ = fs::write(
                app_subdir.join(".legacy-localstorage-migration.done"),
                &mig_str,
            );
            let _ = fs::write(app_subdir.join("storage.json"), &updated_json);
            let _ = fs::write(app_subdir.join("machineid"), &profile.machine_guid);
        }
    }

    // 同步写入 state.vscdb 中的机器码条目
    let state_db_path = global_storage_dir.join("state.vscdb");
    if let Ok(conn) = Connection::open(&state_db_path) {
        let _ = conn.execute(
            "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)",
            [],
        );
        for (k, v) in [
            ("telemetry.machineId", profile.telemetry_machine_id.as_str()),
            ("telemetry.devDeviceId", profile.dev_device_id.as_str()),
            ("telemetry.sqmId", profile.sqm_id.as_str()),
            ("storage.serviceMachineId", profile.service_machine_id.as_str()),
            ("device.machineGuid", profile.machine_guid.as_str()),
        ] {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?1, ?2)",
                [k, v],
            );
        }
    }

    // 初始化实例专属沙箱目录 (.sandbox/home 与 .sandbox/appdata)
    let sandbox_home = user_data_dir.join(".sandbox").join("home");
    let sandbox_roaming = user_data_dir.join(".sandbox").join("appdata").join("Roaming");
    let sandbox_local = user_data_dir.join(".sandbox").join("appdata").join("Local");
    let _ = fs::create_dir_all(&sandbox_home);
    let _ = fs::create_dir_all(&sandbox_roaming);
    let _ = fs::create_dir_all(&sandbox_local);

    let device_manifest = json!({
        "fingerprintId": profile.fingerprint_id,
        "machineGuid": profile.machine_guid,
        "machineId": profile.telemetry_machine_id,
        "devDeviceId": profile.dev_device_id,
        "sqmId": profile.sqm_id,
        "macAddress": profile.mac_address,
        "smbiosUuid": profile.smbios_uuid,
        "diskSerial": profile.disk_serial,
        "hostname": profile.hostname,
        "osBuild": profile.os_build,
        "cpuModel": profile.cpu_model,
        "gpuRenderer": profile.gpu_renderer,
    });
    if let Ok(manifest_str) = serde_json::to_string_pretty(&device_manifest) {
        for dot_name in [
            ".qwenworkcn",
            ".qoder",
            ".qoder-cn",
            ".trae",
            ".trae-cn",
            ".codebuddy",
            ".workbuddy",
        ] {
            let sub_dir = sandbox_home.join(dot_name);
            let _ = fs::create_dir_all(sub_dir.join(".auth"));
            let _ = fs::write(sub_dir.join(".device.json"), &manifest_str);
            let _ = fs::write(
                sub_dir.join(".auth").join("machine_id"),
                &profile.telemetry_machine_id,
            );
            let _ = fs::write(sub_dir.join("machine-id"), &profile.telemetry_machine_id);
            let _ = fs::write(sub_dir.join("installation_id"), &profile.dev_device_id);
            let _ = fs::write(sub_dir.join("device-id"), &profile.dev_device_id);
        }
        let _ = fs::write(user_data_dir.join(".device.json"), &manifest_str);
    }

    Ok(())
}

/// 在启动非默认实例子进程时，注入独立的系统与硬件指纹环境变量及沙箱目录隔离参数
pub fn apply_instance_isolation_and_fingerprint_to_command(
    cmd: &mut Command,
    user_data_dir: &str,
    purge_if_unbound: bool,
    append_extensions_dir_arg: bool,
) {
    let target_path = Path::new(user_data_dir.trim());
    if user_data_dir.trim().is_empty() {
        return;
    }

    if purge_if_unbound {
        let _ = purge_residual_account_credentials(target_path);
    }

    let profile = match load_or_create_fingerprint(target_path) {
        Ok(p) => p,
        Err(e) => {
            logger::log_warn(&format!(
                "[Fingerprint] 加载或生成实例指纹失败，使用临时指纹: {}",
                e
            ));
            generate_fingerprint_profile(Some(user_data_dir))
        }
    };
    let _ = inject_fingerprint_into_instance_storage(target_path, &profile);

    let extensions_dir = target_path.join("extensions");
    let _ = fs::create_dir_all(&extensions_dir);
    if append_extensions_dir_arg {
        cmd.arg("--extensions-dir")
            .arg(extensions_dir.to_string_lossy().to_string());
    }

    // 注入系统与硬件指纹隔离层环境变量
    cmd.env("COMPUTERNAME", &profile.hostname);
    cmd.env("HOSTNAME", &profile.hostname);
    cmd.env("VSCODE_MACHINE_ID", &profile.telemetry_machine_id);
    cmd.env("TELEMETRY_MACHINE_ID", &profile.telemetry_machine_id);
    cmd.env("DEV_DEVICE_ID", &profile.dev_device_id);
    cmd.env("MACHINE_GUID", &profile.machine_guid);
    cmd.env("CODEPASS_FINGERPRINT_ID", &profile.fingerprint_id);
    cmd.env("CODEPASS_MACHINE_GUID", &profile.machine_guid);
    cmd.env("CODEPASS_MAC_ADDRESS", &profile.mac_address);
    cmd.env("CODEPASS_SMBIOS_UUID", &profile.smbios_uuid);
    cmd.env("CODEPASS_DISK_SERIAL", &profile.disk_serial);
    cmd.env("CODEPASS_CPU_MODEL", &profile.cpu_model);
    cmd.env("CODEPASS_GPU_RENDERER", &profile.gpu_renderer);

    // 隔离各 AI 工具的私有全局配置目录变量，切断对 C:\Users\<user>\.qoder[-cn] / .trae / .codebuddy / .qwenworkcn 的穿透读取
    let sandbox_home = target_path.join(".sandbox").join("home");
    let _ = fs::create_dir_all(&sandbox_home);
    cmd.env("QODER_CONFIG_DIR", sandbox_home.join(".qoder"));
    cmd.env("QODERCN_CONFIG_DIR", sandbox_home.join(".qoder-cn"));
    cmd.env("QODER_CLI_HOME", &sandbox_home);
    cmd.env("QODERCN_CLI_HOME", &sandbox_home);
    cmd.env("LINGMA_CONFIG_DIR", sandbox_home.join(".lingma"));
    cmd.env("QWENWORK_CONFIG_DIR", sandbox_home.join(".qwenworkcn"));
    cmd.env("TRAE_CONFIG_DIR", sandbox_home.join(".trae"));
    cmd.env("TRAE_CN_CONFIG_DIR", sandbox_home.join(".trae-cn"));
    cmd.env("ICUBE_CONFIG_DIR", sandbox_home.join(".icube"));
    cmd.env("CODEBUDDY_CONFIG_DIR", sandbox_home.join(".codebuddy"));
    cmd.env("WORKBUDDY_CONFIG_DIR", sandbox_home.join(".workbuddy"));
    cmd.env("WB_E2E_DISABLE_LEGACY_MIGRATION", "true");
    cmd.env("WB_E2E_DISABLE_STARTUP_REPAIR", "true");
}

const QODER_FAMILY_MUTABLE_FILES: &[&str] = &[
    "auth.dat",
    "auth.v1.dat",
    "auth.v1.lock",
    "auth-v2.dat",
    "auth-v2.dat.json",
    "auth-profile-overlays.v1.dat",
    "auth.machine-id",
    "machineid",
    "machine-id",
    "qoder-data.v1.json",
    "qoder-data.v1.ext.json",
    "main.sqlite",
    "main.sqlite-wal",
    "main.sqlite-shm",
    "chat-session-turn-payload-buffer.sqlite",
    "chat-session-turn-payload-buffer.sqlite-wal",
    "chat-session-turn-payload-buffer.sqlite-shm",
    "sessionMigration.sqlite",
    "memoryMigration.sqlite",
    "first-launch-onboarding.v1.json",
    "data/agents.db",
    "data/agents.db-wal",
    "data/agents.db-shm",
    ".migration-state.json",
    ".builtin-defaults-state-v3.json",
    "User/globalStorage/state.vscdb",
    "User/globalStorage/storage.json",
    "storage.json",
];

const QODER_FAMILY_DOT_CONFIG_FILES: &[&str] = &[
    ".auth/machine_id",
    ".auth/.credential-transaction",
    ".qoder-app-status.json",
    ".status.json",
    "installation_id",
    "machine-id",
];

const QODER_FAMILY_DOT_CONFIG_DIRS: &[&str] = &[
    "projects",
    "tasks",
    "memory",
    "qoder-knowledge",
    "file-history",
    "entry",
];

pub fn get_qoder_family_dot_config_dir(
    kind: crate::modules::qoder_account::QoderPlatformKind,
) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    match kind {
        crate::modules::qoder_account::QoderPlatformKind::Global => home.join(".qoder"),
        crate::modules::qoder_account::QoderPlatformKind::Cn => home.join(".qoder-cn"),
        crate::modules::qoder_account::QoderPlatformKind::QwenWork => home.join(".qwenworkcn"),
    }
}

pub fn close_qoder_family_native_processes(
    kind: crate::modules::qoder_account::QoderPlatformKind,
) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW_FLAG: u32 = 0x08000000;
        let exe_names: &[&str] = match kind {
            crate::modules::qoder_account::QoderPlatformKind::Global => &["Qoder.exe"],
            crate::modules::qoder_account::QoderPlatformKind::Cn => &["Qoder CN.exe", "QoderCN.exe"],
            crate::modules::qoder_account::QoderPlatformKind::QwenWork => {
                &["QwenWorkCN.exe", "QwenWork.exe", "QoderWorkCN.exe"]
            }
        };
        for exe_name in exe_names {
            let _ = Command::new("taskkill")
                .creation_flags(CREATE_NO_WINDOW_FLAG)
                .args(["/F", "/IM", exe_name, "/T"])
                .output();
        }
        std::thread::sleep(std::time::Duration::from_millis(280));
    }
    #[cfg(target_os = "macos")]
    {
        let proc_names: &[&str] = match kind {
            crate::modules::qoder_account::QoderPlatformKind::Global => &["Qoder"],
            crate::modules::qoder_account::QoderPlatformKind::Cn => &["Qoder CN", "QoderCN"],
            crate::modules::qoder_account::QoderPlatformKind::QwenWork => &["QwenWorkCN", "QwenWork"],
        };
        for proc_name in proc_names {
            let _ = Command::new("pkill").args(["-f", proc_name]).output();
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
}

fn copy_dir_recursive_for_slot(src: &Path, dst: &Path) {
    if !src.is_dir() {
        return;
    }
    let _ = fs::create_dir_all(dst);
    if let Ok(entries) = fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            let target = dst.join(entry.file_name());
            if path.is_dir() {
                copy_dir_recursive_for_slot(&path, &target);
            } else if path.is_file() {
                let _ = fs::copy(&path, &target);
            }
        }
    }
}

fn save_qoder_family_live_state_to_slot(
    kind: crate::modules::qoder_account::QoderPlatformKind,
    default_dir: &Path,
    slot_dir: &Path,
    has_active_marker: bool,
) {
    if default_dir == slot_dir {
        return;
    }
    let _ = fs::create_dir_all(slot_dir);
    for rel in QODER_FAMILY_MUTABLE_FILES {
        let src = default_dir.join(rel);
        let dst = slot_dir.join(rel);
        if src.is_file() {
            if let Some(parent) = dst.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(&src, &dst);
        } else if has_active_marker && dst.is_file() {
            let _ = fs::remove_file(&dst);
        }
    }

    let dot_dir = get_qoder_family_dot_config_dir(kind);
    let slot_dot_dir = slot_dir.join(".dot_config");
    let _ = fs::create_dir_all(&slot_dot_dir);
    for rel in QODER_FAMILY_DOT_CONFIG_FILES {
        let src = dot_dir.join(rel);
        let dst = slot_dot_dir.join(rel);
        if src.is_file() {
            if let Some(parent) = dst.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(&src, &dst);
        } else if has_active_marker && dst.is_file() {
            let _ = fs::remove_file(&dst);
        }
    }
    for dir_rel in QODER_FAMILY_DOT_CONFIG_DIRS {
        let src = dot_dir.join(dir_rel);
        let dst = slot_dot_dir.join(dir_rel);
        if src.is_dir() {
            if dst.is_dir() {
                let _ = fs::remove_dir_all(&dst);
            }
            copy_dir_recursive_for_slot(&src, &dst);
        } else if has_active_marker && dst.is_dir() {
            let _ = fs::remove_dir_all(&dst);
        }
    }
}

pub fn clear_qoder_family_live_state(
    kind: crate::modules::qoder_account::QoderPlatformKind,
    target_dir: &Path,
    also_clear_dot_config: bool,
) {
    for rel in QODER_FAMILY_MUTABLE_FILES {
        if *rel == "User/globalStorage/storage.json"
            || *rel == "storage.json"
            || *rel == "User/globalStorage/state.vscdb"
        {
            continue;
        }
        let p = target_dir.join(rel);
        if p.exists() {
            let _ = fs::remove_file(&p);
        }
    }
    let _ = purge_residual_account_credentials(target_dir);

    if also_clear_dot_config {
        let dot_dir = get_qoder_family_dot_config_dir(kind);
        for rel in QODER_FAMILY_DOT_CONFIG_FILES {
            let p = dot_dir.join(rel);
            if p.exists() {
                let _ = fs::remove_file(&p);
            }
        }
        for dir_rel in QODER_FAMILY_DOT_CONFIG_DIRS {
            let d = dot_dir.join(dir_rel);
            if d.is_dir() {
                let _ = fs::remove_dir_all(&d);
            }
        }
    }
}

fn restore_qoder_family_slot_to_live_state(
    kind: crate::modules::qoder_account::QoderPlatformKind,
    slot_dir: &Path,
    default_dir: &Path,
) {
    if slot_dir == default_dir {
        return;
    }
    for rel in QODER_FAMILY_MUTABLE_FILES {
        let src = slot_dir.join(rel);
        let dst = default_dir.join(rel);
        if src.is_file() {
            if let Some(parent) = dst.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(&src, &dst);
        }
    }

    let dot_dir = get_qoder_family_dot_config_dir(kind);
    let slot_dot_dir = slot_dir.join(".dot_config");
    for rel in QODER_FAMILY_DOT_CONFIG_FILES {
        let src = slot_dot_dir.join(rel);
        let dst = dot_dir.join(rel);
        if src.is_file() {
            if let Some(parent) = dst.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(&src, &dst);
        }
    }
    for dir_rel in QODER_FAMILY_DOT_CONFIG_DIRS {
        let src = slot_dot_dir.join(dir_rel);
        let dst = dot_dir.join(dir_rel);
        if src.is_dir() {
            if dst.is_dir() {
                let _ = fs::remove_dir_all(&dst);
            }
            copy_dir_recursive_for_slot(&src, &dst);
        }
    }
}

pub fn inject_qoder_family_fingerprint(
    kind: crate::modules::qoder_account::QoderPlatformKind,
    default_dir: &Path,
    slot_dir: &Path,
    profile: &InstanceFingerprintProfile,
) {
    let _ = inject_fingerprint_into_instance_storage(slot_dir, profile);
    if default_dir != slot_dir {
        let _ = inject_fingerprint_into_instance_storage(default_dir, profile);
    }

    let dot_dir = get_qoder_family_dot_config_dir(kind);
    let _ = fs::create_dir_all(dot_dir.join(".auth"));
    let _ = fs::write(
        dot_dir.join(".auth").join("machine_id"),
        &profile.telemetry_machine_id,
    );
    let _ = fs::write(dot_dir.join("machine-id"), &profile.telemetry_machine_id);
    let _ = fs::write(dot_dir.join("installation_id"), &profile.dev_device_id);
}

/// 在启动 Qoder / Qoder CN / QwenWork 实例前同步活跃 Profile 槽位，确保空白实例 100% 干净隔离且不丢失原账号数据
pub fn sync_qoder_family_active_profile_on_start(
    kind: crate::modules::qoder_account::QoderPlatformKind,
    instance_id: &str,
    instance_user_data_dir: &Path,
    bind_account_id: Option<&str>,
) -> Result<(), String> {
    // 1. 强制结束当前平台所有进程，释放单实例锁与 SQLite WAL 锁
    close_qoder_family_native_processes(kind);

    // 2. 自动备份当前本地已登录账号至 AI CodePass 账号列表
    let _ = crate::modules::qoder_account::import_from_local_for_platform(kind);

    let default_dir =
        crate::modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(kind)?;
    let _ = fs::create_dir_all(&default_dir);
    let _ = fs::create_dir_all(instance_user_data_dir);

    // 确保 Local State (DPAPI 主密钥文件，不含账号信息) 在默认目录与实例目录间双向同步
    let default_local_state = default_dir.join("Local State");
    let instance_local_state = instance_user_data_dir.join("Local State");
    if default_local_state.is_file() && !instance_local_state.is_file() {
        let _ = fs::copy(&default_local_state, &instance_local_state);
    } else if instance_local_state.is_file() && !default_local_state.is_file() {
        let _ = fs::copy(&instance_local_state, &default_local_state);
    }

    // 3. 读取上一个活跃实例 ID 并将其最新运行数据归档回对应槽位
    let active_marker_path = default_dir.join(".codepass_active_instance_id");
    let has_active_marker = active_marker_path.is_file();
    let prev_instance_id = fs::read_to_string(&active_marker_path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "__default__".to_string());

    let prev_slot_dir = if prev_instance_id == "__default__" {
        default_dir.join(".codepass_default_slot")
    } else if prev_instance_id == instance_id {
        instance_user_data_dir.to_path_buf()
    } else {
        crate::modules::qoder_instance::load_instance_store_for_platform(kind)
            .ok()
            .and_then(|store| {
                store
                    .instances
                    .into_iter()
                    .find(|item| item.id == prev_instance_id)
                    .map(|item| PathBuf::from(item.user_data_dir))
            })
            .unwrap_or_else(|| default_dir.join(".codepass_slots").join(&prev_instance_id))
    };

    // 如果尚未建立默认槽位或已有活跃标记，将实时目录状态归档至 prev_slot_dir
    if has_active_marker || !prev_slot_dir.exists() {
        save_qoder_family_live_state_to_slot(kind, &default_dir, &prev_slot_dir, has_active_marker);
    }

    // 4. 清空实时运行目录与 ~/.qoder[-cn] / ~/.qwenworkcn 中的残留登录态及会话数据
    clear_qoder_family_live_state(kind, &default_dir, true);

    // 5. 准备目标实例槽位并恢复/初始化
    let target_slot_dir = if instance_id == "__default__" {
        default_dir.join(".codepass_default_slot")
    } else {
        instance_user_data_dir.to_path_buf()
    };

    let bind_id = bind_account_id.map(str::trim).filter(|s| !s.is_empty());
    let slot_initialized = target_slot_dir.join(".codepass_slot_initialized").is_file();
    let slot_has_auth = target_slot_dir.join("auth.v1.dat").is_file()
        || target_slot_dir.join("auth-v2.dat").is_file()
        || target_slot_dir.join("auth.dat").is_file();
    let is_blank_unlogged =
        instance_id != "__default__" && bind_id.is_none() && (!slot_initialized || !slot_has_auth);

    if is_blank_unlogged {
        clear_qoder_family_live_state(kind, &target_slot_dir, false);
        let _ = fs::write(target_slot_dir.join(".codepass_slot_initialized"), "1");
        let fp = load_or_create_fingerprint(&target_slot_dir)?;
        inject_qoder_family_fingerprint(kind, &default_dir, &target_slot_dir, &fp);
        logger::log_info(&format!(
            "[SlotSync] {} 空白实例已彻底清空账号/会话缓存并注入独立硬件指纹: instance_id={}, fp_id={}, machine_guid={}",
            kind.display_name(),
            instance_id,
            fp.fingerprint_id,
            fp.machine_guid
        ));
    } else {
        restore_qoder_family_slot_to_live_state(kind, &target_slot_dir, &default_dir);
        let _ = fs::write(target_slot_dir.join(".codepass_slot_initialized"), "1");
        let fp_dir = if instance_id == "__default__" {
            &default_dir
        } else {
            &target_slot_dir
        };
        let fp = load_or_create_fingerprint(fp_dir)?;
        inject_qoder_family_fingerprint(kind, &default_dir, &target_slot_dir, &fp);
        logger::log_info(&format!(
            "[SlotSync] {} 实例槽位已切换并注入硬件指纹: instance_id={}, fp_id={}",
            kind.display_name(),
            instance_id,
            fp.fingerprint_id
        ));
    }

    // 6. 记录当前活跃实例 ID
    let _ = fs::write(&active_marker_path, instance_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fingerprint_generation_and_storage_injection() {
        let temp_dir = std::env::temp_dir().join(format!("codepass_fp_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        // Simulate a leaked auth-v2.dat and storage.json with old account
        fs::write(temp_dir.join("auth-v2.dat"), b"old_encrypted_credentials").unwrap();
        let global_storage = temp_dir.join("User").join("globalStorage");
        fs::create_dir_all(&global_storage).unwrap();
        fs::write(
            global_storage.join("storage.json"),
            r#"{"iCubeAuthInfo":"old_account","telemetry.machineId":"old_machine_id"}"#,
        )
        .unwrap();

        // Purge residual account credentials and inject new hardware fingerprint
        purge_residual_account_credentials(&temp_dir).expect("purge residuals");
        let fp = load_or_create_fingerprint(&temp_dir).expect("load_or_create_fingerprint");

        assert!(!temp_dir.join("auth-v2.dat").exists(), "auth-v2.dat must be purged");
        assert!(fp.fingerprint_id.starts_with("FP-"));
        assert_eq!(fp.telemetry_machine_id.len(), 64);

        let storage_raw = fs::read_to_string(global_storage.join("storage.json")).unwrap();
        let storage_json: Value = serde_json::from_str(&storage_raw).unwrap();
        assert!(
            storage_json.get("iCubeAuthInfo").is_none(),
            "old account key must be purged from storage.json"
        );
        assert_eq!(
            storage_json["telemetry.machineId"].as_str(),
            Some(fp.telemetry_machine_id.as_str())
        );
        assert_eq!(
            storage_json["device.machineGuid"].as_str(),
            Some(fp.machine_guid.as_str())
        );
        assert_eq!(
            storage_json["device.macAddress"].as_str(),
            Some(fp.mac_address.as_str())
        );

        // Test regenerating fingerprint produces a brand new identity
        let fp2 = regenerate_fingerprint(&temp_dir).expect("regenerate_fingerprint");
        assert_ne!(fp.machine_guid, fp2.machine_guid);
        assert_ne!(fp.telemetry_machine_id, fp2.telemetry_machine_id);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_qoder_v1_and_session_sqlite_purge_and_machine_id_injection() {
        let temp_dir = std::env::temp_dir().join(format!("codepass_qoder_v1_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        // Simulate Qoder CN 0.4.2 files
        fs::write(temp_dir.join("auth.v1.dat"), b"v10_encrypted_qoder_token").unwrap();
        fs::write(temp_dir.join("qoder-data.v1.json"), r#"{"agentAccountScope":"15226706716"}"#).unwrap();
        fs::write(temp_dir.join("main.sqlite"), b"sqlite_chat_data").unwrap();
        fs::write(temp_dir.join("main.sqlite-wal"), b"sqlite_wal_data").unwrap();
        fs::write(temp_dir.join("chat-session-turn-payload-buffer.sqlite"), b"turn_buffer").unwrap();
        fs::write(temp_dir.join("first-launch-onboarding.v1.json"), r#"{"completed":true}"#).unwrap();
        let local_storage_dir = temp_dir.join("Local Storage").join("leveldb");
        fs::create_dir_all(&local_storage_dir).unwrap();
        fs::write(local_storage_dir.join("000003.log"), b"webview_token").unwrap();

        purge_residual_account_credentials(&temp_dir).expect("purge qoder v1 credentials");
        let fp = load_or_create_fingerprint(&temp_dir).expect("create fingerprint");

        assert!(!temp_dir.join("auth.v1.dat").exists(), "auth.v1.dat must be removed");
        assert!(!temp_dir.join("qoder-data.v1.json").exists(), "qoder-data.v1.json must be removed");
        assert!(!temp_dir.join("main.sqlite").exists(), "main.sqlite must be removed");
        assert!(!temp_dir.join("main.sqlite-wal").exists(), "main.sqlite-wal must be removed");
        assert!(!temp_dir.join("chat-session-turn-payload-buffer.sqlite").exists());
        assert!(!temp_dir.join("first-launch-onboarding.v1.json").exists());
        assert!(!temp_dir.join("Local Storage").exists(), "Local Storage must be removed");

        // Check auth.machine-id and sandbox .qoder-cn/.auth/machine_id
        let auth_machine_id = fs::read_to_string(temp_dir.join("auth.machine-id")).unwrap();
        assert_eq!(auth_machine_id, fp.telemetry_machine_id);
        let sandbox_qoder_cn_machine_id = fs::read_to_string(
            temp_dir
                .join(".sandbox")
                .join("home")
                .join(".qoder-cn")
                .join(".auth")
                .join("machine_id"),
        )
        .unwrap();
        assert_eq!(sandbox_qoder_cn_machine_id, fp.telemetry_machine_id);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_workbuddy_and_qwenwork_blank_purge_and_fingerprint_injection() {
        let temp_dir = std::env::temp_dir().join(format!("codepass_wb_qw_test_{}", Uuid::new_v4()));
        fs::create_dir_all(temp_dir.join("data")).unwrap();
        fs::create_dir_all(temp_dir.join("local_storage")).unwrap();
        fs::create_dir_all(temp_dir.join("sessions")).unwrap();

        // Simulate QwenWorkCN and WorkBuddy residual files
        fs::write(temp_dir.join("auth.dat"), b"qwenwork_v1_auth").unwrap();
        fs::write(temp_dir.join("data").join("agents.db"), b"qwenwork_agents_db").unwrap();
        fs::write(temp_dir.join("keyblob"), b"workbuddy_keyblob").unwrap();
        fs::write(temp_dir.join("workbuddy.db"), b"workbuddy_chat_db").unwrap();
        fs::write(temp_dir.join("user-state.json"), b"workbuddy_user_state").unwrap();
        fs::write(temp_dir.join("local_storage").join("state.bin"), b"wb_state").unwrap();

        purge_residual_account_credentials(&temp_dir).expect("purge wb & qwenwork");
        let fp = load_or_create_fingerprint(&temp_dir).expect("create fingerprint");

        assert!(!temp_dir.join("auth.dat").exists(), "auth.dat must be purged");
        assert!(!temp_dir.join("data").join("agents.db").exists(), "agents.db must be purged");
        assert!(!temp_dir.join("keyblob").exists(), "keyblob must be purged");
        assert!(!temp_dir.join("workbuddy.db").exists(), "workbuddy.db must be purged");
        assert!(!temp_dir.join("user-state.json").exists(), "user-state.json must be purged");
        assert!(!temp_dir.join("local_storage").exists(), "local_storage dir must be purged");
        assert!(!temp_dir.join("sessions").exists(), "sessions dir must be purged");

        // Verify WorkBuddy device-id, qimei-cache.json, and .legacy-localstorage-migration.done
        assert_eq!(
            fs::read_to_string(temp_dir.join("device-id")).unwrap(),
            fp.dev_device_id
        );
        let qimei_raw = fs::read_to_string(temp_dir.join("qimei-cache.json")).unwrap();
        let qimei_val: Value = serde_json::from_str(&qimei_raw).unwrap();
        assert_eq!(
            qimei_val["qimei36"].as_str().unwrap().len(),
            36
        );
        assert!(temp_dir.join(".legacy-localstorage-migration.done").is_file());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_qoder_family_slot_save_clear_and_restore() {
        let root_dir = std::env::temp_dir().join(format!("codepass_slot_test_{}", Uuid::new_v4()));
        let default_dir = root_dir.join("live_default");
        let default_slot = default_dir.join(".codepass_default_slot");
        let blank_slot = root_dir.join("blank_instance");
        fs::create_dir_all(&default_dir).unwrap();
        fs::create_dir_all(&blank_slot).unwrap();

        // Populate live_default with Account A data
        fs::write(default_dir.join("auth.v1.dat"), b"account_a_auth").unwrap();
        fs::write(default_dir.join("qoder-data.v1.json"), b"account_a_projects").unwrap();
        fs::write(default_dir.join("main.sqlite"), b"account_a_chats").unwrap();

        // 1. Save live_default to default_slot
        save_qoder_family_live_state_to_slot(
            crate::modules::qoder_account::QoderPlatformKind::Cn,
            &default_dir,
            &default_slot,
            false,
        );
        assert!(default_slot.join("auth.v1.dat").is_file());
        assert!(default_slot.join("qoder-data.v1.json").is_file());
        assert!(default_slot.join("main.sqlite").is_file());

        // 2. Clear live_default for blank_slot launch
        clear_qoder_family_live_state(
            crate::modules::qoder_account::QoderPlatformKind::Cn,
            &default_dir,
            false,
        );
        assert!(!default_dir.join("auth.v1.dat").exists());
        assert!(!default_dir.join("qoder-data.v1.json").exists());
        assert!(!default_dir.join("main.sqlite").exists());

        // 3. Restore default_slot back to live_default
        restore_qoder_family_slot_to_live_state(
            crate::modules::qoder_account::QoderPlatformKind::Cn,
            &default_slot,
            &default_dir,
        );
        assert_eq!(fs::read(default_dir.join("auth.v1.dat")).unwrap(), b"account_a_auth");
        assert_eq!(fs::read(default_dir.join("qoder-data.v1.json")).unwrap(), b"account_a_projects");
        assert_eq!(fs::read(default_dir.join("main.sqlite")).unwrap(), b"account_a_chats");

        let _ = fs::remove_dir_all(&root_dir);
    }
}
