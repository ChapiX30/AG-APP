import React, { useState } from 'react';
import EpsonLabel from '../utils/EpsonPlugin';

const FindEpsonPackage: React.FC = () => {
  const [packages, setPackages] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  const findPackages = async () => {
    setSearching(true);
    try {
      const result = await EpsonLabel.findEpsonPackages();
      console.log('Paquetes encontrados:', result);
      setPackages(result.packages);
      
      // Mostrar en alert para que sea más fácil de copiar
      if (result.packages.length > 0) {
        alert('Paquetes encontrados:\n\n' + result.packages.join('\n\n'));
      } else {
        alert('No se encontraron paquetes con "epson" o "label" en el nombre');
      }
    } catch (error: any) {
      console.error('Error:', error);
      alert('Error: ' + (error?.message || error));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={{
      backgroundColor: '#1e40af',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      marginBottom: '20px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
        paddingBottom: '12px'
      }}>
        <span style={{ fontSize: '24px' }}>🔍</span>
        <div>
          <h3 style={{ 
            margin: 0, 
            color: 'white', 
            fontSize: '20px',
            fontWeight: 'bold'
          }}>
            Encontrar Paquete de Epson
          </h3>
          <p style={{ 
            margin: '4px 0 0 0', 
            color: '#93c5fd', 
            fontSize: '14px' 
          }}>
            Descubre el nombre exacto de la app instalada
          </p>
        </div>
      </div>

      <button 
        onClick={findPackages}
        disabled={searching}
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: searching ? '#64748b' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: searching ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
        }}
        onMouseOver={(e) => {
          if (!searching) {
            e.currentTarget.style.backgroundColor = '#059669';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }
        }}
        onMouseOut={(e) => {
          if (!searching) {
            e.currentTarget.style.backgroundColor = '#10b981';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
      >
        {searching ? '🔄 Buscando...' : '🔎 Buscar Apps de Epson/Label'}
      </button>

      {packages.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '12px'
          }}>
            {packages.map((pkg, index) => (
              <div 
                key={index}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  padding: '12px',
                  borderRadius: '6px',
                  marginBottom: index < packages.length - 1 ? '8px' : '0',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  color: '#1f2937',
                  wordBreak: 'break-all'
                }}
              >
                {pkg}
              </div>
            ))}
          </div>

          <div style={{
            backgroundColor: 'rgba(254, 243, 199, 0.2)',
            border: '1px solid #fbbf24',
            borderRadius: '8px',
            padding: '12px',
            color: '#fef3c7',
            fontSize: '13px',
            lineHeight: '1.5'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>ℹ️</span>
              <div>
                <strong>Próximo paso:</strong> Copia el texto que está después de 
                la flecha (→) y agrégalo como primer elemento en EPSON_PACKAGES[] 
                en EpsonLabelPlugin.java
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FindEpsonPackage;