use crate::modules::logger;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_CHECK_INTERVAL_HOURS: u64 = 1;
const LEGACY_DEFAULT_CHECK_INTERVAL_HOURS: u64 = 24;
const LEGACY_PREVIOUS_DEFAULT_CHECK_INTERVAL_HOURS: u64 = 6;
const PENDING_UPDATE_NOTES_FILE: &str = "pending_update_notes.json";
const CHANGELOG_MARKDOWN_EN: &str = r#"## [1.0.5] - 2026-09-26

### Highlights
- Full-Chain Sandbox & Hardware Fingerprint Injection: Built independent `.sandbox/home` and `.sandbox/appdata` isolation hierarchies with comprehensive environment variable redirection (USERPROFILE, APPDATA, LOCALAPPDATA) and IDE device manifest auto-generation (.device.json, machine_id, installation_id).
- Deep Credential Sanitization: Automatic purging of stale login tokens from `state.vscdb`, `storage.json`, and `.auth` directories when launching unbound or blank instances.
- Universal Multi-Instance Lifecycle & UI Polish: Standardized multi-instance launch pipeline across Qoder, QwenWork, Trae, and CodeBuddy, with polished settings and schedule notification modal styling.

### Added
- Multi-tier sandbox filesystem initialization (.sandbox/home, .sandbox/appdata/Roaming, .sandbox/appdata/Local)
- Dedicated device manifest generator for .qwenworkcn, .qoder, .qoder-cn, .trae, .trae-cn, .codebuddy, and .workbuddy
- Stale credential purge utility for blank and unbound multi-instance launches

### Changed
- Refactored instance process launch commands to enforce sandboxed environment variables and isolate extension telemetry
- Polished ScheduleNotificationModal and Settings visual layout and responsive styles

### Fixed
- Fixed potential cross-instance credential contamination when switching between isolated instances
- Fixed telemetry device ID leakage into global user profile directories

## [1.0.4] - 2026-09-26

### Highlights
- Deep Hardware Fingerprint & Sandbox Isolation: Introduced per-instance virtual hardware fingerprinting (MachineGuid, telemetry.machineId, devDeviceId, sqmId, MAC Address, SMBIOS UUID, Disk Serial, Hostname, and GPU/CPU signatures) to prevent cross-account risk association.
- Blank Isolated Environment & One-Click Rotation: Support creating pure blank isolated instances with credential cache purging and real-time hardware fingerprint inspection and rotation.
- QwenWork CN Multi-Instance & Account Enhancement: Upgraded QwenWork CN multi-instance isolation, token injection, and status synchronization.

### Added
- Dedicated `instance_fingerprint` engine with realistic IEEE OUI MAC generation and SQLite `state.vscdb` / `storage.json` fingerprint injection
- Interactive Hardware Fingerprint Sandbox Inspector modal in Instances Manager with one-click fingerprint regeneration
- Support for creating Blank Isolated Instances with automatic legacy session cleanup

### Changed
- Enhanced process launch pipeline to inject virtualized hardware environment variables per isolated instance
- Improved QwenWork CN account extraction and multi-instance binding workflow

### Fixed
- Fixed cross-instance device fingerprint leakage when running multiple IDE instances simultaneously
- Sanitized residual fallback development paths in session and mock services

## [1.0.3] - 2026-09-26

### Highlights
- Trae Check-in Risk Control Resolution: Automatically extracts and decrypts genuine registered device identifiers from TinyStorage (aha.device.device_id) and running logs, eliminating ByteDance 9074 risk rejections.
- CodeBuddy Quota Card Layout Overlap Fix: Completely solved text colliding and squeezing in quota category headers with flexible container truncation, tooltip previews, and improved grid spacing.
- Robust Auto-Update Delivery: Synchronized official updater keypair and multi-target manifests for seamless one-click background upgrade.

### Added
- Automated TinyStorage ByteCrypto decryption helper for genuine Trae device identification
- Interactive tooltip support for truncated resource package titles, quota figures, and expiration timestamps

### Changed
- Refactored CodeBuddy / Workbuddy quota item layout with resilient flex truncation
- Enhanced accounts grid card minimum width to 250px for clearer typography

### Fixed
- Fixed Trae daily check-in failure caused by unregistered client device IDs (code: 9074)
- Fixed text squeezing and overlapping between package names, badge counts, and quota statistics

## [1.0.2] - 2026-09-26

