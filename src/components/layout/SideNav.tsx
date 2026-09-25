import {
  Settings,
  GaugeCircle,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState, useRef, type CSSProperties } from 'react';
import { Page } from '../../types/navigation';
import { AppBrandLogo } from '../icons/AppBrandLogo';
import { CodebuddyIcon } from '../icons/CodebuddyIcon';
import { QoderIcon } from '../icons/QoderIcon';
import { TraeIcon } from '../icons/TraeIcon';
import { useSideNavLayoutStore } from '../../stores/useSideNavLayoutStore';
import { findGroupByPlatform, usePlatformLayoutStore } from '../../stores/usePlatformLayoutStore';
import { PLATFORM_PAGE_MAP } from '../../types/platform';
import { useCodebuddyAccountStore } from '../../stores/useCodebuddyAccountStore';
import { useCodebuddyCnAccountStore } from '../../stores/useCodebuddyCnAccountStore';
import { useWorkbuddyAccountStore } from '../../stores/useWorkbuddyAccountStore';
import { useWorkbuddyAiAccountStore } from '../../stores/useWorkbuddyAiAccountStore';
import { useQoderAccountStore } from '../../stores/useQoderAccountStore';
import { useQoderCnAccountStore } from '../../stores/useQoderCnAccountStore';
import { useQwenworkAccountStore } from '../../stores/useQwenworkAccountStore';
import { useTraeAccountStore } from '../../stores/useTraeAccountStore';
import { useQoderInstanceStore } from '../../stores/useQoderInstanceStore';
import { useCodebuddyInstanceStore } from '../../stores/useCodebuddyInstanceStore';
import { useCodebuddyCnInstanceStore } from '../../stores/useCodebuddyCnInstanceStore';
import { useWorkbuddyInstanceStore } from '../../stores/useWorkbuddyInstanceStore';
import { useTraeInstanceStore } from '../../stores/useTraeInstanceStore';

interface SideNavProps {
  page: Page;
  setPage: (page: Page) => void;
  onOpenPlatformLayout?: () => void;
  easterEggClickCount?: number;
  onEasterEggTriggerClick?: () => void;
  hasBreakoutSession?: boolean;
  updateActionState?: 'hidden' | 'available' | 'downloading' | 'installing' | 'ready';
  updateProgress?: number;
  onUpdateActionClick?: () => void;
  updateRemindersEnabled?: boolean;
  sponsorEntryVisible?: boolean;
  onOpenLogViewer: () => void;
}

interface FlyingRocket {
  id: number;
  x: number;
}

const APP_DISPLAY_NAME = 'AI CodePass';

