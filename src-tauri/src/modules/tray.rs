//! 系统托盘模块
//! 管理系统托盘图标和菜单

#[cfg(not(target_os = "macos"))]
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

#[cfg(target_os = "macos")]
use tauri::image::Image;
#[cfg(not(target_os = "macos"))]
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Emitter, Runtime,
};
use tracing::info;

#[cfg(target_os = "macos")]
use crate::modules::config::TrayIconStyle;
use crate::modules::logger;

/// 托盘菜单 ID
pub const TRAY_ID: &str = "main-tray";

#[cfg(target_os = "macos")]
const MACOS_STATUS_ITEM_AUTOSAVE_NAME: &str = "com.jlcodes.cockpit-tools.main-tray";

#[cfg(target_os = "macos")]
static MACOS_TRAY_SKIP_LOGGED: AtomicBool = AtomicBool::new(false);

/// How long a rebuild request waits for its neighbours before the menu is built.
///
/// Long enough to swallow a quota sweep's fan-out, short enough that a tray the
/// user opens right after switching accounts already shows the new state.
const TRAY_MENU_COALESCE_WINDOW: std::time::Duration = std::time::Duration::from_millis(150);

/// Rebuild requests received since the pending rebuild last took a batch.
static TRAY_MENU_REQUESTS: AtomicUsize = AtomicUsize::new(0);
/// Whether a worker is already committed to serving the outstanding requests.
static TRAY_MENU_REBUILD_SCHEDULED: AtomicBool = AtomicBool::new(false);
/// Newest tray snapshot waiting to be applied on the UI thread.
/// Older queued applies compare against this and drop themselves.
#[cfg(not(target_os = "macos"))]
static TRAY_MENU_APPLY_GENERATION: AtomicUsize = AtomicUsize::new(0);

/// 单层最多直出的平台数量（超出进入“更多平台”子菜单）
#[cfg(any(test, not(target_os = "macos")))]
const TRAY_PLATFORM_MAX_VISIBLE: usize = 6;

#[cfg(any(test, not(target_os = "macos")))]
fn next_tray_menu_apply_generation(slot: &AtomicUsize) -> usize {
    slot.fetch_add(1, Ordering::AcqRel).wrapping_add(1)
}

#[cfg(any(test, not(target_os = "macos")))]
fn is_stale_tray_menu_apply(slot: &AtomicUsize, generation: usize) -> bool {
    slot.load(Ordering::Acquire) != generation
}

#[cfg(any(test, not(target_os = "macos")))]
fn split_tray_menu_visible_overflow<T>(
    mut entries: Vec<T>,
    max_visible: usize,
) -> (Vec<T>, Vec<T>) {
    let split_index = entries.len().min(max_visible);
    let overflow = entries.split_off(split_index);
    (entries, overflow)
}

#[cfg(target_os = "macos")]
const MACOS_TRAY_TEMPLATE_ICON_SIZE: u32 = 36;

#[cfg(target_os = "macos")]
const MACOS_TRAY_TEMPLATE_FALLBACK_RGB: u8 = 225;

#[cfg(target_os = "macos")]
fn build_macos_template_tray_icon() -> Result<Image<'static>, tauri::Error> {
    let source = Image::from_bytes(include_bytes!("../../icons/tray/status-template.png"))?;
    let source_width = source.width();
    let source_height = source.height();
    let source_rgba = source.rgba();
    let target_size = MACOS_TRAY_TEMPLATE_ICON_SIZE;
    let mut target_rgba = Vec::with_capacity((target_size * target_size * 4) as usize);

    for target_y in 0..target_size {
        let src_y_start = target_y * source_height / target_size;
        let src_y_end = ((target_y + 1) * source_height / target_size)
            .max(src_y_start + 1)
            .min(source_height);

        for target_x in 0..target_size {
            let src_x_start = target_x * source_width / target_size;
            let src_x_end = ((target_x + 1) * source_width / target_size)
                .max(src_x_start + 1)
                .min(source_width);

            let mut alpha_sum: u32 = 0;
            let mut sample_count: u32 = 0;
            for src_y in src_y_start..src_y_end {
                for src_x in src_x_start..src_x_end {
                    let index = ((src_y * source_width + src_x) * 4 + 3) as usize;
                    alpha_sum += source_rgba[index] as u32;
                    sample_count += 1;
                }
            }

            let alpha = if sample_count == 0 {
                0
            } else {
                (alpha_sum / sample_count) as u8
            };
            target_rgba.extend_from_slice(&[
                MACOS_TRAY_TEMPLATE_FALLBACK_RGB,
                MACOS_TRAY_TEMPLATE_FALLBACK_RGB,
                MACOS_TRAY_TEMPLATE_FALLBACK_RGB,
                alpha,
            ]);
        }
    }

    Ok(Image::new_owned(target_rgba, target_size, target_size))
}

#[cfg(target_os = "macos")]
fn macos_tray_icon_for_style<'a, R: Runtime>(
    app: &'a tauri::AppHandle<R>,
    style: TrayIconStyle,
) -> Result<(Image<'a>, bool), tauri::Error> {
    match style {
        TrayIconStyle::Template => Ok((build_macos_template_tray_icon()?, true)),
        TrayIconStyle::Color => Ok((
            app.default_window_icon()
                .expect("default window icon should exist")
                .clone(),
            false,
        )),
    }
}

#[cfg(target_os = "macos")]
fn configure_macos_status_item_identity<R: Runtime>(tray: &TrayIcon<R>) {
    let result = tray.with_inner_tray_icon(|tray_icon| {
        let Some(status_item) = tray_icon.ns_status_item() else {
            return "status_item=none".to_string();
        };

        let autosave_name = objc2_foundation::NSString::from_str(MACOS_STATUS_ITEM_AUTOSAVE_NAME);
        status_item.setAutosaveName(Some(&autosave_name));
        status_item.setVisible(true);
        status_item.setLength(objc2_app_kit::NSVariableStatusItemLength);

        let current_autosave_name = status_item.autosaveName().to_string();
        format!(
            "autosave_name={}, visible={}, length={}",
            current_autosave_name,
            status_item.isVisible(),
            status_item.length()
        )
    });

    match result {
        Ok(detail) => logger::log_info(&format!("[Tray] macOS 状态栏项目身份已设置: {}", detail)),
        Err(err) => logger::log_warn(&format!("[Tray] macOS 状态栏项目身份设置失败: {}", err)),
    }
}

#[cfg(target_os = "macos")]
pub fn apply_tray_icon_style<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let style = crate::modules::config::get_user_config().tray_icon_style;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let (icon, icon_as_template) =
            macos_tray_icon_for_style(app, style).map_err(|err| err.to_string())?;
        let icon_width = icon.width();
        let icon_height = icon.height();
        tray.set_icon(Some(icon)).map_err(|err| err.to_string())?;
        tray.set_icon_as_template(icon_as_template)
            .map_err(|err| err.to_string())?;
        let rect_log = match tray.rect() {
            Ok(Some(rect)) => format!("rect={:?}", rect),
            Ok(None) => "rect=none".to_string(),
            Err(err) => format!("rect_error={}", err),
        };
        logger::log_info(&format!(
            "[Tray] macOS 菜单栏图标样式已应用: style={}, icon={}x{}, template={}, {}",
            style.as_str(),
            icon_width,
            icon_height,
            icon_as_template,
            rect_log
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum PlatformId {
    Codebuddy,
    CodebuddyCn,
    Workbuddy,
    WorkbuddyAi,
    Qoder,
    QoderCn,
    Trae,
    TraeSolo,
    TraeCn,
    TraeSoloCn,
}

impl PlatformId {
    pub(crate) fn default_order() -> [Self; 10] {
        [
            Self::Codebuddy,
            Self::CodebuddyCn,
            Self::Workbuddy,
            Self::WorkbuddyAi,
            Self::Qoder,
            Self::QoderCn,
            Self::Trae,
            Self::TraeSolo,
            Self::TraeCn,
            Self::TraeSoloCn,
        ]
    }

    pub(crate) fn from_str(value: &str) -> Option<Self> {
        match value {
            crate::modules::tray_layout::PLATFORM_CODEBUDDY => Some(Self::Codebuddy),
            crate::modules::tray_layout::PLATFORM_CODEBUDDY_CN => Some(Self::CodebuddyCn),
            crate::modules::tray_layout::PLATFORM_WORKBUDDY => Some(Self::Workbuddy),
            crate::modules::tray_layout::PLATFORM_WORKBUDDY_AI => Some(Self::WorkbuddyAi),
            crate::modules::tray_layout::PLATFORM_QODER => Some(Self::Qoder),
            crate::modules::tray_layout::PLATFORM_QODER_CN => Some(Self::QoderCn),
            crate::modules::tray_layout::PLATFORM_TRAE => Some(Self::Trae),
            crate::modules::tray_layout::PLATFORM_TRAE_SOLO => Some(Self::TraeSolo),
            crate::modules::tray_layout::PLATFORM_TRAE_CN => Some(Self::TraeCn),
            crate::modules::tray_layout::PLATFORM_TRAE_SOLO_CN => Some(Self::TraeSoloCn),
            _ => None,
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Codebuddy => crate::modules::tray_layout::PLATFORM_CODEBUDDY,
            Self::CodebuddyCn => crate::modules::tray_layout::PLATFORM_CODEBUDDY_CN,
            Self::Workbuddy => crate::modules::tray_layout::PLATFORM_WORKBUDDY,
            Self::WorkbuddyAi => crate::modules::tray_layout::PLATFORM_WORKBUDDY_AI,
            Self::Qoder => crate::modules::tray_layout::PLATFORM_QODER,
            Self::QoderCn => crate::modules::tray_layout::PLATFORM_QODER_CN,
            Self::Trae => crate::modules::tray_layout::PLATFORM_TRAE,
            Self::TraeSolo => crate::modules::tray_layout::PLATFORM_TRAE_SOLO,
            Self::TraeCn => crate::modules::tray_layout::PLATFORM_TRAE_CN,
            Self::TraeSoloCn => crate::modules::tray_layout::PLATFORM_TRAE_SOLO_CN,
        }
    }

    pub(crate) fn title(self) -> &'static str {
        match self {
            Self::Codebuddy => "CodeBuddy",
            Self::CodebuddyCn => "CodeBuddy CN",
            Self::Workbuddy => "WorkBuddy",
            Self::WorkbuddyAi => "WorkBuddy AI",
            Self::Qoder => "Qoder",
            Self::QoderCn => "Qoder CN",
            Self::Trae => "Trae",
            Self::TraeSolo => "TRAE SOLO",
            Self::TraeCn => "Trae CN",
            Self::TraeSoloCn => "TRAE SOLO CN",
        }
    }

    pub(crate) fn nav_target(self) -> &'static str {
        match self {
            Self::Codebuddy => "codebuddy",
            Self::CodebuddyCn => "codebuddy-cn",
            Self::Workbuddy => "workbuddy",
            Self::WorkbuddyAi => "workbuddy-ai",
            Self::Qoder => "qoder",
            Self::QoderCn => "qoder-cn",
            Self::Trae => "trae",
            Self::TraeSolo => "trae-solo",
            Self::TraeCn => "trae-cn",
            Self::TraeSoloCn => "trae-solo-cn",
        }
    }
}
/// 菜单项 ID
pub mod menu_ids {
    pub const SHOW_WINDOW: &str = "show_window";
    pub const SHOW_FLOATING_CARD: &str = "show_floating_card";
    pub const REFRESH_QUOTA: &str = "refresh_quota";
    pub const SETTINGS: &str = "settings";
    pub const QUIT: &str = "quit";
}