### Highlights
- Multi-Account Collision & Overwrite Eradicated: Completely fixed account identity collision in CodeBuddy, Workbuddy, Qoder, and Trae when email or UID is absent, ensuring 100% independent coexistence.
- Account-Isolated Check-in & Token Protection: All daily check-in tasks strictly use each account's dedicated persisted credentials without relying on local IDE runtime sessions.
- Full Windows Updater Target Coverage: Added complete manifest coverage for NSIS, MSI, and standard targets, eliminating update check errors.
- Automatic Temp Installer Cleanup: Automatically cleans up downloaded updater packages from temporary directories to prevent disk space accumulation.

### Added
- Auto-cleaner for stale updater temporary installation packages
- Multi-target updater manifest coverage (windows-x86_64, windows-x86_64-nsis, windows-x86_64-msi)

### Changed
- Decoupled daily check-in and quota queries from local running IDE instances
- Improved token collision prevention with cryptographic salt fallbacks

### Fixed
- Fixed account overwrite bug where adding a new account squeezed out existing accounts
- Fixed check-in failure for inactive/background accounts across all platforms
- Fixed updater package accumulation in temp directories

## [1.0.1] - 2026-09-26

### Highlights
- Physical Storage Isolation: Complete migration to independent directory `~/.ai_codepass`.
- Codebase Privacy Sanitization: Completely removed hardcoded test accounts, author personal paths, and test credentials.
- Enhanced Qoder Auto Check-in: Improved SASH protocol compliance and client headers for stable daily credit claims.
- Compact Size & Native Performance: Preserved ultra-light 8.5MB installer package.

### Added
- Independent storage directory `~/.ai_codepass` for clean initial installations
- SASH client protocol enhancements for Qoder global check-in

### Changed
- Refactored user storage path to prevent legacy data leakage
- Synchronized latest v1.0.1 release notes and changelog history

### Fixed
- Fixed legacy account residue on clean installations
- Cleaned up obsolete configuration and debugging references

## [1.0.0] - 2026-09-26

### Highlights
- Specialized standalone management tool for CodeBuddy, Qoder, and Trae.
- Qoder Global daily 100 Credits check-in support with SASH protocol & hardware device headers.
- Real-time quota & plan monitoring with exact reset and expiration countdown.

### Added
- CodeBuddy / Workbuddy multi-account switching and credential extraction
- Qoder CN & Global multi-account management
- Qoder Global daily 100 Credits claim with SASH protocol
- Trae & TRAE SOLO multi-account management and auto check-in
- Real-time quota monitoring and reset countdown
- Multi-instance environment isolation
- System tray integration and instant switching

### Changed
- Refactored lightweight architecture with over 80% faster startup
- Modern minimalist dual-column UI with dark/light theme support

### Fixed
- Fixed Qoder Global campaign recognition and credit query
- Fixed desktop process sync during account switching
"#;

const CHANGELOG_MARKDOWN_ZH: &str = r#"## [1.0.5] - 2026-09-26

### 重要更新
- 全链路沙箱目录与硬件指纹环境注入：为每个多开实例构建专属三级沙箱结构（`.sandbox/home`、`.sandbox/appdata/Roaming`、`.sandbox/appdata/Local`），并在进程启动时全面重定向系统环境变量（`USERPROFILE`、`APPDATA`、`LOCALAPPDATA`）与各大 AI 助手专属设备文件（`.device.json`、`machine_id`、`installation_id`）。
- 历史凭据深度清理与防串号：在启动空白或未绑定实例时，自动清理 `state.vscdb`、`storage.json` 与 `.auth` 目录下的历史残留账号凭据，彻底杜绝历史账号残留。
- 全平台实例生命周期标准化与界面打磨：统一 Qoder、千问办公、Trae、CodeBuddy 等多平台的沙箱启动链路，并优化定时通知弹窗与设置页面的排版间距。

### 新增
- 实例专属沙箱多级文件系统自动构建引擎
- 自动生成针对千问办公、Qoder、Trae、CodeBuddy 等主流 AI 助手的专属设备清单与指纹文件
- 空白与未绑定实例启动时的历史凭据自动清洗机制（`purge_residual_account_credentials`）

### 变更
- 升级各平台多开子进程启动参数，严格隔离全局用户目录与扩展遥测
- 优化 ScheduleNotificationModal 与设置页面的响应式排版

