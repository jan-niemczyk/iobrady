/**
 * Zestaw ikon interfejsu - cienkie, spójne kreski (stroke), kolor dziedziczony
 * z tekstu (currentColor). Zastępują emotki i znaki tekstowe w panelu operatora.
 */
import React from "react";

type Props = {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
};

function Svg({
  size = 16, strokeWidth = 1.6, className, style, children,
}: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "-0.15em", ...style }}
      aria-hidden="true" focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconUsers = (p: Props) => (
  <Svg {...p}>
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
    <circle cx="10" cy="7.5" r="3" />
    <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4" />
    <path d="M15.5 4.7a3 3 0 0 1 0 5.6" />
  </Svg>
);

export const IconMessage = (p: Props) => (
  <Svg {...p}>
    <path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3H6.5A2.5 2.5 0 0 1 4 14.5v-7A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5z" />
  </Svg>
);

export const IconAuto = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 1 2.3 5.4" />
    <path d="M4 8.5V13h4.5" />
  </Svg>
);

export const IconCheck = (p: Props) => (
  <Svg {...p}><path d="M5 12.5 10 17.5 19 7" /></Svg>
);

export const IconClose = (p: Props) => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);

export const IconArrowUp = (p: Props) => (
  <Svg {...p}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></Svg>
);
export const IconArrowDown = (p: Props) => (
  <Svg {...p}><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></Svg>
);
export const IconArrowLeft = (p: Props) => (
  <Svg {...p}><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></Svg>
);
export const IconArrowRight = (p: Props) => (
  <Svg {...p}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></Svg>
);
export const IconChevronDown = (p: Props) => (
  <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
);
export const IconChevronRight = (p: Props) => (
  <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>
);
export const IconDisplay = (p: Props) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></Svg>
);
export const IconDocument = (p: Props) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" />
  </Svg>
);
export const IconList = (p: Props) => (
  <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></Svg>
);
export const IconMic = (p: Props) => (
  <Svg {...p}><rect x="9" y="3" width="6" height="10" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /></Svg>
);
export const IconClock = (p: Props) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
);
export const IconWarning = (p: Props) => (
  <Svg {...p}><path d="M12 4.5 21 19.5H3z" /><path d="M12 10v4M12 17h.01" /></Svg>
);
export const IconDot = ({ size = 10, className, style }: Props) => (
  <svg width={size} height={size} viewBox="0 0 10 10" className={className}
    style={{ flexShrink: 0, display: "inline-block", verticalAlign: "0.05em", ...style }} aria-hidden="true">
    <circle cx="5" cy="5" r="5" fill="currentColor" />
  </svg>
);
