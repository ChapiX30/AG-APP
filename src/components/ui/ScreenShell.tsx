import React from 'react';
import clsx from 'clsx';

type ScreenShellVariant = 'fill' | 'scroll';

interface ScreenShellProps {
  variant: ScreenShellVariant;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<ScreenShellVariant, string> = {
  fill: 'flex h-full min-h-0 w-full flex-1 flex-col',
  scroll: 'min-h-full flex-shrink-0 flex flex-col',
};

/**
 * Root wrapper for screens inside Layout → ScreenTransition.
 * - fill: full-bleed layouts with internal scroll (Drive, Calendar, etc.)
 * - scroll: long content that grows with Layout's overflow-auto (MainMenu, forms)
 */
export const ScreenShell: React.FC<ScreenShellProps> = ({ variant, className, children }) => (
  <div className={clsx(variantClasses[variant], className)}>{children}</div>
);