/// 账号显示信息
#[cfg(any(test, not(target_os = "macos")))]
struct AccountDisplayInfo {
    account: String,
    quota_lines: Vec<String>,
}

#[derive(Debug, Clone)]
#[cfg(any(test, not(target_os = "macos")))]
enum TrayMenuEntry {
    Platform(PlatformId),
    Group {
        id: String,
        name: String,
        platforms: Vec<PlatformId>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg(any(test, not(target_os = "macos")))]
struct TrayMenuSnapshotPlatform {
    submenu_id: String,
    title: String,
    platform_id: String,
    account: String,
    quota_lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg(any(test, not(target_os = "macos")))]
enum TrayMenuSnapshotEntry {
    Platform(TrayMenuSnapshotPlatform),
    Group {
        submenu_id: String,
        name: String,
        platforms: Vec<TrayMenuSnapshotPlatform>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg(not(target_os = "macos"))]
struct TrayMenuSnapshot {
    lang: String,
    show_window: String,
    show_floating_card: String,
    refresh_quota: String,
    settings: String,
    quit: String,
    more_platforms: String,
    no_platform_selected: String,
    visible_entries: Vec<TrayMenuSnapshotEntry>,
    overflow_entries: Vec<TrayMenuSnapshotEntry>,
}

/// 创建系统托盘（完整菜单，包含账号数据加载）
/// 创建骨架托盘（无账号文件 I/O，仅基础菜单项，用于快速启动）
pub fn create_tray_skeleton<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<TrayIcon<R>, tauri::Error> {
    info!("[Tray] 创建骨架托盘...");

    #[cfg(not(target_os = "macos"))]
    let lang = crate::modules::config::get_user_config().language;

    #[cfg(not(target_os = "macos"))]
    let show_window = MenuItem::with_id(
        app,
        menu_ids::SHOW_WINDOW,
        get_text("show_window", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let refresh_quota = MenuItem::with_id(
        app,
        menu_ids::REFRESH_QUOTA,
        get_text("refresh_quota", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let show_floating_card = MenuItem::with_id(
        app,
        menu_ids::SHOW_FLOATING_CARD,
        get_text("show_floating_card", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let settings = MenuItem::with_id(
        app,
        menu_ids::SETTINGS,
        get_text("settings", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let quit = MenuItem::with_id(
        app,
        menu_ids::QUIT,
        get_text("quit", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let loading = MenuItem::with_id(
        app,
        "tray_loading",
        get_text("loading", &lang),
        false,
        None::<&str>,
    )?;

    #[cfg(not(target_os = "macos"))]
    let menu = {
        let menu = Menu::new(app)?;
        menu.append(&show_window)?;
        menu.append(&show_floating_card)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&loading)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&refresh_quota)?;
        menu.append(&settings)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&quit)?;
        menu
    };

    #[cfg(target_os = "macos")]
    let (tray_icon, tray_icon_as_template) = macos_tray_icon_for_style(
        app,
        crate::modules::config::get_user_config().tray_icon_style,
    )?;
    #[cfg(target_os = "macos")]
    let tray_icon_log = format!(
        "icon={}x{}, template={}",
        tray_icon.width(),
        tray_icon.height(),
        tray_icon_as_template
    );
    #[cfg(not(target_os = "macos"))]
    let tray_icon = app.default_window_icon().unwrap().clone();

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .show_menu_on_left_click(false)
        .tooltip("AI CodePass")
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_event);

    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(tray_icon_as_template);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.menu(&menu);

    let tray = builder.build(app)?;

    #[cfg(target_os = "macos")]
    let _ = tray.set_show_menu_on_left_click(false);
    #[cfg(target_os = "macos")]
    let _ = tray.set_icon_as_template(tray_icon_as_template);
    #[cfg(target_os = "macos")]
    configure_macos_status_item_identity(&tray);

    #[cfg(target_os = "macos")]
    {
        let rect_log = match tray.rect() {
            Ok(Some(rect)) => format!("rect={:?}", rect),
            Ok(None) => "rect=none".to_string(),
            Err(err) => format!("rect_error={}", err),
        };
        logger::log_info(&format!(
            "[Tray] macOS 骨架托盘状态: {}, {}",
            tray_icon_log, rect_log
        ));
    }

    info!("[Tray] 骨架托盘创建完成，等待后台加载完整菜单");
    Ok(tray)
}

/// Collect tray labels and current-account quota text without touching native menus.
#[cfg(not(target_os = "macos"))]
fn collect_tray_menu_snapshot() -> TrayMenuSnapshot {
    let config = crate::modules::config::get_user_config();
    let lang = config.language.clone();
    let ordered_entries = resolve_tray_entries();
    let snapshot_entries: Vec<TrayMenuSnapshotEntry> = ordered_entries
        .iter()
        .map(|entry| snapshot_tray_entry(entry, &lang))
        .collect();
    let (visible_entries, overflow_entries) =
        split_tray_menu_visible_overflow(snapshot_entries, TRAY_PLATFORM_MAX_VISIBLE);

    TrayMenuSnapshot {
        show_window: get_text("show_window", &lang),
        show_floating_card: get_text("show_floating_card", &lang),
        refresh_quota: get_text("refresh_quota", &lang),
        settings: get_text("settings", &lang),
        quit: get_text("quit", &lang),
        more_platforms: get_text("more_platforms", &lang),
        no_platform_selected: get_text("no_platform_selected", &lang),
        lang,
        visible_entries,
        overflow_entries,
    }
}

#[cfg(not(target_os = "macos"))]
fn snapshot_tray_entry(entry: &TrayMenuEntry, lang: &str) -> TrayMenuSnapshotEntry {
    map_tray_entry_to_snapshot(entry, |platform| get_account_display_info(platform, lang))
}

#[cfg(any(test, not(target_os = "macos")))]
fn map_tray_entry_to_snapshot<F>(entry: &TrayMenuEntry, mut lookup: F) -> TrayMenuSnapshotEntry
where
    F: FnMut(PlatformId) -> AccountDisplayInfo,
{
    match entry {
        TrayMenuEntry::Platform(platform) => {
            TrayMenuSnapshotEntry::Platform(snapshot_platform(
                *platform,
                format!("platform:{}:submenu", platform.as_str()),
                platform.title().to_string(),
                lookup(*platform),
            ))
        }
        TrayMenuEntry::Group {
            id,
            name,
            platforms,
        } => {
            if let [platform] = platforms.as_slice() {
                return TrayMenuSnapshotEntry::Platform(snapshot_platform(
                    *platform,
                    format!("group:{}:submenu", id),
                    name.clone(),
                    lookup(*platform),
                ));
            }

            TrayMenuSnapshotEntry::Group {
                submenu_id: format!("group:{}:submenu", id),
                name: name.clone(),
                platforms: platforms
                    .iter()
                    .map(|platform| {
                        snapshot_platform(
                            *platform,
                            format!("platform:{}:submenu", platform.as_str()),
                            platform.title().to_string(),
                            lookup(*platform),
                        )
                    })
                    .collect(),
            }
        }
    }
}

#[cfg(any(test, not(target_os = "macos")))]
fn snapshot_platform(
    platform: PlatformId,
    submenu_id: String,
    title: String,
    info: AccountDisplayInfo,
) -> TrayMenuSnapshotPlatform {
    TrayMenuSnapshotPlatform {
        submenu_id,
        title,
        platform_id: platform.as_str().to_string(),
        account: info.account,
        quota_lines: info.quota_lines,
    }
}

/// 构建托盘菜单
#[cfg(not(target_os = "macos"))]
fn build_tray_menu_from_snapshot<R: Runtime>(
    app: &tauri::AppHandle<R>,
    snapshot: &TrayMenuSnapshot,
) -> Result<Menu<R>, tauri::Error> {
    let show_window = MenuItem::with_id(
        app,
        menu_ids::SHOW_WINDOW,
        &snapshot.show_window,
        true,
        None::<&str>,
    )?;
    let refresh_quota = MenuItem::with_id(
        app,
        menu_ids::REFRESH_QUOTA,
        &snapshot.refresh_quota,
        true,
        None::<&str>,
    )?;
    let show_floating_card = MenuItem::with_id(
        app,
        menu_ids::SHOW_FLOATING_CARD,
        &snapshot.show_floating_card,
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(
        app,
        menu_ids::SETTINGS,
        &snapshot.settings,
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        menu_ids::QUIT,
        &snapshot.quit,
        true,
        None::<&str>,
    )?;

    let mut visible_submenus: Vec<Submenu<R>> = Vec::new();
    for entry in &snapshot.visible_entries {
        visible_submenus.push(build_tray_entry_submenu_from_snapshot(app, entry)?);
    }

    let mut overflow_submenus: Vec<Submenu<R>> = Vec::new();
    for entry in &snapshot.overflow_entries {
        overflow_submenus.push(build_tray_entry_submenu_from_snapshot(app, entry)?);
    }

    let overflow_refs: Vec<&dyn IsMenuItem<R>> = overflow_submenus
        .iter()
        .map(|submenu| submenu as &dyn IsMenuItem<R>)
        .collect();
    let more_platforms_submenu = if overflow_refs.is_empty() {
        None
    } else {
        Some(Submenu::with_id_and_items(
            app,
            "tray_more_platforms",
            &snapshot.more_platforms,
            true,
            &overflow_refs,
        )?)
    };

    let no_platform_item = if visible_submenus.is_empty() && overflow_submenus.is_empty() {
        Some(MenuItem::with_id(
            app,
            "tray_no_platform_selected",
            &snapshot.no_platform_selected,
            true,
            None::<&str>,
        )?)
    } else {
        None
    };

    let menu = Menu::with_id(app, "tray_menu")?;
    menu.append(&show_window)?;
    menu.append(&show_floating_card)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    if let Some(item) = &no_platform_item {
        menu.append(item)?;
    } else {
        for submenu in &visible_submenus {
            menu.append(submenu)?;
        }
        if let Some(submenu) = &more_platforms_submenu {
            menu.append(submenu)?;
        }
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&refresh_quota)?;
    menu.append(&settings)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&quit)?;
    Ok(menu)
}

#[cfg(not(target_os = "macos"))]
fn build_tray_entry_submenu_from_snapshot<R: Runtime>(
    app: &tauri::AppHandle<R>,
    entry: &TrayMenuSnapshotEntry,
) -> Result<Submenu<R>, tauri::Error> {
    match entry {
        TrayMenuSnapshotEntry::Platform(platform) => {
            build_platform_details_submenu_from_snapshot(app, platform)
        }
        TrayMenuSnapshotEntry::Group {
            submenu_id,
            name,
            platforms,
        } => {
            let mut submenus: Vec<Submenu<R>> = Vec::new();
            for platform in platforms {
                submenus.push(build_platform_details_submenu_from_snapshot(app, platform)?);
            }
            let refs: Vec<&dyn IsMenuItem<R>> = submenus
                .iter()
                .map(|submenu| submenu as &dyn IsMenuItem<R>)
                .collect();
            Submenu::with_id_and_items(app, submenu_id, name, true, &refs)
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn build_platform_details_submenu_from_snapshot<R: Runtime>(
    app: &tauri::AppHandle<R>,
    platform: &TrayMenuSnapshotPlatform,
) -> Result<Submenu<R>, tauri::Error> {
    let mut items: Vec<MenuItem<R>> = Vec::new();
    items.push(MenuItem::with_id(
        app,
        format!("platform:{}:account", platform.platform_id),
        &platform.account,
        true,
        None::<&str>,
    )?);
    for (idx, line) in platform.quota_lines.iter().enumerate() {
        items.push(MenuItem::with_id(
            app,
            format!("platform:{}:quota:{}", platform.platform_id, idx),
            line,
            true,
            None::<&str>,
        )?);
    }
    let refs: Vec<&dyn IsMenuItem<R>> = items
        .iter()
        .map(|item| item as &dyn IsMenuItem<R>)
        .collect();
    Submenu::with_id_and_items(app, &platform.submenu_id, &platform.title, true, &refs)
}

#[cfg(not(target_os = "macos"))]
fn resolve_tray_entries() -> Vec<TrayMenuEntry> {
    let layout = crate::modules::tray_layout::load_tray_layout();
    let visible = sanitize_platform_list(&layout.tray_platform_ids);
    let visible_set: HashSet<PlatformId> = visible.iter().copied().collect();

    if visible_set.is_empty() {
        return Vec::new();
    }

    let mut groups_by_id: HashMap<String, crate::modules::tray_layout::TrayLayoutGroup> =
        HashMap::new();
    for group in layout.platform_groups {
        groups_by_id.insert(group.id.clone(), group);
    }

    let mut entries = Vec::new();
    let mut used_platforms: HashSet<PlatformId> = HashSet::new();

    for raw_entry in &layout.ordered_entry_ids {
        if let Some(platform) = parse_platform_entry_id(raw_entry) {
            if !visible_set.contains(&platform) || !used_platforms.insert(platform) {
                continue;
            }
            entries.push(TrayMenuEntry::Platform(platform));
            continue;
        }

        let Some(group_id) = parse_group_entry_id(raw_entry) else {
            continue;
        };
        let Some(group) = groups_by_id.get(&group_id) else {
            continue;
        };

        let mut group_platforms: Vec<PlatformId> = Vec::new();
        for raw_platform in &group.platform_ids {
            let Some(platform) = PlatformId::from_str(raw_platform.trim()) else {
                continue;
            };
            if !visible_set.contains(&platform) || !used_platforms.insert(platform) {
                continue;
            }
            group_platforms.push(platform);
        }

        if group_platforms.is_empty() {
            continue;
        }

        let group_name = if group.name.trim().is_empty() {
            group.id.clone()
        } else {
            group.name.clone()
        };

        entries.push(TrayMenuEntry::Group {
            id: group.id.clone(),
            name: group_name,
            platforms: group_platforms,
        });
    }

    for platform in normalize_platform_order(&layout.ordered_platform_ids) {
        if !visible_set.contains(&platform) || !used_platforms.insert(platform) {
            continue;
        }
        entries.push(TrayMenuEntry::Platform(platform));
    }

    entries
}

#[cfg(not(target_os = "macos"))]
fn sanitize_platform_list(ids: &[String]) -> Vec<PlatformId> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();

    for raw in ids {
        let Some(platform) = PlatformId::from_str(raw.trim()) else {
            continue;
        };
        if seen.insert(platform) {
            result.push(platform);
        }
    }

    result
}

#[cfg(not(target_os = "macos"))]
fn normalize_platform_order(ids: &[String]) -> Vec<PlatformId> {
    let mut result = sanitize_platform_list(ids);
    let mut seen: HashSet<PlatformId> = result.iter().copied().collect();

    for platform in PlatformId::default_order() {
        if seen.insert(platform) {
            result.push(platform);
        }
    }

    result
}

#[cfg(not(target_os = "macos"))]
fn parse_platform_entry_id(raw: &str) -> Option<PlatformId> {
    let value = raw.strip_prefix("platform:")?;
    PlatformId::from_str(value.trim())
}

#[cfg(not(target_os = "macos"))]
fn parse_group_entry_id(raw: &str) -> Option<String> {
    let value = raw.strip_prefix("group:")?.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.to_string())
}

#[cfg(not(target_os = "macos"))]
fn get_account_display_info(platform: PlatformId, lang: &str) -> AccountDisplayInfo {
    match platform {
        PlatformId::Codebuddy => build_codebuddy_display_info(lang),
        PlatformId::CodebuddyCn => build_codebuddy_cn_display_info(lang),
        PlatformId::Qoder => build_qoder_display_info(crate::modules::qoder_account::QoderPlatformKind::Global, lang),
        PlatformId::QoderCn => build_qoder_display_info(crate::modules::qoder_account::QoderPlatformKind::Cn, lang),
        PlatformId::Trae | PlatformId::TraeSolo | PlatformId::TraeCn | PlatformId::TraeSoloCn => {
            build_trae_display_info(lang, platform)
        }
        PlatformId::Workbuddy => build_workbuddy_display_info(lang),
        PlatformId::WorkbuddyAi => build_workbuddy_ai_display_info(lang),
    }
}
#[cfg(not(target_os = "macos"))]
fn build_codebuddy_display_info(lang: &str) -> AccountDisplayInfo {
    let accounts = crate::modules::codebuddy_account::list_accounts();
    build_codebuddy_family_display_info(lang, resolve_codebuddy_current_account(&accounts))
}

#[cfg(not(target_os = "macos"))]
fn build_codebuddy_cn_display_info(lang: &str) -> AccountDisplayInfo {
    let accounts = crate::modules::codebuddy_cn_account::list_accounts();
    build_codebuddy_family_display_info(lang, resolve_codebuddy_cn_current_account(&accounts))
}

#[cfg(not(target_os = "macos"))]
fn build_workbuddy_display_info(lang: &str) -> AccountDisplayInfo {
    let accounts = crate::modules::workbuddy_account::list_accounts();
    build_workbuddy_family_display_info(lang, resolve_workbuddy_current_account(&accounts))
}

#[cfg(not(target_os = "macos"))]
fn build_workbuddy_ai_display_info(lang: &str) -> AccountDisplayInfo {
    let accounts = crate::modules::workbuddy_ai_account::list_accounts();
    build_workbuddy_family_display_info(lang, resolve_workbuddy_ai_current_account(&accounts))
}

#[cfg(not(target_os = "macos"))]
fn build_codebuddy_family_display_info(
    lang: &str,
    account: Option<crate::models::codebuddy::CodebuddyAccount>,
) -> AccountDisplayInfo {
    let Some(account) = account else {
        return AccountDisplayInfo {
            account: format!("📧 {}", get_text("not_logged_in", lang)),
            quota_lines: vec!["—".to_string()],
        };
    };

    let display_email = first_non_empty(&[
        Some(account.email.as_str()),
        account.nickname.as_deref(),
        account.uid.as_deref(),
        Some(account.id.as_str()),
    ])
    .unwrap_or("—");

    AccountDisplayInfo {
        account: format!("📧 {}", display_email),
        quota_lines: vec![build_codebuddy_usage_status_line(lang, &account)],
    }
}

#[cfg(not(target_os = "macos"))]
fn build_workbuddy_family_display_info(
    lang: &str,
    account: Option<crate::models::workbuddy::WorkbuddyAccount>,
) -> AccountDisplayInfo {
    let Some(account) = account else {
        return AccountDisplayInfo {
            account: format!("📧 {}", get_text("not_logged_in", lang)),
            quota_lines: vec!["—".to_string()],
        };
    };

    let display_email = first_non_empty(&[
        Some(account.email.as_str()),
        account.nickname.as_deref(),
        account.uid.as_deref(),
        Some(account.id.as_str()),
    ])
    .unwrap_or("—");

    AccountDisplayInfo {
        account: format!("📧 {}", display_email),
        quota_lines: vec![build_workbuddy_usage_status_line(lang, &account)],
    }
}

#[cfg(not(target_os = "macos"))]
fn build_codebuddy_usage_status_line(
    lang: &str,
    account: &crate::models::codebuddy::CodebuddyAccount,
) -> String {
    build_usage_status_line(
        lang,
        account.dosage_notify_code.as_deref(),
        account.dosage_notify_zh.as_deref(),
        account.dosage_notify_en.as_deref(),
    )
}

#[cfg(not(target_os = "macos"))]
fn build_workbuddy_usage_status_line(
    lang: &str,
    account: &crate::models::workbuddy::WorkbuddyAccount,
) -> String {
    build_usage_status_line(
        lang,
        account.dosage_notify_code.as_deref(),
        account.dosage_notify_zh.as_deref(),
        account.dosage_notify_en.as_deref(),
    )
}

#[cfg(not(target_os = "macos"))]
fn build_usage_status_line(
    lang: &str,
    dosage_notify_code: Option<&str>,
    dosage_notify_zh: Option<&str>,
    dosage_notify_en: Option<&str>,
) -> String {
    let label = get_text("usage_status", lang);
    let code = dosage_notify_code.unwrap_or("").trim();

    if code.is_empty() {
        return format!("{}: --", label);
    }

    if code == "0" || code.eq_ignore_ascii_case("USAGE_NORMAL") {
        return format!("{}: {}", label, get_text("status_normal_short", lang));
    }

    let raw = if is_chinese_lang(lang) {
        dosage_notify_zh.or(dosage_notify_en).unwrap_or(code)
    } else {
        dosage_notify_en.or(dosage_notify_zh).unwrap_or(code)
    };

    format!("{}: {}", label, strip_codebuddy_status_prefix(raw))
}

#[cfg(not(target_os = "macos"))]
fn is_chinese_lang(lang: &str) -> bool {
    lang.to_ascii_lowercase().starts_with("zh")
}

#[cfg(not(target_os = "macos"))]
fn strip_codebuddy_status_prefix(raw: &str) -> String {
    let trimmed = raw.trim();
    for prefix in [
        "用量状态：",
        "用量状态:",
        "用量狀態：",
        "用量狀態:",
        "状态：",
        "状态:",
        "狀態：",
        "狀態:",
        "Usage Status:",
        "Usage:",
        "Status:",
    ] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            return rest.trim().to_string();
        }
    }
    trimmed.to_string()
}

#[cfg(not(target_os = "macos"))]
fn resolve_codebuddy_current_account(
    accounts: &[crate::models::codebuddy::CodebuddyAccount],
) -> Option<crate::models::codebuddy::CodebuddyAccount> {
    crate::modules::codebuddy_account::resolve_current_account_id(accounts).and_then(|account_id| {
        accounts
            .iter()
            .find(|account| account.id == account_id)
            .cloned()
    })
}

#[cfg(not(target_os = "macos"))]
fn resolve_codebuddy_cn_current_account(
    accounts: &[crate::models::codebuddy::CodebuddyAccount],
) -> Option<crate::models::codebuddy::CodebuddyAccount> {
    crate::modules::codebuddy_cn_account::resolve_current_account_id(accounts).and_then(
        |account_id| {
            accounts
                .iter()
                .find(|account| account.id == account_id)
                .cloned()
        },
    )
}

#[cfg(not(target_os = "macos"))]
fn resolve_workbuddy_current_account(
    accounts: &[crate::models::workbuddy::WorkbuddyAccount],
) -> Option<crate::models::workbuddy::WorkbuddyAccount> {
    crate::modules::workbuddy_account::resolve_current_account_id(accounts).and_then(|account_id| {
        accounts
            .iter()
            .find(|account| account.id == account_id)
            .cloned()
    })
}

#[cfg(not(target_os = "macos"))]
fn resolve_workbuddy_ai_current_account(
    accounts: &[crate::models::workbuddy::WorkbuddyAccount],
) -> Option<crate::models::workbuddy::WorkbuddyAccount> {
    crate::modules::workbuddy_ai_account::resolve_current_account_id(accounts).and_then(|account_id| {
        accounts
            .iter()
            .find(|account| account.id == account_id)
            .cloned()
    })
}

#[cfg(not(target_os = "macos"))]
fn json_as_f64(value: &serde_json::Value) -> Option<f64> {
    if let Some(v) = value.as_f64() {
        if v.is_finite() {
            return Some(v);
        }
    }
    if let Some(s) = value.as_str() {
        if let Ok(v) = s.trim().parse::<f64>() {
            if v.is_finite() {
                return Some(v);
            }
        }
    }
    None
}

#[cfg(not(target_os = "macos"))]
fn build_qoder_display_info(kind: crate::modules::qoder_account::QoderPlatformKind, lang: &str) -> AccountDisplayInfo {
    let accounts = crate::modules::qoder_account::list_accounts_for_platform(kind);
    let account = crate::modules::qoder_account::resolve_current_account_id_for_platform(kind, &accounts)
        .and_then(|account_id| accounts.iter().find(|item| item.id == account_id).cloned());

    let Some(account) = account else {
        return AccountDisplayInfo {
            account: format!("📧 {}", get_text("not_logged_in", lang)),
            quota_lines: vec!["—".to_string()],
        };
    };

    let mut quota_lines = Vec::new();

    // Parse plan tag from raw data (matching frontend getRawPlanTag)
    let plan_tag = json_first_string(&[
        json_nested(&account.auth_user_plan_raw, &["plan_tier_name"]),
        json_nested(&account.auth_user_plan_raw, &["tier_name"]),
        json_nested(&account.auth_user_plan_raw, &["tierName"]),
        json_nested(&account.auth_user_plan_raw, &["planTierName"]),
        json_nested(&account.auth_user_plan_raw, &["plan"]),
        json_nested(&account.auth_user_info_raw, &["userTag"]),
        json_nested(&account.auth_user_info_raw, &["user_tag"]),
        json_nested(&account.auth_credit_usage_raw, &["plan_tier_name"]),
        json_nested(&account.auth_credit_usage_raw, &["tier_name"]),
        json_nested(&account.auth_credit_usage_raw, &["tierName"]),
        json_nested(&account.auth_credit_usage_raw, &["planTierName"]),
        account.plan_type.as_deref().map(|s| s.to_string()),
    ]);
    if let Some(ref tag) = plan_tag {
        quota_lines.push(format!("Plan: {}", tag));
    }

    // Parse userQuota from auth_credit_usage_raw / auth_user_plan_raw / auth_user_info_raw
    let user_quota = parse_qoder_quota_bucket(
        &[
            json_nested_obj(&account.auth_credit_usage_raw, &["userQuota"]),
            json_nested_obj(&account.auth_user_plan_raw, &["userQuota"]),
            json_nested_obj(&account.auth_user_info_raw, &["userQuota"]),
        ],
        Some((
            &account.credits_used,
            &account.credits_total,
            &account.credits_remaining,
        )),
    );

    let credits_label = if lang == "zh" || lang == "zh-CN" {
        "套餐内 Credits"
    } else {
        "Credits"
    };
    quota_lines.push(format_qoder_quota_line(
        lang,
        credits_label,
        &plan_tag,
        &user_quota,
    ));

    // Parse addOnQuota
    let addon_quota = parse_qoder_quota_bucket(
        &[
            json_nested_obj(&account.auth_credit_usage_raw, &["addOnQuota"]),
            json_nested_obj(&account.auth_credit_usage_raw, &["addonQuota"]),
            json_nested_obj(&account.auth_credit_usage_raw, &["add_on_quota"]),
            json_nested_obj(&account.auth_user_plan_raw, &["addOnQuota"]),
            json_nested_obj(&account.auth_user_plan_raw, &["addonQuota"]),
            json_nested_obj(&account.auth_user_plan_raw, &["add_on_quota"]),
        ],
        None,
    );

    let addon_label = if lang == "zh" || lang == "zh-CN" {
        "附加 Credits"
    } else {
        "Add-on Credits"
    };
    quota_lines.push(format_qoder_quota_line(
        lang,
        addon_label,
        &None,
        &addon_quota,
    ));

    // Parse shared credit package
    let shared_used = json_first_f64(&[
        json_nested_f64(
            &account.auth_credit_usage_raw,
            &["orgResourcePackage", "used"],
        ),
        json_nested_f64(
            &account.auth_credit_usage_raw,
            &["orgResourcePackage", "usage"],
        ),
        json_nested_f64(
            &account.auth_credit_usage_raw,
            &["orgResourcePackage", "consumed"],
        ),
        json_nested_f64(
            &account.auth_credit_usage_raw,
            &["orgResourcePackage", "count"],
        ),
        json_nested_f64(
            &account.auth_credit_usage_raw,
            &["organizationResourcePackage", "used"],
        ),
        json_nested_f64(
            &account.auth_credit_usage_raw,
            &["sharedCreditPackage", "used"],
        ),
        json_nested_f64(&account.auth_credit_usage_raw, &["resourcePackage", "used"]),
        json_nested_f64(&account.auth_user_plan_raw, &["orgResourcePackage", "used"]),
    ]);
    let shared_label = if lang == "zh" || lang == "zh-CN" {
        "共享资源包"
    } else {
        "Shared Package"
    };
    if let Some(used) = shared_used {
        quota_lines.push(format!("{}: {:.0}", shared_label, used));
    } else {
        quota_lines.push(format!("{}: --", shared_label));
    }

    let display_email = first_non_empty(&[
        Some(account.email.as_str()),
        account.display_name.as_deref(),
        account.user_id.as_deref(),
        Some(account.id.as_str()),
    ])
    .unwrap_or("—");

    AccountDisplayInfo {
        account: format!("📧 {}", display_email),
        quota_lines,
    }
}

#[cfg(not(target_os = "macos"))]
#[derive(Debug, Clone, Default)]
#[cfg(not(target_os = "macos"))]
struct QoderQuotaBucket {
    used: Option<f64>,
    total: Option<f64>,
    percentage: Option<f64>,
}

fn parse_qoder_quota_bucket(
    sources: &[Option<serde_json::Value>],
    fallback: Option<(&Option<f64>, &Option<f64>, &Option<f64>)>,
) -> QoderQuotaBucket {
    let raw = sources.iter().find_map(|s| s.clone());

    let used = raw
        .as_ref()
        .and_then(|r| {
            json_first_f64(&[
                r.get("used").and_then(json_as_f64),
                r.get("usage").and_then(json_as_f64),
                r.get("consumed").and_then(json_as_f64),
            ])
        })
        .or_else(|| fallback.and_then(|(u, _, _)| *u));

    let total = raw
        .as_ref()
        .and_then(|r| {
            json_first_f64(&[
                r.get("total").and_then(json_as_f64),
                r.get("quota").and_then(json_as_f64),
                r.get("limit").and_then(json_as_f64),
            ])
        })
        .or_else(|| fallback.and_then(|(_, t, _)| *t));

    let percentage = raw
        .as_ref()
        .and_then(|r| {
            json_first_f64(&[
                r.get("percentage").and_then(json_as_f64),
                r.get("usagePercent").and_then(json_as_f64),
                r.get("usage_percentage").and_then(json_as_f64),
            ])
        })
        .or_else(|| match (total, used) {
            (Some(t), Some(u)) if t > 0.0 => Some((u / t) * 100.0),
            _ => None,
        });

    QoderQuotaBucket {
        used,
        total,
        percentage,
    }
}

/// Format a Qoder quota line like "套餐内 Credits [Free]: 0% 0 / 0"
#[cfg(not(target_os = "macos"))]
fn format_qoder_quota_line(
    _lang: &str,
    label: &str,
    plan_tag: &Option<String>,
    bucket: &QoderQuotaBucket,
) -> String {
    let pct_text = bucket
        .percentage
        .map(|p| format!("{:.0}%", p.clamp(0.0, 100.0)))
        .unwrap_or_else(|| "0%".to_string());
    let used_text = bucket
        .used
        .map(|v| format!("{:.0}", v))
        .unwrap_or_else(|| "0".to_string());
    let total_text = bucket
        .total
        .map(|v| format!("{:.0}", v))
        .unwrap_or_else(|| "0".to_string());

    if let Some(tag) = plan_tag {
        format!(
            "{} [{}]: {} {} / {}",
            label, tag, pct_text, used_text, total_text
        )
    } else {
        format!("{}: {} {} / {}", label, pct_text, used_text, total_text)
    }
}

/// Helpers for navigating nested JSON
#[cfg(not(target_os = "macos"))]
fn json_nested(root: &Option<serde_json::Value>, path: &[&str]) -> Option<String> {
    let mut current = root.as_ref()?;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().map(|s| s.to_string())
}

#[cfg(not(target_os = "macos"))]
fn json_nested_obj(root: &Option<serde_json::Value>, path: &[&str]) -> Option<serde_json::Value> {
    let mut current = root.as_ref()?;
    for key in path {
        current = current.get(*key)?;
    }
    if current.is_object() {
        Some(current.clone())
    } else {
        None
    }
}

#[cfg(not(target_os = "macos"))]
fn json_nested_f64(root: &Option<serde_json::Value>, path: &[&str]) -> Option<f64> {
    let mut current = root.as_ref()?;
    for key in path {
        current = current.get(*key)?;
    }
    json_as_f64(current)
}

#[cfg(not(target_os = "macos"))]
fn json_first_string(values: &[Option<String>]) -> Option<String> {
    values
        .iter()
        .find_map(|v| v.as_ref().filter(|s| !s.trim().is_empty()).cloned())
}

#[cfg(not(target_os = "macos"))]
fn json_first_f64(values: &[Option<f64>]) -> Option<f64> {
    values.iter().find_map(|v| *v)
}

#[cfg(not(target_os = "macos"))]
fn build_trae_display_info(lang: &str, platform: PlatformId) -> AccountDisplayInfo {
    let accounts = crate::modules::trae_account::list_accounts();
    let Some(account) = resolve_trae_current_account(&accounts, platform) else {
        return AccountDisplayInfo {
            account: format!("📧 {}", get_text("not_logged_in", lang)),
            quota_lines: vec!["—".to_string()],
        };
    };

    let mut quota_lines = Vec::new();

    // Parse usage from trae_usage_raw
    let trae_usage = extract_trae_usage(&account);
    if let Some(ref usage) = trae_usage {
        // Plan badge from usage identity
        if let Some(ref identity) = usage.identity_str {
            if !identity.is_empty() {
                quota_lines.push(format!("Plan: {}", identity));
            }
        }

        // Usage percentage + USD / Credits amounts
        if usage.total_usd > 0.0 {
            let used_pct = ((usage.spent_usd / usage.total_usd) * 100.0)
                .round()
                .clamp(0.0, 100.0) as i32;
            let reset_text = usage
                .reset_at
                .map(|ts| format_reset_time_from_ts(lang, Some(ts)));
            quota_lines.push(format_quota_line(
                lang,
                if lang == "zh" || lang == "zh-CN" {
                    "配额"
                } else {
                    "Quota"
                },
                &format!("{}%", used_pct),
                reset_text.as_deref(),
            ));
            if usage.is_credits {
                if lang == "zh" || lang == "zh-CN" {
                    quota_lines.push(format!("{:.2} / {:.0} 积分", usage.spent_usd, usage.total_usd));
                } else {
                    quota_lines.push(format!("{:.2} / {:.0} Credits", usage.spent_usd, usage.total_usd));
                }
            } else {
                quota_lines.push(format!("${:.2} / ${:.2}", usage.spent_usd, usage.total_usd));
            }
        } else {
            // total_usd is 0 — show 0% with $0 / $0
            let reset_text = usage
                .reset_at
                .map(|ts| format_reset_time_from_ts(lang, Some(ts)));
            quota_lines.push(format_quota_line(
                lang,
                if lang == "zh" || lang == "zh-CN" {
                    "配额"
                } else {
                    "Quota"
                },
                "0%",
                reset_text.as_deref(),
            ));
            quota_lines.push(format!("${:.0} / ${:.0}", usage.spent_usd, usage.total_usd));
        }
    }

    // Fallback: show plan_type from account field if no usage data
    if trae_usage.is_none() {
        if let Some(plan) = account.plan_type.as_deref() {
            let trimmed = plan.trim();
            if !trimmed.is_empty() {
                quota_lines.push(format!("Plan: {}", trimmed));
            }
        }
    }

    // Add subscription reset time if available
    if let Some(reset_ts) = account.plan_reset_at {
        // Only show if not already shown as part of usage line
        let already_has_reset = trae_usage.as_ref().and_then(|u| u.reset_at).is_some();
        if !already_has_reset {
            quota_lines.push(format!(
                "{}: {}",
                get_text("subscription_reset", lang),
                format_reset_time_from_ts(lang, Some(reset_ts))
            ));
        }
    }

    if quota_lines.is_empty() {
        quota_lines.push(get_text("loading", lang));
    }

    // Prefer nickname > email > user_id > id
    let display_email = first_non_empty(&[
        account.nickname.as_deref(),
        Some(account.email.as_str()),
        account.user_id.as_deref(),
        Some(account.id.as_str()),
    ])
    .unwrap_or("—");

    AccountDisplayInfo {
        account: format!("📧 {}", display_email),
        quota_lines,
    }
}

#[cfg(not(target_os = "macos"))]
struct TraeUsageSummary {
    identity_str: Option<String>,
    spent_usd: f64,
    total_usd: f64,
    is_credits: bool,
    reset_at: Option<i64>,
}

#[cfg(not(target_os = "macos"))]
fn extract_trae_usage(account: &crate::models::trae::TraeAccount) -> Option<TraeUsageSummary> {
    let usage_root = account.trae_usage_raw.as_ref()?.as_object()?;

    // Check API code
    if let Some(code) = usage_root.get("code").and_then(|v| v.as_i64()) {
        if code != 0 {
            return None;
        }
    }

    let packs = usage_root
        .get("user_entitlement_pack_list")
        .and_then(|v| v.as_array())?;

    if packs.is_empty() {
        return None;
    }

    // Product type constants (matching frontend trae.ts exactly)
    const PRODUCT_FREE: i64 = 0;
    const PRODUCT_PRO: i64 = 1;
    // const PRODUCT_PACKAGE: i64 = 2;
    const PRODUCT_PROMO_CODE: i64 = 3;
    const PRODUCT_PRO_PLUS: i64 = 4;
    const PRODUCT_ULTRA: i64 = 6;
    // const PRODUCT_PAY_GO: i64 = 7;
    const PRODUCT_LITE: i64 = 8;
    const PRODUCT_TRIAL: i64 = 9;

    let get_product_type = |pack: &serde_json::Value| -> i64 {
        // Try entitlement_base_info.product_type first, then pack.product_type
        pack.get("entitlement_base_info")
            .and_then(|e| e.get("product_type"))
            .and_then(|v| v.as_i64())
            .or_else(|| pack.get("product_type").and_then(|v| v.as_i64()))
            .unwrap_or(-1)
    };

    // Filter out promo code packs
    let valid_packs: Vec<_> = packs
        .iter()
        .filter(|p| get_product_type(p) != PRODUCT_PROMO_CODE)
        .collect();

    if valid_packs.is_empty() {
        return None;
    }

    // Find best pack (priority: ultra > pro_plus > pro > trial > lite > free)
    let find_by_type = |product_type: i64| -> Option<&serde_json::Value> {
        valid_packs
            .iter()
            .find(|p| get_product_type(p) == product_type)
            .copied()
    };

    let selected_pack = find_by_type(PRODUCT_ULTRA)
        .or_else(|| find_by_type(PRODUCT_PRO_PLUS))
        .or_else(|| find_by_type(PRODUCT_PRO))
        .or_else(|| find_by_type(PRODUCT_TRIAL))
        .or_else(|| find_by_type(PRODUCT_LITE))
        .or_else(|| find_by_type(PRODUCT_FREE));

    let selected_pack = selected_pack?;

    let summary_obj = usage_root.get("usage_summary");
    let summary_total = summary_obj
        .and_then(|s| s.get("total_amount"))
        .and_then(json_as_f64)
        .unwrap_or(0.0);
    let summary_consumed = summary_obj
        .and_then(|s| s.get("consumed_amount"))
        .and_then(json_as_f64)
        .unwrap_or(0.0);
    let is_credits_billing = usage_root
        .get("is_credits_billing")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        || summary_total > 0.0;

    // Extract usage: pack.usage.basic_usage_amount
    let usage_obj = selected_pack.get("usage");
    let basic_spent_usd = usage_obj
        .and_then(|u| u.get("basic_usage_amount").or_else(|| u.get("basic_usage")))
        .and_then(json_as_f64)
        .unwrap_or(0.0);

    // Extract quota: pack.entitlement_base_info.quota.basic_usage_limit
    let entitlement_base = selected_pack.get("entitlement_base_info");
    let quota_obj = entitlement_base.and_then(|e| e.get("quota"));
    let basic_total_usd = quota_obj
        .and_then(|q| q.get("basic_usage_limit").or_else(|| q.get("basic_quota")))
        .and_then(json_as_f64)
        .unwrap_or(0.0);

    let (spent_usd, total_usd, is_credits) = if is_credits_billing && summary_total > 0.0 {
        (summary_consumed, summary_total, true)
    } else {
        (basic_spent_usd, basic_total_usd, false)
    };

    // Extract reset_at: pack.entitlement_base_info.end_time (+1)
    let reset_at = entitlement_base
        .and_then(|e| e.get("end_time"))
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
        })
        .filter(|ts| *ts > 0)
        .map(|ts| {
            let normalized = if ts > 1_000_000_000_000 {
                ts / 1000
            } else {
                ts
            };
            normalized + 1
        });

    // Identity string from usage
    let identity_str = usage_obj
        .and_then(|u| u.get("identity_str"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string());

    Some(TraeUsageSummary {
        identity_str,
        spent_usd,
        total_usd,
        is_credits,
        reset_at,
    })
}

#[cfg(not(target_os = "macos"))]
fn resolve_trae_current_account(
    accounts: &[crate::models::trae::TraeAccount],
    platform: PlatformId,
) -> Option<crate::models::trae::TraeAccount> {
    let platform_kind =
        crate::modules::trae_account::TraePlatformKind::parse(Some(platform.as_str())).ok()?;
    crate::modules::trae_account::resolve_current_account_id_for_platform(accounts, platform_kind)
        .and_then(|account_id| {
            accounts
                .iter()
                .find(|account| account.id == account_id)
                .cloned()
        })
}

#[cfg(not(target_os = "macos"))]
fn first_non_empty<'a>(values: &[Option<&'a str>]) -> Option<&'a str> {
    values
        .iter()
        .flatten()
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
}

#[cfg(not(target_os = "macos"))]
fn calc_remaining_percent(total: Option<f64>, used: Option<f64>) -> Option<i32> {
    let total = total?;
    if !total.is_finite() || total <= 0.0 {
        return None;
    }

    let used = used.unwrap_or(0.0);
    if !used.is_finite() {
        return None;
    }

    let remaining = (total - used).max(0.0);
    Some(clamp_percent((remaining / total) * 100.0))
}

#[cfg(not(target_os = "macos"))]
fn display_login_email(email: Option<&str>, login: &str) -> String {
    email
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or(login)
        .to_string()
}

#[cfg(not(target_os = "macos"))]
fn format_percent_text(percentage: i32) -> String {
    format!("{}%", percentage.clamp(0, 100))
}

#[cfg(not(target_os = "macos"))]
fn format_quota_line(
    lang: &str,
    label: &str,
    value_text: &str,
    reset_text: Option<&str>,
) -> String {
    let normalized_reset = reset_text
        .map(|text| text.trim())
        .filter(|text| !text.is_empty() && *text != "—");

    if let Some(reset) = normalized_reset {
        format!(
            "{}: {} · {} {}",
            label,
            value_text,
            get_text("reset", lang),
            reset
        )
    } else {
        format!("{}: {}", label, value_text)
    }
}

#[cfg(not(target_os = "macos"))]
fn format_quota_number(value: f64) -> String {
    let normalized = if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    };
    if (normalized.fract()).abs() < f64::EPSILON {
        format!("{:.0}", normalized)
    } else {
        format!("{:.2}", normalized)
    }
}

#[cfg(not(target_os = "macos"))]
fn format_micros_usd(value: f64) -> String {
    let normalized = if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    };
    format!("${:.2}", normalized / 1_000_000.0)
}

#[cfg(not(target_os = "macos"))]
fn json_path<'a>(
    root: Option<&'a serde_json::Value>,
    path: &[&str],
) -> Option<&'a serde_json::Value> {
    let mut current = root?;
    for key in path {
        current = current.as_object()?.get(*key)?;
    }
    Some(current)
}

