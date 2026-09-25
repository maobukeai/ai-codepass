use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::models::qoder::{QoderAccount, QoderAccountIndex};
use crate::modules::{account, logger};

const ACCOUNTS_INDEX_FILE: &str = "qoder_accounts.json";
const ACCOUNTS_DIR: &str = "qoder_accounts";
const ACCOUNTS_INDEX_FILE_CN: &str = "qoder_cn_accounts.json";
const ACCOUNTS_DIR_CN: &str = "qoder_cn_accounts";
const ACCOUNTS_INDEX_FILE_QWENWORK: &str = "qwenwork_accounts.json";
const ACCOUNTS_DIR_QWENWORK: &str = "qwenwork_accounts";

pub const QODER_SECRET_USER_INFO_KEY: &str = "secret://aicoding.auth.userInfo";
const QODER_SECRET_USER_PLAN_KEY: &str = "secret://aicoding.auth.userPlan";
const QODER_SECRET_CREDIT_USAGE_KEY: &str = "secret://aicoding.auth.creditUsage";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QoderPlatformKind {
    Global,
    Cn,
    QwenWork,
}

impl QoderPlatformKind {
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
            Some("qoder_cn") | Some("cn") | Some("qoder-cn") => Self::Cn,
            Some("qwenwork") | Some("qwen_work") | Some("qwen-work") | Some("qoderwork") => Self::QwenWork,
            _ => Self::Global,
        }
    }

    pub fn platform_id(&self) -> &'static str {
        match self {
            Self::Global => "qoder",
            Self::Cn => "qoder_cn",
            Self::QwenWork => "qwenwork",
        }
    }

    pub fn accounts_index_file(&self) -> &'static str {
        match self {
            Self::Global => ACCOUNTS_INDEX_FILE,
            Self::Cn => ACCOUNTS_INDEX_FILE_CN,
            Self::QwenWork => ACCOUNTS_INDEX_FILE_QWENWORK,
        }
    }

    pub fn accounts_dir(&self) -> &'static str {
        match self {
            Self::Global => ACCOUNTS_DIR,
            Self::Cn => ACCOUNTS_DIR_CN,
            Self::QwenWork => ACCOUNTS_DIR_QWENWORK,
        }
    }

    pub fn log_prefix(&self) -> &'static str {
        match self {
            Self::Global => "[Qoder Account]",
            Self::Cn => "[Qoder CN Account]",
            Self::QwenWork => "[QwenWork Account]",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Global => "Qoder",
            Self::Cn => "Qoder CN",
            Self::QwenWork => "千问办公",
        }
    }
}

static QODER_ACCOUNT_INDEX_LOCK: std::sync::LazyLock<Mutex<()>> =
    std::sync::LazyLock::new(|| Mutex::new(()));
static QODER_CN_ACCOUNT_INDEX_LOCK: std::sync::LazyLock<Mutex<()>> =
    std::sync::LazyLock::new(|| Mutex::new(()));
static QWENWORK_ACCOUNT_INDEX_LOCK: std::sync::LazyLock<Mutex<()>> =
    std::sync::LazyLock::new(|| Mutex::new(()));

fn get_account_index_lock(kind: QoderPlatformKind) -> &'static Mutex<()> {
    match kind {
        QoderPlatformKind::Global => &QODER_ACCOUNT_INDEX_LOCK,
        QoderPlatformKind::Cn => &QODER_CN_ACCOUNT_INDEX_LOCK,
        QoderPlatformKind::QwenWork => &QWENWORK_ACCOUNT_INDEX_LOCK,
    }
}

#[derive(Debug, Clone, Default)]
struct QoderSnapshot {
    user_info_raw: Option<Value>,
    user_plan_raw: Option<Value>,
    credit_usage_raw: Option<Value>,
}

#[derive(Debug, Clone)]
struct NumericCandidate {
    path: String,
    value: f64,
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn normalize_non_empty(value: Option<&str>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_email(value: Option<&str>) -> Option<String> {
    normalize_non_empty(value).map(|v| v.to_lowercase())
}

fn sanitize_account_id_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    out
}

fn generate_account_id(
    snapshot: &QoderSnapshot,
    user_id: Option<&str>,
    email: Option<&str>,
) -> String {
    if let Some(uid) = normalize_non_empty(user_id) {
        let cleaned = sanitize_account_id_component(&uid);
        if !cleaned.is_empty() {
            return format!("qoder_uid_{}", cleaned);
        }
    }

    if let Some(addr) = normalize_email(email) {
        let cleaned = sanitize_account_id_component(&addr);
        if !cleaned.is_empty() {
            return format!("qoder_email_{}", cleaned);
        }
    }

    let basis = format!(
        "{}|{}|{}",
        snapshot
            .user_info_raw
            .as_ref()
            .map(|v| v.to_string())
            .unwrap_or_default(),
        snapshot
            .user_plan_raw
            .as_ref()
            .map(|v| v.to_string())
            .unwrap_or_default(),
        snapshot
            .credit_usage_raw
            .as_ref()
            .map(|v| v.to_string())
            .unwrap_or_default(),
    );
    let digest = md5::compute(basis.as_bytes());
    format!("qoder_{:x}", digest)
}

fn get_data_dir() -> Result<PathBuf, String> {
    account::get_data_dir()
}

fn get_accounts_dir(kind: QoderPlatformKind) -> Result<PathBuf, String> {
    let base = get_data_dir()?;
    let dir = base.join(kind.accounts_dir());
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("创建 {} 账号目录失败: {}", kind.display_name(), e))?;
    }
    Ok(dir)
}

fn get_accounts_index_path(kind: QoderPlatformKind) -> Result<PathBuf, String> {
    Ok(get_data_dir()?.join(kind.accounts_index_file()))
}

pub fn accounts_index_path_string_for_platform(kind: QoderPlatformKind) -> Result<String, String> {
    Ok(get_accounts_index_path(kind)?.to_string_lossy().to_string())
}

pub fn accounts_index_path_string() -> Result<String, String> {
    accounts_index_path_string_for_platform(QoderPlatformKind::Global)
}

pub fn accounts_index_path_string_cn() -> Result<String, String> {
    accounts_index_path_string_for_platform(QoderPlatformKind::Cn)
}

fn normalize_account_id(account_id: &str) -> Result<String, String> {
    let trimmed = account_id.trim();
    if trimmed.is_empty() {
        return Err("账号 ID 不能为空".to_string());
    }

    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err("账号 ID 非法，包含路径字符".to_string());
    }

    let valid = trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.');
    if !valid {
        return Err("账号 ID 非法，仅允许字母/数字/._-".to_string());
    }

    Ok(trimmed.to_string())
}

fn resolve_account_file_path(kind: QoderPlatformKind, account_id: &str) -> Result<PathBuf, String> {
    let normalized = normalize_account_id(account_id)?;
    Ok(get_accounts_dir(kind)?.join(format!("{}.json", normalized)))
}

pub fn load_account_for_platform(kind: QoderPlatformKind, account_id: &str) -> Option<QoderAccount> {
    let account_path = resolve_account_file_path(kind, account_id).ok()?;
    if !account_path.exists() {
        return None;
    }
    let content = fs::read_to_string(&account_path).ok()?;
    match crate::modules::secure_account_storage::deserialize_account_file::<QoderAccount>(
        &account_path,
        &content,
    ) {
        Ok((account, needs_rotation)) => {
            if needs_rotation {
                let account_for_rewrite = account.clone();
                let platform_id = kind.platform_id();
                crate::modules::deferred_account_rewrite::schedule_account_rewrite_if_unchanged(
                    platform_id,
                    account_for_rewrite.id.clone(),
                    account_path.clone(),
                    content.as_bytes(),
                    move || {
                        crate::modules::secure_account_storage::serialize_account_file(
                            platform_id,
                            &account_for_rewrite,
                        )
                    },
                );
            }
            Some(account)
        }
        Err(_) => None,
    }
}

pub fn load_account(account_id: &str) -> Option<QoderAccount> {
    load_account_for_platform(QoderPlatformKind::Global, account_id)
        .or_else(|| load_account_for_platform(QoderPlatformKind::Cn, account_id))
}

pub fn load_account_cn(account_id: &str) -> Option<QoderAccount> {
    load_account_for_platform(QoderPlatformKind::Cn, account_id)
}

fn save_account_file(kind: QoderPlatformKind, account: &QoderAccount) -> Result<(), String> {
    let path = resolve_account_file_path(kind, account.id.as_str())?;
    let content = crate::modules::secure_account_storage::serialize_account_file(kind.platform_id(), account)?;
    crate::modules::atomic_write::write_string_atomic(&path, &content)
        .map_err(|e| format!("保存账号失败: {}", e))
}