### 修复
- 修复在多个独立实例间快速切换可能发生凭据缓存交叉污染的问题
- 修复实例子进程可能向系统全局用户目录写入默认设备指纹的隐患

## [1.0.4] - 2026-09-26

### 重要更新
- 深度硬件指纹隔离与虚拟环境多开：新增实例级虚拟硬件指纹引擎（涵盖 MachineGuid、telemetry.machineId、devDeviceId、sqmId、真实厂商前缀 MAC 地址、SMBIOS UUID、磁盘序列号、主机名与 CPU/GPU 渲染签名），全方位阻断多开账号间的风控关联。
- 空白纯净隔离环境与一键换新：支持创建不继承任何历史残留的“纯净空白隔离实例”，并提供可视化硬件指纹沙箱检视面板与一键轮换重置硬件指纹能力。
- 千问办公 (QwenWork CN) 多开与账号同步升级：全面打通千问办公多实例独立目录隔离、进程级虚拟环境注入与账号状态实时同步。

### 新增
- 实例专属硬件指纹生成与持久化引擎（`instance_fingerprint`），自动向 `state.vscdb` 与 `storage.json` 注入虚拟设备指纹
- 多开实例管理器新增硬件指纹徽章（`FP-XXXXXXXX`）与硬件指纹沙箱详情检视/一键换新弹窗
- 新增“空白纯净隔离实例”初始化模式，自动清理目标实例中的历史凭据与会话残留

### 变更
- 升级编辑器进程启动链路，支持按实例注入虚拟硬件环境变量与隔离参数
- 优化千问办公账号提取与多开实例绑定交互体验

### 修复
- 修复多开实例同时运行时可能共享物理机默认 telemetry 设备指纹导致风控关联的问题
- 彻底清理前端备用会话与预览回退逻辑中的本地开发路径残留

## [1.0.3] - 2026-09-26

### 重要更新
- Trae 签到风控彻底修复：新增从本机真实 TinyStorage（aha.device.device_id）与日志中自动解密提取字节跳动已注册真实设备 ID，彻底解决 9074（当前参与用户太多）风控拦截。
- CodeBuddy 配额卡片挤压修复：重构配额分类头部弹性布局与文本截断机制，配合全量悬浮 Tooltip 与网格呼吸间距，彻底消除文字与数值重叠挤压。
- 自动更新平滑升级闭环：统一专用签名密钥与全架构更新清单，支持 1.0.2 客户端一键平滑静默下载与无缝升级。

### 新增
- Trae 真实设备 ID 自动解密提取引擎（TinyStorage + ByteCrypto v1）
- 配额分类名称、资源包数量与到期时间超长时鼠标悬停完整 Tooltip 提示

### 变更
- 重构 CodeBuddy / Workbuddy 配额卡片内部弹性排版，保障极端窄窗下的排版健壮性
- 优化账号卡片网格最小列宽至 250px，提供更舒适的视觉呼吸感

### 修复
- 彻底修复 Trae 签到因伪造随机设备指纹触发 9074 风控拦截的缺陷
- 彻底修复 CodeBuddy 资源包分类中名称、角标与用量数值发生重合挤压的问题

## [1.0.2] - 2026-09-26

### 重要更新
- 全平台多账号防顶替防覆盖：彻底根除 CodeBuddy、Workbuddy、Qoder 与 Trae 在缺少邮箱或 UID 时的账号 ID 碰撞，确保扫码多账号添加 100% 独立共存。
- 全平台签到隔离与防串号：各平台签到任务严格使用各账号专属持久化 Token，不依赖本地客户端运行状态，杜绝误用当前运行账号凭证。
- 自动更新多架构全目标适配：全量补齐 Windows NSIS、MSI 与标准 target 清单，解决跨平台安装方式下更新检查报错问题。
- 更新临时安装包自动清理：新增自动清理机制，启动与更新后自动清理临时下载的安装包，确保电脑零残余空间占用。

### 新增
- 自动更新临时安装包过期清理机制（clean_stale_updater_temp_files）
- 自动更新全架构目标清单（windows-x86_64, windows-x86_64-nsis, windows-x86_64-msi）

### 变更
- 全面解耦每日签到与本地 IDE 客户端运行进程状态
- 优化账号唯一身份生成逻辑，采用加密哈希与 UUID 防碰撞

