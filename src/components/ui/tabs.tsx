import React, { createContext, useContext, useState } from 'react';

type TabsContextType = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export function Tabs({ 
  value, 
  onValueChange, 
  children, 
  className = '' 
}: { 
  value: string; 
  onValueChange: (value: string) => void; 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function TabsTrigger({ 
  value, 
  children, 
  className = '' 
}: { 
  value: string; 
  children: React.ReactNode; 
  className?: string;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger debe usarse dentro de Tabs');

  const isActive = context.value === value;

  return (
    <button
      onClick={() => context.onValueChange(value)}
      className={className}
      data-state={isActive ? 'active' : 'inactive'}
      type="button"
    >
      {children}
    </button>
  );
}

export function TabsContent({ 
  value, 
  children, 
  className = '' 
}: { 
  value: string; 
  children: React.ReactNode;
  className?: string;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent debe usarse dentro de Tabs');

  if (context.value !== value) return null;

  return <div className={className}>{children}</div>;
}