fn delete_account_file(kind: QoderPlatformKind, account_id: &str) -> Result<(), String> {
    let path = resolve_account_file_path(kind, account_id)?;
    if path.exists() {
        crate::modules::atomic_write::remove_file_locked(&path)
            .map_err(|e| format!("删除账号文件失败: {}", e))?;
    }
    Ok(())
}

fn load_account_index(kind: QoderPlatformKind) -> QoderAccountIndex {
    let path = match get_accounts_index_path(kind) {
        Ok(p) => p,
        Err(_) => return QoderAccountIndex::new(),
    };
    if !path.exists() {
        return repair_account_index_from_details(kind, "索引文件不存在")
            .unwrap_or_else(QoderAccountIndex::new);
    }
    match fs::read_to_string(&path) {
        Ok(content) if content.trim().is_empty() => {
            repair_account_index_from_details(kind, "索引文件为空").unwrap_or_else(QoderAccountIndex::new)
        }
        Ok(content) => match crate::modules::atomic_write::parse_json_with_auto_restore::<
            QoderAccountIndex,
        >(&path, &content)
        {
            Ok(index) if !index.accounts.is_empty() => index,
            Ok(_) => repair_account_index_from_details(kind, "索引账号列表为空")
                .unwrap_or_else(QoderAccountIndex::new),
            Err(err) => {
                logger::log_warn(&format!(
                    "{} 账号索引解析失败，尝试按详情文件自动修复: path={}, error={}",
                    kind.log_prefix(),
                    path.display(),
                    err
                ));
                repair_account_index_from_details(kind, "索引文件损坏")
                    .unwrap_or_else(QoderAccountIndex::new)
            }
        },
        Err(_) => QoderAccountIndex::new(),
    }
}

fn load_account_index_checked(kind: QoderPlatformKind) -> Result<QoderAccountIndex, String> {
    let path = get_accounts_index_path(kind)?;
    if !path.exists() {
        if let Some(index) = repair_account_index_from_details(kind, "索引文件不存在") {
            return Ok(index);
        }
        return Ok(QoderAccountIndex::new());
    }

    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(err) => {
            if let Some(index) = repair_account_index_from_details(kind, "索引文件读取失败") {
                return Ok(index);
            }
            return Err(format!("读取账号索引失败: {}", err));
        }
    };

    if content.trim().is_empty() {
        if let Some(index) = repair_account_index_from_details(kind, "索引文件为空") {
            return Ok(index);
        }
        return Ok(QoderAccountIndex::new());
    }

    match crate::modules::atomic_write::parse_json_with_auto_restore::<QoderAccountIndex>(
        &path, &content,
    ) {
        Ok(index) if !index.accounts.is_empty() => Ok(index),
        Ok(index) => {
            if let Some(repaired) = repair_account_index_from_details(kind, "索引账号列表为空") {
                return Ok(repaired);
            }
            Ok(index)
        }
        Err(err) => {
            if let Some(index) = repair_account_index_from_details(kind, "索引文件损坏") {
                return Ok(index);
            }
            Err(crate::error::file_corrupted_error(
                kind.accounts_index_file(),
                &path.to_string_lossy(),
                &err.to_string(),
            ))
        }
    }
}

fn save_account_index(kind: QoderPlatformKind, index: &QoderAccountIndex) -> Result<(), String> {
    let path = get_accounts_index_path(kind)?;
    let content =
        serde_json::to_string_pretty(index).map_err(|e| format!("序列化账号索引失败: {}", e))?;
    crate::modules::atomic_write::write_string_atomic(&path, &content)
        .map_err(|e| format!("写入账号索引失败: {}", e))
}

fn repair_account_index_from_details(kind: QoderPlatformKind, reason: &str) -> Option<QoderAccountIndex> {
    let index_path = get_accounts_index_path(kind).ok()?;
    let accounts_dir = get_accounts_dir(kind).ok()?;
    let mut accounts = crate::modules::account_index_repair::load_accounts_from_details(
        &accounts_dir,
        |account_id| load_account_for_platform(kind, account_id),
    )
    .ok()?;

    if accounts.is_empty() {
        return None;
    }

    crate::modules::account_index_repair::sort_accounts_by_recency(
        &mut accounts,
        |account| account.last_used,
        |account| account.created_at,
        |account| account.id.as_str(),
    );

    let mut index = QoderAccountIndex::new();
    index.accounts = accounts.iter().map(|account| account.summary()).collect();

    let backup_path = crate::modules::account_index_repair::backup_existing_index(&index_path)
        .unwrap_or_else(|err| {
            logger::log_warn(&format!(
                "{} 自动修复前备份索引失败，继续尝试重建: path={}, error={}",
                kind.log_prefix(),
                index_path.display(),
                err
            ));
            None
        });

    if let Err(err) = save_account_index(kind, &index) {
        logger::log_warn(&format!(
            "{} 自动修复索引保存失败，将以内存结果继续运行: reason={}, recovered_accounts={}, error={}",
            kind.log_prefix(),
            reason,
            index.accounts.len(),
            err
        ));
    }

    logger::log_warn(&format!(
        "{} 检测到账号索引异常，已根据详情文件自动重建: reason={}, recovered_accounts={}, backup_path={}",
        kind.log_prefix(),
        reason,
        index.accounts.len(),
        backup_path
            .as_ref()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|| "-".to_string())
    ));

    Some(index)
}

fn refresh_summary(index: &mut QoderAccountIndex, account: &QoderAccount) {
    if let Some(summary) = index.accounts.iter_mut().find(|item| item.id == account.id) {
        *summary = account.summary();
        return;
    }
    index.accounts.push(account.summary());
}

pub(crate) fn upsert_account_record_for_platform(
    kind: QoderPlatformKind,
    account: QoderAccount,
) -> Result<QoderAccount, String> {
    let _lock = get_account_index_lock(kind)
        .lock()
        .map_err(|_| format!("获取 {} 账号锁失败", kind.display_name()))?;
    let mut index = load_account_index(kind);
    save_account_file(kind, &account)?;
    refresh_summary(&mut index, &account);
    save_account_index(kind, &index)?;
    Ok(account)
}

fn upsert_account_record(account: QoderAccount) -> Result<QoderAccount, String> {
    upsert_account_record_for_platform(QoderPlatformKind::Global, account)
}

pub fn update_quota_query_error_for_platform(
    kind: QoderPlatformKind,
    account_id: &str,
    message: Option<String>,
) -> Result<Option<QoderAccount>, String> {
    let Some(mut account) = load_account_for_platform(kind, account_id) else {
        return Ok(None);
    };
    account.quota_query_last_error = message;
    account.quota_query_last_error_at = account
        .quota_query_last_error
        .as_ref()
        .map(|_| chrono::Utc::now().timestamp_millis());
    let updated = upsert_account_record_for_platform(kind, account)?;
    Ok(Some(updated))
}

pub fn update_quota_query_error(
    account_id: &str,
    message: Option<String>,
) -> Result<Option<QoderAccount>, String> {
    update_quota_query_error_for_platform(QoderPlatformKind::Global, account_id, message)
}

pub fn update_quota_query_error_cn(
    account_id: &str,
    message: Option<String>,
) -> Result<Option<QoderAccount>, String> {
    update_quota_query_error_for_platform(QoderPlatformKind::Cn, account_id, message)
}

fn list_accounts_from_index(kind: QoderPlatformKind, index: &QoderAccountIndex) -> Vec<QoderAccount> {
    let mut accounts = Vec::new();
    for summary in &index.accounts {
        if let Some(account) = load_account_for_platform(kind, &summary.id) {
            accounts.push(account);
        }
    }
    accounts.sort_by(|a, b| b.last_used.cmp(&a.last_used));
    accounts
}

pub fn list_accounts_for_platform(kind: QoderPlatformKind) -> Vec<QoderAccount> {
    let index = load_account_index(kind);
    list_accounts_from_index(kind, &index)
}

pub fn list_accounts() -> Vec<QoderAccount> {
    list_accounts_for_platform(QoderPlatformKind::Global)
}

pub fn list_accounts_cn() -> Vec<QoderAccount> {
    list_accounts_for_platform(QoderPlatformKind::Cn)
}

pub fn list_accounts_checked_for_platform(kind: QoderPlatformKind) -> Result<Vec<QoderAccount>, String> {
    let index = load_account_index_checked(kind)?;
    Ok(list_accounts_from_index(kind, &index))
}

pub fn list_accounts_checked() -> Result<Vec<QoderAccount>, String> {
    list_accounts_checked_for_platform(QoderPlatformKind::Global)
}