#[cfg(not(target_os = "macos"))]
fn parse_timestamp_like(value: &serde_json::Value) -> Option<i64> {
    match value {
        serde_json::Value::Number(num) => parse_timestamp_number(num.as_f64()?),
        serde_json::Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return None;
            }
            if let Ok(n) = trimmed.parse::<f64>() {
                return parse_timestamp_number(n);
            }
            chrono::DateTime::parse_from_rfc3339(trimmed)
                .ok()
                .map(|dt| dt.timestamp())
        }
        serde_json::Value::Object(obj) => {
            if let Some(seconds) = obj.get("seconds").and_then(|v| v.as_i64()) {
                return Some(seconds);
            }
            if let Some(seconds) = obj.get("unixSeconds").and_then(|v| v.as_i64()) {
                return Some(seconds);
            }
            if let Some(inner) = obj.get("value") {
                return parse_timestamp_like(inner);
            }
            None
        }
        _ => None,
    }
}

#[cfg(not(target_os = "macos"))]
fn parse_timestamp_number(raw: f64) -> Option<i64> {
    if !raw.is_finite() || raw <= 0.0 {
        return None;
    }
    if raw > 1e12 {
        return Some((raw / 1000.0).floor() as i64);
    }
    Some(raw.floor() as i64)
}

#[cfg(not(target_os = "macos"))]
fn parse_token_map(token: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let prefix = token.split(':').next().unwrap_or(token);
    for item in prefix.split(';') {
        let mut parts = item.splitn(2, '=');
        let key = parts.next().unwrap_or("").trim();
        if key.is_empty() {
            continue;
        }
        let value = parts.next().unwrap_or("").trim();
        map.insert(key.to_string(), value.to_string());
    }
    map
}

