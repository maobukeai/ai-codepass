import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PLATFORM_PAGE_MAP, type PlatformId } from '../../types/platform';
import type { Page } from '../../types/navigation';
import { renderPlatformIcon } from '../../utils/platformMeta';
import { isReducedMotionEnabled } from '../../utils/reducedMotion';
import { usePlatformLayoutStore } from '../../stores/usePlatformLayoutStore';

export interface PlatformGroupSwitcherOption {
  platformId: PlatformId;
  label: string;
}

interface PlatformGroupSwitcherProps {
  currentPlatformId: PlatformId;
  currentLabel: string;
  options: PlatformGroupSwitcherOption[];
  currentGroupId?: string | null;
  activePlatformId?: PlatformId | null;
  extraOptions?: Array<{
    id: string;
    label: string;
    page: Page;
    icon?: ReactNode;
    active?: boolean;
  }>;
}

export function PlatformGroupSwitcher({
  currentPlatformId,
  currentLabel,
  options,
  currentGroupId = null,
  activePlatformId = currentPlatformId,
  extraOptions = [],
}: PlatformGroupSwitcherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const lastWheelTimeRef = useRef<number>(0);

  const updateDropdownPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const dropdownWidth = dropdownRef.current?.offsetWidth ?? 220;
    const maxLeft = window.innerWidth - dropdownWidth - 8;

    setDropdownPosition({
      top: Math.round(rect.bottom + 8),
      left: Math.round(Math.max(8, Math.min(rect.left, maxLeft))),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDropdownPosition(null);
      return;
    }

    updateDropdownPosition();
    const raf = window.requestAnimationFrame(updateDropdownPosition);
    const handleResize = () => updateDropdownPosition();
    const handleScroll = () => {
      if (isReducedMotionEnabled()) {
        setOpen(false);
        return;
      }
      updateDropdownPosition();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, updateDropdownPosition]);

  const handleSwitchPlatform = (nextPlatform: PlatformId) => {
    setOpen(false);
    usePlatformLayoutStore.getState().rememberGroupPlatform(nextPlatform);
    if (nextPlatform === activePlatformId) {
      return;
    }

    const targetPage = PLATFORM_PAGE_MAP[nextPlatform];
    window.dispatchEvent(new CustomEvent('app-request-navigate', { detail: targetPage }));
  };

  const handleOpenPlatformLayout = () => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent('app-open-platform-layout', {
        detail: { groupId: currentGroupId },
      }),
    );
  };

  const handleSwitchPage = (page: Page) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('app-request-navigate', { detail: page }));
  };

  const handleTriggerClick = () => {
    setOpen((currentlyOpen) => {
      const openNext = !currentlyOpen;
      if (openNext) {
        updateDropdownPosition();
      }
      return openNext;
    });
  };

  const currentIndex = options.findIndex((opt) => opt.platformId === activePlatformId);
  const prevOption =
    options.length > 1 && currentIndex !== -1
      ? options[(currentIndex - 1 + options.length) % options.length]
      : null;
  const nextOption =
    options.length > 1 && currentIndex !== -1
      ? options[(currentIndex + 1) % options.length]
      : null;

  // 快捷切至上一个平台
  const handlePrev = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (prevOption) {
      handleSwitchPlatform(prevOption.platformId);
    }
  };

  // 快捷切至下一个平台
  const handleNext = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (nextOption) {
      handleSwitchPlatform(nextOption.platformId);
    }
  };

  // 鼠标滚轮滑动无缝循环切台
  const handleWheel = (event: ReactWheelEvent) => {
    if (options.length <= 1) return;
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 260) return;

    if (event.deltaY > 0 || event.deltaX > 0) {
      if (nextOption) {
        lastWheelTimeRef.current = now;
        handleSwitchPlatform(nextOption.platformId);
      }
    } else if (event.deltaY < 0 || event.deltaX < 0) {
      if (prevOption) {
        lastWheelTimeRef.current = now;
        handleSwitchPlatform(prevOption.platformId);
      }
    }
  };

  // 键盘方向键切换同组平台
  const handleKeyDownContainer = (event: ReactKeyboardEvent) => {
    if (options.length <= 1) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (nextOption) handleSwitchPlatform(nextOption.platformId);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (prevOption) handleSwitchPlatform(prevOption.platformId);
    }
  };

  const hasMultipleOptions = options.length > 1 || extraOptions.length > 0;

  return (
    <div
      className="platform-group-quick-switcher"
      ref={containerRef}
      onWheel={handleWheel}
      onKeyDown={handleKeyDownContainer}
      tabIndex={hasMultipleOptions ? 0 : undefined}
      role={hasMultipleOptions ? 'group' : undefined}
      aria-label={t('platformLayout.groupSwitchLabel', '快捷切换同组平台')}
    >
      <div className={`platform-group-quick-bar ${open ? 'is-open' : ''}`}>
        {hasMultipleOptions && (
          <button
            type="button"
            className="platform-group-quick-step-btn prev"
            onClick={handlePrev}
            title={prevOption ? `${t('common.prev', '上一个')}: ${prevOption.label}` : ''}
            aria-label="切换上一个平台"
          >
            <ChevronLeft size={15} />
          </button>
        )}

        <button
          type="button"
          className="platform-group-quick-main-btn"
          ref={triggerRef}
          onClick={handleTriggerClick}
          title={
            hasMultipleOptions
              ? `${currentLabel} (${t('common.clickOrScrollSwitch', '点击展开列表，或直接滚轮快速切台')})`
              : currentLabel
          }
        >
          <span className="platform-group-quick-icon">
            {renderPlatformIcon(currentPlatformId, 16)}
          </span>
          <span className="platform-group-quick-label">{currentLabel}</span>
          {hasMultipleOptions && (
            <ChevronDown size={14} className={`platform-group-quick-caret ${open ? 'is-open' : ''}`} />
          )}
        </button>

        {hasMultipleOptions && (
          <button
            type="button"
            className="platform-group-quick-step-btn next"
            onClick={handleNext}
            title={nextOption ? `${t('common.next', '下一个')}: ${nextOption.label}` : ''}
            aria-label="切换下一个平台"
          >
            <ChevronRight size={15} />
          </button>
        )}
      </div>

      {open &&
        dropdownPosition &&
        createPortal(
          <div
            className="platform-group-switcher-dropdown"
            role="listbox"
            ref={dropdownRef}
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
            }}
          >
            {options.map((item) => {
              const activeItem = activePlatformId === item.platformId;
              return (
                <button
                  key={`switch-${item.platformId}`}
                  type="button"
                  className={`platform-group-switcher-option ${activeItem ? 'is-active' : ''}`}
                  role="option"
                  aria-selected={activeItem}
                  onClick={() => handleSwitchPlatform(item.platformId)}
                >
                  <span className="platform-group-switcher-option-icon">
                    {renderPlatformIcon(item.platformId, 18)}
                  </span>
                  <span className="platform-group-switcher-option-label">{item.label}</span>
                  <span className="platform-group-switcher-option-check">
                    {activeItem ? <Check size={16} /> : null}
                  </span>
                </button>
              );
            })}

            {extraOptions.map((item) => (
              <button
                key={`switch-page-${item.id}`}
                type="button"
                className={`platform-group-switcher-option ${item.active ? 'is-active' : ''}`}
                role="option"
                aria-selected={item.active === true}
                onClick={() => handleSwitchPage(item.page)}
              >
                <span className="platform-group-switcher-option-icon">
                  {item.icon ?? renderPlatformIcon(currentPlatformId, 18)}
                </span>
                <span className="platform-group-switcher-option-label">{item.label}</span>
                <span className="platform-group-switcher-option-check">
                  {item.active ? <Check size={16} /> : null}
                </span>
              </button>
            ))}

            <div className="platform-group-switcher-divider" />

            <button
              type="button"
              className="platform-group-switcher-action"
              onClick={handleOpenPlatformLayout}
            >
              <span className="platform-group-switcher-action-icon">
                <SlidersHorizontal size={15} />
              </span>
              <span className="platform-group-switcher-action-label">
                {t('accounts.groups.manageTitle', '分组管理')}
              </span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