pub fn list_accounts_checked_cn() -> Result<Vec<QoderAccount>, String> {
    list_accounts_checked_for_platform(QoderPlatformKind::Cn)
}

pub fn remove_account_for_platform(kind: QoderPlatformKind, account_id: &str) -> Result<(), String> {
    let _lock = get_account_index_lock(kind)
        .lock()
        .map_err(|_| format!("获取 {} 账号锁失败", kind.display_name()))?;
    let mut index = load_account_index(kind);
    index.accounts.retain(|item| item.id != account_id);
    save_account_index(kind, &index)?;
    delete_account_file(kind, account_id)?;
    Ok(())
}

pub fn remove_account(account_id: &str) -> Result<(), String> {
    remove_account_for_platform(QoderPlatformKind::Global, account_id)
}

pub fn remove_account_cn(account_id: &str) -> Result<(), String> {
    remove_account_for_platform(QoderPlatformKind::Cn, account_id)
}

pub fn remove_accounts_for_platform(kind: QoderPlatformKind, account_ids: &[String]) -> Result<(), String> {
    let target: HashSet<String> = account_ids
        .iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();
    if target.is_empty() {
        return Ok(());
    }

    let _lock = get_account_index_lock(kind)
        .lock()
        .map_err(|_| format!("获取 {} 账号锁失败", kind.display_name()))?;
    let mut index = load_account_index(kind);
    index.accounts.retain(|item| !target.contains(&item.id));
    save_account_index(kind, &index)?;
    for id in target {
        delete_account_file(kind, &id)?;
    }
    Ok(())
}

pub fn remove_accounts(account_ids: &[String]) -> Result<(), String> {
    remove_accounts_for_platform(QoderPlatformKind::Global, account_ids)
}

pub fn remove_accounts_cn(account_ids: &[String]) -> Result<(), String> {
    remove_accounts_for_platform(QoderPlatformKind::Cn, account_ids)
}

fn parse_json_or_string(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}

fn walk_value<'a>(value: &'a Value, path: &str, visit: &mut dyn FnMut(&str, &'a Value)) {
    visit(path, value);
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let child_path = if path.is_empty() {
                    key.to_string()
                } else {
                    format!("{}.{}", path, key)
                };
                walk_value(child, &child_path, visit);
            }
        }
        Value::Array(list) => {
            for (idx, child) in list.iter().enumerate() {
                let child_path = if path.is_empty() {
                    format!("[{}]", idx)
                } else {
                    format!("{}[{}]", path, idx)
                };
                walk_value(child, &child_path, visit);
            }
        }
        _ => {}
    }
}

fn path_last_segment(path: &str) -> &str {
    let mut last = path;
    if let Some(idx) = last.rfind('.') {
        last = &last[idx + 1..];
    }
    if let Some(idx) = last.rfind('[') {
        last = &last[..idx];
    }
    last
}

fn find_string_by_exact_keys(value: &Value, keys: &[&str]) -> Option<String> {
    let key_set: HashSet<String> = keys.iter().map(|k| k.to_ascii_lowercase()).collect();
    let mut found: Option<String> = None;
    walk_value(value, "", &mut |path, current| {
        if found.is_some() {
            return;
        }
        let Some(text) = current.as_str() else {
            return;
        };
        let Some(normalized) = normalize_non_empty(Some(text)) else {
            return;
        };
        let last = path_last_segment(path).to_ascii_lowercase();
        if key_set.contains(last.as_str()) {
            found = Some(normalized);
        }
    });
    found
}

fn find_string_by_path_keywords(value: &Value, includes: &[&str]) -> Option<String> {
    let mut found: Option<String> = None;
    walk_value(value, "", &mut |path, current| {
        if found.is_some() {
            return;
        }
        let Some(text) = current.as_str() else {
            return;
        };
        let Some(normalized) = normalize_non_empty(Some(text)) else {
            return;
        };
        let path_lower = path.to_ascii_lowercase();
        if includes
            .iter()
            .all(|keyword| path_lower.contains(&keyword.to_ascii_lowercase()))
        {
            found = Some(normalized);
        }
    });
    found
}

fn find_first_email(value: &Value) -> Option<String> {
    let mut found: Option<String> = None;
    walk_value(value, "", &mut |_path, current| {
        if found.is_some() {
            return;
        }
        let Some(text) = current.as_str() else {
            return;
        };
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return;
        }
        if trimmed.contains('@') && trimmed.contains('.') {
            found = Some(trimmed.to_lowercase());
        }
    });
    found
}

fn collect_numeric_candidates(value: &Value, base_path: &str, output: &mut Vec<NumericCandidate>) {
    walk_value(value, base_path, &mut |path, current| {
        let num = match current {
            Value::Number(n) => n.as_f64(),
            Value::String(s) => {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    trimmed.parse::<f64>().ok()
                }
            }
            _ => None,
        };
        let Some(raw) = num else {
            return;
        };
        if !raw.is_finite() || raw.abs() > 1_000_000_000_000.0 {
            return;
        }
        output.push(NumericCandidate {
            path: path.to_ascii_lowercase(),
            value: raw,
        });
    });
}

fn pick_numeric_candidate(
    candidates: &[NumericCandidate],
    includes: &[&str],
    excludes: &[&str],
) -> Option<f64> {
    for candidate in candidates {
        if includes
            .iter()
            .all(|item| candidate.path.contains(&item.to_ascii_lowercase()))
            && excludes
                .iter()
                .all(|item| !candidate.path.contains(&item.to_ascii_lowercase()))
        {
            return Some(candidate.value);
        }
    }
    None
}

fn clamp_percent(value: f64) -> f64 {
    if value.is_nan() {
        return 0.0;
    }
    value.clamp(0.0, 100.0)
}

fn extract_snapshot_email(snapshot: &QoderSnapshot) -> Option<String> {
    let candidates = [
        snapshot.user_info_raw.as_ref(),
        snapshot.user_plan_raw.as_ref(),
        snapshot.credit_usage_raw.as_ref(),
    ];
    for value in candidates.into_iter().flatten() {
        if let Some(email) = find_string_by_exact_keys(value, &["email", "mail"]) {
            return Some(email.to_lowercase());
        }
        if let Some(email) = find_first_email(value) {
            return Some(email);
        }
    }
    for value in candidates.into_iter().flatten() {
        if let Some(phone) = find_string_by_exact_keys(value, &["phone", "mobile"]) {
            return Some(phone);
        }
        if let Some(name) = find_string_by_exact_keys(value, &["name", "username", "nickname"]) {
            return Some(name);
        }
    }
    None
}

fn extract_snapshot_user_id(snapshot: &QoderSnapshot) -> Option<String> {
    let candidates = [
        snapshot.user_info_raw.as_ref(),
        snapshot.user_plan_raw.as_ref(),
        snapshot.credit_usage_raw.as_ref(),
    ];
    for value in candidates.into_iter().flatten() {
        if let Some(uid) = find_string_by_exact_keys(
            value,
            &[
                "uid",
                "user_id",
                "userid",
                "userId",
                "account_id",
                "accountId",
                "id",
            ],
        ) {
            return Some(uid);
        }
    }
    None
}

fn extract_snapshot_display_name(snapshot: &QoderSnapshot) -> Option<String> {
    let Some(value) = snapshot.user_info_raw.as_ref() else {
        return None;
    };
    find_string_by_exact_keys(
        value,
        &[
            "name",
            "nickname",
            "display_name",
            "displayName",
            "username",
        ],
    )
}

fn extract_snapshot_plan_type(snapshot: &QoderSnapshot) -> Option<String> {
    if let Some(value) = snapshot.user_plan_raw.as_ref() {
        if let Some(plan) = find_string_by_exact_keys(
            value,
            &[
                "plan",
                "plan_type",
                "planType",
                "plan_tier_name",
                "planTierName",
                "tier",
                "tier_name",
                "tierName",
                "package",
                "package_name",
                "packageName",
                "name",
            ],
        ) {
            return Some(plan);
        }
    }

    if let Some(value) = snapshot.user_info_raw.as_ref() {
        if let Some(plan) =
            find_string_by_exact_keys(value, &["userTag", "user_tag", "plan_tier_name"])
        {
            return Some(plan);
        }
    }

    if let Some(value) = snapshot.credit_usage_raw.as_ref() {
        if let Some(plan) = find_string_by_path_keywords(value, &["plan"]) {
            return Some(plan);
        }
    }

    None
}

