import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray, SubmitHandler, Controller, useWatch } from 'react-hook-form';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { saveAs } from 'file-saver';
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
    fecha: string;
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
    // ... (Mochilas se mantienen igual)
  mochila_abraham: {
    nombre: 'Mochila 1 (Abraham)',
    items: [
      { herramienta: 'Desarmador Plano', qty: "4", marca: 'Klein', modelo: '6-in-1', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017166' },
    ],
  },
  mochila_Dante: {
    nombre: 'Mochila 2 (Dante)',
    items: [
      { herramienta: 'Desarmador Plano', qty: "4", marca: 'Klein', modelo: '6-in-1', serie: 'N/A' },
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
      { herramienta: 'Desarmador Plano', qty: "4", marca: 'Klein', modelo: '6-in-1', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700130' },
    ],
  },
  mochila_Edgar: {
    nombre: 'Mochila 4 (Edgar)',
    items: [
      { herramienta: 'Desarmador Plano', qty: "4", marca: 'Klein', modelo: '6-in-1', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2L', serie: 'DT220240700114' },
    ],
  },
  mochila_Daniel: {
    nombre: 'Mochila 5 (Daniel)',
    items: [
      { herramienta: 'Desarmador Plano', qty: "4", marca: 'Urrea', modelo: '6-in-1', serie: 'N/A' },
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
      { herramienta: 'Desarmador Plano', qty: "4", marca: 'Klein', modelo: '6-in-1', serie: 'N/A' },
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
  manualTools: ToolItem[];
};

// ==================================================================
// --- ESTILOS MEJORADOS (CORRECCIÓN DE COLOR APLICADA AQUÍ) ---
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
    /* Oculta el overflow para que las animaciones "entren" */
    overflow: hidden; 
  }
  
  /* --- Encabezado con Botón de Regreso --- */
  .header-bar {
    display: flex;
    align-items: center;
    padding: 16px 24px;
    border-bottom: 1px solid #e0e0e0;
    background: #ffffff;
  }
  .header-bar h2 {
    margin: 0;
    margin-left: 16px;
    color: #333;
    font-size: 1.5rem;
  }
  
  .btn-back {
    background: #f0f0f0; /* Color más suave */
    color: #333;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 1.5rem;
    cursor: pointer;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-back:hover {
    background: #e0e0e0;
    transform: scale(1.1); /* Efecto en hover */
  }

  /* --- Contenido del Formulario --- */
  .form-content {
    padding: 24px;
  }

  /* --- Tarjetas de Sección --- */
  .form-section {
    background: #ffffff;
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    /* --- ANIMACIÓN AÑADIDA --- */
    animation: fadeInUp 0.5s ease-out forwards;
    opacity: 0; /* Empezar oculto */
  }
  .form-section h3 { 
    color: #004a99; 
    border-bottom: 2px solid #004a99; 
    padding-bottom: 8px; 
    margin-top: 0;
    margin-bottom: 20px;
    font-size: 1.25rem;
    /* --- ICONOS AÑADIDOS --- */
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* --- Grid de Campos --- */
  .form-grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
    gap: 20px; 
  }
  .form-field { 
    display: flex; 
    flex-direction: column; 
  }
  .form-field label { 
    margin-bottom: 8px; 
    font-weight: 600; 
    color: #555; 
    font-size: 0.875rem;
  }
  .form-field input[type="date"],
  .form-field input[type="text"],
  .form-field input[type="number"],
  .form-field select { 
    padding: 10px; 
    border: 1px solid #ddd; 
    border-radius: 6px; 
    font-size: 1rem;
    background: #fdfdfd;
    transition: border-color 0.3s, box-shadow 0.3s;
    color: #333 !important; /* <--- CORRECCIÓN 1: Color de texto de la caja principal */
  }
  
  /* <--- CORRECCIÓN 2: Asegurar el color de texto de las opciones del select ---> */
  .form-field select option {
      color: #333 !important;
      background-color: #fff; 
  }
  
  .form-field input:focus,
  .form-field select:focus {
    outline: none;
    border-color: #004a99;
    box-shadow: 0 0 0 2px rgba(0, 74, 153, 0.2);
  }

  /* --- Estilos de Tabla Mejorados --- */
  .tool-table { 
    width: 100%; 
    border-collapse: collapse; 
    margin-top: 20px; 
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .tool-table th, .tool-table td { 
    padding: 12px 15px; 
    text-align: left;
    border-bottom: 1px solid #e0e0e0;
  }
  .tool-table th { 
    background-color: #f9f9f9;
    font-size: 0.875rem;
    color: #333;
    text-transform: uppercase;
  }
  .tool-table tr:last-child td {
    border-bottom: none;
  }
  .tool-table tr:nth-child(even) {
    background-color: #fdfdfd;
  }
  /* --- ANIMACIÓN DE FILAS --- */
  .tool-table tbody tr {
    animation: fadeInUp 0.4s ease-out forwards;
    opacity: 0;
  }

  .tool-table input, .tool-table select { 
    width: 100%; 
    box-sizing: border-box; 
    border: 1px solid #ddd; 
    padding: 8px; 
    border-radius: 4px;
    font-size: 0.9rem;
  }
  .tool-table input:focus, .tool-table select:focus {
    outline: none;
    border-color: #004a99;
  }
  .tool-table td.readonly { 
    background: #f9f9f9; 
    color: #333; 
    font-size: 0.9rem;
  }

  /* --- Selector de Mochilas Mejorado --- */
  .backpack-selector { 
    display: flex; 
    flex-wrap: wrap;
    gap: 12px; 
  }
  .backpack-option { 
    display: flex; 
    align-items: center; 
    gap: 8px; 
    background: #fff; 
    border: 1px solid #ddd; 
    padding: 10px 14px; 
    border-radius: 20px; /* Estilo "Chip" */
    cursor: pointer;
    transition: all 0.3s;
    /* --- CORRECCIÓN DE COLOR --- */
    font-weight: 600; 
    color: #333;
    /* --- ANIMACIÓN AÑADIDA --- */
    animation: fadeInUp 0.4s ease-out forwards;
    opacity: 0; /* Empezar oculto */
  }
  .backpack-option input { 
    width: 16px; 
    height: 16px; 
  }
  .backpack-option span { /* Target el span, no el label */
    cursor: pointer;
  }
  .backpack-option:hover {
    border-color: #004a99;
    transform: translateY(-2px); /* Efecto hover */
  }
  .backpack-option input:checked + span { /* Target el span */
    color: #004a99;
  }

  /* --- Botones --- */
  .btn { 
    padding: 12px 20px; 
    border: none; 
    border-radius: 6px; 
    cursor: pointer; 
    font-size: 1rem; 
    font-weight: 600;
    transition: all 0.3s;
  }
  .btn:hover {
    transform: translateY(-2px); /* Efecto hover */
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  }
  .btn:active {
    transform: translateY(0);
    box-shadow: none;
  }

  .btn-primary { 
    background-color: #004a99; 
    color: white; 
  }
  .btn-primary:hover { 
    background-color: #003366; 
  }
  .btn-secondary { 
    background-color: #6c757d; 
    color: white; 
  }
  .btn-secondary:hover { 
    background-color: #5a6268; 
  }
  .btn-danger { 
    background-color: #dc3545; 
    color: white; 
    padding: 8px 12px;
    font-size: 0.875rem;
  }
  .btn-danger:hover {
    background-color: #c82333;
  }

  /* --- Barra de Botones Inferior --- */
  .button-bar { 
    display: flex; 
    justify-content: space-between; 
    align-items: center;
    margin-top: 24px; 
    gap: 15px; 
    background: #fff;
    padding: 16px 24px;
    border-radius: 0 0 12px 12px;
    border-top: 1px solid #e0e0e0;
    margin: 0 -24px -24px -24px;
  }
  .button-bar-right {
    display: flex;
    gap: 10px;
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
    const xColSerie = 420;

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
// --- COMPONENTE DEL FORMULARIO (SCREEN) - CON MODIFICACIONES ---
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

  // --- LÓGICA DE FIREBASE PARA CARGAR METRÓLOGOS (CORRECCIÓN APLICADA) ---
  useEffect(() => {
    const fetchMetrologos = async () => {
      try {
        // CORRECCIÓN APLICADA: Usamos "puesto" y "Metrólogo" (con acento y mayúscula)
        const q = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
        const querySnapshot = await getDocs(q);
        const usersList: Metrologo[] = [];
        querySnapshot.forEach((doc) => {
          // Usamos 'name' como campo de nombre visible en el dropdown (Edgar Amador)
          usersList.push({ id: doc.id, nombre: doc.data().name || doc.data().nombre });
        });
        setMetrologos(usersList);
      } catch (error) {
        console.error("Error cargando metrólogos (puesto Metrólogo): ", error);
        // No alertamos en useEffects pasivos para no molestar al usuario si no es crítico.
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchMetrologos();
  }, []);
  
  // --- LÓGICA DE FIREBASE PARA CARGAR PATRONES (Mantenida) ---
  const fetchPatrones = useCallback(async () => {
    setIsLoadingPatrones(true);
    try {
      const q = query(collection(db, COLLECTION_NAME_PATRONES));
      const querySnapshot = await getDocs(q);
      const patronesMap: PatronesMap = new Map();

      querySnapshot.forEach((doc) => {
        const data = doc.data() as RegistroPatron;
        const key = data.descripcion.trim(); 
        if (key && !patronesMap.has(key)) {
            patronesMap.set(key, { 
                nombre: key, 
                marca: data.marca || 'S/M', 
                modelo: data.modelo || 'S/M', 
                serie: data.serie || 'S/N' 
            });
        }
      });

      setPatronesDisponibles(patronesMap);
    } catch (error) {
      console.error("Error cargando patrones de medición: ", error);
      // No alertamos en useEffects pasivos
    } finally {
      setIsLoadingPatrones(false);
    }
  }, []);
  
  useEffect(() => {
    fetchPatrones();
  }, [fetchPatrones]);


  // --- Lógicas de Memo (Mantenidas) ---
  const watchedManualTools = watch('manualTools');
  
  // Lista de nombres de herramientas manuales ya seleccionadas
  const selectedManualToolNames = useMemo(() => 
    new Set(watchedManualTools.map(tool => tool.herramienta).filter(Boolean)),
    [watchedManualTools]
  );
  
  // Lista de patrones disponibles para seleccionar (PatronesDisponibles - Ya Seleccionados)
  const availablePatronNames = useMemo(() => {
    const names: string[] = [];
    patronesDisponibles.forEach((patron, name) => {
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

  // --- Manejador de envío (sin cambios) ---
  const handleGeneratePdf = async (type: 'celestica' | 'generic') => {
    const isValid = await trigger();
    if (!isValid) {
      alert('Formulario incompleto. Revisa los campos marcados.');
      return;
    }
    const data = getValues();
    const allTools = [...aggregatedTools, ...data.manualTools];
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

        <form className="form-content"> 
          
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
            )}
          </div>

          {/* --- SECCIÓN MANUAL MEJORADA --- */}
          <div className="form-section" style={{ animationDelay: '300ms' }}>
            <h3>
              <ListPlus size={20} />
              Herramientas Manuales Adicionales
            </h3>
            
            {/* Botón de Agregar Fila (Movido arriba de la tabla) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => append({ herramienta: '', qty: '1', marca: '', modelo: '', serie: '' })}
                disabled={isLoadingPatrones}
              >
                {isLoadingPatrones ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                ) : (
                    '+ Agregar Herramienta Manual'
                )}
              </button>
            </div>

            <table className="tool-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Herramienta</th>
                  <th>Qty</th>
                  <th>Marca</th>
                  <th>Modelo/Color</th>
                  <th>Serie</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {fields.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#888' }}>
                      {isLoadingPatrones ? 'Cargando patrones de medición...' : 'No se han agregado herramientas manuales.'}
                    </td>
                  </tr>
                )}
                {fields.map((item, index) => {
                  const currentToolName = watchedManualTools[index]?.herramienta;
                  return (
                    <tr key={item.id} style={{ animationDelay: `${index * 30}ms` }}>
                      <td style={{ width: '40px', textAlign: 'center', color: '#555' }}>{index + 1}</td>
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
                                
                                // OBTENER DATOS DEL PATRÓN DESDE EL MAP DE FIREBASE
                                const toolData = patronesDisponibles.get(selectedToolName);
                                
                                if (toolData) {
                                  // Usar setValue para actualizar los campos automáticamente
                                  setValue(`manualTools.${index}.qty`, '1');
                                  setValue(`manualTools.${index}.marca`, toolData.marca);
                                  setValue(`manualTools.${index}.modelo`, toolData.modelo);
                                  setValue(`manualTools.${index}.serie`, toolData.serie);
                                } else {
                                  setValue(`manualTools.${index}.qty`, '1'); // Default qty 1
                                  setValue(`manualTools.${index}.marca`, '');
                                  setValue(`manualTools.${index}.modelo`, '');
                                  setValue(`manualTools.${index}.serie`, '');
                                }
                              }}
                            >
                              <option value="">
                                {isLoadingPatrones ? 'Cargando patrones...' : '-- Seleccionar Patrón --'}
                              </option>
                              {/* Opción seleccionada actualmente (si no está en disponibles, se muestra igual) */}
                              {currentToolName && !availablePatronNames.includes(currentToolName) && currentToolName !== '' && (
                                <option key={currentToolName} value={currentToolName}>{currentToolName}</option>
                              )}
                              
                              {/* Patrones disponibles de Firebase */}
                              {availablePatronNames.map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          )}
                        />
                      </td>
                      <td style={{ width: '80px' }}>
                        <input {...register(`manualTools.${index}.qty`, { required: true })} placeholder="Ej. 1" type="number" />
                      </td>
                      <td>
                        <input {...register(`manualTools.${index}.marca`)} placeholder="Ej. Fluke" />
                      </td>
                      <td>
                        <input {...register(`manualTools.${index}.modelo`)} placeholder="Ej. 87V" />
                      </td>
                      <td>
                        <input {...register(`manualTools.${index}.serie`)} placeholder="Ej. SN..." />
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
          
          {/* --- BARRA DE BOTONES INFERIOR --- */}
          <div className="button-bar">
            <span></span> {/* Placeholder */}
            
            <div className="button-bar-right">
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleGeneratePdf('celestica')}
                style={{ background: '#004a99' }}
                title="Generar formato oficial de Celestica"
                disabled={fields.length === 0 && aggregatedTools.length === 0}
              >
                Generar PDF Celestica
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleGeneratePdf('generic')}
                title="Generar formato interno con logo"
                disabled={fields.length === 0 && aggregatedTools.length === 0}
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