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
    inject_fingerprint_into_instance_storage(user_data_dir, &profile)?;
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

/// 深度清理空白实例或待重置实例中的残留账号状态（防止读取或残留旧账号数据）
pub fn purge_residual_account_credentials(user_data_dir: &Path) -> Result<(), String> {
    // 1. 清理 QwenWork / Qoder 加密凭证文件
    for rel in [
        "auth-v2.dat",
        "auth-v2.dat.json",
        ".qwenworkcn/.status.json",
        ".sandbox/home/.qwenworkcn/.status.json",
        ".sandbox/appdata/Roaming/QwenWorkCN/auth-v2.dat",
        ".sandbox/appdata/Roaming/QwenWorkCN/auth-v2.dat.json",
    ] {
        let target = user_data_dir.join(rel);
        if target.exists() {
            let _ = fs::remove_file(&target);
        }
    }

    // 2. 清理 storage.json 中的账号字段（保留新的指纹字段）
    for storage_rel in [
        PathBuf::from("User").join("globalStorage").join("storage.json"),
        PathBuf::from("storage.json"),
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

    // 3. 清理 state.vscdb 中的残留登录态 secret
    for db_rel in [
        PathBuf::from("User").join("globalStorage").join("state.vscdb"),
        PathBuf::from("globalStorage").join("state.vscdb"),
        PathBuf::from("state.vscdb"),
    ] {
        let db_path = user_data_dir.join(db_rel);
        if db_path.is_file() {
            if let Ok(conn) = Connection::open(&db_path) {
                let _ = conn.execute(
                    "DELETE FROM ItemTable WHERE key LIKE 'secret://%' OR key LIKE '%aicoding.auth%' OR key LIKE '%coding-copilot%' OR key LIKE '%planning-genie%' OR key LIKE '%iCubeAuth%'",
                    [],
                );
            }
        }
    }

    Ok(())
}

/// 将系统与硬件指纹写入实例目录的 storage.json、state.vscdb 与沙箱设备描述文件
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

    // 同步写入根目录 storage.json (兼容直接读取根目录的客户端变体)
    let root_storage_path = user_data_dir.join("storage.json");
    let _ = fs::write(&root_storage_path, &updated_json);

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
        let qwen_sandbox_dir = sandbox_home.join(".qwenworkcn");
        let _ = fs::create_dir_all(&qwen_sandbox_dir);
        let _ = fs::write(qwen_sandbox_dir.join(".device.json"), &manifest_str);
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

    // 隔离各 AI 工具的私有全局配置目录变量，切断对 C:\Users\<user>\.qoder / .trae / .codebuddy / .qwenworkcn 的穿透读取
    let sandbox_home = target_path.join(".sandbox").join("home");
    let _ = fs::create_dir_all(&sandbox_home);
    cmd.env("QODER_CONFIG_DIR", sandbox_home.join(".qoder"));
    cmd.env("LINGMA_CONFIG_DIR", sandbox_home.join(".lingma"));
    cmd.env("QWENWORK_CONFIG_DIR", sandbox_home.join(".qwenworkcn"));
    cmd.env("TRAE_CONFIG_DIR", sandbox_home.join(".trae"));
    cmd.env("ICUBE_CONFIG_DIR", sandbox_home.join(".icube"));
    cmd.env("CODEBUDDY_CONFIG_DIR", sandbox_home.join(".codebuddy"));
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
}