fn extract_snapshot_credits(
    snapshot: &QoderSnapshot,
) -> (Option<f64>, Option<f64>, Option<f64>, Option<f64>) {
    let mut candidates = Vec::new();
    if let Some(value) = snapshot.credit_usage_raw.as_ref() {
        collect_numeric_candidates(value, "usage", &mut candidates);
    }
    if let Some(value) = snapshot.user_plan_raw.as_ref() {
        collect_numeric_candidates(value, "plan", &mut candidates);
    }

    let mut used = pick_numeric_candidate(
        &candidates,
        &["used"],
        &["percent", "rate", "ratio", "remaining", "remain", "left"],
    )
    .or_else(|| {
        pick_numeric_candidate(
            &candidates,
            &["consum"],
            &["percent", "rate", "ratio", "remaining", "remain", "left"],
        )
    });

    let mut remaining =
        pick_numeric_candidate(&candidates, &["remaining"], &["percent", "rate", "ratio"])
            .or_else(|| {
                pick_numeric_candidate(&candidates, &["remain"], &["percent", "rate", "ratio"])
            })
            .or_else(|| {
                pick_numeric_candidate(&candidates, &["left"], &["percent", "rate", "ratio"])
            })
            .or_else(|| {
                pick_numeric_candidate(&candidates, &["available"], &["percent", "rate", "ratio"])
            });

    let mut total = pick_numeric_candidate(
        &candidates,
        &["total"],
        &[
            "percent",
            "rate",
            "ratio",
            "remaining",
            "remain",
            "left",
            "used",
            "consum",
        ],
    )
    .or_else(|| {
        pick_numeric_candidate(
            &candidates,
            &["quota"],
            &[
                "percent",
                "rate",
                "ratio",
                "remaining",
                "remain",
                "left",
                "used",
                "consum",
            ],
        )
    })
    .or_else(|| {
        pick_numeric_candidate(
            &candidates,
            &["limit"],
            &[
                "percent",
                "rate",
                "ratio",
                "remaining",
                "remain",
                "left",
                "used",
                "consum",
            ],
        )
    });

    if total.is_none() {
        if let (Some(u), Some(r)) = (used, remaining) {
            total = Some(u + r);
        }
    }

    if remaining.is_none() {
        if let (Some(t), Some(u)) = (total, used) {
            remaining = Some((t - u).max(0.0));
        }
    }

    if used.is_none() {
        if let (Some(t), Some(r)) = (total, remaining) {
            used = Some((t - r).max(0.0));
        }
    }

    let mut usage_percent =
        pick_numeric_candidate(&candidates, &["percent"], &["remaining", "remain", "left"]);

    if usage_percent.is_none() {
        usage_percent = pick_numeric_candidate(&candidates, &["ratio"], &[]);
    }

    if let Some(pct) = usage_percent {
        let normalized = if pct <= 1.0 { pct * 100.0 } else { pct };
        usage_percent = Some(clamp_percent(normalized));
    } else if let (Some(u), Some(t)) = (used, total) {
        if t > 0.0 {
            usage_percent = Some(clamp_percent((u / t) * 100.0));
        }
    }

    (used, total, remaining, usage_percent)
}

fn snapshot_has_any_data(snapshot: &QoderSnapshot) -> bool {
    snapshot.user_info_raw.is_some()
        || snapshot.user_plan_raw.is_some()
        || snapshot.credit_usage_raw.is_some()
}

fn same_identity(
    account: &QoderAccount,
    user_id: Option<&str>,
    email: Option<&str>,
    generated_id: &str,
) -> bool {
    if let (Some(left), Some(right)) = (
        normalize_non_empty(account.user_id.as_deref()),
        normalize_non_empty(user_id),
    ) {
        if left.eq_ignore_ascii_case(&right) {
            return true;
        }
    }

    if let (Some(left), Some(right)) = (
        normalize_email(Some(account.email.as_str())),
        normalize_email(email),
    ) {
        if left == right {
            return true;
        }
    }

    account.id == generated_id
}

fn normalize_tags(tags: Vec<String>) -> Option<Vec<String>> {
    let mut set = HashSet::new();
    let mut result = Vec::new();
    for raw in tags {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let normalized = trimmed.to_string();
        let lower = normalized.to_lowercase();
        if set.insert(lower) {
            result.push(normalized);
        }
    }
    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

fn snapshot_to_account(snapshot: QoderSnapshot, existing: Option<&QoderAccount>) -> QoderAccount {
    let now = now_ts();
    let email = extract_snapshot_email(&snapshot)
        .or_else(|| existing.and_then(|item| normalize_email(Some(item.email.as_str()))))
        .unwrap_or_else(|| "unknown@qoder.local".to_string());
    let user_id = extract_snapshot_user_id(&snapshot)
        .or_else(|| existing.and_then(|item| item.user_id.clone()));
    let generated_id = generate_account_id(&snapshot, user_id.as_deref(), Some(email.as_str()));
    let display_name = extract_snapshot_display_name(&snapshot)
        .or_else(|| existing.and_then(|item| item.display_name.clone()));
    let plan_type = extract_snapshot_plan_type(&snapshot)
        .or_else(|| existing.and_then(|item| item.plan_type.clone()));
    let (credits_used, credits_total, credits_remaining, credits_usage_percent) =
        extract_snapshot_credits(&snapshot);

    QoderAccount {
        id: existing.map(|item| item.id.clone()).unwrap_or(generated_id),
        email,
        user_id,
        display_name,
        plan_type,
        credits_used: credits_used.or_else(|| existing.and_then(|item| item.credits_used)),
        credits_total: credits_total.or_else(|| existing.and_then(|item| item.credits_total)),
        credits_remaining: credits_remaining
            .or_else(|| existing.and_then(|item| item.credits_remaining)),
        credits_usage_percent: credits_usage_percent
            .or_else(|| existing.and_then(|item| item.credits_usage_percent)),
        quota_query_last_error: if snapshot.credit_usage_raw.is_some() {
            None
        } else {
            existing.and_then(|item| item.quota_query_last_error.clone())
        },
        quota_query_last_error_at: if snapshot.credit_usage_raw.is_some() {
            None
        } else {
            existing.and_then(|item| item.quota_query_last_error_at)
        },
        usage_updated_at: if snapshot.credit_usage_raw.is_some() {
            Some(now)
        } else {
            existing.and_then(|item| item.usage_updated_at)
        },
        tags: existing.and_then(|item| item.tags.clone()),
        auth_user_info_raw: snapshot
            .user_info_raw
            .or_else(|| existing.and_then(|item| item.auth_user_info_raw.clone())),
        auth_user_plan_raw: snapshot
            .user_plan_raw
            .or_else(|| existing.and_then(|item| item.auth_user_plan_raw.clone())),
        auth_credit_usage_raw: snapshot
            .credit_usage_raw
            .or_else(|| existing.and_then(|item| item.auth_credit_usage_raw.clone())),
        created_at: existing.map(|item| item.created_at).unwrap_or(now),
        last_used: now,
    }
}

fn find_existing_account_for_snapshot(
    snapshot: &QoderSnapshot,
    accounts: &[QoderAccount],
) -> Option<QoderAccount> {
    let user_id = extract_snapshot_user_id(snapshot);
    let email = extract_snapshot_email(snapshot);
    let generated_id = generate_account_id(snapshot, user_id.as_deref(), email.as_deref());
    accounts
        .iter()
        .find(|item| same_identity(item, user_id.as_deref(), email.as_deref(), &generated_id))
        .cloned()
}

pub fn read_qoder_secret_json(db_path: &Path, db_key: &str) -> Result<Option<Value>, String> {
    let raw =
        crate::modules::vscode_inject::read_qoder_secret_storage_value_by_db_path(db_path, db_key)?;
    Ok(raw.map(|text| parse_json_or_string(text.as_str())))
}

fn read_snapshot_from_state_db_path(db_path: &Path) -> Result<Option<QoderSnapshot>, String> {
    if !db_path.exists() {
        return Ok(None);
    }

    let snapshot = QoderSnapshot {
        user_info_raw: read_qoder_secret_json(db_path, QODER_SECRET_USER_INFO_KEY)?,
        user_plan_raw: read_qoder_secret_json(db_path, QODER_SECRET_USER_PLAN_KEY)?,
        credit_usage_raw: read_qoder_secret_json(db_path, QODER_SECRET_CREDIT_USAGE_KEY)?,
    };

    if snapshot_has_any_data(&snapshot) {
        Ok(Some(snapshot))
    } else {
        Ok(None)
    }
}

fn merge_snapshot_for_platform(kind: QoderPlatformKind, snapshot: QoderSnapshot) -> Result<QoderAccount, String> {
    let accounts = list_accounts_for_platform(kind);
    let existing = find_existing_account_for_snapshot(&snapshot, &accounts);
    let account = snapshot_to_account(snapshot, existing.as_ref());
    upsert_account_record_for_platform(kind, account)
}

fn merge_snapshot(snapshot: QoderSnapshot) -> Result<QoderAccount, String> {
    merge_snapshot_for_platform(QoderPlatformKind::Global, snapshot)
}

pub fn upsert_account_from_snapshot_for_platform(
    kind: QoderPlatformKind,
    user_info_raw: Value,
    user_plan_raw: Option<Value>,
    credit_usage_raw: Option<Value>,
) -> Result<QoderAccount, String> {
    merge_snapshot_for_platform(kind, QoderSnapshot {
        user_info_raw: Some(user_info_raw),
        user_plan_raw,
        credit_usage_raw,
    })
}

pub fn upsert_account_from_snapshot(
    user_info_raw: Value,
    user_plan_raw: Option<Value>,
    credit_usage_raw: Option<Value>,
) -> Result<QoderAccount, String> {
    upsert_account_from_snapshot_for_platform(QoderPlatformKind::Global, user_info_raw, user_plan_raw, credit_usage_raw)
}

pub fn upsert_account_from_snapshot_cn(
    user_info_raw: Value,
    user_plan_raw: Option<Value>,
    credit_usage_raw: Option<Value>,
) -> Result<QoderAccount, String> {
    upsert_account_from_snapshot_for_platform(QoderPlatformKind::Cn, user_info_raw, user_plan_raw, credit_usage_raw)
}

pub fn get_default_qoder_state_db_path_for_platform(kind: QoderPlatformKind) -> Option<PathBuf> {
    let data_root = crate::modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(kind).ok()?;
    Some(
        data_root
            .join("User")
            .join("globalStorage")
            .join("state.vscdb"),
    )
}

pub fn get_default_qoder_state_db_path() -> Option<PathBuf> {
    get_default_qoder_state_db_path_for_platform(QoderPlatformKind::Global)
}

fn resolve_state_db_path_for_user_data_dir(user_data_dir: &str) -> PathBuf {
    PathBuf::from(user_data_dir)
        .join("User")
        .join("globalStorage")
        .join("state.vscdb")
}

pub fn ensure_state_db_path_for_user_data_dir_for_platform(
    kind: QoderPlatformKind,
    user_data_dir: &str,
) -> Result<PathBuf, String> {
    let root = PathBuf::from(user_data_dir);
    let candidates = vec![
        root.join("User").join("globalStorage").join("state.vscdb"),
        root.join("globalStorage").join("state.vscdb"),
        root.join("state.vscdb"),
    ];

    if let Some(existing) = candidates.iter().find(|path| path.exists()) {
        return Ok(existing.clone());
    }

    let preferred = resolve_state_db_path_for_user_data_dir(user_data_dir);
    if let Some(parent) = preferred.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建 {} globalStorage 目录失败: {}", kind.display_name(), e))?;
    }

    if let Some(default_db) = get_default_qoder_state_db_path_for_platform(kind) {
        if default_db.exists() && default_db != preferred {
            if let Err(err) = fs::copy(&default_db, &preferred) {
                logger::log_warn(&format!(
                    "{} 复制默认 state.vscdb 失败，改为写入新库: from={}, to={}, error={}",
                    kind.log_prefix(),
                    default_db.to_string_lossy(),
                    preferred.to_string_lossy(),
                    err
                ));
            }
        }
    }

    Ok(preferred)
}

