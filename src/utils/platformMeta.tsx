import { ReactNode } from 'react';
import { TFunction } from 'i18next';
import { PlatformId } from '../types/platform';
import { CodebuddyIcon } from '../components/icons/CodebuddyIcon';
import { QoderIcon } from '../components/icons/QoderIcon';
import { QwenWorkIcon } from '../components/icons/QwenWorkIcon';
import { TraeCnIcon, TraeIcon, TraeSoloCnIcon, TraeSoloIcon } from '../components/icons/TraeIcon';
import { WorkbuddyAiIcon, WorkbuddyIcon } from '../components/icons/WorkbuddyIcon';

export function getPlatformLabel(platformId: PlatformId, _t: TFunction): string {
  switch (platformId) {
    case 'codebuddy':
      return 'CodeBuddy';
    case 'codebuddy_cn':
      return _t('nav.codebuddyCn', 'CodeBuddy CN');
    case 'workbuddy':
      return 'WorkBuddy';
    case 'workbuddy_ai':
      return 'WorkBuddy AI';
    case 'qoder':
      return _t('nav.qoder', 'Qoder');
    case 'qoder_cn':
      return _t('nav.qoderCn', 'Qoder 国内版');
    case 'qwenwork':
      return _t('nav.qwenwork', '千问办公');
    case 'trae':
      return _t('nav.trae', 'Trae');
    case 'trae_solo':
      return _t('nav.traeSolo', 'TRAE Work');
    case 'trae_cn':
      return _t('nav.traeCn', 'Trae CN');
    case 'trae_solo_cn':
      return _t('nav.traeSoloCn', 'TRAE Work CN');
    default:
      return platformId;
  }
}

export function renderPlatformIcon(platformId: PlatformId, size = 20): ReactNode {
  switch (platformId) {
    case 'codebuddy':
    case 'codebuddy_cn':
      return <CodebuddyIcon style={{ width: size, height: size }} />;
    case 'workbuddy':
      return <WorkbuddyIcon style={{ width: size, height: size }} />;
    case 'workbuddy_ai':
      return <WorkbuddyAiIcon style={{ width: size, height: size }} />;
    case 'qoder':
    case 'qoder_cn':
      return <QoderIcon style={{ width: size, height: size }} />;
    case 'qwenwork':
      return <QwenWorkIcon style={{ width: size, height: size }} />;
    case 'trae':
      return <TraeIcon style={{ width: size, height: size }} />;
    case 'trae_solo':
      return <TraeSoloIcon style={{ width: size, height: size }} />;
    case 'trae_cn':
      return <TraeCnIcon style={{ width: size, height: size }} />;
    case 'trae_solo_cn':
      return <TraeSoloCnIcon style={{ width: size, height: size }} />;
    default:
      return null;
  }
}
