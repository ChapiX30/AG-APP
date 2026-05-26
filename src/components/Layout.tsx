import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  // Al haber eliminado el Sidebar, renderizamos directamente el contenido 
  // a pantalla completa (Full Width) para aprovechar el 100% del espacio.
  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-[#eceff8]">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {children}
      </div>
    </main>
  );
};