pub fn ensure_state_db_path_for_user_data_dir(user_data_dir: &str) -> Result<PathBuf, String> {
    ensure_state_db_path_for_user_data_dir_for_platform(QoderPlatformKind::Global, user_data_dir)
}

fn ensure_default_state_db_path_for_platform(kind: QoderPlatformKind) -> Result<PathBuf, String> {
    let data_root = crate::modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(kind)?;
    ensure_state_db_path_for_user_data_dir_for_platform(kind, &data_root.to_string_lossy())
}

fn ensure_default_state_db_path() -> Result<PathBuf, String> {
    ensure_default_state_db_path_for_platform(QoderPlatformKind::Global)
}

fn read_snapshot_from_electron_auth_dat(data_root: &Path) -> Result<Option<QoderSnapshot>, String> {
    let auth_dat_path = data_root.join("auth.v1.dat");
    if !auth_dat_path.exists() {
        return Ok(None);
    }

    let encrypted = fs::read(&auth_dat_path)
        .map_err(|e| format!("读取 auth.v1.dat 失败: {}", e))?;
    if encrypted.is_empty() {
        return Ok(None);
    }

    let json_text = if encrypted.starts_with(b"v10") {
        #[cfg(target_os = "windows")]
        {
            let key = crate::modules::qwenwork_account::read_windows_encryption_key(data_root)?;
            let decrypted_bytes = crate::modules::vscode_inject::decrypt_windows_gcm_v10(&key, &encrypted)?;
            String::from_utf8(decrypted_bytes)
                .map_err(|e| format!("解密 auth.v1.dat 非 UTF-8: {}", e))?
        }
        #[cfg(not(target_os = "windows"))]
        {
            String::from_utf8_lossy(&encrypted).to_string()
        }
    } else {
        String::from_utf8(encrypted)
            .map_err(|e| format!("解析 auth.v1.dat 文本失败: {}", e))?
    };

    let parsed: Value = serde_json::from_str(&json_text)
        .map_err(|e| format!("解析 auth.v1.dat JSON 失败: {}", e))?;

    let has_token = parsed
        .get("token")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let has_user = parsed
        .get("user")
        .and_then(|u| u.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    if !has_token && !has_user {
        return Ok(None);
    }

    Ok(Some(QoderSnapshot {
        user_info_raw: Some(parsed),
        user_plan_raw: None,
        credit_usage_raw: None,
    }))
}

fn format_epoch_ms_or_iso(raw_time: Option<&Value>, default_days_ahead: i64) -> String {
    use chrono::{DateTime, Utc};
    if let Some(s) = raw_time.and_then(|v| v.as_str()) {
        if s.contains('-') && s.contains('T') {
            return s.to_string();
        }
        if let Ok(ms) = s.parse::<i64>() {
            let actual_ms = if ms > 0 && ms < 100_000_000_000 { ms * 1000 } else { ms };
            if let Some(dt) = DateTime::from_timestamp_millis(actual_ms) {
                return dt.format("%Y-%m-%dT%H:%M:%SZ").to_string();
            }
        }
    }
    if let Some(num) = raw_time.and_then(|v| v.as_i64()) {
        let actual_ms = if num > 0 && num < 100_000_000_000 { num * 1000 } else { num };
        if let Some(dt) = DateTime::from_timestamp_millis(actual_ms) {
            return dt.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        }
    }
    (Utc::now() + chrono::Duration::days(default_days_ahead))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

fn build_electron_auth_dat_payload(account: &QoderAccount) -> Option<Value> {
    let raw = account.auth_user_info_raw.as_ref()?;
    let user_id = raw
        .get("id")
        .and_then(|v| v.as_str())
        .or(account.user_id.as_deref())
        .unwrap_or(&account.id);
    let email = raw
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or(&account.email);
    let name = raw
        .get("name")
        .and_then(|v| v.as_str())
        .or(account.display_name.as_deref())
        .unwrap_or(email);
    let avatar_url = raw
        .get("avatarUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let token = raw
        .get("token")
        .or_else(|| raw.get("securityOauthToken"))
        .and_then(|v| v.as_str())?;
    if token.trim().is_empty() {
        return None;
    }
    let refresh_token = raw
        .get("refreshToken")
        .and_then(|v| v.as_str())
        .unwrap_or(token);

    let expires_at = format_epoch_ms_or_iso(
        raw.get("expiresAt").or_else(|| raw.get("expireTime")),
        30,
    );
    let refresh_expires_at = format_epoch_ms_or_iso(
        raw.get("refreshTokenExpiresAt").or_else(|| raw.get("refreshTokenExpireTime")),
        365,
    );

    let user_obj = raw
        .get("user")
        .and_then(Value::as_object)
        .map(|u| {
            let mut u_map = u.clone();
            if !u_map.contains_key("id") {
                u_map.insert("id".to_string(), serde_json::json!(user_id));
            }
            if !u_map.contains_key("email") {
                u_map.insert("email".to_string(), serde_json::json!(email));
            }
            if !u_map.contains_key("name") {
                u_map.insert("name".to_string(), serde_json::json!(name));
            }
            if !u_map.contains_key("avatarUrl") {
                u_map.insert("avatarUrl".to_string(), serde_json::json!(avatar_url));
            }
            if !u_map.contains_key("phone") {
                u_map.insert("phone".to_string(), serde_json::json!(""));
            }
            Value::Object(u_map)
        })
        .unwrap_or_else(|| {
            serde_json::json!({
                "id": user_id,
                "email": email,
                "name": name,
                "avatarUrl": avatar_url,
                "phone": ""
            })
        });

    let mut obj = raw.clone();
    if let Value::Object(ref mut map) = obj {
        map.insert("schemaVersion".to_string(), serde_json::json!(1));
        map.insert("id".to_string(), serde_json::json!(user_id));
        map.insert("email".to_string(), serde_json::json!(email));
        map.insert("name".to_string(), serde_json::json!(name));
        map.insert("avatarUrl".to_string(), serde_json::json!(avatar_url));
        map.insert("token".to_string(), serde_json::json!(token));
        map.insert("refreshToken".to_string(), serde_json::json!(refresh_token));
        map.insert("securityOauthToken".to_string(), serde_json::json!(token));
        map.insert("expiresAt".to_string(), serde_json::json!(expires_at));
        map.insert("refreshTokenExpiresAt".to_string(), serde_json::json!(refresh_expires_at));
        map.insert("privacyPolicyAgreed".to_string(), serde_json::json!(true));
        map.insert("user".to_string(), user_obj);
        if !map.contains_key("status") {
            map.insert("status".to_string(), serde_json::json!(2));
        }
        if !map.contains_key("quota") {
            map.insert("quota".to_string(), serde_json::json!(0));
        }
        if !map.contains_key("whitelist") {
            map.insert("whitelist".to_string(), serde_json::json!(3));
        }
        if !map.contains_key("userTag") {
            map.insert("userTag".to_string(), serde_json::json!(account.plan_type.as_deref().unwrap_or("Free")));
        }
        if !map.contains_key("userType") {
            map.insert("userType".to_string(), serde_json::json!("personal_standard"));
        }
    }
    Some(obj)
}

fn write_electron_auth_dat_if_present(data_root: &Path, account: &QoderAccount) -> Result<(), String> {
    let local_state_path = data_root.join("Local State");
    if !local_state_path.exists() {
        return Ok(());
    }
    let payload_val = match build_electron_auth_dat_payload(account) {
        Some(val) => val,
        None => return Ok(()),
    };
    let payload = serde_json::to_string(&payload_val)
        .map_err(|e| format!("序列化 auth.v1.dat 失败: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        let key = crate::modules::qwenwork_account::read_windows_encryption_key(data_root)?;
        let encrypted = crate::modules::vscode_inject::encrypt_windows_gcm_v10(&key, payload.as_bytes())?;
        fs::write(data_root.join("auth.v1.dat"), encrypted)
            .map_err(|e| format!("写入 auth.v1.dat 失败: {}", e))?;
        logger::log_info(&format!(
            "已写入 Electron auth.v1.dat: dir={}, email={}, id={}",
            data_root.display(),
            account.email,
            account.id
        ));
    }
    Ok(())
}

pub fn import_from_local_for_platform(kind: QoderPlatformKind) -> Result<Option<QoderAccount>, String> {
    if kind == QoderPlatformKind::QwenWork {
        return crate::modules::qwenwork_account::import_from_local_qwenwork();
    }

    let data_root = crate::modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(kind)?;

    if let Ok(Some(snapshot)) = read_snapshot_from_electron_auth_dat(&data_root) {
        let account = merge_snapshot_for_platform(kind, snapshot)?;
        logger::log_info(&format!(
            "{} 从新版客户端 auth.v1.dat 本地导入成功: id={}, email={}, dir={}",
            kind.log_prefix(),
            account.id,
            account.email,
            data_root.to_string_lossy()
        ));
        return Ok(Some(account));
    }

    let db_path = ensure_default_state_db_path_for_platform(kind)?;
    let Some(snapshot) = read_snapshot_from_state_db_path(&db_path)? else {
        return Ok(None);
    };
    let account = merge_snapshot_for_platform(kind, snapshot)?;
    logger::log_info(&format!(
        "{} 从本地 state.vscdb 导入成功: id={}, email={}, db={}",
        kind.log_prefix(),
        account.id,
        account.email,
        db_path.to_string_lossy()
    ));
    Ok(Some(account))
}

pub fn import_from_local() -> Result<Option<QoderAccount>, String> {
    import_from_local_for_platform(QoderPlatformKind::Global)
}

pub fn import_from_local_cn() -> Result<Option<QoderAccount>, String> {
    import_from_local_for_platform(QoderPlatformKind::Cn)
}

pub fn import_from_local_qwenwork() -> Result<Option<QoderAccount>, String> {
    import_from_local_for_platform(QoderPlatformKind::QwenWork)
}

pub(crate) fn resolve_current_account_id_for_platform(
    kind: QoderPlatformKind,
    accounts: &[QoderAccount],
) -> Option<String> {
    crate::modules::provider_current_state::resolve_existing_current_account_id(
        kind.platform_id(),
        accounts.iter().map(|account| account.id.as_str()),
    )
}

pub(crate) fn resolve_current_account_id(accounts: &[QoderAccount]) -> Option<String> {
    resolve_current_account_id_for_platform(QoderPlatformKind::Global, accounts)
}

pub(crate) fn resolve_current_account_id_cn(accounts: &[QoderAccount]) -> Option<String> {
    resolve_current_account_id_for_platform(QoderPlatformKind::Cn, accounts)
}

fn serialize_raw_or_fallback(raw: &Option<Value>, fallback: Value) -> Result<String, String> {
    let value = raw.clone().unwrap_or(fallback);
    serde_json::to_string(&value).map_err(|e| format!("序列化 Qoder 注入数据失败: {}", e))
}

fn build_user_info_fallback(account: &QoderAccount) -> Value {
    serde_json::json!({
        "id": account.user_id.clone().unwrap_or_default(),
        "email": account.email,
        "name": account.display_name.clone().unwrap_or_default(),
    })
}

fn build_user_plan_fallback(account: &QoderAccount) -> Value {
    serde_json::json!({
        "plan": account.plan_type.clone().unwrap_or_default(),
        "tier": account.plan_type.clone().unwrap_or_default(),
    })
}

fn build_credit_usage_fallback(account: &QoderAccount) -> Value {
    serde_json::json!({
        "used": account.credits_used,
        "total": account.credits_total,
        "remaining": account.credits_remaining,
        "usagePercent": account.credits_usage_percent,
    })
}

fn verify_state_db_key_exists(db_path: &Path, db_key: &str) -> Result<(), String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("注入校验失败，无法打开 state.vscdb: {}", e))?;

    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM ItemTable WHERE key = ?1",
            [db_key],
            |row| row.get(0),
        )
        .ok();

    match value {
        Some(stored) if !stored.trim().is_empty() => Ok(()),
        _ => Err(format!(
            "注入校验失败，未在 state.vscdb 找到 key: db={}, key={}",
            db_path.to_string_lossy(),
            db_key
        )),
    }
}

fn verify_injected_account_matches(db_path: &Path, account: &QoderAccount) -> Result<(), String> {
    let snapshot = read_snapshot_from_state_db_path(db_path)?.ok_or_else(|| {
        format!(
            "注入校验失败，未读取到 state.vscdb 快照: {}",
            db_path.display()
        )
    })?;
    let effective_user_id = extract_snapshot_user_id(&snapshot);
    let effective_email = extract_snapshot_email(&snapshot);
    let generated_id = generate_account_id(
        &snapshot,
        effective_user_id.as_deref(),
        effective_email.as_deref(),
    );

    if same_identity(
        account,
        effective_user_id.as_deref(),
        effective_email.as_deref(),
        &generated_id,
    ) {
        return Ok(());
    }

    Err(format!(
        "注入校验失败，落盘账号与目标账号不一致: db={}, target_id={}, target_email={}, actual_user_id={:?}, actual_email={:?}",
        db_path.display(),
        account.id,
        account.email,
        effective_user_id,
        effective_email
    ))
}

pub fn inject_to_qoder_for_platform(kind: QoderPlatformKind, account_id: &str) -> Result<(), String> {
    if kind == QoderPlatformKind::QwenWork {
        let dir = crate::modules::qwenwork_account::get_default_qwenwork_user_data_dir();
        return crate::modules::qwenwork_account::inject_to_qwenwork_dir(&dir, account_id, true);
    }
    if let Ok(data_root) = crate::modules::qoder_instance::get_default_qoder_user_data_dir_for_platform(kind) {
        if let Some(account) = load_account_for_platform(kind, account_id) {
            let _ = write_electron_auth_dat_if_present(&data_root, &account);
        }
    }
    let db_path = ensure_default_state_db_path_for_platform(kind)?;
    inject_to_qoder_at_path_for_platform(kind, &db_path, account_id)
}

pub fn inject_to_qoder(account_id: &str) -> Result<(), String> {
    inject_to_qoder_for_platform(QoderPlatformKind::Global, account_id)
}

pub fn inject_to_qoder_cn(account_id: &str) -> Result<(), String> {
    inject_to_qoder_for_platform(QoderPlatformKind::Cn, account_id)
}

pub fn inject_to_qwenwork(account_id: &str) -> Result<(), String> {
    inject_to_qoder_for_platform(QoderPlatformKind::QwenWork, account_id)
}

pub fn inject_to_qoder_for_user_data_dir_for_platform(
    kind: QoderPlatformKind,
    user_data_dir: &str,
    account_id: &str,
) -> Result<(), String> {
    if kind == QoderPlatformKind::QwenWork {
        return crate::modules::qwenwork_account::inject_to_qwenwork_dir(
            Path::new(user_data_dir),
            account_id,
            false,
        );
    }
    if let Some(account) = load_account_for_platform(kind, account_id) {
        let _ = write_electron_auth_dat_if_present(Path::new(user_data_dir), &account);
    }
    let db_path = ensure_state_db_path_for_user_data_dir_for_platform(kind, user_data_dir)?;
    inject_to_qoder_at_path_for_platform(kind, &db_path, account_id)
}

pub fn inject_to_qoder_for_user_data_dir(
    user_data_dir: &str,
    account_id: &str,
) -> Result<(), String> {
    inject_to_qoder_for_user_data_dir_for_platform(QoderPlatformKind::Global, user_data_dir, account_id)
}

pub fn inject_to_qoder_cn_for_user_data_dir(
    user_data_dir: &str,
    account_id: &str,
) -> Result<(), String> {
    inject_to_qoder_for_user_data_dir_for_platform(QoderPlatformKind::Cn, user_data_dir, account_id)
}

pub fn inject_to_qoder_at_path_for_platform(
    kind: QoderPlatformKind,
    db_path: &Path,
    account_id: &str,
) -> Result<(), String> {
    let account = load_account_for_platform(kind, account_id)
        .ok_or_else(|| format!("{} 账号不存在: {}", kind.display_name(), account_id))?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建 {} state.vscdb 目录失败: {}", kind.display_name(), e))?;
    }

    let user_info_json = serialize_raw_or_fallback(
        &account.auth_user_info_raw,
        build_user_info_fallback(&account),
    )?;
    let user_plan_json = serialize_raw_or_fallback(
        &account.auth_user_plan_raw,
        build_user_plan_fallback(&account),
    )?;
    let credit_usage_json = serialize_raw_or_fallback(
        &account.auth_credit_usage_raw,
        build_credit_usage_fallback(&account),
    )?;

    crate::modules::vscode_inject::inject_secret_to_state_db_for_qoder(
        db_path,
        QODER_SECRET_USER_INFO_KEY,
        &user_info_json,
    )?;
    crate::modules::vscode_inject::inject_secret_to_state_db_for_qoder(
        db_path,
        QODER_SECRET_USER_PLAN_KEY,
        &user_plan_json,
    )?;
    crate::modules::vscode_inject::inject_secret_to_state_db_for_qoder(
        db_path,
        QODER_SECRET_CREDIT_USAGE_KEY,
        &credit_usage_json,
    )?;

    if let Some(data_root) = db_path.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
        if let Err(e) = write_electron_auth_dat_if_present(data_root, &account) {
            logger::log_warn(&format!("写入 auth.v1.dat 警告: {}", e));
        }
    }

    verify_state_db_key_exists(db_path, QODER_SECRET_USER_INFO_KEY)?;
    verify_state_db_key_exists(db_path, QODER_SECRET_USER_INFO_KEY)?;
    verify_state_db_key_exists(db_path, QODER_SECRET_USER_PLAN_KEY)?;
    verify_state_db_key_exists(db_path, QODER_SECRET_CREDIT_USAGE_KEY)?;
    verify_injected_account_matches(db_path, &account)?;

    let mut updated = account.clone();
    updated.last_used = now_ts();
    let _ = upsert_account_record_for_platform(kind, updated);

    logger::log_info(&format!(
        "{} 注入成功: account_id={}, email={}, db={}",
        kind.log_prefix(),
        account.id,
        account.email,
        db_path.to_string_lossy()
    ));
    Ok(())
}

