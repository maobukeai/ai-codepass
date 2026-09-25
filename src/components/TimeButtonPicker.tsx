import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import './TimeButtonPicker.css';

interface TimeButtonPickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const PANEL_WIDTH = 232;
const PANEL_HEIGHT = 250;
const PANEL_GAP = 6;

const pad = (n: number) => String(n).padStart(2, '0');

export function TimeButtonPicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: TimeButtonPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [hour = '00', minute = '00'] = value.split(':');

  const updatePos = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(
      Math.max(8, rect.right - PANEL_WIDTH),
      window.innerWidth - PANEL_WIDTH - 8,
    );
    const top =
      rect.bottom + PANEL_GAP + PANEL_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - PANEL_HEIGHT - PANEL_GAP)
        : rect.bottom + PANEL_GAP;
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="time-button-picker">
      <button
        type="button"
        ref={triggerRef}
        className="time-button-picker-trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Clock size={13} />
        <span>{value}</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            className="time-button-picker-panel"
            ref={panelRef}
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="time-button-picker-label">{t('timePicker.hour', '小时')}</div>
            <div className="time-button-picker-grid">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`time-button-picker-cell ${hour === pad(h) ? 'active' : ''}`}
                  onClick={() => onChange(`${pad(h)}:${minute}`)}
                >
                  {pad(h)}
                </button>
              ))}
            </div>
            <div className="time-button-picker-label">{t('timePicker.minute', '分钟')}</div>
            <div className="time-button-picker-grid">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`time-button-picker-cell ${minute === pad(m) ? 'active' : ''}`}
                  onClick={() => onChange(`${hour}:${pad(m)}`)}
                >
                  {pad(m)}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
