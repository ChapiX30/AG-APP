import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  // Al haber eliminado el Sidebar, renderizamos directamente el contenido 
  // a pantalla completa (Full Width) para aprovechar el 100% del espacio.
  return (
    <main className="w-full h-screen overflow-auto bg-[#eceff8]">
      {children}
    </main>
  );
};