pub fn inject_to_qoder_at_path(db_path: &Path, account_id: &str) -> Result<(), String> {
    inject_to_qoder_at_path_for_platform(QoderPlatformKind::Global, db_path, account_id)
}

pub fn update_account_tags_for_platform(
    kind: QoderPlatformKind,
    account_id: &str,
    tags: Vec<String>,
) -> Result<QoderAccount, String> {
    let mut account = load_account_for_platform(kind, account_id)
        .ok_or_else(|| format!("{} 账号不存在: {}", kind.display_name(), account_id))?;
    account.tags = normalize_tags(tags);
    account.last_used = now_ts();
    upsert_account_record_for_platform(kind, account)
}

pub fn update_account_tags(account_id: &str, tags: Vec<String>) -> Result<QoderAccount, String> {
    update_account_tags_for_platform(QoderPlatformKind::Global, account_id, tags)
}

pub fn update_account_tags_cn(account_id: &str, tags: Vec<String>) -> Result<QoderAccount, String> {
    update_account_tags_for_platform(QoderPlatformKind::Cn, account_id, tags)
}

fn normalize_imported_account(mut account: QoderAccount) -> QoderAccount {
    let now = now_ts();
    account.id = sanitize_account_id_component(account.id.trim());
    if account.id.is_empty() {
        let snapshot = QoderSnapshot {
            user_info_raw: account.auth_user_info_raw.clone(),
            user_plan_raw: account.auth_user_plan_raw.clone(),
            credit_usage_raw: account.auth_credit_usage_raw.clone(),
        };
        account.id = generate_account_id(
            &snapshot,
            account.user_id.as_deref(),
            Some(account.email.as_str()),
        );
    }
    account.email = normalize_email(Some(account.email.as_str()))
        .unwrap_or_else(|| "unknown@qoder.local".to_string());
    account.user_id = normalize_non_empty(account.user_id.as_deref());
    account.display_name = normalize_non_empty(account.display_name.as_deref());
    account.plan_type = normalize_non_empty(account.plan_type.as_deref());
    account.tags = normalize_tags(account.tags.unwrap_or_default());
    account.quota_query_last_error = normalize_non_empty(account.quota_query_last_error.as_deref());
    if account.created_at <= 0 {
        account.created_at = now;
    }
    if account.last_used <= 0 {
        account.last_used = now;
    }
    if account.credits_usage_percent.is_none() {
        if let (Some(used), Some(total)) = (account.credits_used, account.credits_total) {
            if total > 0.0 {
                account.credits_usage_percent = Some(clamp_percent((used / total) * 100.0));
            }
        }
    }
    account
}

