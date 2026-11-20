/**
 * Iconos de línea del panel (SVG en línea, sin librerías). Decorativos:
 * siempre van junto a un texto visible.
 */
import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const IconPanel = () => (
  <Icon>
    <rect x="3" y="3" width="7.5" height="9" rx="1" />
    <rect x="13.5" y="3" width="7.5" height="5.5" rx="1" />
    <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1" />
    <rect x="3" y="15" width="7.5" height="6" rx="1" />
  </Icon>
);

export const IconOrders = () => (
  <Icon>
    <path d="M21 8.5 12 4 3 8.5v7L12 20l9-4.5z" />
    <path d="m3 8.5 9 4.5 9-4.5M12 13v7" />
  </Icon>
);

export const IconPrices = () => (
  <Icon>
    <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z" />
    <circle cx="8" cy="8" r="1.6" />
  </Icon>
);

export const IconStatus = () => (
  <Icon>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Icon>
);

export const IconBatches = () => (
  <Icon>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </Icon>
);

export const IconReservations = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const IconMail = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="m3.5 6 8.5 7 8.5-7" />
  </Icon>
);

export const IconExternal = () => (
  <Icon>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </Icon>
);

export const IconArrowLeft = () => (
  <Icon>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const IconDownload = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);

export const IconCopy = () => (
  <Icon>
    <rect x="8" y="8" width="12" height="12" rx="1.5" />
    <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
  </Icon>
);
