import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useForm, useFieldArray, SubmitHandler, Controller, useWatch } from 'react-hook-form';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { differenceInDays, parseISO, format } from 'date-fns'; 
// --- 1. CAMBIOS DE IMPORTACIÓN ---
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs } from 'firebase/firestore'; 
import { db } from '../utils/firebase';
// Importamos los iconos
import { ArrowLeft, User, Archive, ListPlus, Loader2, AlertCircle, Camera, XCircle } from 'lucide-react'; // 🚨 IMPORTAMOS MÁS ICONOS

// --- 🚀 NUEVO: Importación del lector de códigos de barras ---
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

// ==================================================================
// --- 1. DATOS Y CATÁLOGOS ---
// ==================================================================

// 🚨 CAMBIO 1: Interfaz actualizada para incluir noControl
interface PatronBase {
    noControl: string; // <-- AÑADIDO
    nombre: string; // <-- (Ahora será "AG-XXX - Nombre")
    marca: string;
    modelo: string;
    serie: string;
    fechaVencimiento: string;
    status: 'vigente' | 'vencido' | 'critico' | 'proximo' | 'pendiente'; 
    // 🚨 CAMBIO DE INTERFAZ: Añadimos el estado del proceso
    estadoProceso: 'operativo' | 'programado' | 'en_calibracion' | 'completado' | 'fuera_servicio'; 
}

// Interfaz completa de RegistroPatron del otro componente
export interface RegistroPatron {
    id?: string;
    noControl: string; // <-- ESTE ES EL DATO QUE USAREMOS
    descripcion: string;
    serie: string;
    marca: string;
    modelo: string;
    frecuencia: string;
    tipoServicio: string;
    fecha: string; // <-- Fecha de vencimiento
    prioridad: 'Alta' | 'Media' | 'Baja';
    ubicacion: string;
    responsable: string;
    estadoProceso: 'operativo' | 'programado' | 'en_calibracion' | 'completado' | 'fuera_servicio';
    fechaInicioProceso?: string;
    observaciones?: string;
    historial: any[];
}

const COLLECTION_NAME_PATRONES = "patronesCalibracion"; // Colección de patrones

// --- CATÁLOGO MEJORADO (Datos limpiados de espacios extra) ---
const BACKPACK_CATALOG = {
  mochila_abraham: {
    nombre: 'Mochila 1 (Abraham)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017166' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700459' },
    ],
  },
  mochila_Dante: {
    nombre: 'Mochila 2 (Dante)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVEPNEU0017947' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X1Y00150' },
    ],
  },
  mochila_Angel: {
    nombre: 'Mochila 3 (Angel)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700130' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700192' },
    ],
  },
  mochila_Edgar: {
    nombre: 'Mochila 4 (Edgar)',
    items: [
      { herramienta: 'Desarmador Plano', qty: "1", marca: 'Urrea', modelo: 'S/M', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '8"', serie: 'N/A' },
      { herramienta: 'Destornillador ESD', qty: "4", marca: 'Urrea', modelo: 'S/M', serie: 'Sm' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700191' },
      { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700114' },
    ],
  },
  mochila_Daniel: {
    nombre: 'Mochila 5 (Daniel)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'Pretul', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'Urrea', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Rojo', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Verde', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Gris', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0023514' },
      { herramienta: 'Cepillo', qty: "2", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, 
      
    ],
  },
  mochila_Ricardo: {
    nombre: 'Mochila 6 (Ricardo)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017933' },
    ],
 }
};

// --- Tipos de Datos (Sin cambios) ---
type ToolItem = {
  herramienta: string;
  qty: string | number;
  marca: string;
  modelo: string;
  serie: string;
  // 🚨 NUEVO: Añadimos el estado de proceso para mostrarlo
  estadoProceso?: PatronBase['estadoProceso']; 
};

type FormInputs = {
  fecha: string;
  usuario: string;
  gafeteContratista: string;
  companiaDepto: string;
  noEmpleado: string;
  selectedBackpacks: string[];
  // 🚨 ACTUALIZACIÓN: isVencida e isFueraDeServicio
  manualTools: ToolItem & { isVencida?: boolean, isUnavailable?: boolean }[]; 
};

// ==================================================================
// --- LÓGICA CRÍTICA DE VENCIMIENTO (Sin cambios) ---
// ==================================================================

const getVencimientoStatus = (fecha: string): PatronBase['status'] => {
    if (!fecha || fecha === 'Por Comprar' || fecha === '') {
        return 'pendiente';
    }
    const hoy = new Date();
    try {
        const fechaVencimiento = parseISO(fecha);
        const dias = differenceInDays(fechaVencimiento, hoy);

        if (dias < 0) return 'vencido';
        if (dias >= 0 && dias <= 7) return 'critico';
        if (dias > 7 && dias <= 30) return 'proximo';
        return 'vigente';
    } catch (error) {
        return 'pendiente';
    }
};