#[cfg(not(target_os = "macos"))]
fn parse_token_number(map: &HashMap<String, String>, key: &str) -> Option<f64> {
    map.get(key)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .and_then(|value| value.split(':').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite())
}

#[cfg(not(target_os = "macos"))]
fn parse_json_number(value: &serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::Number(num) => num.as_f64(),
        serde_json::Value::String(text) => text.trim().parse::<f64>().ok(),
        _ => None,
    }
    .filter(|value| value.is_finite())
}

#[cfg(not(target_os = "macos"))]
fn calc_used_percent(total: Option<f64>, remaining: Option<f64>) -> Option<i32> {
    let total = total?;
    let remaining = remaining?;
    if total <= 0.0 {
        return None;
    }

    let used = (total - remaining).max(0.0);
    Some(clamp_percent((used / total) * 100.0))
}

#[cfg(not(target_os = "macos"))]
fn parse_reset_date_to_ts(reset_date: Option<&str>) -> Option<i64> {
    let reset_date = reset_date?.trim();
    if reset_date.is_empty() {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(reset_date)
        .ok()
        .map(|value| value.timestamp())
}

#[cfg(not(target_os = "macos"))]
fn clamp_percent(value: f64) -> i32 {
    value.round().clamp(0.0, 100.0) as i32
}

#[cfg(not(target_os = "macos"))]
fn build_model_quota_lines(lang: &str, models: &[crate::models::quota::ModelQuota]) -> Vec<String> {
    let mut lines = Vec::new();
    for model in models.iter().take(4) {
        let reset_text = format_reset_time(lang, &model.reset_time);
        lines.push(format_quota_line(
            lang,
            &model.name,
            &format_percent_text(model.percentage),
            Some(&reset_text),
        ));
    }
    if lines.is_empty() {
        lines.push("—".to_string());
    }
    lines
}

#[cfg(not(target_os = "macos"))]
fn format_reset_time_from_ts(lang: &str, reset_ts: Option<i64>) -> String {
    let Some(reset_ts) = reset_ts else {
        return "—".to_string();
    };
    let now = chrono::Utc::now().timestamp();
    let remaining_secs = reset_ts - now;
    if remaining_secs <= 0 {
        return get_text("reset_done", lang);
    }
    format_remaining_duration(remaining_secs)
}

#[cfg(not(target_os = "macos"))]
fn format_remaining_duration(remaining_secs: i64) -> String {
    let mut secs = remaining_secs.max(0);
    let days = secs / 86_400;
    secs %= 86_400;
    let hours = secs / 3_600;
    secs %= 3_600;
    let minutes = (secs / 60).max(1);

    if days > 0 {
        format!("{}d {}h {}m", days, hours, minutes)
    } else if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m", minutes)
    }
}

