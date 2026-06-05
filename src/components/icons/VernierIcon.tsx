import React from 'react';

/** Icono de pie de rey / vernier para temática metrológica. */
export const VernierIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 16,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M3 20h18" />
    <path d="M5 20V11l4-5 2 2.5" />
    <path d="M19 20V11l-4-5-2 2.5" />
    <path d="M9 20V14.5" />
    <path d="M15 20V14.5" />
    <path d="M7.5 20v-2" />
    <path d="M10 20v-3" />
    <path d="M12.5 20v-2" />
    <path d="M15 20v-3" />
    <path d="M17.5 20v-2" />
  </svg>
);
