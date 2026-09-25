import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CodebuddyInstancesContent } from './CodebuddyInstancesPage';
import { CodebuddyCnInstancesContent } from './CodebuddyCnInstancesPage';
import { WorkbuddyInstancesContent } from './WorkbuddyInstancesPage';
import { QoderInstancesContent } from './QoderInstancesPage';
import { TraeInstancesContent } from './TraeInstancesPage';
import { CodebuddyIcon } from '../components/icons/CodebuddyIcon';
import { QoderIcon } from '../components/icons/QoderIcon';
import { QwenWorkIcon } from '../components/icons/QwenWorkIcon';
import { TraeIcon } from '../components/icons/TraeIcon';
import { WorkbuddyIcon } from '../components/icons/WorkbuddyIcon';
import type { TraePlatformId } from '../services/traeService';
import { Page } from '../types/navigation';

interface InstancesPageProps {
  onNavigate?: (page: Page) => void;
}

type InstanceTab = 'codebuddy' | 'codebuddy_cn' | 'workbuddy' | 'qoder' | 'qoder_cn' | 'qwenwork' | 'trae';

export function InstancesPage({ onNavigate: _onNavigate }: InstancesPageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<InstanceTab>('codebuddy');
  const [traeSubTab, setTraeSubTab] = useState<TraePlatformId>('trae');

  return (
    <div className="instances-page" style={{ padding: '20px', height: '100%', overflowY: 'auto' }}>
      <div className="page-heading" style={{ marginBottom: '16px' }}>
        <h2>{t('instances.title', '多开实例管理')}</h2>
      </div>

      {/* Main Tabs */}
      <div className="overview-tabs-header" style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'codebuddy' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('codebuddy')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <CodebuddyIcon style={{ width: 16, height: 16 }} />
          <span>CodeBuddy</span>
        </button>

        <button
          className={`btn ${activeTab === 'codebuddy_cn' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('codebuddy_cn')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <CodebuddyIcon style={{ width: 16, height: 16 }} />
          <span>CodeBuddy CN</span>
        </button>

        <button
          className={`btn ${activeTab === 'workbuddy' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('workbuddy')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <WorkbuddyIcon style={{ width: 16, height: 16 }} />
          <span>WorkBuddy</span>
        </button>

        <button
          className={`btn ${activeTab === 'qoder' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('qoder')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <QoderIcon style={{ width: 16, height: 16 }} />
          <span>Qoder</span>
        </button>

        <button
          className={`btn ${activeTab === 'qoder_cn' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('qoder_cn')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <QoderIcon style={{ width: 16, height: 16 }} />
          <span>Qoder 国内版</span>
        </button>

        <button
          className={`btn ${activeTab === 'qwenwork' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('qwenwork')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <QwenWorkIcon style={{ width: 16, height: 16 }} />
          <span>千问办公</span>
        </button>

        <button
          className={`btn ${activeTab === 'trae' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('trae')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <TraeIcon style={{ width: 16, height: 16 }} />
          <span>Trae 家族</span>
        </button>
      </div>

      {/* Trae Sub-tabs selector */}
      {activeTab === 'trae' && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            padding: '8px 12px',
            backgroundColor: 'var(--bg-tertiary, #f3f4f6)',
            borderRadius: '8px',
          }}
        >
          <button
            className={`btn btn-sm ${traeSubTab === 'trae' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTraeSubTab('trae')}
          >
            Trae 国际版
          </button>
          <button
            className={`btn btn-sm ${traeSubTab === 'trae_solo' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTraeSubTab('trae_solo')}
          >
            TRAE Work
          </button>
          <button
            className={`btn btn-sm ${traeSubTab === 'trae_cn' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTraeSubTab('trae_cn')}
          >
            Trae 国内版
          </button>
          <button
            className={`btn btn-sm ${traeSubTab === 'trae_solo_cn' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTraeSubTab('trae_solo_cn')}
          >
            TRAE Work CN
          </button>
        </div>
      )}

      {/* Content */}
      <div className="instances-content-container">
        {activeTab === 'codebuddy' && <CodebuddyInstancesContent />}
        {activeTab === 'codebuddy_cn' && <CodebuddyCnInstancesContent />}
        {activeTab === 'workbuddy' && <WorkbuddyInstancesContent />}
        {activeTab === 'qoder' && <QoderInstancesContent platformId="qoder" />}
        {activeTab === 'qoder_cn' && <QoderInstancesContent platformId="qoder_cn" />}
        {activeTab === 'qwenwork' && <QoderInstancesContent platformId="qwenwork" />}
        {activeTab === 'trae' && <TraeInstancesContent platformId={traeSubTab} />}
      </div>
    </div>
  );
}
