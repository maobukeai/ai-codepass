import { useState } from 'react';
import { UnlockFireworksOverlay } from '../components/UnlockFireworksOverlay';
import { SettingsAccountTransferSection } from '../components/SettingsAccountTransferSection';
import { SettingsWebdavSyncSection } from '../components/SettingsWebdavSyncSection';
import { SettingsWebhookSection } from '../components/SettingsWebhookSection';
import { SettingsAutoCheckinSection } from '../components/SettingsAutoCheckinSection';
import './settings/Settings.css';
import {
  Save,
  AlertCircle,
  RefreshCw,
  FileText,
  Download,
  X,
  Code,
  ExternalLink,
  ShieldCheck,
  MessageCircle,
  Heart,
  Sparkles,
  Check,
  Globe2,
} from 'lucide-react';
import { AppBrandLogo } from '../components/icons/AppBrandLogo';
import contactQr from '../assets/contact_qr.webp';
import sponsorQr from '../assets/sponsor_qr.webp';
import type { PlatformId } from '../types/platform';
import type { useSettingsPageController } from "./SettingsPage";
import { SettingsGeneralPanel } from "./SettingsGeneralPanel";


export type SettingsPageViewProps = ReturnType<typeof useSettingsPageController>;

/** 渲染 SettingsPage 的界面；业务状态与动作统一由 Controller 提供。 */
export function SettingsPageView(props: SettingsPageViewProps) {
  const [qrModal, setQrModal] = useState<'contact' | 'sponsor' | null>(null);
  const {
    activeTab,
    actualPort,
    appVersion,
    autoInstall,
    autoInstallLoaded,
    autoInstallTouchedRef,
    defaultPort,
    generateReportToken,
    globalProxyEnabled,
    globalProxyNoProxy,
    globalProxyUrl,
    handleAboutAvatarTap,
    handleCheckUpdate,
    handleCloseMenuBarQuotaModal,
    handleCloseReleaseHistory,
    handleConfirmMenuBarQuotaModal,
    handleDownloadReleaseVersion,
    handleOpenReleaseHistory,
    handleSaveNetworkConfig,
    latestUpdateStatus,
    menuBarQuotaDraftPlatform,
    menuBarQuotaDraftShowPrefix,
    menuBarQuotaModalMode,
    menuBarQuotaModalOpen,
    menuBarQuotaPlatformOptions,
    needsRestart,
    networkSaving,
    openLink,
    reducedMotionEnabled,
    releaseHistoryError,
    releaseHistoryItems,
    releaseHistoryLoading,
    releaseHistoryOpen,
    releaseHistorySections,
    renderReleaseHistoryLine,
    reportActualPort,
    reportDefaultPort,
    reportEnabled,
    reportPort,
    reportRawPreviewUrl,
    reportRenderedPreviewUrl,
    reportToken,
    setActiveTab,
    setAutoInstall,
    setGlobalProxyEnabled,
    setGlobalProxyNoProxy,
    setGlobalProxyUrl,
    setMenuBarQuotaDraftPlatform,
    setMenuBarQuotaDraftShowPrefix,
    setReportEnabled,
    setReportPort,
    setReportToken,
    setUpdateRemindersEnabled,
    setWsEnabled,
    setWsPort,
    showUnlockFireworks,
    t,
    updateChecking,
    updateCheckMessage,
    updateRemindersEnabled,
    updateRemindersLoaded,
    updateRemindersTouchedRef,
    wsEnabled,
    wsPort,
  } = props;
  return (
    <main className="main-content">
      <div className="page-tabs-row settings-page-tabs-row">
        <div className="page-tabs-label">{t('settings.title')}</div>
        <div className="page-tabs filter-tabs">
          <button 
            className={`filter-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            {t('settings.tabs.general')}
          </button>
          <button 
            className={`filter-tab ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            {t('settings.tabs.notifications', '定时签到与通知')}
          </button>
          <button 
            className={`filter-tab ${activeTab === 'network' ? 'active' : ''}`}
            onClick={() => setActiveTab('network')}
          >
            {t('settings.tabs.network')}
          </button>
          <button 
            className={`filter-tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            {t('settings.tabs.data', '数据管理')}
          </button>
          <button 
            className={`filter-tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            {t('settings.tabs.about')}
          </button>
        </div>
      </div>

      {/* 2. Content Area */}
      <div className="settings-container">
        <div className="settings-content">
        {/* === General Tab === */}
        {activeTab === 'general' && <SettingsGeneralPanel {...props} />}

        {/* === Notifications & Auto Checkin Tab === */}
        {activeTab === 'notifications' && (
          <>
            <SettingsAutoCheckinSection />
            <SettingsWebhookSection />
          </>
        )}

        {activeTab === 'data' && (
          <>
            <SettingsAccountTransferSection />
            <SettingsWebdavSyncSection />
          </>
        )}

        {/* === Network Tab === */}
        {activeTab === 'network' && (
          <>
            <div className="group-title">Antigravity Cockpit API</div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.network.wsService')}</div>
                  <div className="row-desc">{t('settings.network.wsServiceDesc')}</div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={wsEnabled} 
                      onChange={(e) => setWsEnabled(e.target.checked)} 
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              {wsEnabled && (
                <>
                  <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                    <div className="row-label">
                      <div className="row-title">{t('settings.network.preferredPort')}</div>
                      <div className="row-desc">
                        {t('settings.network.preferredPortDesc').replace('{port}', String(defaultPort))}
                      </div>
                    </div>
                    <div className="row-control">
                      <input 
                        type="number" 
                        className="settings-input"
                        value={wsPort}
                        onChange={(e) => setWsPort(e.target.value)}
                        placeholder={String(defaultPort)}
                        min="1024"
                        max="65535"
                      />
                    </div>
                  </div>
                  
                  {actualPort && (
                    <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                      <div className="row-label">
                        <div className="row-title">{t('settings.network.currentPort')}</div>
                        <div className="row-desc">
                          {actualPort === parseInt(wsPort, 10) 
                            ? t('settings.network.portNormal')
                            : t('settings.network.portFallback')
                                .replace('{configured}', wsPort)
                                .replace('{actual}', String(actualPort))}
                        </div>
                      </div>
                      <div className="row-control">
                        <span style={{ 
                          fontFamily: 'var(--font-mono)', 
                          fontSize: '14px',
                          color: actualPort === parseInt(wsPort, 10) ? 'var(--accent)' : 'var(--warning, #f59e0b)'
                        }}>
                          ws://127.0.0.1:{actualPort}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="group-title">{t('settings.network.reportTitle')}</div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.network.reportService')}</div>
                  <div className="row-desc">{t('settings.network.reportServiceDesc')}</div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={reportEnabled}
                      onChange={(e) => setReportEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              {reportEnabled && (
                <>
                  <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                    <div className="row-label">
                      <div className="row-title">{t('settings.network.reportPort')}</div>
                      <div className="row-desc">
                        {t('settings.network.reportPortDesc').replace('{port}', String(reportDefaultPort))}
                      </div>
                    </div>
                    <div className="row-control">
                      <input
                        type="number"
                        className="settings-input"
                        value={reportPort}
                        onChange={(e) => setReportPort(e.target.value)}
                        placeholder={String(reportDefaultPort)}
                        min="1024"
                        max="65535"
                      />
                    </div>
                  </div>

                  <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                    <div className="row-label">
                      <div className="row-title">{t('settings.network.reportToken')}</div>
                      <div className="row-desc">{t('settings.network.reportTokenDesc')}</div>
                    </div>
                    <div className="row-control" style={{ minWidth: '260px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="settings-input"
                        value={reportToken}
                        onChange={(e) => setReportToken(e.target.value)}
                        placeholder="change-this-token"
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => setReportToken(generateReportToken())}
                        type="button"
                      >
                        {t('settings.network.generateToken')}
                      </button>
                    </div>
                  </div>

                  {reportActualPort && (
                    <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                      <div className="row-label">
                        <div className="row-title">{t('settings.network.currentPort')}</div>
                        <div className="row-desc">
                          {reportActualPort === parseInt(reportPort, 10)
                            ? t('settings.network.portNormal')
                            : t('settings.network.portFallback')
                                .replace('{configured}', reportPort)
                                .replace('{actual}', String(reportActualPort))}
                        </div>
                      </div>
                      <div className="row-control">
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '14px',
                          color: reportActualPort === parseInt(reportPort, 10) ? 'var(--accent)' : 'var(--warning, #f59e0b)',
                        }}>
                          http://0.0.0.0:{reportActualPort}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                    <div className="row-label">
                      <div className="row-title">{t('settings.network.reportUrlPreview')}</div>
                      <div className="row-desc">
                        {t('settings.network.reportUrlPreviewDesc')}
                      </div>
                    </div>
                    <div className="row-control">
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        alignItems: 'flex-start',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        wordBreak: 'break-all',
                      }}>
                        <span>{`${t('settings.network.reportUrlRaw')}: ${reportRawPreviewUrl}`}</span>
                        <span>{`${t('settings.network.reportUrlRendered')}: ${reportRenderedPreviewUrl}`}</span>
                      </div>
                    </div>
                  </div>

                  <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                    <div className="row-label">
                      <div className="row-title">{t('settings.network.firewallHintTitle')}</div>
                      <div className="row-desc">{t('settings.network.firewallHint')}</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="group-title">{t('settings.network.proxyTitle')}</div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">{t('settings.network.proxyEnabled')}</div>
                  <div className="row-desc">{t('settings.network.proxyEnabledDesc')}</div>
                </div>
                <div className="row-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={globalProxyEnabled}
                      onChange={(e) => setGlobalProxyEnabled(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              {globalProxyEnabled && (
                <>
                  <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                    <div className="row-label">
                      <div className="row-title">{t('settings.network.proxyUrl')}</div>
                      <div className="row-desc">{t('settings.network.proxyUrlDesc')}</div>
                    </div>
                    <div className="row-control">
                      <input
                        type="text"
                        className="settings-input"
                        value={globalProxyUrl}
                        onChange={(e) => setGlobalProxyUrl(e.target.value)}
                        placeholder={t('settings.network.proxyUrlPlaceholder')}
                      />
                    </div>
                  </div>

                  <div className="settings-row" style={{ animation: 'fadeUp 0.3s ease both' }}>
                    <div className="row-label">
                      <div className="row-title">{t('settings.network.proxyNoProxy')}</div>
                      <div className="row-desc">{t('settings.network.proxyNoProxyDesc')}</div>
                    </div>
                    <div className="row-control">
                      <input
                        type="text"
                        className="settings-input"
                        value={globalProxyNoProxy}
                        onChange={(e) => setGlobalProxyNoProxy(e.target.value)}
                        placeholder={t('settings.network.proxyNoProxyPlaceholder')}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {needsRestart && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '12px 16px',
                marginTop: '12px',
                background: 'rgba(245, 158, 11, 0.1)',
                borderRadius: '8px',
                color: 'var(--warning, #f59e0b)',
                fontSize: '14px'
              }}>
                <AlertCircle size={18} />
                {t('settings.network.restartRequired')}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveNetworkConfig}
                  disabled={networkSaving}
                >
                    <Save size={16} /> {networkSaving ? t('common.saving') : t('settings.saveSettings')}
                </button>
            </div>
          </>
        )}

        {/* === About Tab === */}
        {activeTab === 'about' && (
          <div className="about-container">
            {/* 1. Header Hero */}
            <div className="about-logo-section">
              <div
                className={`app-icon-squircle${showUnlockFireworks ? ' unlock-fireworks-active' : ''}`}
                onClick={handleAboutAvatarTap}
                onMouseDown={(event) => event.preventDefault()}
                style={{ background: 'transparent', boxShadow: 'none' }}
                title="点击探索彩蛋"
              >
                <AppBrandLogo size={80} />
              </div>
              <div className="app-info">
                <h2>AI CodePass</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <div className="version-tag">
                    {appVersion ? (appVersion.startsWith('v') ? appVersion : `v${appVersion}`) : 'v1.0.0'}
                  </div>
                  <button 
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={handleCheckUpdate}
                    disabled={updateChecking}
                    style={{ 
                      fontSize: '12px', 
                      padding: '4px 10px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <RefreshCw size={13} className={updateChecking ? 'spin' : undefined} />
                    <span>{updateChecking ? t('settings.about.checking', '检查中...') : t('settings.about.checkUpdate', '检查更新')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={handleOpenReleaseHistory}
                    disabled={releaseHistoryLoading}
                    style={{
                      fontSize: '12px',
                      padding: '4px 10px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <FileText size={13} />
                    <span>{t('settings.about.viewReleaseHistory', '更新记录')}</span>
                  </button>
                </div>
                {updateCheckMessage && (
                  <div
                    className={`action-message${updateCheckMessage.tone ? ` ${updateCheckMessage.tone}` : ''}`}
                    style={{ marginTop: '10px', marginBottom: 0 }}
                  >
                    <span className="action-message-text">{updateCheckMessage.text}</span>
                  </div>
                )}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '520px', textAlign: 'center', lineHeight: 1.6, margin: '2px 0 0' }}>
                {t('settings.about.slogan', '专为开发者打造的一站式 AI 编程助手凭证管理与全自动签到中心')}
              </p>
            </div>

            {/* 2. Security Banner */}
            <div className="about-security-banner">
              <ShieldCheck size={18} className="about-security-banner-icon" />
              <div className="about-security-banner-content">
                <h4>{t('settings.about.securityVaultTitle', '系统底层硬件级凭据安全沙箱已激活')}</h4>
              </div>
            </div>

            {/* 3. Author & Support Bar */}
            <div className="about-author-bar">
              <div className="about-author-info">
                <span className="about-author-label">{t('settings.about.authorLabel', '作者 / 开发团队')}</span>
                <span className="about-author-name">猫步可爱</span>
                <span className="about-author-role">(maobukeai) · AI CodePass Lead</span>
              </div>
              <div className="about-author-actions">
                <button
                  type="button"
                  className="about-pill-btn"
                  onClick={() => setQrModal('contact')}
                  title="扫描二维码添加作者微信交流"
                >
                  <MessageCircle size={14} color="#07c160" />
                  <span>{t('settings.about.contactAuthor', '联系方式')}</span>
                </button>
                <button
                  type="button"
                  className="about-pill-btn"
                  onClick={() => setQrModal('sponsor')}
                  title="赞助支持开发者"
                >
                  <Heart size={14} color="#e11d48" />
                  <span>{t('settings.about.sponsorAuthor', '赞助支持')}</span>
                </button>
              </div>
            </div>

            {/* 5. About Cards Grid (3 Columns) */}
            <div className="about-cards-grid">
              {/* Card 1: App Update & Auto-check */}
              <div className="about-card">
                <div className="about-card-header">
                  <div className="about-card-icon blue">
                    <RefreshCw size={16} />
                  </div>
                  <div>
                    <h3 className="about-card-title">{t('settings.about.updateCheckCardTitle', '应用更新检查')}</h3>
                    <p className="about-card-desc">{t('settings.about.updateCheckCardDesc', '查询 GitHub Releases 最新版本并支持热更新与自动维护。')}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleCheckUpdate}
                    disabled={updateChecking}
                    style={{
                      fontSize: '12px',
                      height: '28px',
                      padding: '0 12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <RefreshCw size={13} className={updateChecking ? 'spin' : undefined} />
                    <span>{updateChecking ? t('settings.about.checking', '检查中...') : t('settings.about.checkUpdate', '检查更新')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={handleOpenReleaseHistory}
                    disabled={releaseHistoryLoading}
                    style={{
                      fontSize: '12px',
                      height: '28px',
                      padding: '0 10px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <FileText size={13} />
                    <span>{t('settings.about.viewReleaseHistory', '更新记录')}</span>
                  </button>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {appVersion ? (appVersion.startsWith('v') ? appVersion : `v${appVersion}`) : 'v1.0.0'}
                  </span>
                </div>

                {/* 自动更新与自动检查更新选项 */}
                <div className="about-checkbox-group">
                  <label className="about-checkbox-label">
                    <input
                      type="checkbox"
                      checked={updateRemindersEnabled}
                      disabled={!updateRemindersLoaded}
                      onChange={(e) => {
                        updateRemindersTouchedRef.current = true;
                        setUpdateRemindersEnabled(e.target.checked);
                      }}
                    />
                    <span>{t('settings.about.autoCheckUpdateLabel', '启动时自动检查应用更新（发现新版本自动弹窗提醒）')}</span>
                  </label>

                  <label className="about-checkbox-label">
                    <input
                      type="checkbox"
                      checked={autoInstall}
                      disabled={!autoInstallLoaded}
                      onChange={(e) => {
                        autoInstallTouchedRef.current = true;
                        setAutoInstall(e.target.checked);
                      }}
                    />
                    <span>{t('settings.about.autoInstallUpdateLabel', '自动静默下载与安装更新（免去手动操作，体验更丝滑）')}</span>
                  </label>
                </div>

                {/* 状态结果反馈框 */}
                {latestUpdateStatus.status === 'up_to_date' && (
                  <div className="about-update-status-box success">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Check size={14} color="#16a34a" />
                        <strong>已是最新版本 ({latestUpdateStatus.version ? `v${latestUpdateStatus.version}` : (appVersion || 'v1.0.0')})</strong>
                      </div>
                      {latestUpdateStatus.checkedAt && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{latestUpdateStatus.checkedAt}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px' }}>当前运行代码与 GitHub 官方正式 Release 同步。</div>
                  </div>
                )}

                {latestUpdateStatus.status === 'has_update' && (
                  <div className="about-update-status-box" style={{ background: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.25)', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Sparkles size={14} color="var(--primary)" />
                        <strong style={{ color: 'var(--primary)' }}>发现新版本 v{latestUpdateStatus.version}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={handleCheckUpdate}
                        style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                      >
                        立即更新
                      </button>
                    </div>
                  </div>
                )}

                {latestUpdateStatus.status === 'failed' && (
                  <div className="about-update-status-box error">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <AlertCircle size={14} color="#ef4444" />
                      <strong>检查失败</strong>
                    </div>
                    <div style={{ fontSize: '11px' }}>{latestUpdateStatus.error || '无法连接到更新服务器，请检查网络'}</div>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => openLink('https://github.com/maobukeai/ai-codepass/releases')}
                      style={{ alignSelf: 'flex-start', height: '24px', fontSize: '11px', padding: '0 8px', marginTop: '2px' }}
                    >
                      <ExternalLink size={11} /> 前往 Releases 网页
                    </button>
                  </div>
                )}
              </div>

              {/* Card 2: Platform Matrix Overview */}
              <div className="about-card">
                <div className="about-card-header">
                  <div className="about-card-icon green">
                    <Code size={16} />
                  </div>
                  <div>
                    <h3 className="about-card-title">{t('settings.about.supportedPlatforms', '全能纳管矩阵')}</h3>
                    <p className="about-card-desc">{t('settings.about.supportedPlatformsDesc', '全面覆盖国内主流 AI 编程助手，提供专业级调度。')}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', marginTop: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                    <strong>CodeBuddy / CN</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>腾讯混元 · 凭证解析与秒级切号</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                    <strong>Qoder</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>阿里通义 · 多账号管理与环境隔离</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                    <strong>Trae / TRAE Work / CN</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>字节跳动 · 全自动签到领额度</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6', flexShrink: 0 }} />
                    <strong>Workbuddy</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>批量账号调度 · 自动额度领用</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Open Source & Community */}
              <div className="about-card">
                <div className="about-card-header">
                  <div className="about-card-icon purple">
                    <ExternalLink size={16} />
                  </div>
                  <div>
                    <h3 className="about-card-title">{t('settings.about.communityCardTitle', '开源社区与支持')}</h3>
                    <p className="about-card-desc">{t('settings.about.communityCardDesc', '欢迎参与开源社区建设，提交 Issue 或反馈改进建议。')}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => openLink('https://github.com/maobukeai/ai-codepass')}
                    style={{
                      width: '100%',
                      height: '30px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <Globe2 size={13} color="var(--primary)" />
                    <span>访问 GitHub 开源仓库</span>
                    <ExternalLink size={11} style={{ marginLeft: 'auto', opacity: 0.6 }} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => openLink('https://github.com/maobukeai/ai-codepass/issues')}
                    style={{
                      width: '100%',
                      height: '30px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <MessageCircle size={13} color="#16a34a" />
                    <span>提交意见与 Issue 反馈</span>
                    <ExternalLink size={11} style={{ marginLeft: 'auto', opacity: 0.6 }} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={handleOpenReleaseHistory}
                    style={{
                      width: '100%',
                      height: '30px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: '8px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <FileText size={13} color="#f59e0b" />
                    <span>查看各版本更新记录</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 6. Platform Capability Matrix Badges */}
            <div className="about-platform-matrix">
              <div className="about-matrix-header">
                <h3>{t('settings.about.matrixTitle', '平台支持矩阵与能力维度 (Platform Support Matrix)')}</h3>
                <p>{t('settings.about.matrixDesc', '展示各主流 AI 编程助手的自动化集成程度与核心特性支持状态：')}</p>
              </div>
              <div className="about-matrix-grid">
                <div className="about-matrix-card">
                  <div className="about-matrix-card-header">
                    <span className="about-matrix-card-name">CodeBuddy / CN</span>
                    <span className="about-badge success">完全支持</span>
                  </div>
                  <div className="about-matrix-badges">
                    <span className="about-badge primary">多账号秒切</span>
                    <span className="about-badge primary">实时额度监测</span>
                    <span className="about-badge success">Token自动刷新</span>
                  </div>
                </div>

                <div className="about-matrix-card">
                  <div className="about-matrix-card-header">
                    <span className="about-matrix-card-name">Qoder (通义灵码)</span>
                    <span className="about-badge success">完全支持</span>
                  </div>
                  <div className="about-matrix-badges">
                    <span className="about-badge primary">多开隔离</span>
                    <span className="about-badge primary">配置持久化</span>
                    <span className="about-badge success">状态同步</span>
                  </div>
                </div>

                <div className="about-matrix-card">
                  <div className="about-matrix-card-header">
                    <span className="about-matrix-card-name">Trae / Work / CN</span>
                    <span className="about-badge gold">每日领额度</span>
                  </div>
                  <div className="about-matrix-badges">
                    <span className="about-badge gold">全自动签到</span>
                    <span className="about-badge primary">账号快速轮换</span>
                    <span className="about-badge success">额度低位预警</span>
                  </div>
                </div>

                <div className="about-matrix-card">
                  <div className="about-matrix-card-header">
                    <span className="about-matrix-card-name">Workbuddy</span>
                    <span className="about-badge success">完全支持</span>
                  </div>
                  <div className="about-matrix-badges">
                    <span className="about-badge gold">免密自动领用</span>
                    <span className="about-badge primary">批量账户保活</span>
                    <span className="about-badge success">多开环境隔离</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      {menuBarQuotaModalOpen && (
        <div className="modal-overlay">
          <div
            className="modal settings-menu-bar-quota-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {t('settings.general.menuBarQuotaModalTitle', '菜单栏额度')}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={handleCloseMenuBarQuotaModal}
                aria-label={t('common.close', '关闭')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="settings-menu-bar-quota-modal-desc">
                {t(
                  'settings.general.menuBarQuotaModalDesc',
                  '以下为菜单栏额度的专属选项：跟随所选平台当前账号。Codex 当前为 API 服务时显示「API + 池剩余%」；API Key 账号显示「API + 剩余额度」；普通账号显示邮箱前缀与剩余%（多条取最低；低红、中橙、高绿）。'
                )}
              </p>
              <div className="settings-menu-bar-quota-modal-field">
                <label className="settings-menu-bar-quota-modal-label" htmlFor="menu-bar-quota-platform">
                  {t('settings.general.menuBarQuotaPlatform', '额度账号平台')}
                </label>
                <p className="settings-menu-bar-quota-modal-field-desc">
                  {t(
                    'settings.general.menuBarQuotaPlatformDesc',
                    '跟随该平台当前正在使用的账号，刷新或切换后自动更新'
                  )}
                </p>
                <select
                  id="menu-bar-quota-platform"
                  className="settings-select settings-menu-bar-quota-modal-select"
                  value={menuBarQuotaDraftPlatform}
                  onChange={(e) => setMenuBarQuotaDraftPlatform(e.target.value as PlatformId)}
                >
                  {menuBarQuotaPlatformOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-menu-bar-quota-modal-field">
                <label className="settings-menu-bar-quota-modal-label" htmlFor="menu-bar-quota-prefix">
                  {t('settings.general.menuBarAccountPrefix', '显示账号邮箱前 4 位')}
                </label>
                <p className="settings-menu-bar-quota-modal-field-desc">
                  {t(
                    'settings.general.menuBarAccountPrefixDesc',
                    '仅普通账号：关闭后不显示邮箱前缀。Codex API 服务 / API Key 仍会显示 API 标签'
                  )}
                </p>
                <select
                  id="menu-bar-quota-prefix"
                  className="settings-select settings-menu-bar-quota-modal-select"
                  value={menuBarQuotaDraftShowPrefix ? 'true' : 'false'}
                  onChange={(e) => setMenuBarQuotaDraftShowPrefix(e.target.value === 'true')}
                >
                  <option value="true">{t('common.enable', '启用')}</option>
                  <option value="false">{t('common.disable', '停用')}</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseMenuBarQuotaModal}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmMenuBarQuotaModal}
              >
                {menuBarQuotaModalMode === 'enable'
                  ? t('settings.general.menuBarQuotaConfirmEnable', '启用')
                  : t('common.save', '保存')}
              </button>
            </div>
          </div>
        </div>
      )}
      {releaseHistoryOpen && (
        <div className="modal-overlay">
          <div className="modal settings-release-history-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('settings.about.releaseHistoryTitle', '更新记录')}</h2>
              <button
                className="modal-close"
                onClick={handleCloseReleaseHistory}
                aria-label={t('common.close', '关闭')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body settings-release-history-body">
              {releaseHistoryLoading && (
                <div className="settings-release-history-state">
                  <RefreshCw size={14} className="spin" />
                  <span>{t('settings.about.releaseHistoryLoading', '加载中...')}</span>
                </div>
              )}
              {!releaseHistoryLoading && releaseHistoryError && (
                <div className="settings-release-history-state settings-release-history-state-error">
                  {t('settings.about.releaseHistoryLoadFailed', '加载失败：{{error}}', {
                    error: releaseHistoryError,
                  })}
                </div>
              )}
              {!releaseHistoryLoading && !releaseHistoryError && releaseHistoryItems.length === 0 && (
                <div className="settings-release-history-state">
                  {t('settings.about.releaseHistoryEmpty', '暂无更新记录')}
                </div>
              )}
              {!releaseHistoryLoading &&
                !releaseHistoryError &&
                releaseHistoryItems.map((item) => (
                  <article
                    key={`${item.version}-${item.date || 'unknown'}`}
                    className="settings-release-history-item"
                  >
                    <div className="settings-release-history-item-head">
                      <span className="settings-release-history-version">v{item.version}</span>
                      <div className="settings-release-history-item-meta">
                        {item.date ? (
                          <span className="settings-release-history-date">{item.date}</span>
                        ) : null}
                        <button
                          className="settings-release-history-download-btn"
                          onClick={() => {
                            void handleDownloadReleaseVersion(item.version);
                          }}
                          type="button"
                        >
                          <Download size={12} />
                          {t('settings.about.downloadThisVersion', '下载此版本')}
                        </button>
                      </div>
                    </div>
                    <div className="settings-release-history-sections">
                      {releaseHistorySections.map((section) => {
                        const lines = item[section.key];
                        if (!Array.isArray(lines) || lines.length === 0) {
                          return null;
                        }
                        return (
                          <section key={`${item.version}-${section.key}`} className="settings-release-history-section">
                            <h3>{section.label}</h3>
                            <ul>
                              {lines.map((line, index) => (
                                <li key={`${item.version}-${section.key}-${index}`}>
                                  {renderReleaseHistoryLine(line)}
                                </li>
                              ))}
                            </ul>
                          </section>
                        );
                      })}
                    </div>
                  </article>
                ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseReleaseHistory}>
                {t('common.close', '关闭')}
              </button>
            </div>
          </div>
        </div>
      )}
      {qrModal === 'contact' && (
        <div className="modal-overlay" onClick={() => setQrModal(null)}>
          <div
            className="modal"
            style={{ width: '360px', maxWidth: '92vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{t('settings.about.contactModalTitle', '联系作者 · 微信交流')}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setQrModal(null)}
                aria-label={t('common.close', '关闭')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="about-qr-modal-body">
              <img
                src={contactQr}
                alt="猫步可爱 微信二维码"
                className="about-qr-image"
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  猫步可爱 (maobukeai)
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {t('settings.about.contactModalDesc', '扫码添加作者微信，交流反馈与需求探讨')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {qrModal === 'sponsor' && (
        <div className="modal-overlay" onClick={() => setQrModal(null)}>
          <div
            className="modal"
            style={{ width: '360px', maxWidth: '92vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{t('settings.about.sponsorModalTitle', '赞助支持 · 赞赏码')}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setQrModal(null)}
                aria-label={t('common.close', '关闭')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="about-qr-modal-body">
              <img
                src={sponsorQr}
                alt="猫步可爱 赞赏码"
                className="about-qr-image"
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  “感谢支持”
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {t('settings.about.sponsorModalDesc', '猫步可爱 (maobukeai) 的赞赏码 · 感谢对 AI CodePass 的支持！')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUnlockFireworks && !reducedMotionEnabled && (
        <UnlockFireworksOverlay />
      )}
    </main>
  );
}