// ==================================================================
// --- ESTILOS MEJORADOS (OPTIMIZACIÓN PARA MOBILE-FIRST Y CORRECCIÓN DE COLOR) ---
// ==================================================================
const styles = `
  /* --- KEYFRAMES PARA ANIMACIÓN --- */
  @keyframes fadeInUp {
    from { 
      opacity: 0; 
      transform: translateY(20px); 
    }
    to { 
      opacity: 1; 
      transform: translateY(0); 
    }
  }

  .form-container { 
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
    max-width: 1000px; 
    margin: 20px auto; 
    padding: 0;
    background: #f4f7f6;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    /* Ajuste para móvil: Asegura que el contenedor ocupe todo el ancho en pantallas pequeñas */
    margin: 0;
    min-height: 100vh;
  }
  
  /* --- Encabezado con Botón de Regreso --- */
  .header-bar {
    display: flex;
    align-items: center;
    padding: 16px 24px;
    border-bottom: 1px solid #e0e0e0;
    background: #ffffff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05); /* Sombra para que destaque en móvil */
  }
  .header-bar h2 {
    margin: 0;
    margin-left: 16px;
    color: #333;
    font-size: 1.25rem; /* Ajuste para móvil */
  }
  
  .btn-back {
    background: #f0f0f0; 
    color: #333;
    border: none;
    border-radius: 50%;
    width: 36px; /* Más compacto en móvil */
    height: 36px;
    cursor: pointer;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-back:hover {
    background: #e0e0e0;
    transform: scale(1.1); 
  }

  /* --- Contenido del Formulario --- */
  .form-content {
    padding: 24px 16px; /* Padding reducido horizontalmente para móvil */
    min-height: calc(100vh - 120px); /* Ajuste para evitar salto */
  }

  /* --- Tarjetas de Sección --- */
  .form-section {
    background: #ffffff;
    border-radius: 8px;
    padding: 16px; /* Padding más compacto en móvil */
    margin-bottom: 24px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    animation: fadeInUp 0.5s ease-out forwards;
    opacity: 0; 
  }
  .form-section h3 { 
    color: #004a99; 
    border-bottom: 2px solid #004a99; 
    padding-bottom: 8px; 
    margin-top: 0;
    margin-bottom: 15px; /* Margen reducido */
    font-size: 1.1rem; /* Tamaño de fuente reducido */
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* --- Grid de Campos (Responsivo) --- */
  .form-grid { 
    /* En móvil, se apilan en una sola columna */
    display: grid; 
    grid-template-columns: 1fr; 
    gap: 15px; 
  }
  /* En escritorio, usa el grid dinámico */
  @media (min-width: 768px) {
    .form-grid {
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
      gap: 20px; 
    }
  }

  .form-field label { 
    margin-bottom: 6px; 
    font-weight: 600; 
    color: #555; 
    font-size: 0.875rem;
  }
  /* 🎨 CORRECCIÓN: Forzar fondo blanco y texto oscuro en inputs/selects del formulario */
  .form-field input, .form-field select { 
    padding: 10px; 
    border: 1px solid #ddd; 
    border-radius: 6px; 
    font-size: 0.95rem; /* Ligeramente más grande para mejor tacto */
    width: 100%; /* Asegura que ocupen todo el ancho del grid */
    box-sizing: border-box; /* Importante para que el padding no rompa el layout */
    background-color: #ffffff !important; 
    color: #333333 !important; 
  }
  
  /* 🎨 CORRECCIÓN: Asegurar que las opciones del select también tengan fondo blanco y texto oscuro */
  .form-field select option {
    background-color: #ffffff;
    color: #333333;
  }

  
  /* --- 🚀 MEJORA: Estilo para mensajes de error --- */
  .error-message {
    color: #dc3545; /* Rojo de error */
    font-size: 0.8rem;
    font-weight: 600;
    margin-top: 5px;
    margin-bottom: 0;
  }


  /* --- Estilo para inputs de solo lectura --- */
  .form-field input.readonly, .tool-table input.readonly {
    background-color: #f4f4f4;
    color: #777;
    cursor: not-allowed;
    border: 1px solid #eee;
  }


  /* --- Estilos de Tabla (CRÍTICO: Scroll Horizontal para Móvil) --- */
  .tool-table-wrapper {
      overflow-x: auto; /* Permite el scroll horizontal en la tabla */
      width: 100%;
      /* Asegura que el color de fondo no afecte el color de la fuente del encabezado */
      background-color: #fff; 
  }

  .tool-table { 
    /* La tabla debe ser más ancha que el contenedor para forzar el scroll en móvil */
    min-width: 800px; 
    width: 100%; 
    border-collapse: collapse; 
    margin-top: 10px; 
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  
  /* CORRECCIÓN CRÍTICA: Asegurar color de texto en encabezado y filas */
  .tool-table th, .tool-table td { 
    padding: 8px 12px; 
    font-size: 0.8rem; 
    white-space: nowrap; 
    color: #333; /* <-- CORRECCIÓN APLICADA AQUÍ: Asegura que la fuente sea oscura */
    border-bottom: 1px solid #f0f0f0; /* Línea sutil entre filas */
  }
  .tool-table th { 
    background-color: #f9f9f9;
    font-size: 0.75rem; 
    color: #333; /* <-- CORRECCIÓN APLICADA AQUÍ: Asegura que el texto del encabezado sea oscuro */
    text-align: left;
  }
  .tool-table tbody tr:last-child td {
      border-bottom: none;
  }
  
  /* Inputs dentro de la tabla */
  .tool-table input, .tool-table select {
      width: 100%;
      padding: 8px;
      font-size: 0.85rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-sizing: border-box;
      /* 🎨 CORRECCIÓN CRÍTICA: Forzar fondo blanco para anular estilos globales */
      background-color: #ffffff !important; 
      /* 🎨 CORRECCIÓN: Forzar texto oscuro (será sobreescrito por el style={} en el select de patrones) */
      color: #333333 !important;
  }
  .tool-table input:focus, .tool-table select:focus {
      border-color: #004a99;
      box-shadow: 0 0 0 2px rgba(0, 74, 153, 0.2);
      outline: none;
  }
  /* 🎨 CORRECCIÓN: Estilo para las opciones del select */
  .tool-table select option {
      background-color: #ffffff;
      color: #333;
      /* El color de la letra se aplica en línea (inline style) */
  }


  /* --- COLORES DE ESTADO DE VENCIMIENTO (Sin cambios, ya definen su color de texto) --- */
  .tool-row-vencido {
    background-color: #fcebeb !important; 
    color: #9f1c2b !important; /* Mantenemos este color específico para vencido */
    font-weight: 600;
  }
  .tool-row-vencido td {
    border-left: 4px solid #dc3545; 
  }
  .tool-row-critico {
    background-color: #fff8eb !important; 
    color: #925c0e !important; /* Mantenemos este color específico para crítico */
  }
  .tool-row-critico td {
    border-left: 4px solid #ffc107;
  }
  .tool-row-vigente {
    background-color: #f1fff4 !important; 
  }
  .tool-row-vigente td {
    border-left: 4px solid #198754; 
  }
  
  /* --- 🚨 NUEVO: ESTILO PARA PATRÓN EN CALIBRACION / FUERA DE SERVICIO (NO DISPONIBLE) --- */
  .tool-row-unavailable {
    background-color: #f6f6f6 !important; 
    color: #a8a29e !important; /* Gris para indicar indisponibilidad */
    font-style: italic;
  }
  .tool-row-unavailable td {
    border-left: 4px solid #a8a29e;
    text-decoration: line-through;
  }
  
  /* Selector de Mochilas Mejorado */
  .backpack-selector { 
    display: flex; 
    flex-wrap: wrap;
    gap: 8px; 
  }
  .backpack-option { 
    padding: 8px 12px; 
    border-radius: 16px;
    font-size: 0.85rem; 
    background: #f0f0f0;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  /* Ocultar el checkbox real */
  .backpack-option input {
    display: none;
  }
  
  /* Asegura que el texto del selector de mochila sea oscuro */
  .backpack-option span {
    color: #333; 
    cursor: pointer;
  }
  .backpack-option input:checked + span { 
    color: #004a99;
    font-weight: 600;
  }
  .backpack-option:has(input:checked) {
      background-color: #e6f0ff;
      border-color: #004a99;
  }


  /* ======================================================= */
  /* --- 🚨 SECCIÓN DE CORRECCIÓN DE BOTONES --- */
  /* ======================================================= */
  .btn {
    padding: 10px 15px;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    text-decoration: none; /* Por si se usa <a> */
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  /* Botón Primario (Azul) - Asegura texto blanco */
  .btn-primary {
    background-color: #004a99; /* Color que el usuario ya usa */
    color: #ffffff !important; /* !important para forzar sobre global */
    border-color: #004a99;
  }
  .btn-primary:hover:not(:disabled) {
    background-color: #003a75; /* Un tono más oscuro */
  }

  /* Botón Secundario (Gris/Blanco) - Asegura texto oscuro */
  .btn-secondary {
    background-color: #f0f0f0; /* Fondo claro */
    color: #333333 !important; /* !important para forzar texto oscuro */
    border-color: #ddd;
  }
  .btn-secondary:hover:not(:disabled) {
    background-color: #e0e0e0;
  }
  
  /* Botón de Peligro (Rojo) - Asegura texto blanco */
  .btn-danger {
      background-color: #dc3545;
      color: #ffffff !important; /* !important para forzar texto blanco */
      border-color: #dc3545;
  }
  .btn-danger:hover:not(:disabled) {
      background-color: #c82333;
  }
  
  /* Clases de utilidad */
  .ml-auto {
      margin-left: auto;
  }
  
  /* Aseguramos que el btn-danger de la tabla se comporte */
  .tool-table .btn-danger {
      padding: 6px 10px;
      font-size: 0.7rem;
      width: 100%; /* Ocupa el ancho de la celda */
  }
  /* --- FIN DE SECCIÓN DE CORRECCIÓN DE BOTONES --- */


  /* --- Barra de Botones Inferior (Sticky en Móvil) --- */
  .button-bar { 
    display: flex; 
    flex-direction: column; 
    justify-content: space-between; 
    align-items: center;
    gap: 10px; 
    background: #fff;
    padding: 16px;
    border-top: 1px solid #e0e0e0;
    position: sticky; 
    bottom: 0;
    width: 100%;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
    z-index: 10;
    box-sizing: border-box; /* Asegura que el padding no afecte el ancho */
  }
  
  .button-bar > span { 
      text-align: center;
      padding-bottom: 5px;
      font-size: 0.9rem;
  }

  .button-bar-right {
    display: flex;
    flex-direction: column; 
    width: 100%;
    gap: 8px; 
  }
  
  .button-bar-right .btn {
      width: 100%; 
      padding: 12px;
  }

  /* Media Query para Escritorio */
  @media (min-width: 768px) {
    .form-container {
        margin: 20px auto;
    }
    .form-content {
        padding: 24px;
    }
    .header-bar h2 {
        font-size: 1.5rem;
    }
    .btn-back {
        width: 40px;
        height: 40px;
    }
    .button-bar {
      flex-direction: row; 
      /* Quitamos los márgenes negativos para que se alinee con el form-content */
      padding: 16px 24px;
      position: static; 
      box-shadow: none;
      border-radius: 0 0 12px 12px; /* Redondear esquinas inferiores */
    }
    .button-bar-right {
      flex-direction: row; 
      width: auto;
    }
    .button-bar-right .btn {
      width: auto;
      padding: 12px 20px;
    }
    .tool-table-wrapper {
        overflow-x: hidden; 
    }
    .tool-table {
        min-width: 100%; /* En escritorio, no necesita min-width */
    }
  }

  /* --- Estilos para Tailwind (si no están cargados) --- */
  .text-sm { font-size: 0.875rem; }
  .font-bold { font-weight: 700; }
  .text-red-700 { color: #b91c1c; }
  .text-red-600 { color: #dc2626; }
  .p-2 { padding: 0.5rem; }
  .bg-red-100 { background-color: #fee2e2; }
  .border { border-width: 1px; }
  .border-red-300 { border-color: #fca5a5; }
  .rounded-lg { border-radius: 0.5rem; }
  .rounded-full { border-radius: 9999px; }
  .mb-2 { margin-bottom: 0.5rem; }
  .w-4 { width: 1rem; }
  .h-4 { height: 1rem; }
  .mr-2 { margin-right: 0.5rem; }
  .inline { display: inline; }
  .inline-block { display: inline-block; }
  .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
  .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
  .text-xs { font-size: 0.75rem; }
  .font-semibold { font-weight: 600; }
  .text-center { text-align: center; }
  
  .bg-red-300 { background-color: #fca5a5; }
  .text-red-800 { color: #991b1b; }
  .bg-orange-300 { background-color: #fdba74; }
  .text-orange-800 { color: #9a3412; }
  .bg-green-300 { background-color: #86efac; }
  .text-green-800 { color: #166534; }
  .bg-gray-300 { background-color: #d1d5db; }
  .text-gray-800 { color: #1f2937; }
  /* 🚨 NUEVO COLOR PARA EN CALIBRACION / FUERA DE SERVICIO */
  .bg-slate-300 { background-color: #cbd5e1; }
  .text-slate-800 { color: #1e293b; }


  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-spin { animation: spin 1s linear infinite; }

  /* --- 🚀 NUEVO: ESTILOS PARA EL MODAL DEL ESCÁNER --- */
  .scanner-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .scanner-content {
    background: #fff;
    padding: 20px;
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    text-align: center;
    box-shadow: 0 5px 20px rgba(0,0,0,0.3);
  }
  .scanner-content h3 {
    margin-top: 0;
    color: #333;
  }
  
  .scanner-video {
    width: 100%;
    height: auto;
    border-radius: 8px;
    border: 1px solid #ddd;
    background: #000;
  }
  
  .scanner-content .btn-danger {
      margin-top: 15px;
      background-color: #dc3545;
      color: #fff !important;
  }
`;