### 修复
- 彻底修复添加新账号时挤掉覆盖已有账号的严重缺陷
- 彻底修复只有当前切换运行中的账号才能签到成功的串号问题
- 修复自动更新下载安装包在临时目录中累积占用磁盘空间的问题

## [1.0.1] - 2026-09-26

### 重要更新
- 专属数据目录物理隔离：全面迁移并重构本地持久化数据至独立专属目录 `~/.ai_codepass`，彻底杜绝历史账号残留，确保首次安装启动纯净空白。
- 源码隐私与全链路脱敏：彻底清洗代码与测试用例中的所有硬编码调试账号、作者隐私信息与个人本地路径，加固安全防护。
- Qoder 签到与配额服务优化：完善 SASH 协议与高拟真客户端请求头，支持千问办公、Qoder 国际版与国内版多账号稳定打卡。
- 极致体积与性能保持：全程序 LTO 单态优化，Windows 安装包保持 8.5MB 极简体积，毫秒级快速启动。

### 新增
- 独立专属数据存储目录 `~/.ai_codepass`，实现物理层级隔离保护
- 优化 Qoder 国际版与国内版签到请求头契约

### 变更
- 重构持久化存储层，新安装用户 100% 纯净空白启动
- 健全多语言版本更新日志与更新历史记录展示

### 修复
- 彻底解决首次安装可能继承历史调试账号的残留问题
- 修复更新记录中新版本条目未展示问题

## [1.0.0] - 2026-09-26

### 重要更新
- 独立聚焦三大主流 AI 编程助手：CodeBuddy（腾讯混元）、Qoder（阿里通义灵码）、Trae（字节跳动）。
- Qoder 国际版每日签到与配额全适配：深度适配 SASH 协议与设备指纹，每天 10:00 自动领取 100 Credits 奖励。
- 智能配额监控与到期倒计时：支持套餐额度、赠送额度、有效期精准计算与实时可视化。

### 新增
- CodeBuddy / Workbuddy 腾讯混元多账号管理与一键切换
- Qoder 阿里通义灵码国内版与国际版多账号管理
- Qoder 国际版每日签到领取 100 Credits（SASH 协议与真实设备头适配）
- Trae / TRAE SOLO 字节跳动多账号及自动签到领额度
- 实时配额用量监控与到期倒计时提醒
- 多开实例环境隔离与一键启动
- 系统托盘后台驻留与快速切号菜单

### 变更
- 全新架构解耦，移除冗余工具，启动速度与内存占用大幅优化
- 现代化极简双栏设计，沉浸式深浅色主题适配

### 修复
- 修复 Qoder 国际版每日签到活动识别与额度显示异常
- 修复多账号切换时的桌面端进程状态同步问题
"#;


static UPDATE_SETTINGS_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn update_settings_lock() -> &'static Mutex<()> {
    UPDATE_SETTINGS_LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettings {
    pub auto_check: bool,
    pub last_check_time: u64,
    #[serde(default = "default_check_interval")]
    pub check_interval_hours: u64,
    #[serde(default)]
    pub auto_install: bool,
    #[serde(default)]
    pub last_run_version: String,
    #[serde(default = "default_remind_on_update")]
    pub remind_on_update: bool,
    #[serde(default)]
    pub skipped_version: String,
}

fn default_check_interval() -> u64 {
    DEFAULT_CHECK_INTERVAL_HOURS
}

fn default_remind_on_update() -> bool {
    true
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            auto_check: true,
            last_check_time: 0,
            check_interval_hours: DEFAULT_CHECK_INTERVAL_HOURS,
            auto_install: false,
            last_run_version: String::new(),
            remind_on_update: true,
            skipped_version: String::new(),
        }
    }
}

