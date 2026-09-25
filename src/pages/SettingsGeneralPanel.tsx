import { invoke } from '@tauri-apps/api/core';
import { normalizeLanguage } from '../i18n';
import { showFloatingCardWindow } from '../services/floatingCardService';
import { UI_SCALE_OPTION_STRINGS as UI_SCALE_OPTIONS } from '../utils/uiScale';
import { SettingsAccountTransferSection } from '../components/SettingsAccountTransferSection';
import type { SideNavLayoutMode } from '../stores/useSideNavLayoutStore';
import './settings/Settings.css';
import { FolderOpen, AlertCircle, RefreshCw } from 'lucide-react';
import type { SettingsPageViewProps } from "./SettingsPageView";


/** 渲染 SettingsPageView 的 activeTab === 'general' 业务面板。 */
export function SettingsGeneralPanel(props: SettingsPageViewProps) {
  const {
    appAutoLaunchEnabled,
    autoImportFromLocalEnabled,
    autoImportScanBusy,
    autoImportScanSeqRef,
    autoImportScanStatus,
    autoInstall,
    autoInstallLoaded,
    autoInstallTouchedRef,
    closeBehavior,
    codebuddyAppPath,
    codebuddyAutoRefresh,
    codebuddyAutoRefreshCustomMode,
    codebuddyAutoRefreshIsPreset,
    codebuddyCnAppPath,
    codebuddyCnAutoRefresh,
    codebuddyCnAutoRefreshCustomMode,
    codebuddyCnAutoRefreshIsPreset,
    codebuddyCnQuotaAlertEnabled,
    codebuddyCnQuotaAlertThreshold,
    codebuddyCnQuotaAlertThresholdCustomMode,
    codebuddyCnQuotaAlertThresholdIsPreset,
    codebuddyCnShareSessionsOnSwitch,
    codebuddyQuotaAlertEnabled,
    codebuddyQuotaAlertThreshold,
    codebuddyQuotaAlertThresholdCustomMode,
    codebuddyQuotaAlertThresholdIsPreset,
    codebuddyShareSessionsOnSwitch,
    defaultTerminal,
    errorReportingEnabled,
    errorReportingSaving,
    externalNetworkEnabled,
    floatingCardAlwaysOnTop,
    floatingCardShowOnStartup,
    generalLoaded,
    generalLoadFailed,
    getResetLabelByTarget,
    handleErrorReportingEnabledChange,
    handlePickAppPath,
    handleResetAppPath,
    handleSelectTraeLaunchCandidate,
    hideDockIcon,
    isAppPathResetDetecting,
    isMacOS,
    isWindows,
    language,
    languageOptions,
    loadGeneralConfig,
    loadUpdateSettings,
    menuBarQuotaEnabled,
    menuBarQuotaPlatform,
    menuBarQuotaPlatformOptions,
    normalizeNumberInput,
    openMenuBarQuotaModal,
    platformSettingsOrder,
    qoderAppPath,
    qoderAutoRefresh,
    qoderAutoRefreshCustomMode,
    qoderAutoRefreshIsPreset,
    qoderQuotaAlertEnabled,
    qoderQuotaAlertThreshold,
    qoderQuotaAlertThresholdCustomMode,
    qoderQuotaAlertThresholdIsPreset,
    qoderCnAppPath,
    qoderCnAutoRefresh,
    qoderCnAutoRefreshCustomMode,
    qoderCnAutoRefreshIsPreset,
    qoderCnQuotaAlertEnabled,
    qoderCnQuotaAlertThreshold,
    qoderCnQuotaAlertThresholdCustomMode,
    qoderCnQuotaAlertThresholdIsPreset,
    reducedMotionEnabled,
    REFRESH_PRESET_VALUES,
    rememberMainWindowState,
    renderAccountLevelRefreshConfig,
    renderCurrentAccountRefreshRow,
    renderSessionSharingRow,
    renderTraeVariantSettingsGroup,
    sanitizeNumberInput,
    setAppAutoLaunchEnabled,
    setAutoImportFromLocalEnabled,
    setAutoImportScanBusy,
    setAutoImportScanStatus,
    setAutoInstall,
    setCloseBehavior,
    setCodebuddyAppPath,
    setCodebuddyAutoRefresh,
    setCodebuddyAutoRefreshCustomMode,
    setCodebuddyCnAppPath,
    setCodebuddyCnAutoRefresh,
    setCodebuddyCnAutoRefreshCustomMode,
    setCodebuddyCnQuotaAlertEnabled,
    setCodebuddyCnQuotaAlertThreshold,
    setCodebuddyCnQuotaAlertThresholdCustomMode,
    setCodebuddyCnShareSessionsOnSwitch,
    setCodebuddyQuotaAlertEnabled,
    setCodebuddyQuotaAlertThreshold,
    setCodebuddyQuotaAlertThresholdCustomMode,
    setCodebuddyShareSessionsOnSwitch,
    setDefaultTerminal,
    setExternalNetworkEnabled,
    setFloatingCardAlwaysOnTop,
    setFloatingCardShowOnStartup,
    setHideDockIcon,
    setLanguage,
    setMenuBarQuotaEnabled,
    setQoderAppPath,
    setQoderAutoRefresh,
    setQoderAutoRefreshCustomMode,
    setQoderQuotaAlertEnabled,
    setQoderQuotaAlertThreshold,
    setQoderQuotaAlertThresholdCustomMode,
    setQoderCnAppPath,
    setQoderCnAutoRefresh,
    setQoderCnAutoRefreshCustomMode,
    setQoderCnQuotaAlertEnabled,
    setQoderCnQuotaAlertThreshold,
    setQoderCnQuotaAlertThresholdCustomMode,
    setReducedMotionEnabled,
    setRememberMainWindowState,
    setSideNavLayoutMode,
    setStartupMinimized,
    setStartupPage,
    setTheme,
    setThemeColor,
    setTokenKeeperEnabled,
    setTopRightAdVisible,
    setTraeAppPath,
    setTraeAutoRefresh,
    setTraeAutoRefreshCustomMode,
    setTraeCnAutoRefresh,
    setTraeCnAutoRefreshCustomMode,
    setTraeCnQuotaAlertEnabled,
    setTraeCnQuotaAlertThreshold,
    setTraeCnQuotaAlertThresholdCustomMode,
    setTraeQuotaAlertEnabled,
    setTraeQuotaAlertThreshold,
    setTraeQuotaAlertThresholdCustomMode,
    setTraeSoloAutoRefresh,
    setTraeSoloAutoRefreshCustomMode,
    setTraeSoloCnAutoRefresh,
    setTraeSoloCnAutoRefreshCustomMode,
    setTraeSoloCnQuotaAlertEnabled,
    setTraeSoloCnQuotaAlertThreshold,
    setTraeSoloCnQuotaAlertThresholdCustomMode,
    setTraeSoloQuotaAlertEnabled,
    setTraeSoloQuotaAlertThreshold,
    setTraeSoloQuotaAlertThresholdCustomMode,
    setTrayIconStyle,
    setUiScale,
    setUpdateRemindersEnabled,
    setWebdavAllowedDomains,
    setWorkbuddyAppPath,
    setWorkbuddyAutoRefresh,
    setWorkbuddyAutoRefreshCustomMode,
    setWorkbuddyQuotaAlertEnabled,
    setWorkbuddyQuotaAlertThreshold,
    setWorkbuddyQuotaAlertThresholdCustomMode,
    setWorkbuddyShareSessionsOnSwitch,
    sideNavLayoutMode,
    startupMinimized,
    startupPage,
    t,
    terminalOptions,
    theme,
    themeColor,
    THRESHOLD_PRESET_VALUES,
    tokenKeeperEnabled,
    topRightAdVisible,
    traeAppPath,
    traeAutoRefresh,
    traeAutoRefreshCustomMode,
    traeAutoRefreshIsPreset,
    traeCnAutoRefresh,
    traeCnAutoRefreshCustomMode,
    traeCnAutoRefreshIsPreset,
    traeCnQuotaAlertEnabled,
    traeCnQuotaAlertThreshold,
    traeCnQuotaAlertThresholdCustomMode,
    traeCnQuotaAlertThresholdIsPreset,
    traeLaunchCandidates,
    traeLaunchCandidatesTarget,
    traeQuotaAlertEnabled,
    traeQuotaAlertThreshold,
    traeQuotaAlertThresholdCustomMode,
    traeQuotaAlertThresholdIsPreset,
    traeSoloAutoRefresh,
    traeSoloAutoRefreshCustomMode,
    traeSoloAutoRefreshIsPreset,
    traeSoloCnAutoRefresh,
    traeSoloCnAutoRefreshCustomMode,
    traeSoloCnAutoRefreshIsPreset,
    traeSoloCnQuotaAlertEnabled,
    traeSoloCnQuotaAlertThreshold,
    traeSoloCnQuotaAlertThresholdCustomMode,
    traeSoloCnQuotaAlertThresholdIsPreset,
    traeSoloQuotaAlertEnabled,
    traeSoloQuotaAlertThreshold,
    traeSoloQuotaAlertThresholdCustomMode,
    traeSoloQuotaAlertThresholdIsPreset,
    trayIconStyle,
    uiScale,
    updateRemindersEnabled,
    updateRemindersLoaded,
    updateRemindersTouchedRef,
    updateSettingsLoadFailed,
    webdavAllowedDomains,
    workbuddyAppPath,
    workbuddyAutoRefresh,
    workbuddyAutoRefreshCustomMode,
    workbuddyAutoRefreshIsPreset,
    workbuddyQuotaAlertEnabled,
    workbuddyQuotaAlertThreshold,
    workbuddyQuotaAlertThresholdCustomMode,
    workbuddyQuotaAlertThresholdIsPreset,
    workbuddyShareSessionsOnSwitch,
  } = props;
  return (
          <>
          {(generalLoadFailed || updateSettingsLoadFailed) && (
            <div className="settings-load-error" role="alert">
              <AlertCircle size={16} />
              <span>{t('common.failed')}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (generalLoadFailed) void loadGeneralConfig();
                  if (updateSettingsLoadFailed) void loadUpdateSettings();
                }}
              >
                <RefreshCw size={14} />
                {t('common.refresh')}
              </button>
            </div>
          )}
          <SettingsAccountTransferSection directoryEntryOnly />
          <fieldset
            className="settings-general-fieldset"
            disabled={!generalLoaded}
            aria-busy={!generalLoaded}
          >
            <div className="group-title">{t('settings.general.commonTitle', '通用')}</div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.language')}</div>
                  <div className="row-desc">{t('settings.general.languageDesc')}</div>
                </div>
                <div className="row-control">
                  <select 
                    className="settings-select" 
                    value={language} 
                    onChange={(e) => setLanguage(normalizeLanguage(e.target.value))}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.theme')}</div>
                  <div className="row-desc">{t('settings.general.themeDesc')}</div>
                </div>
                <div className="row-control">
                  <select 
                    className="settings-select" 
                    value={theme} 
                    onChange={(e) => setTheme(e.target.value)}
                  >
                    <option value="light">{t('settings.general.themeLight')}</option>
                    <option value="dark">{t('settings.general.themeDark')}</option>
                    <option value="system">{t('settings.general.themeSystem')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.reducedMotion', '减少动画')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.reducedMotionDesc',
                      '降低页面淡入、弹层过渡、阴影、模糊和平滑滚动，仅保留必要加载反馈'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={reducedMotionEnabled}
                      onChange={(event) => setReducedMotionEnabled(event.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.defaultTerminal', '默认终端')}</div>
                  <div className="row-desc">{t('settings.general.defaultTerminalDesc', 'CLI 打开时使用的终端')}</div>
                </div>
                <div className="row-control">
                  <select 
                    className="settings-select" 
                    value={defaultTerminal} 
                    onChange={(e) => setDefaultTerminal(e.target.value)}
                  >
                    {terminalOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.sideNavLayout', '侧边栏布局')}</div>
                  <div className="row-desc">{t('settings.general.sideNavLayoutDesc', '切换原始布局或经典布局')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={sideNavLayoutMode}
                    onChange={(e) => setSideNavLayoutMode(e.target.value as SideNavLayoutMode)}
                  >
                    <option value="original">{t('settings.general.sideNavLayoutOriginal', '原始布局')}</option>
                    <option value="classic">{t('settings.general.sideNavLayoutClassic', '经典布局')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.uiScale')}</div>
                  <div className="row-desc">{t('settings.general.uiScaleDesc')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={uiScale}
                    onChange={(e) => setUiScale(e.target.value)}
                  >
                    {UI_SCALE_OPTIONS.map((value) => (
                      <option key={value} value={value}>{`${Math.round(Number.parseFloat(value) * 100)}%`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.closeBehavior')}</div>
                  <div className="row-desc">{t('settings.general.closeBehaviorDesc')}</div>
                </div>
                <div className="row-control">
                  <select 
                    className="settings-select" 
                    value={closeBehavior} 
                    onChange={(e) => setCloseBehavior(e.target.value as 'ask' | 'minimize' | 'quit')}
                  >
                    <option value="ask">{t('settings.general.closeBehaviorAsk')}</option>
                    <option value="minimize">{t('settings.general.closeBehaviorMinimize')}</option>
                    <option value="quit">{t('settings.general.closeBehaviorQuit')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.startupMinimized', '启动后自动最小化')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.startupMinimizedDesc',
                      '应用启动完成后自动最小化主窗口，可从 Dock、任务栏或托盘恢复'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={startupMinimized ? 'true' : 'false'}
                    onChange={(e) => setStartupMinimized(e.target.value === 'true')}
                  >
                    <option value="false">{t('common.disable', '停用')}</option>
                    <option value="true">{t('common.enable', '启用')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.rememberMainWindowState', '记住主窗口位置和大小')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.rememberMainWindowStateDesc',
                      '重启或从托盘重新打开时恢复主窗口位置和大小；默认关闭'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={rememberMainWindowState}
                      onChange={(event) => setRememberMainWindowState(event.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.autoUpdate')}</div>
                  <div className="row-desc">{t('settings.general.autoUpdateDesc')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={autoInstall ? 'true' : 'false'}
                    disabled={!autoInstallLoaded}
                    onChange={(e) => {
                      autoInstallTouchedRef.current = true;
                      setAutoInstall(e.target.value === 'true');
                    }}
                  >
                    <option value="false">{t('settings.general.autoUpdateOff')}</option>
                    <option value="true">{t('settings.general.autoUpdateOn')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.updateReminder')}</div>
                  <div className="row-desc">{t('settings.general.updateReminderDesc')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={updateRemindersEnabled ? 'true' : 'false'}
                    disabled={!updateRemindersLoaded}
                    onChange={(e) => {
                      updateRemindersTouchedRef.current = true;
                      setUpdateRemindersEnabled(e.target.value === 'true');
                    }}
                  >
                    <option value="true">{t('settings.general.updateReminderOn')}</option>
                    <option value="false">{t('settings.general.updateReminderOff')}</option>
                  </select>
                </div>
              </div>

              {isMacOS && (
                <>
                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">
                        {t('settings.general.hideDockIcon', '是否隐藏Dock图标（仅 macOS）')}
                      </div>
                      <div className="row-desc">
                        {t(
                          'settings.general.hideDockIconDesc',
                          '独立控制程序坞图标显示状态，不受窗口最小化行为影响'
                        )}
                      </div>
                    </div>
                    <div className="row-control">
                      <select
                        className="settings-select"
                        value={hideDockIcon ? 'true' : 'false'}
                        onChange={(e) => setHideDockIcon(e.target.value === 'true')}
                      >
                        <option value="false">
                          {t('settings.general.hideDockIconOff', '否（显示Dock图标）')}
                        </option>
                        <option value="true">
                          {t('settings.general.hideDockIconOn', '是（隐藏Dock图标）')}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">
                        {t('settings.general.trayIconStyle', '菜单栏图标样式（仅 macOS）')}
                      </div>
                      <div className="row-desc">
                        {t(
                          'settings.general.trayIconStyleDesc',
                          '选择系统单色图标或原彩色 App 图标'
                        )}
                      </div>
                    </div>
                    <div className="row-control">
                      <select
                        className="settings-select"
                        value={trayIconStyle}
                        onChange={(e) =>
                          setTrayIconStyle(e.target.value === 'color' ? 'color' : 'template')
                        }
                      >
                        <option value="template">
                          {t('settings.general.trayIconStyleTemplate', '单色图标')}
                        </option>
                        <option value="color">
                          {t('settings.general.trayIconStyleColor', '彩色图标')}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">
                        {t('settings.general.menuBarQuota', '菜单栏显示实时额度')}
                      </div>
                      <div className="row-desc">
                        {menuBarQuotaEnabled
                          ? t(
                              'settings.general.menuBarQuotaEnabledDesc',
                              '已启用 · {{platform}} · 显示该平台当前账号剩余额度（多条取最低）',
                              {
                                platform:
                                  menuBarQuotaPlatformOptions.find(
                                    (option) => option.value === menuBarQuotaPlatform
                                  )?.label ?? menuBarQuotaPlatform,
                              }
                            )
                          : t(
                              'settings.general.menuBarQuotaDesc',
                              '启用后在菜单栏图标旁显示所选平台当前账号的剩余额度；平台等专属选项在弹框中配置'
                            )}
                      </div>
                    </div>
                    <div className="row-control">
                      <select
                        className="settings-select"
                        value={menuBarQuotaEnabled ? 'true' : 'false'}
                        onChange={(e) => {
                          if (e.target.value === 'true') {
                            openMenuBarQuotaModal(menuBarQuotaEnabled ? 'edit' : 'enable');
                            return;
                          }
                          setMenuBarQuotaEnabled(false);
                        }}
                      >
                        <option value="false">{t('common.disable', '停用')}</option>
                        <option value="true">{t('common.enable', '启用')}</option>
                      </select>
                      {menuBarQuotaEnabled ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => openMenuBarQuotaModal('edit')}
                        >
                          {t('settings.general.menuBarQuotaConfigure', '配置')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </>
              )}

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.floatingCardStartup', '启动时显示悬浮卡片')}</div>
                  <div className="row-desc">{t('settings.general.floatingCardStartupDesc', '应用启动后默认展示悬浮账号卡片')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={floatingCardShowOnStartup ? 'true' : 'false'}
                    onChange={(e) => setFloatingCardShowOnStartup(e.target.value === 'true')}
                  >
                    <option value="true">{t('common.enable', '启用')}</option>
                    <option value="false">{t('common.disable', '停用')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.floatingCardAlwaysOnTop', '悬浮卡片默认置顶')}</div>
                  <div className="row-desc">{t('settings.general.floatingCardAlwaysOnTopDesc', '新打开的悬浮卡片窗口默认保持置顶')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={floatingCardAlwaysOnTop ? 'true' : 'false'}
                    onChange={(e) => setFloatingCardAlwaysOnTop(e.target.value === 'true')}
                  >
                    <option value="false">{t('common.disable', '停用')}</option>
                    <option value="true">{t('common.enable', '启用')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.appAutoLaunch')}</div>
                  <div className="row-desc">{t('settings.general.appAutoLaunchDesc')}</div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={appAutoLaunchEnabled ? 'true' : 'false'}
                    onChange={(e) => setAppAutoLaunchEnabled(e.target.value === 'true')}
                  >
                    <option value="false">{t('common.disable', '停用')}</option>
                    <option value="true">{t('common.enable', '启用')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.tokenKeeper', '后台授权保活')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.tokenKeeperDesc',
                      '仅在授权快过期时分批刷新账号 Token，降低大量账号场景下的后台请求压力。',
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={tokenKeeperEnabled}
                      onChange={(e) => setTokenKeeperEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.autoImportFromLocal', '本机账号自动导入')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.autoImportFromLocalDesc',
                      '开启后会立即扫描本机客户端登录状态并导入当前账号；之后当官方客户端更换登录时自动导入。首次可能弹出系统钥匙串授权，请选择「始终允许」。',
                    )}
                    {autoImportScanStatus ? (
                      <div
                        className="row-desc-extra"
                        style={{
                          marginTop: 6,
                          opacity: autoImportScanBusy ? 0.9 : 1,
                        }}
                      >
                        {autoImportScanStatus}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={autoImportFromLocalEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setAutoImportFromLocalEnabled(enabled);
                        if (!enabled) {
                          // 作废进行中的扫描结果，避免关了之后又刷回完成文案
                          autoImportScanSeqRef.current += 1;
                          setAutoImportScanBusy(false);
                          setAutoImportScanStatus(
                            autoImportScanBusy
                              ? t(
                                  'settings.general.autoImportFromLocalScanCancelled',
                                  '已关闭，后台扫描将忽略结果',
                                )
                              : '',
                          );
                          return;
                        }
                        const scanSeq = ++autoImportScanSeqRef.current;
                        setAutoImportScanBusy(true);
                        setAutoImportScanStatus(
                          t(
                            'settings.general.autoImportFromLocalScanning',
                            '正在扫描本机账号，可随时关闭…',
                          ),
                        );
                        void (async () => {
                          try {
                            // 等 patch 自动保存生效后再扫（debounce 300ms）
                            await new Promise((resolve) => window.setTimeout(resolve, 450));
                            if (autoImportScanSeqRef.current !== scanSeq) {
                              return;
                            }
                            const result = await invoke<{
                              scanned: number;
                              imported: number;
                              failed: number;
                              platforms: string[];
                            }>('scan_auto_local_import');
                            if (autoImportScanSeqRef.current !== scanSeq) {
                              return;
                            }
                            if (result.imported > 0) {
                              setAutoImportScanStatus(
                                t('settings.general.autoImportFromLocalScanDone', {
                                  imported: result.imported,
                                  scanned: result.scanned,
                                  defaultValue:
                                    '扫描完成：发现 {{scanned}} 个本机登录，已导入 {{imported}} 个',
                                }),
                              );
                            } else if (result.failed > 0) {
                              setAutoImportScanStatus(
                                t(
                                  'settings.general.autoImportFromLocalScanPartial',
                                  '扫描完成：未成功导入，部分平台失败，可到账号页手动导入',
                                ),
                              );
                            } else {
                              setAutoImportScanStatus(
                                t(
                                  'settings.general.autoImportFromLocalScanEmpty',
                                  '扫描完成：未发现可导入的本机登录',
                                ),
                              );
                            }
                          } catch (err) {
                            if (autoImportScanSeqRef.current !== scanSeq) {
                              return;
                            }
                            console.error('本机账号自动导入扫描失败:', err);
                            setAutoImportScanStatus(
                              t('settings.general.autoImportFromLocalScanFailed', {
                                error: String(err),
                                defaultValue: '扫描失败：{{error}}',
                              }),
                            );
                          } finally {
                            if (autoImportScanSeqRef.current === scanSeq) {
                              setAutoImportScanBusy(false);
                            }
                          }
                        })();
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.errorReporting', '遥测诊断')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.errorReportingDesc',
                      '默认开启，仅用于排查启动和界面问题；关闭后不会提交遥测事件。上报前会脱敏，不上传账号密码、Token、2FA 秘钥、手机号等敏感信息。',
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={errorReportingEnabled}
                      disabled={errorReportingSaving}
                      onChange={(e) => void handleErrorReportingEnabledChange(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.floatingCardShowNow', '立即显示悬浮卡片')}</div>
                  <div className="row-desc">{t('settings.general.floatingCardShowNowDesc', '关闭后可在这里或托盘菜单中重新打开')}</div>
                </div>
                <div className="row-control">
                  <button className="btn btn-secondary" onClick={() => void showFloatingCardWindow()}>
                    {t('settings.general.floatingCardShowNowAction', '显示悬浮卡片')}
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.dataDir')}</div>
                  <div className="row-desc">{t('settings.general.dataDirDesc')}</div>
                </div>
                <div className="row-control">
                  <button className="btn btn-secondary" onClick={() => invoke('open_data_folder')}>
                    <FolderOpen size={16} />{t('common.open')}
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.topRightAdVisible', '显示顶部推广')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.topRightAdVisibleDesc',
                      '关闭后隐藏应用顶部推广位。'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={topRightAdVisible}
                      onChange={(e) => setTopRightAdVisible(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.startupPage', '启动默认页')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.startupPageDesc',
                      '应用冷启动时打开的页面；选“记住上次”则恢复上次离开时的页面'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={startupPage}
                    onChange={(e) => setStartupPage(e.target.value)}
                  >
                    <option value="last">
                      {t('settings.general.startupPageLast', '记住上次')}
                    </option>
                    <option value="dashboard">{t('nav.dashboard', '仪表盘')}</option>
                    <option value="overview">{t('nav.overview', 'Antigravity IDE')}</option>
                    <option value="codex">{t('nav.codex', 'Codex')}</option>
                    <option value="codex-api-service">
                      {t('settings.general.startupPageCodexApi', 'Codex API 服务')}
                    </option>
                    <option value="claude">{t('nav.claude', 'Claude')}</option>
                    <option value="github-copilot">{t('nav.githubCopilot', 'GitHub Copilot')}</option>
                    <option value="windsurf">{t('nav.windsurf', 'Devin')}</option>
                    <option value="kiro">Kiro</option>
                    <option value="cursor">Cursor</option>
                    <option value="grok">Grok CLI</option>
                    <option value="codebuddy">{t('nav.codebuddy', 'CodeBuddy')}</option>
                    <option value="codebuddy-cn">{t('nav.codebuddyCn', 'CodeBuddy CN')}</option>
                    <option value="qoder">{t('nav.qoder', 'Qoder')}</option>
                    <option value="zcode">ZCode</option>
                    <option value="trae">{t('nav.trae', 'Trae')}</option>
                    <option value="trae-solo">{t('nav.traeSolo', 'TRAE Work')}</option>
                    <option value="trae-cn">{t('nav.traeCn', 'Trae CN')}</option>
                    <option value="trae-solo-cn">{t('nav.traeSoloCn', 'TRAE Work CN')}</option>
                    <option value="workbuddy">WorkBuddy</option>
                    <option value="zed">{t('nav.zed', 'Zed')}</option>
                    <option value="instances">{t('nav.instances', '应用多开')}</option>
                    <option value="wakeup">{t('nav.wakeup', '唤醒任务')}</option>
                    <option value="2fa">{t('nav.2faManager', '2FA 管理')}</option>
                    <option value="api-relay">{t('nav.apiRelay', '中转站')}</option>
                    <option value="manual">{t('nav.manual', '使用手册')}</option>
                    <option value="settings">{t('nav.settings', '设置')}</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.themeColor', '主题色套件')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.themeColorDesc',
                      '在浅色/深色之上叠加配色包（Nord、Tokyo Night 等）'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <select
                    className="settings-select"
                    value={themeColor}
                    onChange={(e) => {
                      const next = e.target.value;
                      setThemeColor(next);
                      try {
                        document.documentElement.setAttribute('data-theme-color', next);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    <option value="default">{t('settings.general.themeColorDefault', '默认')}</option>
                    <option value="nord">{t('settings.general.themeColorNord', 'Nord')}</option>
                    <option value="tokyo-night">
                      {t('settings.general.themeColorTokyoNight', 'Tokyo Night')}
                    </option>
                    <option value="catppuccin">
                      {t('settings.general.themeColorCatppuccin', 'Catppuccin')}
                    </option>
                    <option value="gruvbox">
                      {t('settings.general.themeColorGruvbox', 'Gruvbox')}
                    </option>
                    <option value="everforest">
                      {t('settings.general.themeColorEverforest', 'Everforest')}
                    </option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.externalNetwork', '允许外连')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.externalNetworkDesc',
                      '关闭后阻断 WebDAV 同步与 OpenRouter 用量刷新（不影响应用更新等其他网络）'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={externalNetworkEnabled}
                      onChange={(e) => setExternalNetworkEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.webdavAllowedDomains', 'WebDAV 域名白名单')}
                  </div>
                  <div className="row-desc">
                    {t(
                      'settings.general.webdavAllowedDomainsDesc',
                      '逗号分隔；留空不限制。非空时同步 URL 主机必须匹配'
                    )}
                  </div>
                </div>
                <div className="row-control">
                  <input
                    className="settings-input"
                    value={webdavAllowedDomains}
                    onChange={(e) => setWebdavAllowedDomains(e.target.value)}
                    placeholder="example.com, dav.example.org"
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ order: platformSettingsOrder.codebuddy }}>
                <div className="group-title">{t('settings.general.codebuddySettingsTitle', 'CodeBuddy 设置')}</div>
                <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.codebuddyAutoRefresh', 'CodeBuddy 自动刷新配额')}</div>
                  <div className="row-desc">{t('settings.general.codebuddyAutoRefreshDesc', '后台自动更新频率')}</div>
                </div>
                <div className="row-control">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {codebuddyAutoRefreshCustomMode ? (
                      <div className="settings-inline-input" style={{ minWidth: '120px', width: 'auto' }}>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          className="settings-select settings-select--input-mode settings-select--with-unit"
                          value={codebuddyAutoRefresh}
                          placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                          onChange={(e) => setCodebuddyAutoRefresh(sanitizeNumberInput(e.target.value))}
                          onBlur={() => {
                            const normalized = normalizeNumberInput(codebuddyAutoRefresh, 1, 999);
                            if (REFRESH_PRESET_VALUES.includes(normalized)) {
                              setCodebuddyAutoRefreshCustomMode(false);
                            }
                            setCodebuddyAutoRefresh(normalized);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const normalized = normalizeNumberInput(codebuddyAutoRefresh, 1, 999);
                              setCodebuddyAutoRefreshCustomMode(false);
                              setCodebuddyAutoRefresh(normalized);
                            }
                          }}
                        />
                        <span className="settings-input-unit">{t('settings.general.minutes')}</span>
                      </div>
                    ) : (
                      <select
                        className="settings-select"
                        style={{ minWidth: '120px', width: 'auto' }}
                        value={codebuddyAutoRefresh}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setCodebuddyAutoRefreshCustomMode(true);
                            setCodebuddyAutoRefresh(codebuddyAutoRefresh !== '-1' ? codebuddyAutoRefresh : '1');
                            return;
                          }
                          setCodebuddyAutoRefreshCustomMode(false);
                          setCodebuddyAutoRefresh(val);
                        }}
                      >
                        {!codebuddyAutoRefreshIsPreset && (
                          <option value={codebuddyAutoRefresh}>
                            {codebuddyAutoRefresh} {t('settings.general.minutes')}
                          </option>
                        )}
                        <option value="-1">{t('settings.general.autoRefreshDisabled')}</option>
                        <option value="2">2 {t('settings.general.minutes')}</option>
                        <option value="5">5 {t('settings.general.minutes')}</option>
                        <option value="10">10 {t('settings.general.minutes')}</option>
                        <option value="15">15 {t('settings.general.minutes')}</option>
                        <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {renderCurrentAccountRefreshRow('codebuddy')}
              {renderAccountLevelRefreshConfig('codebuddy')}

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {t('settings.general.codebuddyShareSessionsOnSwitch')}
                  </div>
                  <div className="row-desc">
                    {t('settings.general.codebuddyShareSessionsOnSwitchDesc')}
                  </div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={codebuddyShareSessionsOnSwitch}
                      onChange={(event) => setCodebuddyShareSessionsOnSwitch(event.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.general.codebuddyAppPath', 'CodeBuddy 启动路径')}</div>
                  <div className="row-desc">{t('settings.general.codebuddyAppPathDesc', '留空则使用默认路径')}</div>
                </div>
                <div className="row-control row-control--grow">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                    <input
                      type="text"
                      className="settings-input settings-input--path"
                      value={codebuddyAppPath}
                      placeholder={t('settings.general.codebuddyAppPathPlaceholder', '默认路径')}
                      onChange={(e) => setCodebuddyAppPath(e.target.value)}
                    />
                    <button
                      className="btn btn-secondary"
                      onClick={() => handlePickAppPath('codebuddy')}
                      disabled={isAppPathResetDetecting('codebuddy')}
                    >
                      {t('settings.general.codebuddyPathSelect', '选择')}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleResetAppPath('codebuddy')}
                      disabled={isAppPathResetDetecting('codebuddy')}
                    >
                      <RefreshCw size={16} className={isAppPathResetDetecting('codebuddy') ? 'spin' : undefined} />
                      {isAppPathResetDetecting('codebuddy')
                        ? t('common.loading', '加载中...')
                        : getResetLabelByTarget('codebuddy')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('quickSettings.quotaAlert.enable', '超额预警')}</div>
                  <div className="row-desc">{t('quickSettings.quotaAlert.hint', '当当前账号任意模型配额低于阈值时，发送原生通知并在页面提示快捷切号。')}</div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={codebuddyQuotaAlertEnabled}
                      onChange={(e) => setCodebuddyQuotaAlertEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
              {codebuddyQuotaAlertEnabled && (
                <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                  <div className="row-label">
                    <div className="row-title">{t('quickSettings.quotaAlert.threshold', '预警阈值')}</div>
                    <div className="row-desc">{t('quickSettings.quotaAlert.thresholdDesc', '任意模型配额低于此百分比时触发预警')}</div>
                  </div>
                  <div className="row-control">
                    {codebuddyQuotaAlertThresholdCustomMode ? (
                      <div className="settings-inline-input">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="settings-select settings-select--input-mode settings-select--with-unit"
                          value={codebuddyQuotaAlertThreshold}
                          placeholder={t('quickSettings.inputPercent', '输入百分比')}
                          onChange={(e) => setCodebuddyQuotaAlertThreshold(sanitizeNumberInput(e.target.value))}
                          onBlur={() => {
                            const normalized = normalizeNumberInput(codebuddyQuotaAlertThreshold, 0, 100);
                            if (THRESHOLD_PRESET_VALUES.includes(normalized)) {
                              setCodebuddyQuotaAlertThresholdCustomMode(false);
                            }
                            setCodebuddyQuotaAlertThreshold(normalized);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const normalized = normalizeNumberInput(codebuddyQuotaAlertThreshold, 0, 100);
                              setCodebuddyQuotaAlertThresholdCustomMode(false);
                              setCodebuddyQuotaAlertThreshold(normalized);
                            }
                          }}
                        />
                        <span className="settings-input-unit">%</span>
                      </div>
                    ) : (
                      <select
                        className="settings-select"
                        value={codebuddyQuotaAlertThreshold}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setCodebuddyQuotaAlertThresholdCustomMode(true);
                            setCodebuddyQuotaAlertThreshold(codebuddyQuotaAlertThreshold || '20');
                            return;
                          }
                          setCodebuddyQuotaAlertThresholdCustomMode(false);
                          setCodebuddyQuotaAlertThreshold(val);
                        }}
                      >
                        {!codebuddyQuotaAlertThresholdIsPreset && (
                          <option value={codebuddyQuotaAlertThreshold}>{codebuddyQuotaAlertThreshold}%</option>
                        )}
                        <option value="0">0%</option>
                        <option value="20">20%</option>
                        <option value="40">40%</option>
                        <option value="60">60%</option>
                        <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                      </select>
                    )}
                  </div>
                </div>
              )}
            </div>
              </div>

              <div style={{ order: platformSettingsOrder.codebuddy_cn }}>
                <div className="group-title">{t('settings.general.codebuddyCnSettingsTitle', 'CodeBuddy CN 设置')}</div>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.codebuddyCnAutoRefresh', 'CodeBuddy CN 自动刷新配额')}</div>
                      <div className="row-desc">{t('settings.general.codebuddyCnAutoRefreshDesc', '后台自动更新频率')}</div>
                    </div>
                    <div className="row-control">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {codebuddyCnAutoRefreshCustomMode ? (
                          <div className="settings-inline-input" style={{ minWidth: '120px', width: 'auto' }}>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={codebuddyCnAutoRefresh}
                              placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                              onChange={(e) => setCodebuddyCnAutoRefresh(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(codebuddyCnAutoRefresh, 1, 999);
                                if (REFRESH_PRESET_VALUES.includes(normalized)) {
                                  setCodebuddyCnAutoRefreshCustomMode(false);
                                }
                                setCodebuddyCnAutoRefresh(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(codebuddyCnAutoRefresh, 1, 999);
                                  setCodebuddyCnAutoRefreshCustomMode(false);
                                  setCodebuddyCnAutoRefresh(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">{t('settings.general.minutes')}</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            style={{ minWidth: '120px', width: 'auto' }}
                            value={codebuddyCnAutoRefresh}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setCodebuddyCnAutoRefreshCustomMode(true);
                                setCodebuddyCnAutoRefresh(codebuddyCnAutoRefresh !== '-1' ? codebuddyCnAutoRefresh : '1');
                                return;
                              }
                              setCodebuddyCnAutoRefreshCustomMode(false);
                              setCodebuddyCnAutoRefresh(val);
                            }}
                          >
                            {!codebuddyCnAutoRefreshIsPreset && (
                              <option value={codebuddyCnAutoRefresh}>
                                {codebuddyCnAutoRefresh} {t('settings.general.minutes')}
                              </option>
                            )}
                            <option value="-1">{t('settings.general.autoRefreshDisabled')}</option>
                            <option value="2">2 {t('settings.general.minutes')}</option>
                            <option value="5">5 {t('settings.general.minutes')}</option>
                            <option value="10">10 {t('settings.general.minutes')}</option>
                            <option value="15">15 {t('settings.general.minutes')}</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderCurrentAccountRefreshRow('codebuddy_cn')}
                  {renderAccountLevelRefreshConfig('codebuddy_cn')}
                  {renderSessionSharingRow(
                    'CodeBuddy CN',
                    codebuddyCnShareSessionsOnSwitch,
                    setCodebuddyCnShareSessionsOnSwitch,
                    true,
                  )}

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.codebuddyCnAppPath', 'CodeBuddy CN 启动路径')}</div>
                      <div className="row-desc">{t('settings.general.codebuddyCnAppPathDesc', '留空则使用默认路径')}</div>
                    </div>
                    <div className="row-control row-control--grow">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                        <input
                          type="text"
                          className="settings-input settings-input--path"
                          value={codebuddyCnAppPath}
                          placeholder={t('settings.general.codebuddyCnAppPathPlaceholder', '默认路径')}
                          onChange={(e) => setCodebuddyCnAppPath(e.target.value)}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => handlePickAppPath('codebuddy_cn')}
                          disabled={isAppPathResetDetecting('codebuddy_cn')}
                        >
                          {t('settings.general.codebuddyCnPathSelect', '选择')}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleResetAppPath('codebuddy_cn')}
                          disabled={isAppPathResetDetecting('codebuddy_cn')}
                        >
                          <RefreshCw size={16} className={isAppPathResetDetecting('codebuddy_cn') ? 'spin' : undefined} />
                          {isAppPathResetDetecting('codebuddy_cn')
                            ? t('common.loading', '加载中...')
                            : getResetLabelByTarget('codebuddy_cn')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('quickSettings.quotaAlert.enable', '超额预警')}</div>
                      <div className="row-desc">{t('quickSettings.quotaAlert.hint', '当当前账号任意模型配额低于阈值时，发送原生通知并在页面提示快捷切号。')}</div>
                    </div>
                    <div className="row-control">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={codebuddyCnQuotaAlertEnabled}
                          onChange={(e) => setCodebuddyCnQuotaAlertEnabled(e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                  {codebuddyCnQuotaAlertEnabled && (
                    <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                      <div className="row-label">
                        <div className="row-title">{t('quickSettings.quotaAlert.threshold', '预警阈值')}</div>
                        <div className="row-desc">{t('quickSettings.quotaAlert.thresholdDesc', '任意模型配额低于此百分比时触发预警')}</div>
                      </div>
                      <div className="row-control">
                        {codebuddyCnQuotaAlertThresholdCustomMode ? (
                          <div className="settings-inline-input">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={codebuddyCnQuotaAlertThreshold}
                              placeholder={t('quickSettings.inputPercent', '输入百分比')}
                              onChange={(e) => setCodebuddyCnQuotaAlertThreshold(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(codebuddyCnQuotaAlertThreshold, 0, 100);
                                if (THRESHOLD_PRESET_VALUES.includes(normalized)) {
                                  setCodebuddyCnQuotaAlertThresholdCustomMode(false);
                                }
                                setCodebuddyCnQuotaAlertThreshold(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(codebuddyCnQuotaAlertThreshold, 0, 100);
                                  setCodebuddyCnQuotaAlertThresholdCustomMode(false);
                                  setCodebuddyCnQuotaAlertThreshold(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">%</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            value={codebuddyCnQuotaAlertThreshold}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setCodebuddyCnQuotaAlertThresholdCustomMode(true);
                                setCodebuddyCnQuotaAlertThreshold(codebuddyCnQuotaAlertThreshold || '20');
                                return;
                              }
                              setCodebuddyCnQuotaAlertThresholdCustomMode(false);
                              setCodebuddyCnQuotaAlertThreshold(val);
                            }}
                          >
                            {!codebuddyCnQuotaAlertThresholdIsPreset && (
                              <option value={codebuddyCnQuotaAlertThreshold}>{codebuddyCnQuotaAlertThreshold}%</option>
                            )}
                            <option value="0">0%</option>
                            <option value="20">20%</option>
                            <option value="40">40%</option>
                            <option value="60">60%</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ order: platformSettingsOrder.qoder }}>
                <div className="group-title">{t('quickSettings.qoder.title', 'Qoder 设置')}</div>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.qoderAutoRefresh', 'Qoder 自动刷新配额')}</div>
                      <div className="row-desc">{t('settings.general.qoderAutoRefreshDesc', '后台自动更新频率')}</div>
                    </div>
                    <div className="row-control">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {qoderAutoRefreshCustomMode ? (
                          <div className="settings-inline-input" style={{ minWidth: '120px', width: 'auto' }}>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={qoderAutoRefresh}
                              placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                              onChange={(e) => setQoderAutoRefresh(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(qoderAutoRefresh, 1, 999);
                                if (REFRESH_PRESET_VALUES.includes(normalized)) {
                                  setQoderAutoRefreshCustomMode(false);
                                }
                                setQoderAutoRefresh(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(qoderAutoRefresh, 1, 999);
                                  setQoderAutoRefreshCustomMode(false);
                                  setQoderAutoRefresh(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">{t('settings.general.minutes')}</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            style={{ minWidth: '120px', width: 'auto' }}
                            value={qoderAutoRefresh}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setQoderAutoRefreshCustomMode(true);
                                setQoderAutoRefresh(qoderAutoRefresh !== '-1' ? qoderAutoRefresh : '1');
                                return;
                              }
                              setQoderAutoRefreshCustomMode(false);
                              setQoderAutoRefresh(val);
                            }}
                          >
                            {!qoderAutoRefreshIsPreset && (
                              <option value={qoderAutoRefresh}>
                                {qoderAutoRefresh} {t('settings.general.minutes')}
                              </option>
                            )}
                            <option value="-1">{t('settings.general.autoRefreshDisabled')}</option>
                            <option value="2">2 {t('settings.general.minutes')}</option>
                            <option value="5">5 {t('settings.general.minutes')}</option>
                            <option value="10">10 {t('settings.general.minutes')}</option>
                            <option value="15">15 {t('settings.general.minutes')}</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderCurrentAccountRefreshRow('qoder')}
                  {renderAccountLevelRefreshConfig('qoder')}

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.qoderAppPath', 'Qoder 启动路径')}</div>
                      <div className="row-desc">{t('settings.general.qoderAppPathDesc', '留空则使用默认路径')}</div>
                    </div>
                    <div className="row-control row-control--grow">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                        <input
                          type="text"
                          className="settings-input settings-input--path"
                          value={qoderAppPath}
                          placeholder={t('settings.general.qoderAppPathPlaceholder', '默认路径')}
                          onChange={(e) => setQoderAppPath(e.target.value)}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => handlePickAppPath('qoder')}
                          disabled={isAppPathResetDetecting('qoder')}
                        >
                          {t('settings.general.qoderPathSelect', '选择')}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleResetAppPath('qoder')}
                          disabled={isAppPathResetDetecting('qoder')}
                        >
                          <RefreshCw size={16} className={isAppPathResetDetecting('qoder') ? 'spin' : undefined} />
                          {isAppPathResetDetecting('qoder')
                            ? t('common.loading', '加载中...')
                            : getResetLabelByTarget('qoder')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('quickSettings.quotaAlert.enable', '超额预警')}</div>
                      <div className="row-desc">{t('quickSettings.quotaAlert.hint', '当当前账号任意模型配额低于阈值时，发送原生通知并在页面提示快捷切号。')}</div>
                    </div>
                    <div className="row-control">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={qoderQuotaAlertEnabled}
                          onChange={(e) => setQoderQuotaAlertEnabled(e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                  {qoderQuotaAlertEnabled && (
                    <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                      <div className="row-label">
                        <div className="row-title">{t('quickSettings.quotaAlert.threshold', '预警阈值')}</div>
                        <div className="row-desc">{t('quickSettings.quotaAlert.thresholdDesc', '任意模型配额低于此百分比时触发预警')}</div>
                      </div>
                      <div className="row-control">
                        {qoderQuotaAlertThresholdCustomMode ? (
                          <div className="settings-inline-input">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={qoderQuotaAlertThreshold}
                              placeholder={t('quickSettings.inputPercent', '输入百分比')}
                              onChange={(e) => setQoderQuotaAlertThreshold(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(qoderQuotaAlertThreshold, 0, 100);
                                if (THRESHOLD_PRESET_VALUES.includes(normalized)) {
                                  setQoderQuotaAlertThresholdCustomMode(false);
                                }
                                setQoderQuotaAlertThreshold(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(qoderQuotaAlertThreshold, 0, 100);
                                  setQoderQuotaAlertThresholdCustomMode(false);
                                  setQoderQuotaAlertThreshold(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">%</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            value={qoderQuotaAlertThreshold}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setQoderQuotaAlertThresholdCustomMode(true);
                                setQoderQuotaAlertThreshold(qoderQuotaAlertThreshold || '20');
                                return;
                              }
                              setQoderQuotaAlertThresholdCustomMode(false);
                              setQoderQuotaAlertThreshold(val);
                            }}
                          >
                            {!qoderQuotaAlertThresholdIsPreset && (
                              <option value={qoderQuotaAlertThreshold}>{qoderQuotaAlertThreshold}%</option>
                            )}
                            <option value="0">0%</option>
                            <option value="20">20%</option>
                            <option value="40">40%</option>
                            <option value="60">60%</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ order: platformSettingsOrder.qoder_cn }}>
                <div className="group-title">{t('quickSettings.qoderCn.title', 'Qoder 国内版设置')}</div>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.qoderCnAutoRefresh', 'Qoder 国内版自动刷新配额')}</div>
                      <div className="row-desc">{t('settings.general.qoderCnAutoRefreshDesc', '后台自动更新频率')}</div>
                    </div>
                    <div className="row-control">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {qoderCnAutoRefreshCustomMode ? (
                          <div className="settings-inline-input" style={{ minWidth: '120px', width: 'auto' }}>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={qoderCnAutoRefresh}
                              placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                              onChange={(e) => setQoderCnAutoRefresh(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(qoderCnAutoRefresh, 1, 999);
                                if (REFRESH_PRESET_VALUES.includes(normalized)) {
                                  setQoderCnAutoRefreshCustomMode(false);
                                }
                                setQoderCnAutoRefresh(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(qoderCnAutoRefresh, 1, 999);
                                  setQoderCnAutoRefreshCustomMode(false);
                                  setQoderCnAutoRefresh(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">{t('settings.general.minutes')}</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            style={{ minWidth: '120px', width: 'auto' }}
                            value={qoderCnAutoRefresh}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setQoderCnAutoRefreshCustomMode(true);
                                setQoderCnAutoRefresh(qoderCnAutoRefresh !== '-1' ? qoderCnAutoRefresh : '1');
                                return;
                              }
                              setQoderCnAutoRefreshCustomMode(false);
                              setQoderCnAutoRefresh(val);
                            }}
                          >
                            {!qoderCnAutoRefreshIsPreset && (
                              <option value={qoderCnAutoRefresh}>
                                {qoderCnAutoRefresh} {t('settings.general.minutes')}
                              </option>
                            )}
                            <option value="-1">{t('settings.general.autoRefreshDisabled')}</option>
                            <option value="2">2 {t('settings.general.minutes')}</option>
                            <option value="5">5 {t('settings.general.minutes')}</option>
                            <option value="10">10 {t('settings.general.minutes')}</option>
                            <option value="15">15 {t('settings.general.minutes')}</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderCurrentAccountRefreshRow('qoder_cn')}
                  {renderAccountLevelRefreshConfig('qoder_cn')}

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.qoderCnAppPath', 'Qoder 国内版启动路径')}</div>
                      <div className="row-desc">{t('settings.general.qoderCnAppPathDesc', '留空则使用默认路径')}</div>
                    </div>
                    <div className="row-control row-control--grow">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                        <input
                          type="text"
                          className="settings-input settings-input--path"
                          value={qoderCnAppPath}
                          placeholder={t('settings.general.qoderCnAppPathPlaceholder', '默认路径')}
                          onChange={(e) => setQoderCnAppPath(e.target.value)}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => handlePickAppPath('qoder_cn')}
                          disabled={isAppPathResetDetecting('qoder_cn')}
                        >
                          {t('settings.general.qoderCnPathSelect', '选择')}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleResetAppPath('qoder_cn')}
                          disabled={isAppPathResetDetecting('qoder_cn')}
                        >
                          <RefreshCw size={16} className={isAppPathResetDetecting('qoder_cn') ? 'spin' : undefined} />
                          {isAppPathResetDetecting('qoder_cn')
                            ? t('common.loading', '加载中...')
                            : getResetLabelByTarget('qoder_cn')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('quickSettings.quotaAlert.enable', '超额预警')}</div>
                      <div className="row-desc">{t('quickSettings.quotaAlert.hint', '当当前账号任意模型配额低于阈值时，发送原生通知并在页面提示快捷切号。')}</div>
                    </div>
                    <div className="row-control">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={qoderCnQuotaAlertEnabled}
                          onChange={(e) => setQoderCnQuotaAlertEnabled(e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                  {qoderCnQuotaAlertEnabled && (
                    <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                      <div className="row-label">
                        <div className="row-title">{t('quickSettings.quotaAlert.threshold', '预警阈值')}</div>
                        <div className="row-desc">{t('quickSettings.quotaAlert.thresholdDesc', '任意模型配额低于此百分比时触发预警')}</div>
                      </div>
                      <div className="row-control">
                        {qoderCnQuotaAlertThresholdCustomMode ? (
                          <div className="settings-inline-input">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={qoderCnQuotaAlertThreshold}
                              placeholder={t('quickSettings.inputPercent', '输入百分比')}
                              onChange={(e) => setQoderCnQuotaAlertThreshold(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(qoderCnQuotaAlertThreshold, 0, 100);
                                if (THRESHOLD_PRESET_VALUES.includes(normalized)) {
                                  setQoderCnQuotaAlertThresholdCustomMode(false);
                                }
                                setQoderCnQuotaAlertThreshold(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(qoderCnQuotaAlertThreshold, 0, 100);
                                  setQoderCnQuotaAlertThresholdCustomMode(false);
                                  setQoderCnQuotaAlertThreshold(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">%</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            value={qoderCnQuotaAlertThreshold}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setQoderCnQuotaAlertThresholdCustomMode(true);
                                setQoderCnQuotaAlertThreshold(qoderCnQuotaAlertThreshold || '20');
                                return;
                              }
                              setQoderCnQuotaAlertThresholdCustomMode(false);
                              setQoderCnQuotaAlertThreshold(val);
                            }}
                          >
                            {!qoderCnQuotaAlertThresholdIsPreset && (
                              <option value={qoderCnQuotaAlertThreshold}>{qoderCnQuotaAlertThreshold}%</option>
                            )}
                            <option value="0">0%</option>
                            <option value="20">20%</option>
                            <option value="40">40%</option>
                            <option value="60">60%</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ order: platformSettingsOrder.trae }}>
                <div className="group-title">{t('quickSettings.trae.title', 'Trae 设置')}</div>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.traeAutoRefresh', 'Trae 自动刷新配额')}</div>
                      <div className="row-desc">{t('settings.general.traeAutoRefreshDesc', '后台自动更新频率')}</div>
                    </div>
                    <div className="row-control">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {traeAutoRefreshCustomMode ? (
                          <div className="settings-inline-input" style={{ minWidth: '120px', width: 'auto' }}>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={traeAutoRefresh}
                              placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                              onChange={(e) => setTraeAutoRefresh(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(traeAutoRefresh, 1, 999);
                                if (REFRESH_PRESET_VALUES.includes(normalized)) {
                                  setTraeAutoRefreshCustomMode(false);
                                }
                                setTraeAutoRefresh(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(traeAutoRefresh, 1, 999);
                                  setTraeAutoRefreshCustomMode(false);
                                  setTraeAutoRefresh(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">{t('settings.general.minutes')}</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            style={{ minWidth: '120px', width: 'auto' }}
                            value={traeAutoRefresh}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setTraeAutoRefreshCustomMode(true);
                                setTraeAutoRefresh(traeAutoRefresh !== '-1' ? traeAutoRefresh : '1');
                                return;
                              }
                              setTraeAutoRefreshCustomMode(false);
                              setTraeAutoRefresh(val);
                            }}
                          >
                            {!traeAutoRefreshIsPreset && (
                              <option value={traeAutoRefresh}>
                                {traeAutoRefresh} {t('settings.general.minutes')}
                              </option>
                            )}
                            <option value="-1">{t('settings.general.autoRefreshDisabled')}</option>
                            <option value="2">2 {t('settings.general.minutes')}</option>
                            <option value="5">5 {t('settings.general.minutes')}</option>
                            <option value="10">10 {t('settings.general.minutes')}</option>
                            <option value="15">15 {t('settings.general.minutes')}</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderCurrentAccountRefreshRow('trae')}
                  {renderAccountLevelRefreshConfig('trae')}

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.traeAppPath', 'Trae 启动路径')}</div>
                      <div className="row-desc">{t('settings.general.traeAppPathDesc', '留空则使用默认路径')}</div>
                    </div>
                    <div className="row-control row-control--grow settings-claude-launch-control">
                      <div className="settings-claude-launch-row">
                        <input
                          type="text"
                          className="settings-input settings-input--path"
                          value={traeAppPath}
                          placeholder={t('settings.general.traeAppPathPlaceholder', '默认路径')}
                          onChange={(e) => setTraeAppPath(e.target.value)}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => handlePickAppPath('trae')}
                          disabled={isAppPathResetDetecting('trae')}
                        >
                          {t('settings.general.traePathSelect', '选择')}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleResetAppPath('trae')}
                          disabled={isAppPathResetDetecting('trae')}
                        >
                          <RefreshCw size={16} className={isAppPathResetDetecting('trae') ? 'spin' : undefined} />
                          {isAppPathResetDetecting('trae')
                            ? t('common.loading', '加载中...')
                            : getResetLabelByTarget('trae')}
                        </button>
                      </div>
                      {isWindows && traeLaunchCandidatesTarget === 'trae' && traeLaunchCandidates.length > 0 ? (
                        <div className="settings-claude-candidate-list">
                          {traeLaunchCandidates.map((candidate) => (
                            <button
                              key={`${candidate.target_type}:${candidate.target}`}
                              type="button"
                              className={`settings-claude-candidate-item${
                                traeAppPath.trim() === candidate.target ? ' selected' : ''
                              }`}
                              onClick={() => handleSelectTraeLaunchCandidate('trae', candidate)}
                            >
                              <div className="settings-claude-candidate-main">
                                <span>{candidate.label || 'Trae'}</span>
                                <span className="settings-claude-candidate-badge">EXE</span>
                              </div>
                              <div className="settings-claude-candidate-target">
                                {candidate.target}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('quickSettings.quotaAlert.enable', '超额预警')}</div>
                      <div className="row-desc">{t('quickSettings.quotaAlert.hint', '当当前账号任意模型配额低于阈值时，发送原生通知并在页面提示快捷切号。')}</div>
                    </div>
                    <div className="row-control">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={traeQuotaAlertEnabled}
                          onChange={(e) => setTraeQuotaAlertEnabled(e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                  {traeQuotaAlertEnabled && (
                    <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                      <div className="row-label">
                        <div className="row-title">{t('quickSettings.quotaAlert.threshold', '预警阈值')}</div>
                        <div className="row-desc">{t('quickSettings.quotaAlert.thresholdDesc', '任意模型配额低于此百分比时触发预警')}</div>
                      </div>
                      <div className="row-control">
                        {traeQuotaAlertThresholdCustomMode ? (
                          <div className="settings-inline-input">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={traeQuotaAlertThreshold}
                              placeholder={t('quickSettings.inputPercent', '输入百分比')}
                              onChange={(e) => setTraeQuotaAlertThreshold(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(traeQuotaAlertThreshold, 0, 100);
                                if (THRESHOLD_PRESET_VALUES.includes(normalized)) {
                                  setTraeQuotaAlertThresholdCustomMode(false);
                                }
                                setTraeQuotaAlertThreshold(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(traeQuotaAlertThreshold, 0, 100);
                                  setTraeQuotaAlertThresholdCustomMode(false);
                                  setTraeQuotaAlertThreshold(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">%</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            value={traeQuotaAlertThreshold}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setTraeQuotaAlertThresholdCustomMode(true);
                                setTraeQuotaAlertThreshold(traeQuotaAlertThreshold || '20');
                                return;
                              }
                              setTraeQuotaAlertThresholdCustomMode(false);
                              setTraeQuotaAlertThreshold(val);
                            }}
                          >
                            {!traeQuotaAlertThresholdIsPreset && (
                              <option value={traeQuotaAlertThreshold}>{traeQuotaAlertThreshold}%</option>
                            )}
                            <option value="0">0%</option>
                            <option value="20">20%</option>
                            <option value="40">40%</option>
                            <option value="60">60%</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {renderTraeVariantSettingsGroup({
                target: 'trae_solo',
                order: platformSettingsOrder.trae_solo,
                titleKey: 'quickSettings.traeSolo.title',
                titleDefault: 'TRAE Work 设置',
                appPathTitleKey: 'settings.general.traeSoloAppPath',
                appPathTitleDefault: 'TRAE Work 启动路径',
                autoRefresh: traeSoloAutoRefresh,
                setAutoRefresh: setTraeSoloAutoRefresh,
                autoRefreshCustomMode: traeSoloAutoRefreshCustomMode,
                setAutoRefreshCustomMode: setTraeSoloAutoRefreshCustomMode,
                autoRefreshIsPreset: traeSoloAutoRefreshIsPreset,
                quotaAlertEnabled: traeSoloQuotaAlertEnabled,
                setQuotaAlertEnabled: setTraeSoloQuotaAlertEnabled,
                quotaAlertThreshold: traeSoloQuotaAlertThreshold,
                setQuotaAlertThreshold: setTraeSoloQuotaAlertThreshold,
                quotaAlertThresholdCustomMode: traeSoloQuotaAlertThresholdCustomMode,
                setQuotaAlertThresholdCustomMode: setTraeSoloQuotaAlertThresholdCustomMode,
                quotaAlertThresholdIsPreset: traeSoloQuotaAlertThresholdIsPreset,
              })}

              {renderTraeVariantSettingsGroup({
                target: 'trae_cn',
                order: platformSettingsOrder.trae_cn,
                titleKey: 'quickSettings.traeCn.title',
                titleDefault: 'Trae CN 设置',
                appPathTitleKey: 'settings.general.traeCnAppPath',
                appPathTitleDefault: 'Trae CN 启动路径',
                autoRefresh: traeCnAutoRefresh,
                setAutoRefresh: setTraeCnAutoRefresh,
                autoRefreshCustomMode: traeCnAutoRefreshCustomMode,
                setAutoRefreshCustomMode: setTraeCnAutoRefreshCustomMode,
                autoRefreshIsPreset: traeCnAutoRefreshIsPreset,
                quotaAlertEnabled: traeCnQuotaAlertEnabled,
                setQuotaAlertEnabled: setTraeCnQuotaAlertEnabled,
                quotaAlertThreshold: traeCnQuotaAlertThreshold,
                setQuotaAlertThreshold: setTraeCnQuotaAlertThreshold,
                quotaAlertThresholdCustomMode: traeCnQuotaAlertThresholdCustomMode,
                setQuotaAlertThresholdCustomMode: setTraeCnQuotaAlertThresholdCustomMode,
                quotaAlertThresholdIsPreset: traeCnQuotaAlertThresholdIsPreset,
              })}

              {renderTraeVariantSettingsGroup({
                target: 'trae_solo_cn',
                order: platformSettingsOrder.trae_solo_cn,
                titleKey: 'quickSettings.traeSoloCn.title',
                titleDefault: 'TRAE Work CN 设置',
                appPathTitleKey: 'settings.general.traeSoloCnAppPath',
                appPathTitleDefault: 'TRAE Work CN 启动路径',
                autoRefresh: traeSoloCnAutoRefresh,
                setAutoRefresh: setTraeSoloCnAutoRefresh,
                autoRefreshCustomMode: traeSoloCnAutoRefreshCustomMode,
                setAutoRefreshCustomMode: setTraeSoloCnAutoRefreshCustomMode,
                autoRefreshIsPreset: traeSoloCnAutoRefreshIsPreset,
                quotaAlertEnabled: traeSoloCnQuotaAlertEnabled,
                setQuotaAlertEnabled: setTraeSoloCnQuotaAlertEnabled,
                quotaAlertThreshold: traeSoloCnQuotaAlertThreshold,
                setQuotaAlertThreshold: setTraeSoloCnQuotaAlertThreshold,
                quotaAlertThresholdCustomMode: traeSoloCnQuotaAlertThresholdCustomMode,
                setQuotaAlertThresholdCustomMode: setTraeSoloCnQuotaAlertThresholdCustomMode,
                quotaAlertThresholdIsPreset: traeSoloCnQuotaAlertThresholdIsPreset,
              })}

              <div style={{ order: platformSettingsOrder.workbuddy }}>
                <div className="group-title">{t('quickSettings.workbuddy.title', 'WorkBuddy 设置')}</div>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.workbuddyAutoRefresh', 'WorkBuddy 自动刷新配额')}</div>
                      <div className="row-desc">{t('settings.general.workbuddyAutoRefreshDesc', '后台自动更新频率')}</div>
                    </div>
                    <div className="row-control">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {workbuddyAutoRefreshCustomMode ? (
                          <div className="settings-inline-input" style={{ minWidth: '120px', width: 'auto' }}>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={workbuddyAutoRefresh}
                              placeholder={t('quickSettings.inputMinutes', '输入分钟数')}
                              onChange={(e) => setWorkbuddyAutoRefresh(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(workbuddyAutoRefresh, 1, 999);
                                if (REFRESH_PRESET_VALUES.includes(normalized)) {
                                  setWorkbuddyAutoRefreshCustomMode(false);
                                }
                                setWorkbuddyAutoRefresh(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(workbuddyAutoRefresh, 1, 999);
                                  setWorkbuddyAutoRefreshCustomMode(false);
                                  setWorkbuddyAutoRefresh(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">{t('settings.general.minutes')}</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            style={{ minWidth: '120px', width: 'auto' }}
                            value={workbuddyAutoRefresh}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setWorkbuddyAutoRefreshCustomMode(true);
                                setWorkbuddyAutoRefresh(workbuddyAutoRefresh !== '-1' ? workbuddyAutoRefresh : '1');
                                return;
                              }
                              setWorkbuddyAutoRefreshCustomMode(false);
                              setWorkbuddyAutoRefresh(val);
                            }}
                          >
                            {!workbuddyAutoRefreshIsPreset && (
                              <option value={workbuddyAutoRefresh}>
                                {workbuddyAutoRefresh} {t('settings.general.minutes')}
                              </option>
                            )}
                            <option value="-1">{t('settings.general.autoRefreshDisabled')}</option>
                            <option value="2">2 {t('settings.general.minutes')}</option>
                            <option value="5">5 {t('settings.general.minutes')}</option>
                            <option value="10">10 {t('settings.general.minutes')}</option>
                            <option value="15">15 {t('settings.general.minutes')}</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderCurrentAccountRefreshRow('workbuddy')}
                  {renderAccountLevelRefreshConfig('workbuddy')}

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">
                        {t('settings.general.workbuddyShareSessionsOnSwitch')}
                      </div>
                      <div className="row-desc">
                        {t('settings.general.workbuddyShareSessionsOnSwitchDesc')}
                      </div>
                    </div>
                    <div className="row-control">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={workbuddyShareSessionsOnSwitch}
                          onChange={(event) =>
                            setWorkbuddyShareSessionsOnSwitch(event.target.checked)
                          }
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('settings.general.workbuddyAppPath', 'WorkBuddy 启动路径')}</div>
                      <div className="row-desc">{t('settings.general.workbuddyAppPathDesc', '留空则使用默认路径')}</div>
                    </div>
                    <div className="row-control row-control--grow">
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                        <input
                          type="text"
                          className="settings-input settings-input--path"
                          value={workbuddyAppPath}
                          placeholder={t('settings.general.workbuddyAppPathPlaceholder', '默认路径')}
                          onChange={(e) => setWorkbuddyAppPath(e.target.value)}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => handlePickAppPath('workbuddy')}
                          disabled={isAppPathResetDetecting('workbuddy')}
                        >
                          {t('settings.general.workbuddyPathSelect', '选择')}
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleResetAppPath('workbuddy')}
                          disabled={isAppPathResetDetecting('workbuddy')}
                        >
                          <RefreshCw size={16} className={isAppPathResetDetecting('workbuddy') ? 'spin' : undefined} />
                          {isAppPathResetDetecting('workbuddy')
                            ? t('common.loading', '加载中...')
                            : getResetLabelByTarget('workbuddy')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="row-label">
                      <div className="row-title">{t('quickSettings.quotaAlert.enable', '超额预警')}</div>
                      <div className="row-desc">{t('quickSettings.quotaAlert.hint', '当当前账号任意模型配额低于阈值时，发送原生通知并在页面提示快捷切号。')}</div>
                    </div>
                    <div className="row-control">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={workbuddyQuotaAlertEnabled}
                          onChange={(e) => setWorkbuddyQuotaAlertEnabled(e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>
                  {workbuddyQuotaAlertEnabled && (
                    <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                      <div className="row-label">
                        <div className="row-title">{t('quickSettings.quotaAlert.threshold', '预警阈值')}</div>
                        <div className="row-desc">{t('quickSettings.quotaAlert.thresholdDesc', '任意模型配额低于此百分比时触发预警')}</div>
                      </div>
                      <div className="row-control">
                        {workbuddyQuotaAlertThresholdCustomMode ? (
                          <div className="settings-inline-input">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className="settings-select settings-select--input-mode settings-select--with-unit"
                              value={workbuddyQuotaAlertThreshold}
                              placeholder={t('quickSettings.inputPercent', '输入百分比')}
                              onChange={(e) => setWorkbuddyQuotaAlertThreshold(sanitizeNumberInput(e.target.value))}
                              onBlur={() => {
                                const normalized = normalizeNumberInput(workbuddyQuotaAlertThreshold, 0, 100);
                                if (THRESHOLD_PRESET_VALUES.includes(normalized)) {
                                  setWorkbuddyQuotaAlertThresholdCustomMode(false);
                                }
                                setWorkbuddyQuotaAlertThreshold(normalized);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const normalized = normalizeNumberInput(workbuddyQuotaAlertThreshold, 0, 100);
                                  setWorkbuddyQuotaAlertThresholdCustomMode(false);
                                  setWorkbuddyQuotaAlertThreshold(normalized);
                                }
                              }}
                            />
                            <span className="settings-input-unit">%</span>
                          </div>
                        ) : (
                          <select
                            className="settings-select"
                            value={workbuddyQuotaAlertThreshold}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setWorkbuddyQuotaAlertThresholdCustomMode(true);
                                setWorkbuddyQuotaAlertThreshold(workbuddyQuotaAlertThreshold || '20');
                                return;
                              }
                              setWorkbuddyQuotaAlertThresholdCustomMode(false);
                              setWorkbuddyQuotaAlertThreshold(val);
                            }}
                          >
                            {!workbuddyQuotaAlertThresholdIsPreset && (
                              <option value={workbuddyQuotaAlertThreshold}>{workbuddyQuotaAlertThreshold}%</option>
                            )}
                            <option value="0">0%</option>
                            <option value="20">20%</option>
                            <option value="40">40%</option>
                            <option value="60">60%</option>
                            <option value="custom">{t('settings.general.autoRefreshCustom')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </fieldset>
          </>
        );
}