// --- 🚀 MEJORA: LÓGICA DE AGREGACIÓN DE MOCHILAS MÁS ROBUSTA (ignora espacios) ---
function aggregateTools(backpackIds: string[]): ToolItem[] {
  const aggregator = new Map<string, ToolItem>();
  for (const id of backpackIds) {
    const backpack = BACKPACK_CATALOG[id];
    if (!backpack) continue;
    
    for (const item of backpack.items) {
      // Limpiamos los datos para evitar duplicados por espacios
      const cleanTool = item.herramienta.trim();
      const cleanMarca = item.marca.trim();
      const cleanModelo = item.modelo.trim();
      const cleanSerie = item.serie.trim();
      const key = `${cleanTool}|${cleanMarca}|${cleanModelo}|${cleanSerie}`;
      
      if (aggregator.has(key)) {
        const existing = aggregator.get(key)!;
        const newQty = (Number(existing.qty) || 0) + (Number(item.qty) || 0);
        existing.qty = String(newQty); 
      } else {
        // Agregamos el item *limpio* al mapa
        aggregator.set(key, { 
            herramienta: cleanTool,
            marca: cleanMarca,
            modelo: cleanModelo,
            serie: cleanSerie,
            qty: String(item.qty) 
        });
      }
    }
  }
  return Array.from(aggregator.values());
}

// =================================================================
// --- 🚀 FUNCIÓN HELPER ACTUALIZADA PARA LIMPIAR NOMBRES DE PATRÓN ---
// =================================================================

/**
 * Quita prefijos "AG-XXX - " y "** - " de los nombres de patrones.
 * Ej: "AG-059 - Bloques Patron" -> "Bloques Patron"
 * Ej: "** - Bomba Druck" -> "Bomba Druck"
 * Ej: "Perica" -> "Perica"
 */
const cleanToolNameForPdf = (name: string): string => {
  if (!name) return '';
  
  // 1. Quitar prefijo "AG-XXX - "
  const regexAg = /^AG-\d+\s+-\s+/; 
  if (regexAg.test(name)) {
    return name.replace(regexAg, '');
  }
  
  // 2. Quitar prefijo "* - " o "** - " (y espacios)
  const regexAsterisk = /^\*+\s*-\s+/;
  if (regexAsterisk.test(name)) {
    return name.replace(regexAsterisk, '');
  }

  // Si no coincide, devuelve el nombre original
  return name;
};


// =================================================================
// --- PDF 1: FUNCIÓN PARA GENERAR PDF CELESTICA (MODIFICADA) ---
// =================================================================

// 🚀 MEJORA: Constante para "número mágico"
const MAX_ITEMS_CELESTICA_PDF = 30;