fn parse_import_item(item: &Value) -> Result<QoderAccount, String> {
    if let Ok(account) = serde_json::from_value::<QoderAccount>(item.clone()) {
        return Ok(normalize_imported_account(account));
    }

    let Some(obj) = item.as_object() else {
        return Err("Qoder 导入数据格式无效".to_string());
    };

    let snapshot = QoderSnapshot {
        user_info_raw: obj
            .get("auth_user_info_raw")
            .or_else(|| obj.get("userInfo"))
            .cloned(),
        user_plan_raw: obj
            .get("auth_user_plan_raw")
            .or_else(|| obj.get("userPlan"))
            .cloned(),
        credit_usage_raw: obj
            .get("auth_credit_usage_raw")
            .or_else(|| obj.get("creditUsage"))
            .cloned(),
    };

    if !snapshot_has_any_data(&snapshot) {
        return Err("Qoder 导入项缺少账号字段".to_string());
    }

    Ok(snapshot_to_account(snapshot, None))
}

pub fn import_from_json_for_platform(
    kind: QoderPlatformKind,
    json_content: &str,
) -> Result<Vec<QoderAccount>, String> {
    let parsed: Value =
        serde_json::from_str(json_content).map_err(|e| format!("JSON 解析失败: {}", e))?;
    let items: Vec<Value> = match parsed {
        Value::Array(list) => list,
        Value::Object(map) => {
            if let Some(Value::Array(list)) = map.get("accounts") {
                list.clone()
            } else {
                vec![Value::Object(map)]
            }
        }
        _ => return Err("仅支持对象或数组格式的 Qoder JSON".to_string()),
    };

    if items.is_empty() {
        return Ok(Vec::new());
    }

    let mut imported = Vec::new();
    for item in items {
        let account = parse_import_item(&item)?;
        let saved = upsert_account_record_for_platform(kind, account)?;
        imported.push(saved);
    }

    Ok(imported)
}