/// 格式化重置时间
#[cfg(not(target_os = "macos"))]
fn format_reset_time(lang: &str, reset_time: &str) -> String {
    if let Ok(reset) = chrono::DateTime::parse_from_rfc3339(reset_time) {
        let now = chrono::Utc::now();
        let duration = reset.signed_duration_since(now);

        if duration.num_seconds() <= 0 {
            return get_text("reset_done", lang);
        }

        let hours = duration.num_hours();
        let minutes = duration.num_minutes() % 60;

        if hours > 0 {
            format!("{}h {}m", hours, minutes)
        } else {
            format!("{}m", minutes)
        }
    } else {
        reset_time.to_string()
    }
}

/// 处理菜单事件
fn handle_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    logger::log_info(&format!("[Tray] 菜单点击: {}", id));

    match id {
        menu_ids::SHOW_WINDOW => {
            if let Err(err) = crate::modules::floating_card_window::show_main_window(app) {
                logger::log_warn(&format!("[Tray] 显示主窗口失败: {}", err));
            }
        }
        menu_ids::REFRESH_QUOTA => {
            let _ = app.emit("tray:refresh_quota", ());
        }
        menu_ids::SHOW_FLOATING_CARD => {
            let _ = crate::modules::floating_card_window::show_floating_card_window(app, true);
        }
        menu_ids::SETTINGS => {
            if let Err(err) =
                crate::modules::floating_card_window::show_main_window_and_navigate(app, "settings")
            {
                logger::log_warn(&format!("[Tray] 打开设置页失败: {}", err));
            }
        }
        menu_ids::QUIT => {
            info!("[Tray] 用户选择退出应用");
            crate::modules::floating_card_window::request_app_exit();
            app.exit(0);
        }
        _ => {
            if let Some(platform) = parse_platform_from_menu_id(id) {
                if let Err(err) =
                    crate::modules::floating_card_window::show_main_window_and_navigate(
                        app,
                        platform.nav_target(),
                    )
                {
                    logger::log_warn(&format!(
                        "[Tray] 打开平台页面失败: platform={}, err={}",
                        platform.as_str(),
                        err
                    ));
                }
            } else if id.starts_with("ag_") {
                if let Err(err) =
                    crate::modules::floating_card_window::show_main_window_and_navigate(
                        app, "overview",
                    )
                {
                    logger::log_warn(&format!("[Tray] 打开 Antigravity IDE 总览失败: {}", err));
                }
            } else if id.starts_with("codex_") {
                if let Err(err) =
                    crate::modules::floating_card_window::show_main_window_and_navigate(
                        app, "codex",
                    )
                {
                    logger::log_warn(&format!("[Tray] 打开 Codex 页面失败: {}", err));
                }
            }
        }
    }
}