async function generateCelesticaPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const templateUrl = '/template.pdf'; 
    const existingPdfBytes = await fetch(templateUrl).then(res => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const firstPage = pdfDoc.getPages()[0];
    const { width, height } = firstPage.getSize();
    const fontSize = 9;
    const color = rgb(0, 0, 0);

    // --- DATOS DE ARRIBA (USUARIO, FECHA, ETC.) ---
    firstPage.drawText(data.fecha, { x: 60, y: height - 82, size: fontSize, font, color });
    firstPage.drawText(data.usuario,           { x: 320, y: height - 82, size: fontSize, font, color });
    firstPage.drawText(data.gafeteContratista, { x: 490, y: height - 80, size: fontSize, font, color });
    firstPage.drawText(data.companiaDepto,     { x: 320, y: height - 114, size: fontSize, font, color });
    firstPage.drawText(data.noEmpleado,        { x: 500, y: height - 114, size: fontSize, font, color });

    // --- TABLA DE HERRAMIENTAS ---
    let yStartTable = height - 222; 
    const rowHeight = 16.7;       
    const xColTool = 40;
    const xColQty = 270;
    const xColMarca = 310;
    const xColModelo = 400;
    const xColSerie = 480;

    // 🚨 FILTRAR HERRAMIENTAS NO DISPONIBLES ANTES DE DIBUJAR
    const availableTools = allTools.filter(tool => 
        tool.estadoProceso !== 'en_calibracion' && 
        tool.estadoProceso !== 'fuera_servicio'
    );
    // --------------------------------------------------------

    availableTools.forEach((tool, index) => {
      // Usamos la constante
      if (index >= MAX_ITEMS_CELESTICA_PDF) return; 
      
      const y = yStartTable - (index * rowHeight);

      // 🚀 MODIFICACIÓN: Limpiamos el nombre de la herramienta antes de dibujarlo
      const toolName = cleanToolNameForPdf(tool.herramienta);

      firstPage.drawText(toolName,         { x: xColTool,   y: y, size: fontSize, font, color }); // <-- Se usa toolName
      firstPage.drawText(String(tool.qty), { x: xColQty,    y: y, size: fontSize, font, color });
      firstPage.drawText(tool.marca,       { x: xColMarca,  y: y, size: fontSize, font, color });
      firstPage.drawText(tool.modelo,      { x: xColModelo, y: y, size: fontSize, font, color });
      firstPage.drawText(tool.serie,       { x: xColSerie,  y: y, size: fontSize, font, color });
    });
    
    // 🚨 AVISO EN PDF SI SE EXCLUYERON HERRAMIENTAS
    if (allTools.length > availableTools.length) {
        const margin = 50; // Definimos margin aquí para usarlo
        firstPage.drawText(`* NOTA: ${allTools.length - availableTools.length} equipo(s) excluido(s) por estado 'En CALIBRACION' o 'Fuera de Servicio'.`, { 
            x: xColTool, 
            y: margin + 30, // Posición fija al final
            size: fontSize + 1, 
            font: font, 
            color: rgb(0.5, 0.5, 0.5) 
        });
    }
    // ----------------------------------------------------

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    saveAs(blob, `Registro_Celestica_${data.usuario}.pdf`);

  } catch (error) {
    console.error('Error al generar el PDF de Celestica:', error);
    alert('Error al generar el PDF de Celestica. Revisa la consola.');
  }
}

// =================================================================
// --- PDF 2: NUEVA FUNCIÓN PARA PDF GENÉRICO (MODIFICADA) ---
// =================================================================
async function generateGenericPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]); // Tamaño A4
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const color = rgb(0, 0, 0);
    const margin = 50;

    // --- 1. Cargar y dibujar tu LOGO ---
    const logoUrl = '/lab_logo.png';
    const logoBytes = await fetch(logoUrl).then(res => res.arrayBuffer());
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.25); 

    page.drawImage(logoImage, {
      x: margin,
      y: height - margin - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });

    // --- 2. Dibujar Título ---
    page.drawText('Registro de Herramienta o Equipo', {
      x: margin + logoDims.width + 10,
      y: height - margin - 30,
      size: 18,
      font: fontBold,
      color: color,
    });

    // --- 3. Dibujar Datos del Usuario ---
    let yPos = height - margin - logoDims.height - 30;
    const drawField = (label: string, value: string) => {
      if (!value) return; 
      page.drawText(label, { x: margin, y: yPos, size: 9, font: fontBold });
      page.drawText(value, { x: margin + 120, y: yPos, size: 9, font: font });
      yPos -= 15;
    };
    
    drawField('Fecha:', data.fecha);
    drawField('Usuario:', data.usuario);
    drawField('Compañía:', data.companiaDepto);
    drawField('No. Empleado:', data.noEmpleado);
    drawField('Gafete Contratista:', data.gafeteContratista);

    // --- 4. Dibujar la Tabla ---
    yPos -= 20;
    const rowHeight = 20;
    const tableMargin = margin - 10;

    // 🚨 NUEVA COLUMNA DE ESTADO DE PROCESO
    const cols = [
      { header: 'Herramienta', x: tableMargin, width: 140 }, // Reducir ancho
      { header: 'Qty', x: tableMargin + 140, width: 30 },
      { header: 'Marca', x: tableMargin + 170, width: 80 },
      { header: 'Modelo/Color', x: tableMargin + 250, width: 90 },
      { header: 'Serie', x: tableMargin + 340, width: 100 },
      { header: 'Estado', x: tableMargin + 440, width: 80 }, // Nueva columna
    ];

    const drawTableHeader = (currentPage: any) => {
      currentPage.drawRectangle({
        x: tableMargin,
        y: yPos - 5,
        width: width - 2 * tableMargin,
        height: rowHeight,
        color: rgb(0.9, 0.9, 0.9),
      });
      cols.forEach(col => {
        currentPage.drawText(col.header, { x: col.x + 5, y: yPos, size: 10, font: fontBold });
      });
      yPos -= rowHeight;
    };

    drawTableHeader(page);

    for (const tool of allTools) {
      if (yPos < margin + rowHeight) {
        page = pdfDoc.addPage([595.28, 841.89]);
        yPos = height - margin;
        drawTableHeader(page);
      }

      // 🚀 MODIFICACIÓN: Limpiamos el nombre de la herramienta antes de agregarlo
      const toolName = cleanToolNameForPdf(tool.herramienta);
      
      // 🚨 Obtener el estado del proceso para el PDF
      const estadoLabel = tool.estadoProceso ? tool.estadoProceso.toUpperCase().replace('_', ' ') : 'OPERATIVO';

      const rowData = [
        String(toolName), // <-- Se usa toolName
        String(tool.qty),
        String(tool.marca),
        String(tool.modelo),
        String(tool.serie),
        String(estadoLabel), // Nuevo campo
      ];
      
      cols.forEach((col, i) => {
        page.drawText(rowData[i], { x: col.x + 5, y: yPos, size: 9, font: font });
      });
      
      page.drawLine({
          start: { x: tableMargin, y: yPos - 5 },
          end: { x: width - tableMargin, y: yPos - 5 },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8),
      });

      yPos -= rowHeight;
    }

    // --- 5. Guardar y Descargar ---
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    saveAs(blob, `Registro_Generico_${data.usuario}.pdf`);

  } catch (error) {
    console.error('Error al generar el PDF Genérico:', error);
    alert('Error al generar el PDF Genérico. Revisa la consola.');
  }
}


// =================================================================
// --- COMPONENTE DEL FORMULARIO (SCREEN) ---
// =================================================================

// Tipo para los usuarios de Firebase
type Metrologo = {
  id: string;
  nombre: string;
};

