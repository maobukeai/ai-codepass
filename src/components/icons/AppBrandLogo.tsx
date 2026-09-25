import React from 'react';
import appLogoUrl from '../../assets/app-logo.png';

interface AppBrandLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

export function AppBrandLogo({
  size = 28,
  className = '',
  style = {},
  alt = 'AI CodePass Logo',
}: AppBrandLogoProps) {
  return (
    <div
      className={`app-brand-logo-wrapper inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        ...style,
      }}
    >
      <img
        src={appLogoUrl}
        alt={alt}
        width={size}
        height={size}
        className="app-brand-logo-img select-none pointer-events-none transition-transform duration-300 hover:scale-105"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: 'drop-shadow(0 3px 10px rgba(0, 113, 227, 0.32))',
          borderRadius: `${Math.round(size * 0.22)}px`,
        }}
        draggable={false}
      />
    </div>
  );
}