export function SideNav({
  page,
  setPage,
  easterEggClickCount = 0,
  onEasterEggTriggerClick,
  hasBreakoutSession = false,
  onOpenLogViewer,
}: SideNavProps) {
  const { t } = useTranslation();
  const [flyingRockets, setFlyingRockets] = useState<FlyingRocket[]>([]);
  const sideNavLayoutMode = useSideNavLayoutStore((state) => state.mode);
  const classicCollapsed = useSideNavLayoutStore((state) => state.classicCollapsed);
  const toggleClassicCollapsed = useSideNavLayoutStore((state) => state.toggleClassicCollapsed);

  // Live Account and Instance counts for dynamic badges
  const platformGroups = usePlatformLayoutStore((state) => state.platformGroups);
  const cbGroup = findGroupByPlatform(platformGroups, 'codebuddy');
  const cbTargetPlatform = cbGroup?.defaultPlatformId || 'codebuddy';
  const cbTargetPage = PLATFORM_PAGE_MAP[cbTargetPlatform] || 'codebuddy';

  const traeGroup = findGroupByPlatform(platformGroups, 'trae');
  const traeTargetPlatform = traeGroup?.defaultPlatformId || 'trae';
  const traeTargetPage = PLATFORM_PAGE_MAP[traeTargetPlatform] || 'trae';

  const qoderGroup = findGroupByPlatform(platformGroups, 'qoder');
  const qoderTargetPlatform = qoderGroup?.defaultPlatformId || 'qoder';
  const qoderTargetPage = PLATFORM_PAGE_MAP[qoderTargetPlatform] || 'qoder';

  const cbAccounts = useCodebuddyAccountStore((state) => state.accounts) || [];
  const cbCnAccounts = useCodebuddyCnAccountStore((state) => state.accounts) || [];
  const wbAccounts = useWorkbuddyAccountStore((state) => state.accounts) || [];
  const wbAiAccounts = useWorkbuddyAiAccountStore((state) => state.accounts) || [];
  const totalCbCount = cbAccounts.length + cbCnAccounts.length + wbAccounts.length + wbAiAccounts.length;

  const qoderAccounts = useQoderAccountStore((state) => state.accounts) || [];
  const qoderCnAccounts = useQoderCnAccountStore((state) => state.accounts) || [];
  const qwenworkAccounts = useQwenworkAccountStore((state) => state.accounts) || [];
  const totalQoderCount = qoderAccounts.length + qoderCnAccounts.length + qwenworkAccounts.length;

  const traeAccounts = useTraeAccountStore((state) => state.accounts) || [];
  const totalTraeCount = traeAccounts.length;

  const qoderInstances = useQoderInstanceStore((state) => state.instances) || [];
  const cbInstances = useCodebuddyInstanceStore((state) => state.instances) || [];
  const cbCnInstances = useCodebuddyCnInstanceStore((state) => state.instances) || [];
  const wbInstances = useWorkbuddyInstanceStore((state) => state.instances) || [];
  const traeInstances = useTraeInstanceStore((state) => state.instances) || [];

  const allInstances = [
    ...qoderInstances,
    ...cbInstances,
    ...cbCnInstances,
    ...wbInstances,
    ...traeInstances,
  ];
  const runningInstancesCount = allInstances.filter((i) => i.running).length;
  const totalInstancesCount = allInstances.length;

  const isClassicLayout = sideNavLayoutMode === 'classic';
  const isClassicCollapsed = isClassicLayout && classicCollapsed;
  const showClassicLabels = isClassicLayout && !classicCollapsed;
  const rocketIdRef = useRef(0);

  const handleLogoClick = () => {
    const nextId = ++rocketIdRef.current;
    const randomX = Math.floor(Math.random() * 40) - 20;
    setFlyingRockets((prev) => [...prev, { id: nextId, x: randomX }]);
    setTimeout(() => {
      setFlyingRockets((prev) => prev.filter((r) => r.id !== nextId));
    }, 1200);

    if (onEasterEggTriggerClick) {
      onEasterEggTriggerClick();
    }
  };

  const isCodebuddyActive =
    page === 'codebuddy' || page === 'codebuddy-cn' || page === 'workbuddy' || page === 'workbuddy-ai';
  const isQoderActive = page === 'qoder' || page === 'qoder-cn' || page === 'qwenwork';
  const isTraeActive =
    page === 'trae' || page === 'trae-solo' || page === 'trae-cn' || page === 'trae-solo-cn';

  return (
    <>
      <nav
        className={`side-nav${isClassicLayout ? ' side-nav-classic' : ''}${
          isClassicCollapsed ? ' side-nav-classic-collapsed' : ''
        }`}
      >
        <div className="side-nav-brand">
          <div className="side-nav-brand-content">
            <div
              className="side-nav-logo side-nav-logo-clickable"
              onClick={handleLogoClick}
              title={hasBreakoutSession ? t('breakout.resumeGameNav', '继续游戏') : APP_DISPLAY_NAME}
            >
              <AppBrandLogo size={36} />
              {hasBreakoutSession && <span className="rocket-session-indicator" aria-hidden="true" />}
              {!hasBreakoutSession && easterEggClickCount > 0 && (
                <span className="rocket-click-count">{easterEggClickCount}</span>
              )}
            </div>

            {isClassicLayout && !isClassicCollapsed && (
              <div className="side-nav-brand-info">
                <span className="side-nav-brand-title">{APP_DISPLAY_NAME}</span>
                <span className="side-nav-brand-badge">PASS PRO</span>
              </div>
            )}
          </div>

          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            {flyingRockets.map((rocket) => (
              <span
                key={rocket.id}
                className="flying-rocket"
                style={{ '--rocket-x': `${rocket.x}px` } as CSSProperties}
              >
                🚀
              </span>
            ))}
          </div>
        </div>

        <div className="nav-items nav-items-no-scroll">
          {/* Dashboard */}
          <button
            type="button"
            className={`nav-item ${page === 'dashboard' ? 'active' : ''}`}
            onClick={() => setPage('dashboard')}
            title={t('nav.dashboard', '仪表盘')}
          >
            <div className="nav-item-leading">
              <GaugeCircle size={19} className="nav-item-icon" />
              {showClassicLabels ? (
                <span className="nav-item-text">{t('nav.dashboard', '仪表盘')}</span>
              ) : null}
            </div>
            {!isClassicLayout && <span className="tooltip">{t('nav.dashboard', '仪表盘')}</span>}
          </button>

          {/* CodeBuddy */}
          <button
            type="button"
            className={`nav-item ${isCodebuddyActive ? 'active' : ''}`}
            onClick={() => setPage(cbTargetPage)}
            title={`CodeBuddy${totalCbCount > 0 ? ` (${totalCbCount})` : ''}`}
          >
            <div className="nav-item-leading">
              <CodebuddyIcon style={{ width: 19, height: 19 }} />
              {showClassicLabels ? (
                <span className="nav-item-text">CodeBuddy</span>
              ) : null}
            </div>
            {showClassicLabels && totalCbCount > 0 && (
              <span className="nav-item-badge">{totalCbCount}</span>
            )}
            {isClassicCollapsed && totalCbCount > 0 && (
              <span className="nav-collapsed-dot" />
            )}
            {!isClassicLayout && (
              <span className="tooltip">{`CodeBuddy${totalCbCount > 0 ? ` (${totalCbCount})` : ''}`}</span>
            )}
          </button>

          {/* Qoder */}
          <button
            type="button"
            className={`nav-item ${isQoderActive ? 'active' : ''}`}
            onClick={() => setPage(qoderTargetPage)}
            title={`${t('nav.qoder', 'Qoder')}${totalQoderCount > 0 ? ` (${totalQoderCount})` : ''}`}
          >
            <div className="nav-item-leading">
              <QoderIcon style={{ width: 19, height: 19 }} />
              {showClassicLabels ? (
                <span className="nav-item-text">{t('nav.qoder', 'Qoder')}</span>
              ) : null}
            </div>
            {showClassicLabels && totalQoderCount > 0 && (
              <span className="nav-item-badge">{totalQoderCount}</span>
            )}
            {isClassicCollapsed && totalQoderCount > 0 && (
              <span className="nav-collapsed-dot" />
            )}
            {!isClassicLayout && (
              <span className="tooltip">{`${t('nav.qoder', 'Qoder')}${totalQoderCount > 0 ? ` (${totalQoderCount})` : ''}`}</span>
            )}
          </button>

          {/* Trae */}
          <button
            type="button"
            className={`nav-item ${isTraeActive ? 'active' : ''}`}
            onClick={() => setPage(traeTargetPage)}
            title={`${t('nav.trae', 'Trae')}${totalTraeCount > 0 ? ` (${totalTraeCount})` : ''}`}
          >
            <div className="nav-item-leading">
              <TraeIcon style={{ width: 19, height: 19 }} />
              {showClassicLabels ? (
                <span className="nav-item-text">{t('nav.trae', 'Trae')}</span>
              ) : null}
            </div>
            {showClassicLabels && totalTraeCount > 0 && (
              <span className="nav-item-badge">{totalTraeCount}</span>
            )}
            {isClassicCollapsed && totalTraeCount > 0 && (
              <span className="nav-collapsed-dot" />
            )}
            {!isClassicLayout && (
              <span className="tooltip">{`${t('nav.trae', 'Trae')}${totalTraeCount > 0 ? ` (${totalTraeCount})` : ''}`}</span>
            )}
          </button>

          {/* Instances */}
          <button
            type="button"
            className={`nav-item ${page === 'instances' ? 'active' : ''}`}
            onClick={() => setPage('instances')}
            title={`${t('nav.instances', '多开实例')}${runningInstancesCount > 0 ? ` (${runningInstancesCount} 运行中)` : totalInstancesCount > 0 ? ` (${totalInstancesCount})` : ''}`}
          >
            <div className="nav-item-leading">
              <Layers size={19} className="nav-item-icon" />
              {showClassicLabels ? (
                <span className="nav-item-text">{t('nav.instances', '多开实例')}</span>
              ) : null}
            </div>
            {showClassicLabels && runningInstancesCount > 0 ? (
              <span className="nav-item-badge nav-item-badge-live" title={`${runningInstancesCount} 个实例正在运行`}>
                <span className="nav-live-dot" />
                {runningInstancesCount}
              </span>
            ) : showClassicLabels && totalInstancesCount > 0 ? (
              <span className="nav-item-badge">{totalInstancesCount}</span>
            ) : null}
            {isClassicCollapsed && runningInstancesCount > 0 ? (
              <span className="nav-collapsed-dot live" />
            ) : isClassicCollapsed && totalInstancesCount > 0 ? (
              <span className="nav-collapsed-dot" />
            ) : null}
            {!isClassicLayout && (
              <span className="tooltip">{`${t('nav.instances', '多开实例')}${runningInstancesCount > 0 ? ` (${runningInstancesCount} 运行中)` : ''}`}</span>
            )}
          </button>
        </div>

        {isClassicLayout ? (
          <div className="nav-bottom-actions">
            <button
              type="button"
              className="nav-item"
              onClick={onOpenLogViewer}
              title={t('nav.logs', '日志')}
            >
              <div className="nav-item-leading">
                <FileText size={18} className="nav-item-icon" />
                {showClassicLabels ? (
                  <span className="nav-item-text">{t('nav.logs', '日志')}</span>
                ) : null}
              </div>
            </button>

            <button
              type="button"
              className={`nav-item ${page === 'settings' ? 'active' : ''}`}
              onClick={() => setPage('settings')}
              title={t('nav.settings', '设置')}
            >
              <div className="nav-item-leading">
                <Settings size={18} className="nav-item-icon" />
                {showClassicLabels ? (
                  <span className="nav-item-text">{t('nav.settings', '设置')}</span>
                ) : null}
              </div>
            </button>
          </div>
        ) : (
          <div className="nav-footer">
            <button
              type="button"
              className="nav-item"
              onClick={onOpenLogViewer}
              title={t('nav.logs', '日志')}
            >
              <FileText size={18} />
              <span className="tooltip">{t('nav.logs', '日志')}</span>
            </button>
            <button
              type="button"
              className={`nav-item ${page === 'settings' ? 'active' : ''}`}
              onClick={() => setPage('settings')}
              title={t('nav.settings', '设置')}
            >
              <Settings size={18} />
              <span className="tooltip">{t('nav.settings', '设置')}</span>
            </button>
          </div>
        )}
      </nav>

      {isClassicLayout && (
        <button
          type="button"
          className={`side-nav-classic-handle${
            isClassicCollapsed ? ' side-nav-classic-handle-collapsed' : ''
          }`}
          onClick={toggleClassicCollapsed}
          title={
            classicCollapsed
              ? t('nav.expandSidebar', '展开侧边栏')
              : t('nav.collapseSidebar', '收起侧边栏')
          }
          aria-label={
            classicCollapsed
              ? t('nav.expandSidebar', '展开侧边栏')
              : t('nav.collapseSidebar', '收起侧边栏')
          }
        >
          {classicCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      )}
    </>
  );
}