pub fn import_from_json(json_content: &str) -> Result<Vec<QoderAccount>, String> {
    import_from_json_for_platform(QoderPlatformKind::Global, json_content)
}

pub fn import_from_json_cn(json_content: &str) -> Result<Vec<QoderAccount>, String> {
    import_from_json_for_platform(QoderPlatformKind::Cn, json_content)
}

pub fn export_accounts_for_platform(
    kind: QoderPlatformKind,
    account_ids: &[String],
) -> Result<String, String> {
    let accounts = list_accounts_for_platform(kind);
    let selected: Vec<QoderAccount> = if account_ids.is_empty() {
        accounts
    } else {
        let target: HashSet<String> = account_ids
            .iter()
            .map(|id| id.trim().to_string())
            .filter(|id| !id.is_empty())
            .collect();
        accounts
            .into_iter()
            .filter(|item| target.contains(&item.id))
            .collect()
    };

    serde_json::to_string_pretty(&selected).map_err(|e| format!("序列化导出 JSON 失败: {}", e))
}

pub fn export_accounts(account_ids: &[String]) -> Result<String, String> {
    export_accounts_for_platform(QoderPlatformKind::Global, account_ids)
}

pub fn export_accounts_cn(account_ids: &[String]) -> Result<String, String> {
    export_accounts_for_platform(QoderPlatformKind::Cn, account_ids)
}

pub fn export_accounts_qwenwork(account_ids: &[String]) -> Result<String, String> {
    export_accounts_for_platform(QoderPlatformKind::QwenWork, account_ids)
}

pub fn upsert_qwenwork_snapshot(
    user_info_raw: Value,
    user_plan_raw: Value,
    credit_usage_raw: Value,
) -> Result<QoderAccount, String> {
    let has_usage = !credit_usage_raw.is_null() && credit_usage_raw != serde_json::json!({});
    let snapshot = QoderSnapshot {
        user_info_raw: Some(user_info_raw),
        user_plan_raw: Some(user_plan_raw),
        credit_usage_raw: if has_usage { Some(credit_usage_raw) } else { None },
    };
    merge_snapshot_for_platform(QoderPlatformKind::QwenWork, snapshot)
}

pub fn record_platform_checkin_reward(
    kind: QoderPlatformKind,
    account_id: &str,
    today: &str,
    reward_credits: f64,
) -> Result<QoderAccount, String> {
    let mut account = load_account_for_platform(kind, account_id)
        .ok_or_else(|| format!("{} 账号不存在: {}", kind.display_name(), account_id))?;

    let prev_total = account.credits_total.unwrap_or(1000.0);
    let prev_remaining = account.credits_remaining.unwrap_or(prev_total);
    let next_total = (prev_total + reward_credits).max(reward_credits);
    let next_remaining = prev_remaining + reward_credits;
    let used = (next_total - next_remaining).max(0.0);
    let usage_percent = if next_total > 0.0 {
        (used / next_total) * 100.0
    } else {
        0.0
    };

    account.credits_total = Some(next_total);
    account.credits_remaining = Some(next_remaining);
    account.credits_used = Some(used);
    account.credits_usage_percent = Some(usage_percent);
    account.usage_updated_at = Some(now_ts());
    account.last_used = now_ts();

    let mut credit_obj = account
        .auth_credit_usage_raw
        .take()
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    let prev_checkins = credit_obj
        .get("total_checkins")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    credit_obj.insert("used".to_string(), serde_json::json!(used));
    credit_obj.insert("total".to_string(), serde_json::json!(next_total));
    credit_obj.insert("remaining".to_string(), serde_json::json!(next_remaining));
    credit_obj.insert("usagePercent".to_string(), serde_json::json!(usage_percent));
    credit_obj.insert("checked_in_today".to_string(), serde_json::json!(true));
    credit_obj.insert("last_checkin_date".to_string(), serde_json::json!(today));
    credit_obj.insert("checkin_reward".to_string(), serde_json::json!(reward_credits));
    credit_obj.insert("total_checkins".to_string(), serde_json::json!(prev_checkins + 1));
    account.auth_credit_usage_raw = Some(Value::Object(credit_obj));

    upsert_account_record_for_platform(kind, account)
}

pub fn record_qwenwork_checkin_reward(
    account_id: &str,
    today: &str,
    reward_credits: f64,
) -> Result<QoderAccount, String> {
    record_platform_checkin_reward(QoderPlatformKind::QwenWork, account_id, today, reward_credits)
}

pub fn record_qwenwork_verified_checkin(
    account_id: &str,
    today: &str,
    reward_credits: f64,
) -> Result<QoderAccount, String> {
    let mut account = load_account_for_platform(QoderPlatformKind::QwenWork, account_id)
        .ok_or_else(|| format!("千问办公账号不存在: {}", account_id))?;

    let now = now_ts();
    account.usage_updated_at = Some(now);
    account.last_used = now;

    let mut credit_obj = account
        .auth_credit_usage_raw
        .take()
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    let prev_checkins = credit_obj
        .get("total_checkins")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    credit_obj.insert("checked_in_today".to_string(), serde_json::json!(true));
    credit_obj.insert("last_checkin_date".to_string(), serde_json::json!(today));
    credit_obj.insert("checkin_reward".to_string(), serde_json::json!(reward_credits));
    credit_obj.insert("total_checkins".to_string(), serde_json::json!(prev_checkins + 1));
    account.auth_credit_usage_raw = Some(Value::Object(credit_obj));

    upsert_account_record_for_platform(QoderPlatformKind::QwenWork, account)
}

pub async fn sync_qoder_usage_from_remote(
    kind: QoderPlatformKind,
    account_id: &str,
    token: &str,
) -> Result<QoderAccount, String> {
    if token.trim().is_empty() {
        return Err("Token 不能为空".to_string());
    }

    if kind == QoderPlatformKind::QwenWork {
        return crate::modules::qwenwork_account::sync_qwenwork_usage_from_remote(account_id, token).await;
    }

    let base_url = match kind {
        QoderPlatformKind::Cn => "https://openapi.qoder.com.cn",
        QoderPlatformKind::Global => "https://openapi.qoder.sh",
        QoderPlatformKind::QwenWork => "https://gateway.qwenwork.cn",
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {}", e))?;

    let url = format!("{}/sash/api/v2/me/usage", base_url);
    let raw_uid = account_id.strip_prefix("qoder_uid_");
    let headers = crate::modules::qwenwork_account::build_qoder_desktop_client_headers(
        kind,
        token.trim(),
        raw_uid,
    );

    let resp = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("获取最新配额失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("获取最新配额失败: HTTP {}", resp.status()));
    }

    let body: Value = resp.json().await.map_err(|e| format!("解析配额JSON失败: {}", e))?;

    let mut account = load_account_for_platform(kind, account_id)
        .ok_or_else(|| format!("账号不存在: {}", account_id))?;

    if let Some(usage_obj) = body.get("qoderUsage") {
        account.auth_credit_usage_raw = Some(usage_obj.clone());

        let mut total = 0.0;
        let mut used = 0.0;
        let mut remaining = 0.0;

        if let Some(uq) = usage_obj.get("userQuota") {
            let u_total = uq.get("total").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let u_used = uq.get("used").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let u_rem = uq.get("remaining").and_then(|v| v.as_f64()).unwrap_or(u_total - u_used);
            total += u_total;
            used += u_used;
            remaining += u_rem;
        }

        if let Some(aq) = usage_obj.get("addOnQuota") {
            let a_total = aq.get("total").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let a_used = aq.get("used").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let a_rem = aq.get("remaining").and_then(|v| v.as_f64()).unwrap_or(a_total - a_used);
            total += a_total;
            used += a_used;
            remaining += a_rem;
        }

        account.credits_total = Some(total);
        account.credits_used = Some(used);
        account.credits_remaining = Some(remaining);
        account.credits_usage_percent = if total > 0.0 {
            Some((used / total) * 100.0)
        } else {
            Some(0.0)
        };
        account.usage_updated_at = Some(now_ts());
        account.last_used = now_ts();

        let updated = upsert_account_record_for_platform(kind, account)?;
        return Ok(updated);
    }

    Ok(account)
}