fn parse_platform_from_menu_id(id: &str) -> Option<PlatformId> {
    let mut parts = id.split(':');
    if parts.next()? != "platform" {
        return None;
    }
    PlatformId::from_str(parts.next()?)
}

/// 处理托盘图标事件
fn handle_tray_event<R: Runtime>(tray: &TrayIcon<R>, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button,
            button_state,
            rect: _rect,
            ..
        } => {
            #[cfg(target_os = "macos")]
            {
                if button == MouseButton::Left {
                    if let Err(err) =
                        crate::modules::floating_card_window::show_main_window(tray.app_handle())
                    {
                        logger::log_warn(&format!("[Tray] 左键恢复主窗口失败: {}", err));
                    }
                    return;
                }

                if button == MouseButton::Right && button_state == MouseButtonState::Down {
                    let app = tray.app_handle().clone();
                    let app_for_menu = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        crate::modules::macos_native_menu::toggle_tray_menu(&app_for_menu, _rect);
                    });
                }
            }

            #[cfg(not(target_os = "macos"))]
            if button == MouseButton::Left && button_state == MouseButtonState::Up {
                if let Err(err) =
                    crate::modules::floating_card_window::show_main_window(tray.app_handle())
                {
                    logger::log_warn(&format!("[Tray] 左键恢复主窗口失败: {}", err));
                }
            }
        }
        TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => {
            #[cfg(target_os = "macos")]
            {
                return;
            }

            #[cfg(not(target_os = "macos"))]
            if let Err(err) =
                crate::modules::floating_card_window::show_main_window(tray.app_handle())
            {
                logger::log_warn(&format!("[Tray] 双击恢复主窗口失败: {}", err));
            }
        }
        _ => {}
    }
}