/// Version jump info returned when app was updated since last run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionJumpInfo {
    pub previous_version: String,
    pub current_version: String,
    pub release_notes: String,
    pub release_notes_zh: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseHistoryItem {
    pub version: String,
    pub date: String,
    pub added: Vec<String>,
    pub changed: Vec<String>,
    pub fixed: Vec<String>,
    pub removed: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReleaseHistorySection {
    Added,
    Changed,
    Fixed,
    Removed,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingUpdateNotes {
    pub version: String,
    #[serde(default)]
    pub release_notes: String,
    #[serde(default)]
    pub release_notes_zh: String,
}

/// Compare two semantic versions (e.g., "0.2.0" vs "0.1.0")
fn compare_versions(latest: &str, current: &str) -> bool {
    let parse_version =
        |v: &str| -> Vec<u32> { v.split('.').filter_map(|s| s.parse::<u32>().ok()).collect() };

    let latest_parts = parse_version(latest);
    let current_parts = parse_version(current);

    for i in 0..latest_parts.len().max(current_parts.len()) {
        let latest_part = latest_parts.get(i).unwrap_or(&0);
        let current_part = current_parts.get(i).unwrap_or(&0);

        if latest_part > current_part {
            return true;
        } else if latest_part < current_part {
            return false;
        }
    }

    false
}

/// Check if enough time has passed since last check
pub fn should_check_for_updates(settings: &UpdateSettings) -> bool {
    if !settings.auto_check {
        return false;
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let elapsed_hours = now.saturating_sub(settings.last_check_time) / 3600;
    let interval = if settings.check_interval_hours > 0 {
        settings.check_interval_hours
    } else {
        DEFAULT_CHECK_INTERVAL_HOURS
    };
    elapsed_hours >= interval
}

/// Get data directory for storing update settings
fn get_data_dir() -> Result<std::path::PathBuf, String> {
    dirs::data_local_dir()
        .map(|d| d.join("ai-codepass"))
        .ok_or_else(|| "Failed to get data directory".to_string())
}

fn ensure_data_dir() -> Result<std::path::PathBuf, String> {
    let data_dir = get_data_dir()?;
    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data dir: {}", e))?;
    }
    Ok(data_dir)
}

fn pending_update_notes_path() -> Result<std::path::PathBuf, String> {
    Ok(get_data_dir()?.join(PENDING_UPDATE_NOTES_FILE))
}

fn parse_release_header(line: &str) -> Option<(String, String)> {
    if !line.starts_with("## [") {
        return None;
    }
    let body = line.strip_prefix("## [")?;
    let end_bracket = body.find(']')?;
    let version = body[..end_bracket].trim();
    if version.is_empty() {
        return None;
    }

    let tail = body[(end_bracket + 1)..].trim();
    let date = tail
        .strip_prefix('-')
        .map(|value| value.trim().to_string())
        .unwrap_or_default();

    Some((version.to_string(), date))
}

fn parse_release_section(line: &str) -> Option<ReleaseHistorySection> {
    let heading = line.strip_prefix("### ")?.trim().to_lowercase();
    match heading.as_str() {
        "added" | "新增" => Some(ReleaseHistorySection::Added),
        "changed" | "变更" => Some(ReleaseHistorySection::Changed),
        "fixed" | "修复" => Some(ReleaseHistorySection::Fixed),
        "removed" | "移除" => Some(ReleaseHistorySection::Removed),
        _ => Some(ReleaseHistorySection::Unknown),
    }
}

fn parse_release_history_markdown(markdown: &str, limit: usize) -> Vec<ReleaseHistoryItem> {
    let mut releases: Vec<ReleaseHistoryItem> = Vec::new();
    let mut current_release: Option<ReleaseHistoryItem> = None;
    let mut current_section = ReleaseHistorySection::Unknown;
    let normalized = markdown.replace("\r\n", "\n");

    for raw_line in normalized.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some((version, date)) = parse_release_header(line) {
            if let Some(release) = current_release.take() {
                releases.push(release);
            }
            current_release = Some(ReleaseHistoryItem {
                version,
                date,
                added: Vec::new(),
                changed: Vec::new(),
                fixed: Vec::new(),
                removed: Vec::new(),
            });
            current_section = ReleaseHistorySection::Unknown;
            continue;
        }

        if let Some(section) = parse_release_section(line) {
            current_section = section;
            continue;
        }

        if !line.starts_with("- ") {
            continue;
        }

        let Some(release) = current_release.as_mut() else {
            continue;
        };
        let content = line.trim_start_matches("- ").trim();
        if content.is_empty() {
            continue;
        }

        match current_section {
            ReleaseHistorySection::Added => release.added.push(content.to_string()),
            ReleaseHistorySection::Changed => release.changed.push(content.to_string()),
            ReleaseHistorySection::Fixed => release.fixed.push(content.to_string()),
            ReleaseHistorySection::Removed => release.removed.push(content.to_string()),
            ReleaseHistorySection::Unknown => {}
        }
    }

    if let Some(release) = current_release.take() {
        releases.push(release);
    }

    if releases.len() > limit {
        releases.truncate(limit);
    }

    releases
}

fn release_history_markdown_for_locale(locale: &str) -> &'static str {
    if locale.trim().to_lowercase().starts_with("zh") {
        CHANGELOG_MARKDOWN_ZH
    } else {
        CHANGELOG_MARKDOWN_EN
    }
}

