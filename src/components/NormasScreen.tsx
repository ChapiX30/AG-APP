import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray, SubmitHandler, Controller, useWatch } from 'react-hook-form';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { differenceInDays, parseISO, format } from 'date-fns'; 
// --- 1. CAMBIOS DE IMPORTACIÓN ---
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs } from 'firebase/firestore'; 
import { db } from '../utils/firebase';
// Importamos los iconos
import { ArrowLeft, User, Archive, ListPlus, Loader2 } from 'lucide-react'; 

// ==================================================================
// --- 1. DATOS Y CATÁLOGOS ---
// ==================================================================

// Interfaz para la herramienta estática de la base de datos (simplificada para el select)
interface PatronBase {
    nombre: string;
    marca: string;
    modelo: string;
    serie: string;
    // NUEVO: Campo para almacenar la fecha de vencimiento
    fechaVencimiento: string;
    // NUEVO: Estado del patrón para la UI (vigente, vencido, etc.)
    status: 'vigente' | 'vencido' | 'critico' | 'proximo' | 'pendiente'; 
}

// Interfaz completa de RegistroPatron del otro componente
export interface RegistroPatron {
    id?: string;
    noControl: string;
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
    estadoProceso: 'operativo' | 'programado' | 'en_proceso' | 'completado' | 'fuera_servicio';
    fechaInicioProceso?: string;
    observaciones?: string;
    historial: any[];
}

const COLLECTION_NAME_PATRONES = "patronesCalibracion"; // Colección de patrones

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
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'S/N' },
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
      { herramienta: 'Destornillador ESD', qty: "3", marca: 'Urrea', modelo: 'S/M', serie: 'Sm' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'S/M' },
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
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Rojo', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Verde', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Gris', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
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
};