// 🔧 MODIFICADO: Ahora definimos dos tipos de Mapas
type PatronesMapDropdown = Map<string, PatronBase>; // Clave: "AG-XXX - Nombre"
type PatronesMapScanner = Map<string, PatronBase>;  // Clave: "AG-XXX"

const NormasScreen = () => {
  // --- 1. HOOKS PARA NAVEGACION Y USUARIOS ---
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<Metrologo[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  
  // 🚀 MEJORA: Estado para manejar errores de carga de usuarios
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  
  // --- 🔧 MODIFICADO: ESTADOS PARA PATRONES (AHORA DOS MAPAS) ---
  // Para el <select> (Clave: "AG-XXX - Nombre")
  const [patronesDisponibles, setPatronesDisponibles] = useState<PatronesMapDropdown>(new Map());
  // 🚀 NUEVO: Para el Escáner (Clave: "AG-XXX")
  const [patronesPorNoControl, setPatronesPorNoControl] = useState<PatronesMapScanner>(new Map());
  
  const [isLoadingPatrones, setIsLoadingPatrones] = useState(true);

  // --- 🚀 NUEVO: ESTADOS Y REFS PARA EL ESCÁNER ---
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Guardará los controles del escáner (para poder detenerlo)
  const scannerControlsRef = useRef<IScannerControls | null>(null);


  // --- 2. HOOK DE FORMULARIO CON VALOR POR DEFECTO ---
  // 🚀 MEJORA: Obtenemos "errors" de formState para mostrar mensajes
  const { 
    register, 
    control, 
    handleSubmit, 
    setValue, 
    watch, 
    trigger, 
    getValues, 
    formState: { errors } 
  } = useForm<FormInputs>({
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
      selectedBackpacks: [],
      manualTools: [],
      companiaDepto: 'Equipos y Servicios AG',
    },
    mode: 'onChange' // Validar al cambiar
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'manualTools',
  });

  // --- LÓGICA DE FIREBASE PARA CARGAR METRÓLOGOS ---
  useEffect(() => {
    const fetchMetrologos = async () => {
      // 🚀 MEJORA: Reiniciar el estado de error al intentar cargar
      setUserFetchError(null); 
      try {
        const q = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
        const querySnapshot = await getDocs(q);
        const usersList: Metrologo[] = [];
        querySnapshot.forEach((doc) => {
          usersList.push({ id: doc.id, nombre: doc.data().name || doc.data().nombre });
        });
        setMetrologos(usersList);
      } catch (error) {
        console.error("Error cargando metrólogos (puesto Metrólogo): ", error);
        // 🚀 MEJORA: Guardar el mensaje de error para mostrarlo en la UI
        setUserFetchError("Error al cargar usuarios. Revise la consola.");
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchMetrologos();
  }, []);
  
  // 🚨 CAMBIO 2: Lógica de fetchPatrones actualizada
  const fetchPatrones = useCallback(async () => {
    setIsLoadingPatrones(true);
    try {
      const q = query(collection(db, COLLECTION_NAME_PATRONES));
      const querySnapshot = await getDocs(q);
      
      // Creamos los dos mapas
      const patronesMapDropdown: PatronesMapDropdown = new Map();
      const patronesMapScanner: PatronesMapScanner = new Map(); // 🚀 NUEVO

      querySnapshot.forEach((doc) => {
        const data = doc.data() as RegistroPatron;
        const descripcion = data.descripcion.trim(); 
        const noControl = data.noControl || 'S/N'; // <-- Obtenemos el noControl
        
        // <-- Creamos el nombre a mostrar
        const displayName = `${noControl} - ${descripcion}`; 
        
        const status = getVencimientoStatus(data.fecha);
        const estadoProceso = data.estadoProceso || 'operativo'; // 🚨 OBTENER ESTADO

        const patronData: PatronBase = {
            noControl: noControl,
            nombre: displayName, // <-- Guardamos el nombre combinado
            marca: data.marca || 'S/M', 
            modelo: data.modelo || 'S/M', 
            serie: data.serie || 'S/N',
            fechaVencimiento: data.fecha, 
            status: status,
            estadoProceso: estadoProceso, // 🚨 GUARDAMOS ESTADO DEL PROCESO
        };

        // Llenamos el mapa para el Dropdown (select)
        if (displayName && !patronesMapDropdown.has(displayName)) {
            patronesMapDropdown.set(displayName, patronData);
        }
        
        // 🚀 NUEVO: Llenamos el mapa para el Escáner
        if (noControl !== 'S/N' && !patronesMapScanner.has(noControl)) {
            patronesMapScanner.set(noControl, patronData);
        }
      });

      setPatronesDisponibles(patronesMapDropdown);
      setPatronesPorNoControl(patronesMapScanner); // 🚀 NUEVO
      
    } catch (error) {
      console.error("Error cargando patrones de medición: ", error);
    } finally {
      setIsLoadingPatrones(false);
    }
  }, []);
  
  useEffect(() => {
    fetchPatrones();
  }, [fetchPatrones]);


  // --- HOOKS DE VIGILANCIA Y ESTADO DE VALIDACIÓN ---
  
  const watchedManualTools = watch('manualTools');
  
  // 🔄 NUEVO: Hook para rastrear si ALGÚN PATRÓN seleccionado está vencido o no disponible
  const isAnyPatronVencido = useMemo(() => {
    // Considera vencido/crítico como riesgo
    return watchedManualTools.some(tool => tool.isVencida || tool.isUnavailable);
  }, [watchedManualTools]);
  
  // Lista de nombres de herramientas manuales ya seleccionadas
  // (Ahora contendrá el "AG-XXX - Nombre")
  const selectedManualToolNames = useMemo(() => 
    new Set(watchedManualTools.map(tool => tool.herramienta).filter(Boolean)),
    [watchedManualTools]
  );
  
  // Lógica de mochilas se mantiene igual
  const watchedBackpacks = watch('selectedBackpacks');
  const aggregatedTools = useMemo(() => 
    aggregateTools(watchedBackpacks || []), 
    [watchedBackpacks]
  );
  
  // 🚨 FILTRADO CRÍTICO: SOLO PATRONES DISPONIBLES (operativo o programado)
  const availablePatrones = useMemo(() => 
    Array.from(patronesDisponibles.values()).filter(patron => 
        patron.estadoProceso === 'operativo' || patron.estadoProceso === 'programado' || patron.estadoProceso === 'completado'
    ).sort((a,b) => a.nombre.localeCompare(b.nombre)),
    [patronesDisponibles]
  );

  // Lista COMPLETA (para rellenar la tabla)
  const allAvailableOptions = useMemo(() => 
    Array.from(patronesDisponibles.values()).sort((a,b) => a.nombre.localeCompare(b.nombre)),
    [patronesDisponibles]
  );

  // --- Manejador de envío (Aplicando la regla de negocio) ---
  const handleGeneratePdf = async (type: 'celestica' | 'generic') => {
    // 🚨 REGLA DE NEGOCIO CRÍTICA: Bloquear si hay algún patrón vencido o no disponible
    if (isAnyPatronVencido) {
        alert('ADVERTENCIA: No se puede generar el PDF. Hay patrones de medición vencidos, críticos, o NO DISPONIBLES (En calibracion/Fuera de Servicio) en la lista de Herramientas Manuales.');
        return;
    }
    
    // 🚀 MEJORA: trigger() ahora mostrará errores en los campos
    const isValid = await trigger();
    if (!isValid) {
      console.warn("Formulario inválido. Errores:", errors);
      alert('Formulario incompleto. Revisa los campos marcados en rojo.');
      return;
    }
    
    const data = getValues();
    // (Ahora `data.manualTools.herramienta` ya tiene el "AG-XXX - Nombre")
    // 🚨 MODIFICACIÓN: Pasamos el estado de proceso para filtrar en el PDF.
    const validManualTools = data.manualTools
        .filter(tool => tool.herramienta)
        .map(tool => ({
            ...tool, 
            estadoProceso: patronesDisponibles.get(tool.herramienta)?.estadoProceso || 'operativo'
        }));
        
    const allTools = [...aggregatedTools, ...validManualTools];
    
    console.log('Datos listos para enviar al PDF:', data);
    console.log('Herramientas combinadas:', allTools);
    if (type === 'celestica') {
      await generateCelesticaPdf(data, allTools);
    } else {
      await generateGenericPdf(data, allTools);
    }
  };

  // --- 🚀 NUEVO: FUNCIONES DEL ESCÁNER ---

  /**
   * Se ejecuta cuando el escáner lee un código
   */
  const handleScanResult = useCallback((noControl: string) => {
    if (!noControl) return;

    // 1. Detener el escáner inmediatamente
    stopScan();
    console.log(`Código escaneado: ${noControl}`);

    // 2. Buscar el patrón en nuestro NUEVO mapa
    const patron = patronesPorNoControl.get(noControl);

    if (!patron) {
      alert(`Patrón con No. de Control "${noControl}" no encontrado en la base de datos.`);
      return;
    }
    
    // 3. Revisar si ya está en la lista (usando su 'displayName')
    const displayName = patron.nombre;
    if (selectedManualToolNames.has(displayName)) {
        alert(`Patrón "${displayName}" ya está en la lista.`);
        return;
    }

    // 4. Revisar si está disponible
    const isUnavailable = patron.estadoProceso === 'en_proceso' || patron.estadoProceso === 'fuera_servicio';
    if (isUnavailable) {
        alert(`Patrón "${displayName}" NO DISPONIBLE. Estado: ${patron.estadoProceso.toUpperCase()}.`);
        return;
    }
    
    // 5. Revisar si está vencido/crítico
    const isVencida = (patron.status === 'vencido' || patron.status === 'critico');

    // 6. ¡Todo bien! Agregarlo a la lista
    append({
      herramienta: patron.nombre, // "AG-XXX - Nombre"
      qty: '1',
      marca: patron.marca,
      modelo: patron.modelo,
      serie: patron.serie,
      isVencida: isVencida,
      isUnavailable: isUnavailable,
    });
    
    alert(`Patrón "${displayName}" agregado exitosamente.`);

  }, [patronesPorNoControl, selectedManualToolNames, append]); // Dependencias

  /**
   * Inicia la cámara y el escáner
   */
  const startScan = useCallback(async () => {
    if (!videoRef.current) return;

    setIsScannerOpen(true);
    const reader = new BrowserMultiFormatReader();
    
    try {
      // Pide permiso y empieza a escanear del video
      const controls = await reader.decodeFromVideoDevice(
        undefined, // undefined usa la cámara por defecto
        videoRef.current,
        (result, error, controls) => {
          if (result) {
            // ¡Éxito!
            handleScanResult(result.getText());
            controls.stop(); // Detiene el stream
          }
          if (error && !(error instanceof DOMException && error.name === 'NotAllowedError')) {
            // Ignora errores de "no encontrado", pero loggea otros
            // console.error(error); 
          }
        }
      );
      // Guardamos los controles para poder detenerlos manualmente (ej. con el botón Cancelar)
      scannerControlsRef.current = controls;
    } catch (e) {
      console.error("Error al iniciar el escáner:", e);
      alert("Error al iniciar la cámara. Revisa los permisos.");
      setIsScannerOpen(false);
    }
  }, [handleScanResult]);

  /**
   * Detiene la cámara y cierra el modal
   */
  const stopScan = useCallback(() => {
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    setIsScannerOpen(false);
  }, []);

  // Limpieza: Asegurarse de que el escáner se apague si el componente se desmonta
  useEffect(() => {
    return () => {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
      }
    };
  }, []);


  // --- 4. RENDER CON MEJORAS DE UI ---
  return (
    <>
      <style>{styles}</style>
      
      {/* --- 🚀 NUEVO: MODAL DEL ESCÁNER --- */}
      {isScannerOpen && (
        <div className="scanner-modal" onClick={stopScan}>
          <div className="scanner-content" onClick={(e) => e.stopPropagation()}>
            <h3>Escanear Código de Barras</h3>
            <video ref={videoRef} className="scanner-video" />
            <button 
              type="button" 
              className="btn btn-danger" 
              onClick={stopScan}
            >
              <XCircle size={18} style={{ marginRight: '8px' }} />
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="form-container">
        
        {/* --- BOTÓN DE REGRESO Y TÍTULO --- */}
        <div className="header-bar">
          <button 
            type="button" 
            className="btn-back" 
            onClick={() => navigateTo('/')}
            title="Regresar a Menú Principal"
          >
            <ArrowLeft size={20} />
          </button>
          <h2>Registro de Herramienta y Equipo</h2>
        </div>

        <form className="form-content" onSubmit={(e) => e.preventDefault()}> 
          
          {/* --- SECCIÓN DATOS DE USUARIO MEJORADA --- */}
          <div className="form-section" style={{ animationDelay: '100ms' }}>
            <h3>
              <User size={20} />
              Datos del Usuario
            </h3>
            <div className="form-grid">
              
              <div className="form-field">
                <label>Fecha</label>
                {/* 🚀 MEJORA: Mensaje de error personalizado */}
                <input type="date" {...register('fecha', { required: "La fecha es requerida" })} />
                {errors.fecha && <p className="error-message">{errors.fecha.message}</p>}
              </div>

              {/* --- SELECTOR DE USUARIO (FIREBASE) --- */}
              <div className="form-field">
                <label>Usuario (Nombre Completo)</label>
                <Controller
                  name="usuario"
                  control={control}
                  rules={{ required: "Debes seleccionar un usuario" }}
                  render={({ field }) => (
                    <select {...field} disabled={isLoadingUsers}>
                      {/* 🚀 MEJORA: Lógica de carga, error y "no encontrado" */}
                      <option 
                        value="" 
                        style={{ color: '#555555', backgroundColor: '#ffffff' }}
                      >
                        {isLoadingUsers 
                          ? 'Cargando usuarios...' 
                          : (metrologos.length === 0 ? 'No se encontraron Metrólogos' : '-- Seleccionar Metrólogo --')
                        }
                      </option>
                      {metrologos.map(user => (
                        <option 
                          key={user.id} 
                          value={user.nombre}
                          // 🎨 CORRECCIÓN DE ESTILO: Forzar color de texto y fondo
                          style={{ color: '#333333', backgroundColor: '#ffffff' }}
                        >
                          {user.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                />
                {/* 🚀 MEJORA: Mensaje de error para Controller */}
                {errors.usuario && <p className="error-message">{errors.usuario.message}</p>}
                {/* 🚀 MEJORA: Mostrar error de carga de Firebase */}
                {userFetchError && <p className="error-message">{userFetchError}</p>}
              </div>
              
              <div className="form-field">
                <label>Gafete Contratista</label>
                <input type="text" {...register('gafeteContratista')} />
              </div>

              {/* --- CAMPO CON VALOR POR DEFECTO --- */}
              <div className="form-field">
                <label>Compañía y/o Departamento</label>
                <input type="text" {...register('companiaDepto', { required: "La compañía es requerida" })} />
                {errors.companiaDepto && <p className="error-message">{errors.companiaDepto.message}</p>}
              </div>
              
              <div className="form-field">
                <label>No. Empleado</label>
                <input type="text" {...register('noEmpleado')} />
              </div>
            </div>
          </div>

          {/* --- SECCIÓN DE MOCHILAS MEJORADA --- */}
          <div className="form-section" style={{ animationDelay: '200ms' }}>
            <h3>
              <Archive size={20} />
              Selector de Mochilas
            </h3>
            <div className="backpack-selector">
              <Controller
                name="selectedBackpacks"
                control={control}
                render={({ field }) => (
                  <>
                    {Object.entries(BACKPACK_CATALOG).map(([id, backpack], index) => (
                      <label 
                        key={id} 
                        className="backpack-option" 
                        htmlFor={`backpack-${id}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <input
                          type="checkbox"
                          id={`backpack-${id}`}
                          value={id}
                          onChange={(e) => {
                            const newSelection = e.target.checked
                              ? [...field.value, id]
                              : field.value.filter((value) => value !== id);
                            field.onChange(newSelection);
                          }}
                          checked={field.value.includes(id)}
                        />
                        <span>{backpack.nombre}</span>
                      </label>
                    ))}
                  </>
                )}
              />
            </div>

            {/* --- Tabla de Herramientas de Mochila --- */}
            {aggregatedTools.length > 0 && (
              <div className="tool-table-wrapper">
                <table className="tool-table" style={{ marginTop: '20px' }}>
                  <thead>
                    <tr>
                      <th>Herramienta (Agregada)</th>
                      <th>Qty Total</th>
                      <th>Marca</th>
                      <th>Modelo/Color</th>
                      <th>Serie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedTools.sort((a, b) => a.herramienta.localeCompare(b.herramienta)).map((tool, index) => (
                      <tr 
                        key={`${tool.herramienta}-${tool.marca}-${tool.modelo}-${tool.serie}`}
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <td className="readonly">{tool.herramienta}</td>
                        <td className="readonly" style={{ textAlign: 'center' }}>{tool.qty}</td>
                        <td className="readonly">{tool.marca}</td>
                        <td className="readonly">{tool.modelo}</td>
                        <td className="readonly">{tool.serie}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* --- SECCIÓN MANUAL MEJORADA --- */}
          <div className="form-section" style={{ animationDelay: '300ms' }}>
            <h3>
              <ListPlus size={20} />
              Herramientas Manuales Adicionales
            </h3>
            
            {/* 🔧 MODIFICADO: Contenedor de botones */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                {isAnyPatronVencido && (
                    <div className="text-sm font-bold text-red-700 p-2 bg-red-100 border border-red-300 rounded-lg mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        ⚠️ **ERROR:** Patrón(es) VENCIDO(s)/CRÍTICO(s) o **NO DISPONIBLE** seleccionado(s).
                    </div>
                )}
                
                {/* 🚀 NUEVO: Grupo de botones a la derecha */}
                <div className="ml-auto" style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={startScan} // 🚀 NUEVO: Llama a la función de escanear
                      disabled={isLoadingPatrones}
                      title="Escanear un patrón con la cámara"
                    >
                      <Camera size={16} style={{ marginRight: '8px' }} />
                      Escanear Patrón
                    </button>
                
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => append({ herramienta: '', qty: '1', marca: '', modelo: '', serie: '', isVencida: false, isUnavailable: false })}
                      disabled={isLoadingPatrones}
                      title="Agregar una fila manualmente"
                    >
                      {isLoadingPatrones ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                      ) : (
                          '+ Agregar Manual'
                      )}
                    </button>
                </div>
            </div>

            <div className="tool-table-wrapper">
                <table className="tool-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Patrón de Medición</th>
                      <th>Estatus Venc.</th>
                      <th>Estatus Proceso</th>
                      <th style={{ width: '60px' }}>Qty</th>
                      <th>Marca</th>
                      <th>Modelo/Color</th>
                      <th>Serie</th>
                      <th style={{ width: '80px' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', color: '#888' }}>
                          {isLoadingPatrones ? 'Cargando patrones de medición...' : 'No se han agregado patrones manuales.'}
                        </td>
                      </tr>
                    )}
                    {fields.map((item, index) => {
                      // 🚨 CAMBIO 3: `currentToolName` ahora es "AG-XXX - Nombre"
                      const currentToolName = watchedManualTools[index]?.herramienta;
                      const toolData = patronesDisponibles.get(currentToolName);
                      
                      // 🚨 NUEVO: Obtenemos Estatus de Vencimiento y Proceso
                      const rowStatus = toolData?.status || 'pendiente';
                      const rowEstadoProceso = toolData?.estadoProceso || 'operativo';

                      // Clase dinámica para el color de la fila
                      let rowClassName = '';
                      // 🚨 REGLA CRÍTICA DE INDISPONIBILIDAD
                      const isUnavailable = rowEstadoProceso === 'en_proceso' || rowEstadoProceso === 'fuera_servicio';
                      
                      if (isUnavailable) {
                          rowClassName = 'tool-row-unavailable';
                      } else if (rowStatus === 'vencido') {
                          rowClassName = 'tool-row-vencido';
                      } else if (rowStatus === 'critico') {
                          rowClassName = 'tool-row-critico';
                      } else if (rowStatus === 'vigente') {
                          rowClassName = 'tool-row-vigente';
                      }

                      return (
                        <tr 
                          key={item.id} 
                          className={rowClassName} // Aplicamos la clase aquí
                          style={{ animationDelay: `${index * 30}ms` }}
                        >
                          <td style={{ width: '40px', textAlign: 'center' }}>{index + 1}</td>
                          <td>
                            <Controller
                              name={`manualTools.${index}.herramienta`}
                              control={control}
                              rules={{ required: true }} // El error se maneja a nivel de 'trigger'
                              render={({ field }) => (
                                <select 
                                  {...field}
                                  disabled={isLoadingPatrones}
                                  // 🎨 APLICAMOS ESTILO AL SELECT SEGÚN EL ESTATUS
                                  style={{
                                    // El color de fondo se fuerza con CSS
                                    color: isUnavailable ? '#a8a29e' : (rowStatus === 'vencido' ? '#9f1c2b' : (rowStatus === 'critico' ? '#925c0e' : '#333')),
                                    fontWeight: (rowStatus === 'vencido' || rowStatus === 'critico' || isUnavailable) ? '600' : 'normal',
                                    backgroundColor: isUnavailable ? '#f4f4f4' : '#ffffff',
                                  }}
                                  onChange={(e) => {
                                    // `selectedToolName` ahora es "AG-XXX - Nombre"
                                    const selectedToolName = e.target.value; 
                                    field.onChange(selectedToolName);
                                    
                                    // Buscamos en el mapa por el "AG-XXX - Nombre"
                                    const newToolData = patronesDisponibles.get(selectedToolName); 
                                    
                                    if (newToolData) {
                                      // 🚨 ACTUALIZAR LOS ESTADOS INTERNOS
                                      const isVencida = (newToolData.status === 'vencido' || newToolData.status === 'critico');
                                      const isUnavailable = (newToolData.estadoProceso === 'en_proceso' || newToolData.estadoProceso === 'fuera_servicio');

                                      setValue(`manualTools.${index}.qty`, '1');
                                      setValue(`manualTools.${index}.marca`, newToolData.marca);
                                      setValue(`manualTools.${index}.modelo`, newToolData.modelo);
                                      setValue(`manualTools.${index}.serie`, newToolData.serie);
                                      setValue(`manualTools.${index}.isVencida`, isVencida); // Guardamos el estado
                                      setValue(`manualTools.${index}.isUnavailable`, isUnavailable); // 🚨 GUARDAMOS INDISPONIBILIDAD
                                    } else {
                                      // Si se deselecciona o es la opción inicial
                                      setValue(`manualTools.${index}.qty`, '1'); 
                                      setValue(`manualTools.${index}.marca`, '');
                                      setValue(`manualTools.${index}.modelo`, '');
                                      setValue(`manualTools.${index}.serie`, '');
                                      setValue(`manualTools.${index}.isVencida`, false);
                                      setValue(`manualTools.${index}.isUnavailable`, false); 
                                    }
                                  }}
                                >
                                  <option value="">
                                    {isLoadingPatrones ? 'Cargando patrones...' : '-- Seleccionar Patrón --'}
                                  </option>
                                  
                                  {/* 🎨 Iteramos sobre el array de patrones para aplicar estilo a cada <option> */}
                                  {allAvailableOptions.map(patron => {
                                      // `patron.nombre` es "AG-XXX - Nombre"
                                      // 🚨 Regla de deshabilitar si ya seleccionado O NO DISPONIBLE
                                      const isSelectedInAnotherRow = selectedManualToolNames.has(patron.nombre) && patron.nombre !== currentToolName;
                                      const isUnavailableOption = patron.estadoProceso === 'en_proceso' || patron.estadoProceso === 'fuera_servicio';
                                      
                                      // Definir el color para la OPCIÓN
                                      let optionColor = '#333';
                                      if (isUnavailableOption) optionColor = '#a8a29e';
                                      else if (patron.status === 'vencido') optionColor = '#9f1c2b';
                                      else if (patron.status === 'critico') optionColor = '#925c0e';
                                      else if (patron.status === 'vigente') optionColor = '#198754';
                                      
                                      const isDisabled = isSelectedInAnotherRow || isUnavailableOption; // 🚨 NUEVA REGLA

                                      return (
                                          <option 
                                              key={patron.nombre} // <-- Usamos el nombre combinado como key
                                              value={patron.nombre} // <-- Usamos el nombre combinado como value
                                              disabled={isDisabled} // Deshabilita si ya seleccionado o no disponible
                                              style={{ 
                                                  color: optionColor, 
                                                  fontWeight: (patron.status === 'vencido' || patron.status === 'critico' || isUnavailableOption) ? 'bold' : 'normal',
                                                  backgroundColor: '#ffffff' // Asegurar fondo blanco en opciones
                                              }}
                                          >
                                              {patron.nombre} {/* <-- Mostramos el nombre combinado */}
                                              {patron.status === 'vencido' && ' (Vencido)'}
                                              {patron.status === 'critico' && ' (Crítico)'}
                                              {isUnavailableOption && ` (${patron.estadoProceso.toUpperCase().replace('_', ' ')})`} {/* 🚨 MUESTRA ESTADO */}
                                          </option>
                                      );
                                  })}
                                </select>
                              )}
                            />
                            {/* 🚨 Mensaje de advertencia si la herramienta no está disponible */}
                            {isUnavailable && (
                                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 inline" /> 
                                    NO DISPONIBLE
                                </p>
                            )}
                          </td>
                          {/* Columna de estado de vencimiento */}
                          <td style={{ width: '120px', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                                rowStatus === 'vencido' ? 'bg-red-300 text-red-800' : 
                                rowStatus === 'critico' ? 'bg-orange-300 text-orange-800' : 
                                rowStatus === 'vigente' ? 'bg-green-300 text-green-800' : 'bg-gray-300 text-gray-800'
                              }`}>
                                {rowStatus.toUpperCase()}
                              </span>
                          </td>
                          {/* 🚨 NUEVA COLUMNA: ESTADO DE PROCESO */}
                          <td style={{ width: '140px', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                                rowEstadoProceso === 'en_proceso' ? 'bg-orange-300 text-orange-800' : 
                                rowEstadoProceso === 'fuera_servicio' ? 'bg-red-300 text-red-800' : 
                                rowEstadoProceso === 'operativo' ? 'bg-green-300 text-green-800' : 'bg-gray-300 text-gray-800'
                              }`}>
                                {rowEstadoProceso.toUpperCase().replace('_', ' ')}
                              </span>
                          </td>
                          <td style={{ width: '80px' }}>
                            {/* Deshabilitar la cantidad si no está disponible */}
                            <input {...register(`manualTools.${index}.qty`, { required: true, valueAsNumber: true })} placeholder="1" type="number" min="1" disabled={isUnavailable} />
                          </td>
                          <td>
                            <input {...register(`manualTools.${index}.marca`)} placeholder="Marca" readOnly tabIndex={-1} className="readonly" />
                          </td>
                          <td>
                            <input {...register(`manualTools.${index}.modelo`)} placeholder="Modelo" readOnly tabIndex={-1} className="readonly" />
                          </td>
                          <td>
                            <input {...register(`manualTools.${index}.serie`)} placeholder="Serie" readOnly tabIndex={-1} className="readonly" />
                          </td>
                          <td style={{ width: '80px', textAlign: 'center' }}>
                            <button type="button" className="btn btn-danger" onClick={() => remove(index)}>
                              Quitar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          </div>
          
          {/* --- BARRA DE BOTONES INFERIOR --- */}
          <div className="button-bar">
            {isAnyPatronVencido && (
                <span className="text-sm font-bold text-red-600">
                    🔴 Generación de PDF bloqueada por patrones VENCIDOS/CRÍTICOS o NO DISPONIBLES.
                </span>
            )}
            
            <div className="button-bar-right ml-auto">
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleGeneratePdf('celestica')}
                title={isAnyPatronVencido ? 'Acción bloqueada: Patrón vencido o no disponible' : "Generar formato oficial de Celestica"}
                // 🚀 MEJORA: Deshabilitado mientras carga datos O si hay riesgo/indisponibilidad
                disabled={isAnyPatronVencido || (fields.length === 0 && aggregatedTools.length === 0) || isLoadingUsers || isLoadingPatrones}
              >
                Generar PDF Celestica
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleGeneratePdf('generic')}
                title={isAnyPatronVencido ? 'Acción bloqueada: Patrón vencido o no disponible' : "Generar formato interno con logo"}
                // 🚀 MEJORA: Deshabilitado mientras carga datos O si hay riesgo/indisponibilidad
                disabled={isAnyPatronVencido || (fields.length === 0 && aggregatedTools.length === 0) || isLoadingUsers || isLoadingPatrones}
              >
                Generar PDF Genérico
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
};

export default NormasScreen;