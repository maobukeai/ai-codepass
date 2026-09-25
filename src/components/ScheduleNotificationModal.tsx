import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CalendarCheck, Send, X, Clock } from 'lucide-react';
import { useEscCloseTopmost } from '../hooks/useEscClose';
import { SettingsAutoCheckinSection } from './SettingsAutoCheckinSection';
import { SettingsWebhookSection } from './SettingsWebhookSection';
import '../pages/settings/Settings.css';
import './ScheduleNotificationModal.css';

export interface ScheduleNotificationModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'checkin' | 'webhook';
}

export function ScheduleNotificationModal({
  open,
  onClose,
  defaultTab = 'checkin',
}: ScheduleNotificationModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'checkin' | 'webhook'>(defaultTab);

  useEscCloseTopmost(open, onClose);

  if (!open) return null;

  const modalContent = (
    <div
      className="modal-overlay schedule-notification-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal schedule-notification-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-notification-modal-title"
      >
        {/* Header */}
        <div className="modal-header schedule-notification-modal-header">
          <div className="schedule-notification-modal-title-wrap">
            <div className="schedule-notification-modal-icon">
              <Bell size={17} />
            </div>
            <h2 id="schedule-notification-modal-title" className="schedule-notification-modal-title">
              {t('settings.tabs.notifications', '定时签到与通知')}
            </h2>
          </div>

          <div className="schedule-notification-tabs-nav" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'checkin'}
              className={`schedule-notification-tab-item ${activeTab === 'checkin' ? 'active' : ''}`}
              onClick={() => setActiveTab('checkin')}
            >
              <CalendarCheck size={14} />
              <span>{t('settings.autoCheckin.tabTitle', '定时自动签到')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'webhook'}
              className={`schedule-notification-tab-item ${activeTab === 'webhook' ? 'active' : ''}`}
              onClick={() => setActiveTab('webhook')}
            >
              <Send size={14} />
              <span>{t('settings.webhook.tabTitle', '通知推送 (Webhook)')}</span>
            </button>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t('common.close', '关闭')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body schedule-notification-modal-body settings-content">
          {activeTab === 'checkin' && <SettingsAutoCheckinSection />}
          {activeTab === 'webhook' && <SettingsWebhookSection />}
        </div>

        {/* Footer */}
        <div className="modal-footer schedule-notification-modal-footer">
          <div className="schedule-notification-modal-footer-hint">
            <Clock size={13} />
            <span>{t('settings.autoCheckin.escHint', '按 Esc 键关闭 · 错峰任务与通知于后台静默运行')}</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.close', '关闭')}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