type FormInputs = {
  fecha: string;
  usuario: string;
  gafeteContratista: string;
  companiaDepto: string;
  noEmpleado: string;
  selectedBackpacks: string[];
  manualTools: ToolItem & { isVencida?: boolean }[]; // Agregamos un indicador de vencimiento al tipo de campo
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
  .form-field input, .form-field select { 
    padding: 10px; 
    border: 1px solid #ddd; 
    border-radius: 6px; 
    font-size: 0.95rem; /* Ligeramente más grande para mejor tacto */
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
  }
  .tool-table th { 
    background-color: #f9f9f9;
    font-size: 0.75rem; 
    color: #333; /* <-- CORRECCIÓN APLICADA AQUÍ: Asegura que el texto del encabezado sea oscuro */
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
  
  .tool-table .btn-danger {
      padding: 6px 10px;
      font-size: 0.7rem;
  }

  /* --- Selector de Mochilas Mejorado --- */
  .backpack-selector { 
    display: flex; 
    flex-wrap: wrap;
    gap: 8px; 
  }
  .backpack-option { 
    padding: 8px 12px; 
    border-radius: 16px;
    font-size: 0.85rem; 
  }
  
  /* Asegura que el texto del selector de mochila sea oscuro */
  .backpack-option span {
    color: #333; 
    cursor: pointer;
  }
  .backpack-option input:checked + span { 
    color: #004a99;
  }

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
      margin: 0 -24px -24px -24px; 
      padding: 16px 24px;
      position: static; 
      box-shadow: none;
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
  }
`;

// --- LÓGICA DE AGREGACIÓN DE MOCHILAS (Sin cambios) ---
function aggregateTools(backpackIds: string[]): ToolItem[] {
  const aggregator = new Map<string, ToolItem>();
  for (const id of backpackIds) {
    const backpack = BACKPACK_CATALOG[id];
    if (!backpack) continue;
    for (const item of backpack.items) {
      const key = `${item.herramienta}|${item.marca}|${item.modelo}|${item.serie}`;
      if (aggregator.has(key)) {
        const existing = aggregator.get(key)!;
        const newQty = (Number(existing.qty) || 0) + (Number(item.qty) || 0);
        existing.qty = String(newQty); 
      } else {
        aggregator.set(key, { ...item, qty: String(item.qty) }); 
      }
    }
  }
  return Array.from(aggregator.values());
}

// =================================================================
// --- PDF 1: FUNCIÓN PARA GENERAR PDF CELESTICA (Sin cambios) ---
// =================================================================
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

    allTools.forEach((tool, index) => {
      if (index >= 30) return;
      const y = yStartTable - (index * rowHeight);
      firstPage.drawText(tool.herramienta, { x: xColTool,   y: y, size: fontSize, font, color });
      firstPage.drawText(String(tool.qty), { x: xColQty,    y: y, size: fontSize, font, color });
      firstPage.drawText(tool.marca,       { x: xColMarca,  y: y, size: fontSize, font, color });
      firstPage.drawText(tool.modelo,      { x: xColModelo, y: y, size: fontSize, font, color });
      firstPage.drawText(tool.serie,       { x: xColSerie,  y: y, size: fontSize, font, color });
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    saveAs(blob, `Registro_Celestica_${data.usuario}.pdf`);

  } catch (error) {
    console.error('Error al generar el PDF de Celestica:', error);
    alert('Error al generar el PDF de Celestica. Revisa la consola.');
  }
}

// =================================================================
// --- PDF 2: NUEVA FUNCIÓN PARA PDF GENÉRICO (Sin cambios) ---
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

    const cols = [
      { header: 'Herramienta', x: tableMargin, width: 170 },
      { header: 'Qty', x: tableMargin + 170, width: 30 },
      { header: 'Marca', x: tableMargin + 200, width: 110 },
      { header: 'Modelo/Color', x: tableMargin + 310, width: 120 },
      { header: 'Serie', x: tableMargin + 430, width: 120 },
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

      const rowData = [
        String(tool.herramienta),
        String(tool.qty),
        String(tool.marca),
        String(tool.modelo),
        String(tool.serie),
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

// Tipo simplificado para guardar los patrones disponibles (Herramienta: Datos)
type PatronesMap = Map<string, PatronBase>;

const NormasScreen = () => {
  // --- 1. HOOKS PARA NAVEGACIÓN Y FIREBASE ---
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<Metrologo[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  
  // --- NUEVOS ESTADOS PARA PATRONES ---
  const [patronesDisponibles, setPatronesDisponibles] = useState<PatronesMap>(new Map());
  const [isLoadingPatrones, setIsLoadingPatrones] = useState(true);


  // --- 2. HOOK DE FORMULARIO CON VALOR POR DEFECTO ---
  const { register, control, handleSubmit, setValue, watch, trigger, getValues } = useForm<FormInputs>({
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
      selectedBackpacks: [],
      manualTools: [],
      companiaDepto: 'Equipos y Servicios AG',
    },
    mode: 'onChange' 
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'manualTools',
  });

  // --- LÓGICA DE FIREBASE PARA CARGAR METRÓLOGOS ---
  useEffect(() => {
    const fetchMetrologos = async () => {
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
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchMetrologos();
  }, []);
  
  // --- LÓGICA DE FIREBASE PARA CARGAR PATRONES (AÑADIMOS LA LÓGICA DE VENCIMIENTO AQUÍ) ---
  const fetchPatrones = useCallback(async () => {
    setIsLoadingPatrones(true);
    try {
      const q = query(collection(db, COLLECTION_NAME_PATRONES));
      const querySnapshot = await getDocs(q);
      const patronesMap: PatronesMap = new Map();

      querySnapshot.forEach((doc) => {
        const data = doc.data() as RegistroPatron;
        const key = data.descripcion.trim(); 
        
        // 🚨 LÓGICA CRÍTICA DE VENCIMIENTO APLICADA EN LA CARGA
        const status = getVencimientoStatus(data.fecha);

        if (key && !patronesMap.has(key)) {
            patronesMap.set(key, { 
                nombre: key, 
                marca: data.marca || 'S/M', 
                modelo: data.modelo || 'S/M', 
                serie: data.serie || 'S/N',
                fechaVencimiento: data.fecha, // Guardar la fecha
                status: status,              // Guardar el estado
            });
        }
      });

      setPatronesDisponibles(patronesMap);
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
  
  // 🔄 NUEVO: Hook para rastrear si ALGÚN PATRÓN seleccionado está vencido
  const isAnyPatronVencido = useMemo(() => {
    // Considera vencido/crítico como riesgo
    return watchedManualTools.some(tool => tool.isVencida);
  }, [watchedManualTools]);
  
  // Lista de nombres de herramientas manuales ya seleccionadas
  const selectedManualToolNames = useMemo(() => 
    new Set(watchedManualTools.map(tool => tool.herramienta).filter(Boolean)),
    [watchedManualTools]
  );
  
  // Lista de patrones disponibles para seleccionar (PatronesDisponibles - Ya Seleccionados)
  const availablePatronNames = useMemo(() => {
    const names: string[] = [];
    patronesDisponibles.forEach((patron, name) => {
        // Solo lista los patrones que NO están ya en la tabla.
        // El patrón actual en la fila siempre estará disponible para su propia fila.
        if (!selectedManualToolNames.has(name)) {
            names.push(name);
        }
    });
    return names.sort();
  }, [patronesDisponibles, selectedManualToolNames]);

  // Lógica de mochilas se mantiene igual
  const watchedBackpacks = watch('selectedBackpacks');
  const aggregatedTools = useMemo(() => 
    aggregateTools(watchedBackpacks || []), 
    [watchedBackpacks]
  );

  // --- Manejador de envío (Aplicando la regla de negocio) ---
  const handleGeneratePdf = async (type: 'celestica' | 'generic') => {
    // 🚨 REGLA DE NEGOCIO CRÍTICA: Bloquear si hay algún patrón vencido
    if (isAnyPatronVencido) {
        alert('ADVERTENCIA: No se puede generar el PDF. Hay patrones de medición vencidos o críticos en la lista de Herramientas Manuales.');
        return;
    }
    
    const isValid = await trigger();
    if (!isValid) {
      alert('Formulario incompleto. Revisa los campos marcados.');
      return;
    }
    const data = getValues();
    // Aseguramos que solo se incluyan herramientas manuales con un nombre de patrón seleccionado, ya que son los ítems de calibración.
    const validManualTools = data.manualTools.filter(tool => tool.herramienta);
    const allTools = [...aggregatedTools, ...validManualTools];
    
    console.log('Datos listos para enviar al PDF:', data);
    console.log('Herramientas combinadas:', allTools);
    if (type === 'celestica') {
      await generateCelesticaPdf(data, allTools);
    } else {
      await generateGenericPdf(data, allTools);
    }
  };

  // --- 4. RENDER CON MEJORAS DE UI ---
  return (
    <>
      <style>{styles}</style>
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
                <input type="date" {...register('fecha', { required: true })} />
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
                      <option value="">
                        {isLoadingUsers ? 'Cargando usuarios...' : '-- Seleccionar Metrólogo --'}
                      </option>
                      {metrologos.map(user => (
                        <option key={user.id} value={user.nombre}>
                          {user.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                />
              </div>
              
              <div className="form-field">
                <label>Gafete Contratista</label>
                <input type="text" {...register('gafeteContratista')} />
              </div>

              {/* --- CAMPO CON VALOR POR DEFECTO --- */}
              <div className="form-field">
                <label>Compañía y/o Departamento</label>
                <input type="text" {...register('companiaDepto', { required: true })} />
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
            
            {/* Botón de Agregar Fila (Movido arriba de la tabla) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                {isAnyPatronVencido && (
                    <div className="text-sm font-bold text-red-700 p-2 bg-red-100 border border-red-300 rounded-lg mb-2">
                        ⚠️ **ERROR:** Patrón(es) VENCIDO(s)/CRÍTICO(s) seleccionado(s).
                    </div>
                )}
              <button
                type="button"
                className="btn btn-secondary ml-auto"
                onClick={() => append({ herramienta: '', qty: '1', marca: '', modelo: '', serie: '', isVencida: false })}
                disabled={isLoadingPatrones}
              >
                {isLoadingPatrones ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                ) : (
                    '+ Agregar Patrón/Herramienta'
                )}
              </button>
            </div>

            <div className="tool-table-wrapper">
                <table className="tool-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Patrón de Medición</th>
                      <th>Estatus Venc.</th>
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
                        <td colSpan={8} style={{ textAlign: 'center', color: '#888' }}>
                          {isLoadingPatrones ? 'Cargando patrones de medición...' : 'No se han agregado patrones manuales.'}
                        </td>
                      </tr>
                    )}
                    {fields.map((item, index) => {
                      const currentToolName = watchedManualTools[index]?.herramienta;
                      const rowStatus = patronesDisponibles.get(currentToolName)?.status || 'pendiente';
                      
                      // Clase dinámica para el color de la fila
                      let rowClassName = '';
                      if (rowStatus === 'vencido') {
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
                          <td style={{ width: '40px', textAlign: 'center', color: rowStatus === 'vencido' || rowStatus === 'critico' ? '#9f1c2b' : '#555' }}>{index + 1}</td>
                          <td>
                            <Controller
                              name={`manualTools.${index}.herramienta`}
                              control={control}
                              rules={{ required: true }}
                              render={({ field }) => (
                                <select 
                                  {...field}
                                  disabled={isLoadingPatrones}
                                  onChange={(e) => {
                                    const selectedToolName = e.target.value;
                                    field.onChange(selectedToolName);
                                    
                                    const toolData = patronesDisponibles.get(selectedToolName);
                                    
                                    // Aseguramos que solo las opciones NO seleccionadas y el valor actual estén disponibles
                                    const currentValues = getValues('manualTools').map(t => t.herramienta);
                                    const alreadySelected = new Set(currentValues.filter((_, i) => i !== index));
                                    
                                    if (toolData) {
                                      // 🚨 ACTUALIZAR EL ESTADO DE VENCIMIENTO INTERNO (isVencida)
                                      const isVencida = (toolData.status === 'vencido' || toolData.status === 'critico');
                                      
                                      setValue(`manualTools.${index}.qty`, '1');
                                      setValue(`manualTools.${index}.marca`, toolData.marca);
                                      setValue(`manualTools.${index}.modelo`, toolData.modelo);
                                      setValue(`manualTools.${index}.serie`, toolData.serie);
                                      setValue(`manualTools.${index}.isVencida`, isVencida); // Guardamos el estado
                                    } else {
                                      // Si se deselecciona o es la opción inicial
                                      setValue(`manualTools.${index}.qty`, '1'); 
                                      setValue(`manualTools.${index}.marca`, '');
                                      setValue(`manualTools.${index}.modelo`, '');
                                      setValue(`manualTools.${index}.serie`, '');
                                      setValue(`manualTools.${index}.isVencida`, false); 
                                    }
                                  }}
                                >
                                  <option value="">
                                    {isLoadingPatrones ? 'Cargando patrones...' : '-- Seleccionar Patrón --'}
                                  </option>
                                  {/* Renderiza solo opciones no seleccionadas previamente y el valor actual */}
                                  {[...availablePatronNames, currentToolName].filter(name => name && name !== '').map(name => (
                                    <option 
                                        key={name} 
                                        value={name}
                                        disabled={selectedManualToolNames.has(name) && name !== currentToolName} // Deshabilita si ya fue seleccionado en otra fila
                                    >
                                        {name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            />
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
                          <td style={{ width: '80px' }}>
                            <input {...register(`manualTools.${index}.qty`, { required: true, valueAsNumber: true })} placeholder="1" type="number" min="1" />
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
                    🔴 Generación de PDF bloqueada por patrones VENCIDOS/CRÍTICOS.
                </span>
            )}
            
            <div className="button-bar-right ml-auto">
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleGeneratePdf('celestica')}
                style={{ background: '#004a99' }}
                title={isAnyPatronVencido ? 'Acción bloqueada: Patrón vencido' : "Generar formato oficial de Celestica"}
                disabled={isAnyPatronVencido || (fields.length === 0 && aggregatedTools.length === 0)}
              >
                Generar PDF Celestica
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleGeneratePdf('generic')}
                title={isAnyPatronVencido ? 'Acción bloqueada: Patrón vencido' : "Generar formato interno con logo"}
                disabled={isAnyPatronVencido || (fields.length === 0 && aggregatedTools.length === 0)}
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