/// 请求更新托盘菜单（合并同一时间窗内的重复请求）
///
/// Rebuilding the menu re-reads every platform's account library from disk, so
/// the ~120 call sites that fire on any account mutation must not each pay for
/// one: a single quota refresh sweep touches a dozen platforms and used to queue
/// a dozen full rebuilds. Requests are collapsed into one trailing rebuild, then
/// native menu construction is applied in a single UI-thread pass.
pub fn update_tray_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    TRAY_MENU_REQUESTS.fetch_add(1, Ordering::AcqRel);
    if TRAY_MENU_REBUILD_SCHEDULED.swap(true, Ordering::AcqRel) {
        // A worker is already going to pick this request up.
        return Ok(());
    }
    spawn_tray_menu_rebuild_worker(app.clone());
    Ok(())
}

fn spawn_tray_menu_rebuild_worker<R: Runtime>(app: tauri::AppHandle<R>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(TRAY_MENU_COALESCE_WINDOW);
        let collapsed = TRAY_MENU_REQUESTS.swap(0, Ordering::AcqRel);
        let started = std::time::Instant::now();
        match rebuild_tray_menu_now(&app) {
            Ok(Some(timing)) => {
                logger::log_info(&format!(
                    "[Tray] 托盘菜单已更新: 合并请求={}, 数据耗时={}ms, 提交耗时={}ms, 总耗时={}ms",
                    collapsed,
                    timing.data_ms,
                    timing.apply_ms,
                    started.elapsed().as_millis()
                ));
            }
            Ok(None) => {
                logger::log_info(&format!(
                    "[Tray] 托盘菜单重建已跳过过期快照: 合并请求={}, 耗时={}ms",
                    collapsed,
                    started.elapsed().as_millis()
                ));
            }
            Err(err) => {
                logger::log_warn(&format!("[Tray] 托盘菜单重建失败: {}", err));
            }
        }

        // Release the slot, then re-check: a request that landed between the
        // swap above and this store would otherwise never be served.
        TRAY_MENU_REBUILD_SCHEDULED.store(false, Ordering::Release);
        if TRAY_MENU_REQUESTS.load(Ordering::Acquire) == 0 {
            return;
        }
        if TRAY_MENU_REBUILD_SCHEDULED.swap(true, Ordering::AcqRel) {
            // Someone else claimed the slot and will do the work.
            return;
        }
    });
}

struct TrayMenuRebuildTiming {
    data_ms: u128,
    apply_ms: u128,
}

fn rebuild_tray_menu_now<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Option<TrayMenuRebuildTiming>, String> {
    #[cfg(target_os = "macos")]
    {
        crate::modules::macos_native_menu::update_status_item(app)?;
        if !MACOS_TRAY_SKIP_LOGGED.swap(true, Ordering::Relaxed) {
            logger::log_info("[Tray] macOS 原生菜单模式，已更新菜单栏状态");
        }
        Ok(Some(TrayMenuRebuildTiming {
            data_ms: 0,
            apply_ms: 0,
        }))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let data_started = std::time::Instant::now();
        let snapshot = collect_tray_menu_snapshot();
        let data_ms = data_started.elapsed().as_millis();
        let generation = next_tray_menu_apply_generation(&TRAY_MENU_APPLY_GENERATION);
        let app_handle = app.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            if is_stale_tray_menu_apply(&TRAY_MENU_APPLY_GENERATION, generation) {
                let _ = tx.send(Ok(None));
                return;
            }
            let apply_started = std::time::Instant::now();
            let result = (|| {
                let Some(tray) = app_handle.tray_by_id(TRAY_ID) else {
                    return Ok(());
                };
                let menu = build_tray_menu_from_snapshot(&app_handle, &snapshot)
                    .map_err(|e| e.to_string())?;
                tray.set_menu(Some(menu)).map_err(|e| e.to_string())
            })();
            let apply_ms = apply_started.elapsed().as_millis();
            let _ = tx.send(result.map(|()| Some(apply_ms)));
        })
        .map_err(|e| e.to_string())?;

        match rx.recv().map_err(|_| "等待托盘菜单提交失败".to_string())? {
            Ok(Some(apply_ms)) => Ok(Some(TrayMenuRebuildTiming { data_ms, apply_ms })),
            Ok(None) => Ok(None),
            Err(err) => Err(err),
        }
    }
}