pub fn get_release_history(
    locale: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<ReleaseHistoryItem>, String> {
    let resolved_locale = locale.unwrap_or("en");
    let content = release_history_markdown_for_locale(resolved_locale);
    let safe_limit = limit.unwrap_or(30).max(1).min(100);
    Ok(parse_release_history_markdown(content, safe_limit))
}

fn load_pending_update_notes() -> Result<Option<PendingUpdateNotes>, String> {
    let path = pending_update_notes_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read pending update notes: {}", e))?;
    match serde_json::from_str(&content) {
        Ok(pending) => Ok(Some(pending)),
        Err(error) => {
            match crate::modules::atomic_write::quarantine_file(&path, "invalid-json") {
                Ok(Some(backup_path)) => logger::log_warn(&format!(
                    "[UpdateChecker] 待安装更新说明解析失败，已隔离并忽略: path={}, backup={}, error={}",
                    path.display(),
                    backup_path.display(),
                    error
                )),
                Ok(None) => logger::log_warn(&format!(
                    "[UpdateChecker] 待安装更新说明解析失败，文件已不存在，忽略: path={}, error={}",
                    path.display(),
                    error
                )),
                Err(backup_error) => logger::log_warn(&format!(
                    "[UpdateChecker] 待安装更新说明解析失败，隔离失败，忽略: path={}, parse_error={}, backup_error={}",
                    path.display(),
                    error,
                    backup_error
                )),
            }
            Ok(None)
        }
    }
}

fn remove_pending_update_notes_file() {
    match pending_update_notes_path() {
        Ok(path) => {
            if path.exists() {
                if let Err(err) = std::fs::remove_file(&path) {
                    logger::log_error(&format!(
                        "删除待安装更新说明文件失败: path={}, error={}",
                        path.display(),
                        err
                    ));
                }
            }
        }
        Err(err) => {
            logger::log_error(&format!("解析待安装更新说明路径失败: {}", err));
        }
    }
}

pub fn save_pending_update_notes(
    version: String,
    release_notes: String,
    release_notes_zh: String,
) -> Result<(), String> {
    let version = version.trim().to_string();
    if version.is_empty() {
        return Err("Version cannot be empty".to_string());
    }

    let data_dir = ensure_data_dir()?;
    let path = data_dir.join(PENDING_UPDATE_NOTES_FILE);
    let payload = PendingUpdateNotes {
        version: version.clone(),
        release_notes,
        release_notes_zh,
    };
    let content = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize pending update notes: {}", e))?;
    crate::modules::atomic_write::write_string_atomic(&path, &content)
        .map_err(|e| format!("Failed to write pending update notes: {}", e))?;

    logger::log_info(&format!(
        "已保存待安装更新说明: version={}, path={}",
        version,
        path.display()
    ));
    Ok(())
}

/// Load update settings from config file
fn load_update_settings_unlocked() -> Result<UpdateSettings, String> {
    let data_dir = get_data_dir()?;
    let settings_path = data_dir.join("update_settings.json");

    if !settings_path.exists() {
        return Ok(UpdateSettings::default());
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    let mut settings: UpdateSettings = match serde_json::from_str(&content) {
        Ok(settings) => settings,
        Err(error) => {
            match crate::modules::atomic_write::quarantine_file(&settings_path, "invalid-json") {
                Ok(Some(backup_path)) => logger::log_warn(&format!(
                    "[UpdateChecker] 更新设置解析失败，已隔离并使用默认设置: path={}, backup={}, error={}",
                    settings_path.display(),
                    backup_path.display(),
                    error
                )),
                Ok(None) => logger::log_warn(&format!(
                    "[UpdateChecker] 更新设置解析失败，文件已不存在，使用默认设置: path={}, error={}",
                    settings_path.display(),
                    error
                )),
                Err(backup_error) => logger::log_warn(&format!(
                    "[UpdateChecker] 更新设置解析失败，隔离失败，使用默认设置: path={}, parse_error={}, backup_error={}",
                    settings_path.display(),
                    error,
                    backup_error
                )),
            }
            return Ok(UpdateSettings::default());
        }
    };

    let mut should_persist = false;
    if settings.check_interval_hours == 0
        || settings.check_interval_hours == LEGACY_DEFAULT_CHECK_INTERVAL_HOURS
        || settings.check_interval_hours == LEGACY_PREVIOUS_DEFAULT_CHECK_INTERVAL_HOURS
    {
        settings.check_interval_hours = DEFAULT_CHECK_INTERVAL_HOURS;
        should_persist = true;
    }

    if should_persist {
        let _ = save_update_settings_unlocked(&settings);
    }

    Ok(settings)
}

pub fn load_update_settings() -> Result<UpdateSettings, String> {
    let _guard = update_settings_lock()
        .lock()
        .map_err(|_| "Update settings lock poisoned".to_string())?;
    load_update_settings_unlocked()
}

/// Save update settings to config file
fn save_update_settings_unlocked(settings: &UpdateSettings) -> Result<(), String> {
    let data_dir = ensure_data_dir()?;

    let settings_path = data_dir.join("update_settings.json");

    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    crate::modules::atomic_write::write_string_atomic(&settings_path, &content)
        .map_err(|e| format!("Failed to write settings file: {}", e))
}

pub fn patch_update_settings<F>(patch: F) -> Result<UpdateSettings, String>
where
    F: FnOnce(&mut UpdateSettings),
{
    let _guard = update_settings_lock()
        .lock()
        .map_err(|_| "Update settings lock poisoned".to_string())?;
    let mut settings = load_update_settings_unlocked()?;
    patch(&mut settings);
    save_update_settings_unlocked(&settings)?;
    Ok(settings)
}

/// Update last check time
pub fn update_last_check_time() -> Result<(), String> {
    let last_check_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    patch_update_settings(|settings| settings.last_check_time = last_check_time)?;
    Ok(())
}

/// Check if a version jump occurred (app was updated since last run)
/// Returns Some(VersionJumpInfo) if the current version is higher than the last recorded version
pub fn check_version_jump() -> Result<Option<VersionJumpInfo>, String> {
    let _guard = update_settings_lock()
        .lock()
        .map_err(|_| "Update settings lock poisoned".to_string())?;
    let mut settings = load_update_settings_unlocked()?;
    let current = CURRENT_VERSION.to_string();

    // First run or same version – just record and return
    if settings.last_run_version.is_empty() || settings.last_run_version == current {
        if settings.last_run_version != current {
            settings.last_run_version = current;
            save_update_settings_unlocked(&settings)?;
        }
        return Ok(None);
    }

    let previous = settings.last_run_version.clone();

    // Only trigger if current > previous (upgrade, not downgrade)
    if !compare_versions(&current, &previous) {
        settings.last_run_version = current;
        save_update_settings_unlocked(&settings)?;
        return Ok(None);
    }

    let mut release_notes = String::new();
    let mut release_notes_zh = String::new();
    match load_pending_update_notes() {
        Ok(Some(pending)) => {
            if pending.version == current {
                release_notes = pending.release_notes;
                release_notes_zh = pending.release_notes_zh;
                remove_pending_update_notes_file();
            } else if compare_versions(&current, &pending.version) {
                // 当前版本已经超过缓存版本，缓存内容过期，直接清理。
                remove_pending_update_notes_file();
            }
        }
        Ok(None) => {}
        Err(err) => {
            logger::log_error(&format!("读取待安装更新说明失败: {}", err));
        }
    }

    // Update the stored version
    settings.last_run_version = current.clone();
    save_update_settings_unlocked(&settings)?;

    logger::log_info(&format!("检测到版本跳跃: {} -> {}", previous, current));

    clean_stale_updater_temp_files();

    Ok(Some(VersionJumpInfo {
        previous_version: previous,
        current_version: current,
        release_notes,
        release_notes_zh,
    }))
}

/// Proactively clean temporary installer files left behind by updater in %TEMP%
pub fn clean_stale_updater_temp_files() {
    let temp_dir = std::env::temp_dir();
    let Ok(entries) = std::fs::read_dir(&temp_dir) else {
        return;
    };

    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name();
        let name_lossy = file_name.to_string_lossy().to_lowercase();

        let is_updater_artifact = (name_lossy.contains("ai-codepass")
            || name_lossy.contains("ai codepass")
            || name_lossy.starts_with(".tauri-updater"))
            && (name_lossy.contains("updater") || name_lossy.contains("installer") || name_lossy.ends_with(".msi") || name_lossy.ends_with(".exe"));

        if !is_updater_artifact {
            continue;
        }

        // Only delete files/directories older than 30 minutes to avoid deleting active in-flight downloads
        if let Ok(metadata) = entry.metadata() {
            if let Ok(modified) = metadata.modified() {
                if let Ok(elapsed) = now.duration_since(modified) {
                    if elapsed.as_secs() > 1800 {
                        if metadata.is_dir() {
                            let _ = std::fs::remove_dir_all(&path);
                        } else {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_versions() {
        assert!(compare_versions("0.2.0", "0.1.0"));
        assert!(compare_versions("1.0.0", "0.9.9"));
        assert!(compare_versions("0.1.1", "0.1.0"));
        assert!(!compare_versions("0.1.0", "0.1.0"));
        assert!(!compare_versions("0.1.0", "0.2.0"));
    }

    #[test]
    fn test_should_check_for_updates() {
        let mut settings = UpdateSettings::default();
        assert!(should_check_for_updates(&settings));

        settings.last_check_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(!should_check_for_updates(&settings));

        settings.auto_check = false;
        assert!(!should_check_for_updates(&settings));
    }

    #[test]
    fn test_compare_versions_handles_longer_version_segments() {
        assert!(compare_versions("1.0.0.1", "1.0.0"));
        assert!(!compare_versions("1.0.0", "1.0.0.1"));
    }

    #[test]
    fn test_parse_release_history_markdown_with_english_sections() {
        let input = r#"
## [0.2.0] - 2026-04-19

### Added
- Added feature A

### Changed
- Changed behavior B

### Fixed
- Fixed bug C

### Removed
- Removed old D
"#;

        let result = parse_release_history_markdown(input, 30);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].version, "0.2.0");
        assert_eq!(result[0].date, "2026-04-19");
        assert_eq!(result[0].added, vec!["Added feature A".to_string()]);
        assert_eq!(result[0].changed, vec!["Changed behavior B".to_string()]);
        assert_eq!(result[0].fixed, vec!["Fixed bug C".to_string()]);
        assert_eq!(result[0].removed, vec!["Removed old D".to_string()]);
    }

    #[test]
    fn test_parse_release_history_markdown_with_chinese_sections() {
        let input = r#"
## [0.1.0] - 2026-04-18

### 新增
- 新能力 A

### 变更
- 调整 B

### 修复
- 修复 C
"#;

        let result = parse_release_history_markdown(input, 30);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].version, "0.1.0");
        assert_eq!(result[0].added, vec!["新能力 A".to_string()]);
        assert_eq!(result[0].changed, vec!["调整 B".to_string()]);
        assert_eq!(result[0].fixed, vec!["修复 C".to_string()]);
        assert!(result[0].removed.is_empty());
    }

    #[test]
    fn test_parse_release_history_markdown_respects_limit() {
        let input = r#"
## [0.3.0] - 2026-04-20
### Added
- A
## [0.2.0] - 2026-04-19
### Added
- B
"#;
        let result = parse_release_history_markdown(input, 1);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].version, "0.3.0");
    }

    #[test]
    fn test_verify_v103_artifact_signature() {
        let pubkey_str = "untrusted comment: minisign public key: 3BEEEB4E6F1522C3\nRWTDIhVvTuvuO4bPz4jgUVYpreEteksdVrLurxQRwIpRqppMThaIcUzC\n";
        let pubkey = minisign_verify::PublicKey::decode(pubkey_str).expect("valid pubkey");
        let sig_path = std::path::PathBuf::from("../release_artifacts/AI-CodePass_1.0.3_x64_Setup.msi.sig");
        let msi_path = std::path::PathBuf::from("../release_artifacts/AI-CodePass_1.0.3_x64_Setup.msi");
        if sig_path.exists() && msi_path.exists() {
            let sig_str_raw = std::fs::read_to_string(&sig_path).expect("read sig");
            let sig_decoded = String::from_utf8(
                base64::Engine::decode(&base64::engine::general_purpose::STANDARD, sig_str_raw.trim())
                    .expect("base64 decode sig")
            ).expect("utf8 sig");
            let signature = minisign_verify::Signature::decode(&sig_decoded).expect("valid sig");
            let bin_bytes = std::fs::read(&msi_path).expect("read bin");
            pubkey.verify(&bin_bytes, &signature, false).expect("minisign verification succeeds");
        }
    }
}

