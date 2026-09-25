import { CSSProperties, useId } from 'react';

type QwenWorkIconProps = {
  className?: string;
  style?: CSSProperties;
};

export function QwenWorkIcon({ className = 'nav-item-icon', style }: QwenWorkIconProps) {
  const id = useId();
  const bgGradientId = `qwenwork-bg-${id}`;
  const starGradientId = `qwenwork-star-${id}`;

  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bgGradientId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#615CED" />
          <stop offset="52%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#3730A3" />
        </linearGradient>
        <linearGradient id={starGradientId} x1="6" y1="5" x2="18" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0E7FF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill={`url(#${bgGradientId})`} />
      {/* QwenWork geometric 4-pointed star & work emblem */}
      <path
        d="M12 5.2C12.35 8.45 14.35 10.45 17.6 10.8C14.35 11.15 12.35 13.15 12 16.4C11.65 13.15 9.65 11.15 6.4 10.8C9.65 10.45 11.65 8.45 12 5.2Z"
        fill={`url(#${starGradientId})`}
      />
      <path
        d="M16.8 14.2C17 15.6 17.8 16.4 19.2 16.6C17.8 16.8 17 17.6 16.8 19C16.6 17.6 15.8 16.8 14.4 16.6C15.8 16.4 16.6 15.6 16.8 14.2Z"
        fill="#C7D2FE"
      />
      <circle cx="8.2" cy="16.8" r="1.35" fill="#A5B4FC" />
    </svg>
  );
}