/// 获取本地化文本
#[cfg(not(target_os = "macos"))]
fn get_text(key: &str, lang: &str) -> String {
    match (key, lang) {
        // 简体中文
        ("show_window", "zh-cn") => "显示主窗口".to_string(),
        ("show_floating_card", "zh-cn") => "显示悬浮卡片".to_string(),
        ("refresh_quota", "zh-cn") => "🔄 刷新配额".to_string(),
        ("settings", "zh-cn") => "⚙️ 设置...".to_string(),
        ("quit", "zh-cn") => "❌ 退出".to_string(),
        ("not_logged_in", "zh-cn") => "未登录".to_string(),
        ("loading", "zh-cn") => "加载中...".to_string(),
        ("reset", "zh-cn") => "重置".to_string(),
        ("reset_done", "zh-cn") => "已重置".to_string(),
        ("reset_unknown", "zh-cn") => "重置时间未知".to_string(),
        ("left", "zh-cn") => "剩余".to_string(),
        ("usage_status", "zh-cn") => "用量状态".to_string(),
        ("plan", "zh-cn") => "订阅".to_string(),
        ("claude_current_session", "zh-cn") => "Current session".to_string(),
        ("claude_current_week_all_models", "zh-cn") => "Current week (all models)".to_string(),
        ("token_spend", "zh-cn") => "Token 消耗".to_string(),
        ("edit_predictions", "zh-cn") => "编辑预测".to_string(),
        ("overdue_field", "zh-cn") => "是否欠费".to_string(),
        ("overdue_yes", "zh-cn") => "是".to_string(),
        ("overdue_no", "zh-cn") => "否".to_string(),
        ("status_normal_short", "zh-cn") => "正常".to_string(),
        ("included", "zh-cn") => "包含".to_string(),
        ("ghcp_inline", "zh-cn") => "Inline".to_string(),
        ("ghcp_chat", "zh-cn") => "Chat".to_string(),
        ("ghcp_premium", "zh-cn") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "zh-cn") => "每日额度用量".to_string(),
        ("windsurf_weekly_quota_usage", "zh-cn") => "每周额度用量".to_string(),
        ("windsurf_extra_usage_balance", "zh-cn") => "额外用量余额".to_string(),
        ("windsurf_credits_left", "zh-cn") => "剩余积分".to_string(),
        ("windsurf_prompt_credits_left", "zh-cn") => "Prompt Credits".to_string(),
        ("windsurf_addon_credits_available", "zh-cn") => "附加积分".to_string(),
        ("subscription_reset", "zh-cn") => "订阅重置".to_string(),
        ("more_platforms", "zh-cn") => "更多平台".to_string(),
        ("no_platform_selected", "zh-cn") => "未选择托盘平台".to_string(),

        // 繁体中文
        ("show_window", "zh-tw") => "顯示主視窗".to_string(),
        ("show_floating_card", "zh-tw") => "顯示懸浮卡片".to_string(),
        ("refresh_quota", "zh-tw") => "🔄 重新整理配額".to_string(),
        ("settings", "zh-tw") => "⚙️ 設定...".to_string(),
        ("quit", "zh-tw") => "❌ 結束".to_string(),
        ("not_logged_in", "zh-tw") => "未登入".to_string(),
        ("loading", "zh-tw") => "載入中...".to_string(),
        ("reset", "zh-tw") => "重置".to_string(),
        ("reset_done", "zh-tw") => "已重置".to_string(),
        ("reset_unknown", "zh-tw") => "重置時間未知".to_string(),
        ("left", "zh-tw") => "剩餘".to_string(),
        ("usage_status", "zh-tw") => "用量狀態".to_string(),
        ("plan", "zh-tw") => "訂閱".to_string(),
        ("claude_current_session", "zh-tw") => "目前工作階段".to_string(),
        ("claude_current_week_all_models", "zh-tw") => "本週（所有模型）".to_string(),
        ("token_spend", "zh-tw") => "Token 消耗".to_string(),
        ("edit_predictions", "zh-tw") => "編輯預測".to_string(),
        ("overdue_field", "zh-tw") => "是否欠費".to_string(),
        ("overdue_yes", "zh-tw") => "是".to_string(),
        ("overdue_no", "zh-tw") => "否".to_string(),
        ("status_normal_short", "zh-tw") => "正常".to_string(),
        ("included", "zh-tw") => "已包含".to_string(),
        ("ghcp_inline", "zh-tw") => "Inline".to_string(),
        ("ghcp_chat", "zh-tw") => "Chat".to_string(),
        ("ghcp_premium", "zh-tw") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "zh-tw") => "每日額度用量".to_string(),
        ("windsurf_weekly_quota_usage", "zh-tw") => "每週額度用量".to_string(),
        ("windsurf_extra_usage_balance", "zh-tw") => "額外用量餘額".to_string(),
        ("windsurf_credits_left", "zh-tw") => "剩餘積分".to_string(),
        ("windsurf_prompt_credits_left", "zh-tw") => "Prompt Credits".to_string(),
        ("windsurf_addon_credits_available", "zh-tw") => "附加積分".to_string(),
        ("subscription_reset", "zh-tw") => "訂閱重置".to_string(),
        ("more_platforms", "zh-tw") => "更多平台".to_string(),
        ("no_platform_selected", "zh-tw") => "未選擇托盤平台".to_string(),

        // 英文
        ("show_window", "en") => "Show Window".to_string(),
        ("show_floating_card", "en") => "Show Floating Card".to_string(),
        ("refresh_quota", "en") => "🔄 Refresh Quota".to_string(),
        ("settings", "en") => "⚙️ Settings...".to_string(),
        ("quit", "en") => "❌ Quit".to_string(),
        ("not_logged_in", "en") => "Not logged in".to_string(),
        ("loading", "en") => "Loading...".to_string(),
        ("reset", "en") => "Reset".to_string(),
        ("reset_done", "en") => "Reset done".to_string(),
        ("reset_unknown", "en") => "Reset time unknown".to_string(),
        ("left", "en") => "left".to_string(),
        ("usage_status", "en") => "Usage Status".to_string(),
        ("plan", "en") => "Plan".to_string(),
        ("claude_current_session", "en") => "Current session".to_string(),
        ("claude_current_week_all_models", "en") => "Current week (all models)".to_string(),
        ("token_spend", "en") => "Token Spend".to_string(),
        ("edit_predictions", "en") => "Edit Predictions".to_string(),
        ("overdue_field", "en") => "Overdue".to_string(),
        ("overdue_yes", "en") => "Yes".to_string(),
        ("overdue_no", "en") => "No".to_string(),
        ("status_normal_short", "en") => "Normal".to_string(),
        ("included", "en") => "Included".to_string(),
        ("ghcp_inline", "en") => "Inline".to_string(),
        ("ghcp_chat", "en") => "Chat".to_string(),
        ("ghcp_premium", "en") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "en") => "Daily quota usage".to_string(),
        ("windsurf_weekly_quota_usage", "en") => "Weekly quota usage".to_string(),
        ("windsurf_extra_usage_balance", "en") => "Extra usage balance".to_string(),
        ("windsurf_credits_left", "en") => "Credits left".to_string(),
        ("windsurf_prompt_credits_left", "en") => "Prompt credits left".to_string(),
        ("windsurf_addon_credits_available", "en") => "Add-on credits available".to_string(),
        ("subscription_reset", "en") => "Subscription reset".to_string(),
        ("more_platforms", "en") => "More platforms".to_string(),
        ("no_platform_selected", "en") => "No tray platforms selected".to_string(),

        // 日语
        ("show_window", "ja") => "ウィンドウを表示".to_string(),
        ("show_floating_card", "ja") => "フローティングカードを表示".to_string(),
        ("refresh_quota", "ja") => "🔄 クォータを更新".to_string(),
        ("settings", "ja") => "⚙️ 設定...".to_string(),
        ("quit", "ja") => "❌ 終了".to_string(),
        ("not_logged_in", "ja") => "未ログイン".to_string(),
        ("loading", "ja") => "読み込み中...".to_string(),
        ("reset", "ja") => "リセット".to_string(),
        ("reset_done", "ja") => "リセット済み".to_string(),
        ("reset_unknown", "ja") => "リセット時間不明".to_string(),
        ("left", "ja") => "残り".to_string(),
        ("usage_status", "ja") => "利用状況".to_string(),
        ("plan", "ja") => "プラン".to_string(),
        ("claude_current_session", "ja") => "現在のセッション".to_string(),
        ("claude_current_week_all_models", "ja") => "今週（全モデル）".to_string(),
        ("token_spend", "ja") => "Token Spend".to_string(),
        ("edit_predictions", "ja") => "Edit Predictions".to_string(),
        ("overdue_field", "ja") => "延滞有無".to_string(),
        ("overdue_yes", "ja") => "はい".to_string(),
        ("overdue_no", "ja") => "いいえ".to_string(),
        ("status_normal_short", "ja") => "正常".to_string(),
        ("included", "ja") => "含まれる".to_string(),
        ("ghcp_inline", "ja") => "Inline".to_string(),
        ("ghcp_chat", "ja") => "Chat".to_string(),
        ("ghcp_premium", "ja") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "ja") => "日次クォータ使用量".to_string(),
        ("windsurf_weekly_quota_usage", "ja") => "週次クォータ使用量".to_string(),
        ("windsurf_extra_usage_balance", "ja") => "追加使用残高".to_string(),
        ("windsurf_credits_left", "ja") => "残りクレジット".to_string(),
        ("windsurf_prompt_credits_left", "ja") => "Prompt Credits".to_string(),
        ("windsurf_addon_credits_available", "ja") => "追加クレジット".to_string(),
        ("subscription_reset", "ja") => "サブスクリプションリセット".to_string(),
        ("more_platforms", "ja") => "その他のプラットフォーム".to_string(),
        ("no_platform_selected", "ja") => {
            "トレイに表示するプラットフォームがありません".to_string()
        }

        // 俄语
        ("show_window", "ru") => "Показать окно".to_string(),
        ("show_floating_card", "ru") => "Показать плавающую карточку".to_string(),
        ("refresh_quota", "ru") => "🔄 Обновить квоту".to_string(),
        ("settings", "ru") => "⚙️ Настройки...".to_string(),
        ("quit", "ru") => "❌ Выход".to_string(),
        ("not_logged_in", "ru") => "Не авторизован".to_string(),
        ("loading", "ru") => "Загрузка...".to_string(),
        ("reset", "ru") => "Сброс".to_string(),
        ("reset_done", "ru") => "Сброс выполнен".to_string(),
        ("reset_unknown", "ru") => "Время сброса неизвестно".to_string(),
        ("left", "ru") => "осталось".to_string(),
        ("usage_status", "ru") => "Статус использования".to_string(),
        ("plan", "ru") => "План".to_string(),
        ("claude_current_session", "ru") => "Текущая сессия".to_string(),
        ("claude_current_week_all_models", "ru") => "Текущая неделя (все модели)".to_string(),
        ("token_spend", "ru") => "Token Spend".to_string(),
        ("edit_predictions", "ru") => "Edit Predictions".to_string(),
        ("overdue_field", "ru") => "Есть задолженность".to_string(),
        ("overdue_yes", "ru") => "Да".to_string(),
        ("overdue_no", "ru") => "Нет".to_string(),
        ("status_normal_short", "ru") => "Норма".to_string(),
        ("included", "ru") => "Включено".to_string(),
        ("ghcp_inline", "ru") => "Inline".to_string(),
        ("ghcp_chat", "ru") => "Chat".to_string(),
        ("ghcp_premium", "ru") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "ru") => "Дневная квота".to_string(),
        ("windsurf_weekly_quota_usage", "ru") => "Недельная квота".to_string(),
        ("windsurf_extra_usage_balance", "ru") => "Баланс доп. использования".to_string(),
        ("windsurf_credits_left", "ru") => "Остаток кредитов".to_string(),
        ("windsurf_prompt_credits_left", "ru") => "Prompt credits".to_string(),
        ("windsurf_addon_credits_available", "ru") => "Доп. кредиты".to_string(),
        ("subscription_reset", "ru") => "Сброс подписки".to_string(),
        ("more_platforms", "ru") => "Другие платформы".to_string(),
        ("no_platform_selected", "ru") => "Платформы для трея не выбраны".to_string(),

        // 默认英文
        ("show_window", _) => "Show Window".to_string(),
        ("show_floating_card", _) => "Show Floating Card".to_string(),
        ("refresh_quota", _) => "🔄 Refresh Quota".to_string(),
        ("settings", _) => "⚙️ Settings...".to_string(),
        ("quit", _) => "❌ Quit".to_string(),
        ("not_logged_in", _) => "Not logged in".to_string(),
        ("loading", _) => "Loading...".to_string(),
        ("reset", _) => "Reset".to_string(),
        ("reset_done", _) => "Reset done".to_string(),
        ("reset_unknown", _) => "Reset time unknown".to_string(),
        ("left", _) => "left".to_string(),
        ("usage_status", _) => "Usage Status".to_string(),
        ("plan", _) => "Plan".to_string(),
        ("claude_current_session", _) => "Current session".to_string(),
        ("claude_current_week_all_models", _) => "Current week (all models)".to_string(),
        ("token_spend", _) => "Token Spend".to_string(),
        ("edit_predictions", _) => "Edit Predictions".to_string(),
        ("overdue_field", _) => "Overdue".to_string(),
        ("overdue_yes", _) => "Yes".to_string(),
        ("overdue_no", _) => "No".to_string(),
        ("status_normal_short", _) => "Normal".to_string(),
        ("included", _) => "Included".to_string(),
        ("ghcp_inline", _) => "Inline".to_string(),
        ("ghcp_chat", _) => "Chat".to_string(),
        ("ghcp_premium", _) => "Premium".to_string(),
        ("windsurf_daily_quota_usage", _) => "Daily quota usage".to_string(),
        ("windsurf_weekly_quota_usage", _) => "Weekly quota usage".to_string(),
        ("windsurf_extra_usage_balance", _) => "Extra usage balance".to_string(),
        ("windsurf_credits_left", _) => "Credits left".to_string(),
        ("windsurf_prompt_credits_left", _) => "Prompt credits left".to_string(),
        ("windsurf_addon_credits_available", _) => "Add-on credits available".to_string(),
        ("subscription_reset", _) => "Subscription reset".to_string(),
        ("more_platforms", _) => "More platforms".to_string(),
        ("no_platform_selected", _) => "No tray platforms selected".to_string(),

        _ => key.to_string(),
    }
}

#[cfg(test)]
#[path = "tray_menu_rebuild_tests.rs"]
mod tray_menu_rebuild_tests;
