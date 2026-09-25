import { ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Layers } from 'lucide-react';
import { CodebuddyIcon } from '../icons/CodebuddyIcon';
import { QoderIcon } from '../icons/QoderIcon';
import { QwenWorkIcon } from '../icons/QwenWorkIcon';
import { TraeCnIcon, TraeIcon, TraeSoloCnIcon, TraeSoloIcon } from '../icons/TraeIcon';
import { WorkbuddyAiIcon, WorkbuddyIcon } from '../icons/WorkbuddyIcon';
import { ManualHelpIconButton } from '../ManualHelpIconButton';
import { PlatformId } from '../../types/platform';
import {
  findGroupByPlatform,
  resolveGroupChildName,
  usePlatformLayoutStore,
} from '../../stores/usePlatformLayoutStore';
import { getPlatformLabel } from '../../utils/platformMeta';
import { PlatformGroupSwitcher } from './PlatformGroupSwitcher';
import { useRemoteConfigStore } from '../../stores/useRemoteConfigStore';

export type PlatformOverviewTab = 'overview' | 'instances' | 'sessions';
export type PlatformOverviewHeaderId = PlatformId;

interface PlatformOverviewTabsHeaderProps {
  platform: PlatformOverviewHeaderId;
  active: PlatformOverviewTab;
  onTabChange?: (tab: PlatformOverviewTab) => void;
  tabs?: PlatformOverviewTab[];
}

interface PlatformOverviewConfig {
  platformLabel: string;
  overviewIcon: ReactNode;
}

interface TabSpec {
  key: PlatformOverviewTab;
  label: string;
  icon: ReactNode;
}

const CONFIGS: Record<PlatformOverviewHeaderId, PlatformOverviewConfig> = {
  codebuddy: {
    platformLabel: 'CodeBuddy',
    overviewIcon: <CodebuddyIcon className="tab-icon" />,
  },
  codebuddy_cn: {
    platformLabel: 'CodeBuddy CN',
    overviewIcon: <CodebuddyIcon className="tab-icon" />,
  },
  workbuddy: {
    platformLabel: 'WorkBuddy',
    overviewIcon: <WorkbuddyIcon className="tab-icon" />,
  },
  workbuddy_ai: {
    platformLabel: 'WorkBuddy AI',
    overviewIcon: <WorkbuddyAiIcon className="tab-icon" />,
  },
  qoder: {
    platformLabel: 'Qoder',
    overviewIcon: <QoderIcon className="tab-icon" />,
  },
  qoder_cn: {
    platformLabel: 'Qoder CN',
    overviewIcon: <QoderIcon className="tab-icon" />,
  },
  qwenwork: {
    platformLabel: '千问办公',
    overviewIcon: <QwenWorkIcon className="tab-icon" />,
  },
  trae: {
    platformLabel: 'Trae',
    overviewIcon: <TraeIcon className="tab-icon" />,
  },
  trae_solo: {
    platformLabel: 'TRAE Work',
    overviewIcon: <TraeSoloIcon className="tab-icon" />,
  },
  trae_cn: {
    platformLabel: 'Trae CN',
    overviewIcon: <TraeCnIcon className="tab-icon" />,
  },
  trae_solo_cn: {
    platformLabel: 'TRAE Work CN',
    overviewIcon: <TraeSoloCnIcon className="tab-icon" />,
  },
};

export function PlatformOverviewTabsHeader({
  platform,
  active,
  onTabChange,
  tabs,
}: PlatformOverviewTabsHeaderProps) {
  const { t } = useTranslation();
  const { platformGroups } = usePlatformLayoutStore();
  const remoteHiddenPlatformIds = useRemoteConfigStore((state) => state.hiddenPlatformIds);
  const config = CONFIGS[platform] || {
    platformLabel: platform,
    overviewIcon: <CodebuddyIcon className="tab-icon" />,
  };
  const currentPlatformId = platform;
  const remoteHiddenPlatformSet = useMemo(
    () => new Set(remoteHiddenPlatformIds),
    [remoteHiddenPlatformIds],
  );
  const currentGroup = useMemo(
    () => findGroupByPlatform(platformGroups, currentPlatformId),
    [platformGroups, currentPlatformId],
  );
  const switchablePlatforms = useMemo(
    () => {
      const source = currentGroup ? currentGroup.platformIds : [currentPlatformId];
      const visible = source.filter((platformId) =>
        platformId === currentPlatformId || !remoteHiddenPlatformSet.has(platformId),
      );
      return visible.length > 0 ? visible : [currentPlatformId];
    },
    [currentGroup, currentPlatformId, remoteHiddenPlatformSet],
  );
  const currentPlatformLabel = getPlatformLabel(currentPlatformId, t);
  const currentDisplayName = useMemo(
    () =>
      currentGroup
        ? resolveGroupChildName(currentGroup, currentPlatformId, currentPlatformLabel || config.platformLabel)
        : currentPlatformLabel || config.platformLabel,
    [currentGroup, currentPlatformId, currentPlatformLabel, config.platformLabel],
  );
  const switchOptions = useMemo(
    () =>
      switchablePlatforms.map((platformId) => {
        const platformName = currentGroup
          ? resolveGroupChildName(currentGroup, platformId, getPlatformLabel(platformId, t))
          : getPlatformLabel(platformId, t);
        return {
          platformId,
          label: platformName,
        };
      }),
    [switchablePlatforms, currentGroup, t],
  );
  const tabOrder: PlatformOverviewTab[] =
    tabs && tabs.length > 0 ? tabs : ['overview', 'instances'];
  const tabLabels: Record<PlatformOverviewTab, TabSpec> = {
    overview: {
      key: 'overview',
      label: t('overview.title', '账号总览'),
      icon: config.overviewIcon,
    },
    instances: {
      key: 'instances',
      label: t('instances.title', '应用多开'),
      icon: <Layers className="tab-icon" />,
    },
    sessions: {
      key: 'sessions',
      label: t('navigation.sessions', '会话迁移'),
      icon: <FolderOpen className="tab-icon" />,
    },
  };
  const tabSpecs: TabSpec[] = tabOrder.map((tab) => tabLabels[tab]);

  return (
    <>
      <div className="page-top-strip">
        <div className="page-top-strip-left">
          <span className="page-top-strip-label">
            {currentDisplayName
              ? `${currentDisplayName} ${t('common.accountManagement', '账号管理')}`
              : t('navigation.accounts', '账号管理')}
          </span>
          <ManualHelpIconButton className="platform-header-help" />
        </div>
        <div className="page-top-strip-right-placeholder" aria-hidden="true" />
      </div>
      <div className="page-tabs-row page-tabs-center page-tabs-row-with-leading">
        <div className="page-tabs-leading">
          <PlatformGroupSwitcher
            currentPlatformId={currentPlatformId}
            currentLabel={currentDisplayName}
            options={switchOptions}
            currentGroupId={currentGroup?.id ?? null}
          />
        </div>
        <div className="page-tabs filter-tabs">
          {tabSpecs.map((tab) => (
            <button
              key={tab.key}
              className={`filter-tab${active === tab.key ? ' active' : ''}`}
              onClick={() => onTabChange?.(tab.key)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
