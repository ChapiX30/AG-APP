import React from 'react';
import { useMobileBackNavigation } from '../hooks/useMobileBackNavigation';

interface MobileBackHandlerProps {
  enabled?: boolean;
}

/** Montar una vez por área de la app donde debe funcionar el regreso con gesto/botón atrás. */
export const MobileBackHandler: React.FC<MobileBackHandlerProps> = ({ enabled = true }) => {
  useMobileBackNavigation(enabled);
  return null;
};
