import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useForm, useFieldArray, SubmitHandler, Controller, useWatch } from 'react-hook-form';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { differenceInDays, parseISO, format } from 'date-fns'; 
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore'; 
import { db } from '../utils/firebase';
import { ArrowLeft, User, Archive, ListPlus, Loader2, AlertCircle, Camera, XCircle, Save } from 'lucide-react'; 

import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

// ==================================================================
// --- 1. DATOS Y CATÁLOGOS ---
// ==================================================================

interface PatronBase {
    id: string; 
    noControl: string; 
    nombre: string; 
    marca: string;
    modelo: string;
    serie: string;
    fechaVencimiento: string;
    status: 'vigente' | 'vencido' | 'critico' | 'proximo' | 'pendiente'; 
    // 🚨 AÑADIDO 'en_servicio'
    estadoProceso: 'operativo' | 'programado' | 'en_calibracion' | 'completado' | 'fuera_servicio' | 'en_prestamo' | 'en_servicio'; 
    usuarioEnUso?: string; 
}

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
    estadoProceso: 'operativo' | 'programado' | 'en_calibracion' | 'completado' | 'fuera_servicio' | 'en_prestamo' | 'en_servicio';
    fechaInicioProceso?: string;
    observaciones?: string;
    historial: any[];
    usuarioEnUso?: string;
}

const COLLECTION_NAME_PATRONES = "patronesCalibracion"; 

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

type ToolItem = {
  herramienta: string;
  qty: string | number;
  marca: string;
  modelo: string;
  serie: string;
  estadoProceso?: PatronBase['estadoProceso']; 
};

type FormInputs = {
  fecha: string;
  usuario: string;
  gafeteContratista: string;
  companiaDepto: string;
  noEmpleado: string;
  selectedBackpacks: string[];
  manualTools: ToolItem & { isVencida?: boolean, isUnavailable?: boolean }[]; 
};

const getVencimientoStatus = (fecha: string): PatronBase['status'] => {
    if (!fecha || fecha === 'Por Comprar' || fecha === '') return 'pendiente';
    try {
        const dias = differenceInDays(parseISO(fecha), new Date());
        if (dias < 0) return 'vencido';
        if (dias >= 0 && dias <= 7) return 'critico';
        if (dias > 7 && dias <= 30) return 'proximo';
        return 'vigente';
    } catch (error) { return 'pendiente'; }
};

const styles = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .form-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 0; background: #f4f7f6; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); min-height: 100vh; }
  .header-bar { display: flex; align-items: center; padding: 16px 24px; border-bottom: 1px solid #e0e0e0; background: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
  .header-bar h2 { margin: 0; margin-left: 16px; color: #333; font-size: 1.25rem; }
  .btn-back { background: #f0f0f0; color: #333; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center; }
  .btn-back:hover { background: #e0e0e0; transform: scale(1.1); }
  .form-content { padding: 24px 16px; min-height: calc(100vh - 120px); }
  .form-section { background: #ffffff; border-radius: 8px; padding: 16px; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); animation: fadeInUp 0.5s ease-out forwards; opacity: 0; }
  .form-section h3 { color: #004a99; border-bottom: 2px solid #004a99; padding-bottom: 8px; margin-top: 0; margin-bottom: 15px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; }
  .form-grid { display: grid; grid-template-columns: 1fr; gap: 15px; }
  @media (min-width: 768px) { .form-grid { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; } }
  .form-field label { margin-bottom: 6px; font-weight: 600; color: #555; font-size: 0.875rem; }
  .form-field input, .form-field select { padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95rem; width: 100%; box-sizing: border-box; background-color: #ffffff !important; color: #333333 !important; }
  .form-field select option { background-color: #ffffff; color: #333333; }
  .error-message { color: #dc3545; font-size: 0.8rem; font-weight: 600; margin-top: 5px; margin-bottom: 0; }
  .form-field input.readonly, .tool-table input.readonly { background-color: #f4f4f4; color: #777; cursor: not-allowed; border: 1px solid #eee; }
  .tool-table-wrapper { overflow-x: auto; width: 100%; background-color: #fff; }
  .tool-table { min-width: 800px; width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .tool-table th, .tool-table td { padding: 8px 12px; font-size: 0.8rem; white-space: nowrap; color: #333; border-bottom: 1px solid #f0f0f0; }
  .tool-table th { background-color: #f9f9f9; font-size: 0.75rem; color: #333; text-align: left; }
  .tool-table tbody tr:last-child td { border-bottom: none; }
  .tool-table input, .tool-table select { width: 100%; padding: 8px; font-size: 0.85rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; background-color: #ffffff !important; color: #333333 !important; }
  .tool-table input:focus, .tool-table select:focus { border-color: #004a99; box-shadow: 0 0 0 2px rgba(0, 74, 153, 0.2); outline: none; }
  .tool-table select option { background-color: #ffffff; color: #333; }
  .tool-row-vencido { background-color: #fcebeb !important; color: #9f1c2b !important; font-weight: 600; }
  .tool-row-vencido td { border-left: 4px solid #dc3545; }
  .tool-row-critico { background-color: #fff8eb !important; color: #925c0e !important; }
  .tool-row-critico td { border-left: 4px solid #ffc107; }
  .tool-row-vigente { background-color: #f1fff4 !important; }
  .tool-row-vigente td { border-left: 4px solid #198754; }
  .tool-row-unavailable { background-color: #f6f6f6 !important; color: #a8a29e !important; font-style: italic; }
  .tool-row-unavailable td { border-left: 4px solid #a8a29e; text-decoration: line-through; }
  .backpack-selector { display: flex; flex-wrap: wrap; gap: 8px; }
  .backpack-option { padding: 8px 12px; border-radius: 16px; font-size: 0.85rem; background: #f0f0f0; border: 1px solid #ddd; cursor: pointer; transition: all 0.2s; }
  .backpack-option input { display: none; }
  .backpack-option span { color: #333; cursor: pointer; }
  .backpack-option input:checked + span { color: #004a99; font-weight: 600; }
  .backpack-option:has(input:checked) { background-color: #e6f0ff; border-color: #004a99; }
  .btn { padding: 10px 15px; border: 1px solid transparent; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; font-size: 0.9rem; text-decoration: none; }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { background-color: #004a99; color: #ffffff !important; border-color: #004a99; }
  .btn-primary:hover:not(:disabled) { background-color: #003a75; }
  .btn-secondary { background-color: #f0f0f0; color: #333333 !important; border-color: #ddd; }
  .btn-secondary:hover:not(:disabled) { background-color: #e0e0e0; }
  .btn-danger { background-color: #dc3545; color: #ffffff !important; border-color: #dc3545; }
  .btn-danger:hover:not(:disabled) { background-color: #c82333; }
  .btn-success { background-color: #16a34a; color: #ffffff !important; border-color: #16a34a; }
  .btn-success:hover:not(:disabled) { background-color: #15803d; }
  .ml-auto { margin-left: auto; }
  .tool-table .btn-danger { padding: 6px 10px; font-size: 0.7rem; width: 100%; }
  .button-bar { display: flex; flex-direction: column; justify-content: space-between; align-items: center; gap: 10px; background: #fff; padding: 16px; border-top: 1px solid #e0e0e0; position: sticky; bottom: 0; width: 100%; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); z-index: 10; box-sizing: border-box; }
  .button-bar > span { text-align: center; padding-bottom: 5px; font-size: 0.9rem; }
  .button-bar-right { display: flex; flex-direction: column; width: 100%; gap: 8px; }
  .button-bar-right .btn { width: 100%; padding: 12px; }
  @media (min-width: 768px) { .form-container { margin: 20px auto; } .form-content { padding: 24px; } .header-bar h2 { font-size: 1.5rem; } .btn-back { width: 40px; height: 40px; } .button-bar { flex-direction: row; padding: 16px 24px; position: static; box-shadow: none; border-radius: 0 0 12px 12px; } .button-bar-right { flex-direction: row; width: auto; } .button-bar-right .btn { width: auto; padding: 12px 20px; } .tool-table-wrapper { overflow-x: hidden; } .tool-table { min-width: 100%; } }
  .text-sm { font-size: 0.875rem; } .font-bold { font-weight: 700; } .text-red-700 { color: #b91c1c; } .text-red-600 { color: #dc2626; } .p-2 { padding: 0.5rem; } .bg-red-100 { background-color: #fee2e2; } .border { border-width: 1px; } .border-red-300 { border-color: #fca5a5; } .rounded-lg { border-radius: 0.5rem; } .rounded-full { border-radius: 9999px; } .mb-2 { margin-bottom: 0.5rem; } .w-4 { width: 1rem; } .h-4 { height: 1rem; } .mr-2 { margin-right: 0.5rem; } .inline { display: inline; } .inline-block { display: inline-block; } .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; } .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; } .text-xs { font-size: 0.75rem; } .font-semibold { font-weight: 600; } .text-center { text-align: center; } .bg-red-300 { background-color: #fca5a5; } .text-red-800 { color: #991b1b; } .bg-orange-300 { background-color: #fdba74; } .text-orange-800 { color: #9a3412; } .bg-green-300 { background-color: #86efac; } .text-green-800 { color: #166534; } .bg-gray-300 { background-color: #d1d5db; } .text-gray-800 { color: #1f2937; } .bg-slate-300 { background-color: #cbd5e1; } .text-slate-800 { color: #1e293b; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .animate-spin { animation: spin 1s linear infinite; }
  .scanner-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .scanner-content { background: #fff; padding: 20px; border-radius: 12px; width: 90%; max-width: 600px; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.3); }
  .scanner-content h3 { margin-top: 0; color: #333; }
  .scanner-video { width: 100%; height: auto; border-radius: 8px; border: 1px solid #ddd; background: #000; }
  .scanner-content .btn-danger { margin-top: 15px; background-color: #dc3545; color: #fff !important; }
`;

function aggregateTools(backpackIds: string[]): ToolItem[] {
  const aggregator = new Map<string, ToolItem>();
  for (const id of backpackIds) {
    const backpack = BACKPACK_CATALOG[id];
    if (!backpack) continue;
    for (const item of backpack.items) {
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
        aggregator.set(key, { 
            herramienta: cleanTool, marca: cleanMarca, modelo: cleanModelo, serie: cleanSerie, qty: String(item.qty) 
        });
      }
    }
  }
  return Array.from(aggregator.values());
}

const cleanToolNameForPdf = (name: string): string => {
  if (!name) return '';
  const regexAg = /^AG-\d+\s+-\s+/; 
  if (regexAg.test(name)) return name.replace(regexAg, '');
  const regexAsterisk = /^\*+\s*-\s+/;
  if (regexAsterisk.test(name)) return name.replace(regexAsterisk, '');
  return name;
};

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

    firstPage.drawText(data.fecha, { x: 60, y: height - 82, size: fontSize, font, color });
    firstPage.drawText(data.usuario,           { x: 320, y: height - 82, size: fontSize, font, color });
    firstPage.drawText(data.gafeteContratista, { x: 490, y: height - 80, size: fontSize, font, color });
    firstPage.drawText(data.companiaDepto,     { x: 320, y: height - 114, size: fontSize, font, color });
    firstPage.drawText(data.noEmpleado,        { x: 500, y: height - 114, size: fontSize, font, color });

    let yStartTable = height - 222; 
    const rowHeight = 16.7;       
    const xColTool = 40;
    const xColQty = 270;
    const xColMarca = 310;
    const xColModelo = 400;
    const xColSerie = 480;

    // 🚨 EXCLUIR EQUIPOS NO OPERATIVOS
    const availableTools = allTools.filter(tool => 
        tool.estadoProceso !== 'en_calibracion' && 
        tool.estadoProceso !== 'fuera_servicio' &&
        tool.estadoProceso !== 'en_servicio' // Excluir 'en_servicio' si se desea
    );

    availableTools.forEach((tool, index) => {
      if (index >= MAX_ITEMS_CELESTICA_PDF) return; 
      const y = yStartTable - (index * rowHeight);
      const toolName = cleanToolNameForPdf(tool.herramienta);
      firstPage.drawText(toolName,         { x: xColTool,   y: y, size: fontSize, font, color });
      firstPage.drawText(String(tool.qty), { x: xColQty,    y: y, size: fontSize, font, color });
      firstPage.drawText(tool.marca,       { x: xColMarca,  y: y, size: fontSize, font, color });
      firstPage.drawText(tool.modelo,      { x: xColModelo, y: y, size: fontSize, font, color });
      firstPage.drawText(tool.serie,       { x: xColSerie,  y: y, size: fontSize, font, color });
    });
    
    if (allTools.length > availableTools.length) {
        const margin = 50;
        firstPage.drawText(`* NOTA: ${allTools.length - availableTools.length} equipo(s) excluido(s) por estado 'NO DISPONIBLE'.`, { 
            x: xColTool, y: margin + 30, size: fontSize + 1, font: font, color: rgb(0.5, 0.5, 0.5) 
        });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    saveAs(blob, `Registro_Celestica_${data.usuario}.pdf`);
  } catch (error) {
    console.error('Error al generar el PDF de Celestica:', error);
    alert('Error al generar el PDF de Celestica. Revisa la consola.');
  }
}

async function generateGenericPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]); 
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const color = rgb(0, 0, 0);
    const margin = 50;

    const logoUrl = '/lab_logo.png';
    const logoBytes = await fetch(logoUrl).then(res => res.arrayBuffer());
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.25); 

    page.drawImage(logoImage, {
      x: margin, y: height - margin - logoDims.height, width: logoDims.width, height: logoDims.height,
    });

    page.drawText('Registro de Herramienta o Equipo', {
      x: margin + logoDims.width + 10, y: height - margin - 30, size: 18, font: fontBold, color: color,
    });

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

    yPos -= 20;
    const rowHeight = 20;
    const tableMargin = margin - 10;

    const cols = [
      { header: 'Herramienta', x: tableMargin, width: 140 },
      { header: 'Qty', x: tableMargin + 140, width: 30 },
      { header: 'Marca', x: tableMargin + 170, width: 80 },
      { header: 'Modelo/Color', x: tableMargin + 250, width: 90 },
      { header: 'Serie', x: tableMargin + 340, width: 100 },
      { header: 'Estado', x: tableMargin + 440, width: 80 },
    ];

    const drawTableHeader = (currentPage: any) => {
      currentPage.drawRectangle({
        x: tableMargin, y: yPos - 5, width: width - 2 * tableMargin, height: rowHeight, color: rgb(0.9, 0.9, 0.9),
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

      const toolName = cleanToolNameForPdf(tool.herramienta);
      const estadoLabel = tool.estadoProceso ? tool.estadoProceso.toUpperCase().replace('_', ' ') : 'OPERATIVO';

      const rowData = [
        String(toolName), String(tool.qty), String(tool.marca), String(tool.modelo), String(tool.serie), String(estadoLabel),
      ];
      
      cols.forEach((col, i) => {
        page.drawText(rowData[i], { x: col.x + 5, y: yPos, size: 9, font: font });
      });
      
      page.drawLine({
          start: { x: tableMargin, y: yPos - 5 }, end: { x: width - tableMargin, y: yPos - 5 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
      });

      yPos -= rowHeight;
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    saveAs(blob, `Registro_Generico_${data.usuario}.pdf`);
  } catch (error) {
    console.error('Error al generar el PDF Genérico:', error);
    alert('Error al generar el PDF Genérico. Revisa la consola.');
  }
}

type Metrologo = { id: string; nombre: string; };
type PatronesMapDropdown = Map<string, PatronBase>; 
type PatronesMapScanner = Map<string, PatronBase>; 

const NormasScreen = () => {
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<Metrologo[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [userFetchError, setUserFetchError] = useState<string | null>(null);
  
  const [patronesDisponibles, setPatronesDisponibles] = useState<PatronesMapDropdown>(new Map());
  const [patronesPorNoControl, setPatronesPorNoControl] = useState<PatronesMapScanner>(new Map());
  
  const [isLoadingPatrones, setIsLoadingPatrones] = useState(true);
  const [isSavingBatch, setIsSavingBatch] = useState(false); 

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const { 
    register, control, handleSubmit, setValue, watch, trigger, getValues, 
    formState: { errors } 
  } = useForm<FormInputs>({
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

  useEffect(() => {
    const fetchMetrologos = async () => {
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
        setUserFetchError("Error al cargar usuarios. Revise la consola.");
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchMetrologos();
  }, []);
  
  const fetchPatrones = useCallback(async () => {
    setIsLoadingPatrones(true);
    try {
      const q = query(collection(db, COLLECTION_NAME_PATRONES));
      const querySnapshot = await getDocs(q);
      
      const patronesMapDropdown: PatronesMapDropdown = new Map();
      const patronesMapScanner: PatronesMapScanner = new Map();

      querySnapshot.forEach((doc) => {
        const data = doc.data() as RegistroPatron;
        const descripcion = data.descripcion.trim(); 
        const noControl = data.noControl || 'S/N'; 
        
        const displayName = `${noControl} - ${descripcion}`; 
        const status = getVencimientoStatus(data.fecha);
        const estadoProceso = data.estadoProceso || 'operativo';

        const patronData: PatronBase = {
            id: doc.id, 
            noControl: noControl,
            nombre: displayName,
            marca: data.marca || 'S/M', 
            modelo: data.modelo || 'S/M', 
            serie: data.serie || 'S/N',
            fechaVencimiento: data.fecha, 
            status: status,
            estadoProceso: estadoProceso,
            usuarioEnUso: data.usuarioEnUso 
        };

        if (displayName && !patronesMapDropdown.has(displayName)) {
            patronesMapDropdown.set(displayName, patronData);
        }
        
        if (noControl !== 'S/N' && !patronesMapScanner.has(noControl)) {
            patronesMapScanner.set(noControl, patronData);
        }
      });

      setPatronesDisponibles(patronesMapDropdown);
      setPatronesPorNoControl(patronesMapScanner);
      
    } catch (error) {
      console.error("Error cargando patrones de medición: ", error);
    } finally {
      setIsLoadingPatrones(false);
    }
  }, []);
  
  useEffect(() => {
    fetchPatrones();
  }, [fetchPatrones]);

  const watchedManualTools = watch('manualTools');
  
  const isAnyPatronVencido = useMemo(() => {
    return watchedManualTools.some(tool => tool.isVencida || tool.isUnavailable);
  }, [watchedManualTools]);
  
  const selectedManualToolNames = useMemo(() => 
    new Set(watchedManualTools.map(tool => tool.herramienta).filter(Boolean)),
    [watchedManualTools]
  );
  
  const watchedBackpacks = watch('selectedBackpacks');
  const aggregatedTools = useMemo(() => 
    aggregateTools(watchedBackpacks || []), 
    [watchedBackpacks]
  );
  
  const availablePatrones = useMemo(() => 
    Array.from(patronesDisponibles.values()).filter(patron => 
        patron.estadoProceso === 'operativo' || patron.estadoProceso === 'programado' || patron.estadoProceso === 'completado'
    ).sort((a,b) => a.nombre.localeCompare(b.nombre)),
    [patronesDisponibles]
  );

  const allAvailableOptions = useMemo(() => 
    Array.from(patronesDisponibles.values()).sort((a,b) => a.nombre.localeCompare(b.nombre)),
    [patronesDisponibles]
  );

  // 🚨🚨 FUNCIÓN REGISTRO MASIVO (CORREGIDA PARA 'en_servicio') 🚨🚨
  const handleRegistrarSalidaMasiva = async () => {
    const isValid = await trigger('usuario'); 
    if (!isValid) {
        alert('⚠️ Por favor, selecciona un USUARIO primero.');
        return;
    }
    const usuarioSeleccionado = getValues('usuario');
    
    const herramientasParaSalida = watchedManualTools.filter(tool => {
        const patronData = patronesDisponibles.get(tool.herramienta);
        return patronData && patronData.id; 
    });

    if (herramientasParaSalida.length === 0) {
        alert('⚠️ No hay patrones válidos en la lista "Manual" para registrar salida.');
        return;
    }

    // ======================================================
    // 🚨 VALIDACIÓN BLINDADA: REVISAR SI YA ESTÁN EN SERVICIO/PRÉSTAMO
    // ======================================================
    for (const tool of herramientasParaSalida) {
        const patronData = patronesDisponibles.get(tool.herramienta);
        // Si NO está operativo (está en servicio, préstamo, etc.), NO se puede volver a sacar.
        if (patronData && patronData.estadoProceso !== 'operativo') {
             let msg = `❌ ERROR: El equipo "${patronData.nombre}" NO está disponible.`;
             if (patronData.usuarioEnUso) {
                 msg += `\nLo tiene actualmente: ${patronData.usuarioEnUso}.`;
             }
             msg += `\nEstado: ${patronData.estadoProceso.toUpperCase()}`;
             alert(msg);
             return; // DETIENE TODO
        }
    }
    // ======================================================

    if (isAnyPatronVencido) {
        const confirmar = window.confirm('⚠️ ADVERTENCIA: Hay patrones vencidos en la lista. ¿Deseas forzar la salida?');
        if (!confirmar) return;
    } else {
        const confirmar = window.confirm(`¿Estás seguro de registrar la salida de ${herramientasParaSalida.length} equipos a nombre de ${usuarioSeleccionado}?`);
        if (!confirmar) return;
    }

    setIsSavingBatch(true);

    try {
        const batch = writeBatch(db); 
        const fechaActual = new Date().toISOString().split('T')[0];

        let count = 0;

        for (const tool of herramientasParaSalida) {
            const patronData = patronesDisponibles.get(tool.herramienta);
            if (!patronData || !patronData.id) continue;

            const docRef = doc(db, COLLECTION_NAME_PATRONES, patronData.id);

            batch.update(docRef, {
                estadoProceso: 'en_servicio', // 🚨 GUARDAMOS COMO 'en_servicio'
                usuarioEnUso: usuarioSeleccionado,
                ubicacion: 'En Uso',
                fechaPrestamo: fechaActual,
            });
            count++;
        }

        await batch.commit();
        alert(`✅ ¡Éxito! Se registró la salida de ${count} equipos a nombre de ${usuarioSeleccionado}.`);
        
        fetchPatrones();

    } catch (error) {
        console.error("Error en registro masivo:", error);
        alert("❌ Error al registrar la salida en la base de datos.");
    } finally {
        setIsSavingBatch(false);
    }
  };

  const handleGeneratePdf = async (type: 'celestica' | 'generic') => {
    if (isAnyPatronVencido) {
        alert('ADVERTENCIA: No se puede generar el PDF. Hay patrones de medición vencidos, críticos, o NO DISPONIBLES en la lista.');
        return;
    }
    const isValid = await trigger();
    if (!isValid) {
      console.warn("Formulario inválido. Errores:", errors);
      alert('Formulario incompleto. Revisa los campos marcados en rojo.');
      return;
    }
    const data = getValues();
    const validManualTools = data.manualTools
        .filter(tool => tool.herramienta)
        .map(tool => ({
            ...tool, 
            estadoProceso: patronesDisponibles.get(tool.herramienta)?.estadoProceso || 'operativo'
        }));
    const allTools = [...aggregatedTools, ...validManualTools];
    if (type === 'celestica') await generateCelesticaPdf(data, allTools);
    else await generateGenericPdf(data, allTools);
  };

  const handleOpenScanner = () => {
    setIsScannerOpen(true);
  };

  const handleScanResult = useCallback((noControl: string) => {
    if (!noControl) return;
    stopScan();
    console.log(`Código escaneado: ${noControl}`);
    const patron = patronesPorNoControl.get(noControl);
    if (!patron) {
      alert(`Patrón con No. de Control "${noControl}" no encontrado en la base de datos.`);
      return;
    }
    const displayName = patron.nombre;
    if (selectedManualToolNames.has(displayName)) {
        alert(`Patrón "${displayName}" ya está en la lista.`);
        return;
    }
    
    // 🚨 VALIDACIÓN ESTRICTA EN EL ESCÁNER TAMBIÉN
    const isUnavailable = 
        patron.estadoProceso === 'en_proceso' || 
        patron.estadoProceso === 'fuera_servicio' || 
        patron.estadoProceso === 'en_servicio' || // 🚨 Bloquea 'en_servicio'
        patron.estadoProceso === 'en_prestamo';   // 🚨 Bloquea 'en_prestamo'

    if (isUnavailable) {
        let msg = `Patrón "${displayName}" NO DISPONIBLE. Estado: ${patron.estadoProceso.toUpperCase()}.`;
        if (patron.usuarioEnUso) {
            msg += `\nLo tiene: ${patron.usuarioEnUso}`;
        }
        alert(msg);
        return;
    }
    const isVencida = (patron.status === 'vencido' || patron.status === 'critico');
    append({
      herramienta: patron.nombre,
      qty: '1',
      marca: patron.marca,
      modelo: patron.modelo,
      serie: patron.serie,
      isVencida: isVencida,
      isUnavailable: isUnavailable,
    });
    alert(`Patrón "${displayName}" agregado exitosamente.`);
  }, [patronesPorNoControl, selectedManualToolNames, append]);

  const stopScan = useCallback(() => {
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    setIsScannerOpen(false);
  }, []);

  useEffect(() => {
    if (isScannerOpen && videoRef.current) {
      const startScanLogic = async () => {
        const reader = new BrowserMultiFormatReader();
        try {
          const controls = await reader.decodeFromVideoDevice(
            undefined, videoRef.current,
            (result, error, controls) => {
              if (result) {
                handleScanResult(result.getText());
                controls.stop();
              }
              if (error && !(error instanceof DOMException && error.name === 'NotAllowedError')) {
                // console.error(error); 
              }
            }
          );
          scannerControlsRef.current = controls;
        } catch (e) {
          console.error("Error al iniciar el escáner:", e);
          alert("Error al iniciar la cámara. Revisa los permisos.\n(Recuerda que debe ser un sitio HTTPS si no es localhost)");
          setIsScannerOpen(false);
        }
      };
      startScanLogic();
    }
    return () => {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
        scannerControlsRef.current = null;
      }
    };
  }, [isScannerOpen, handleScanResult, stopScan]);

  return (
    <>
      <style>{styles}</style>
      
      {isScannerOpen && (
        <div className="scanner-modal" onClick={stopScan}>
          <div className="scanner-content" onClick={(e) => e.stopPropagation()}>
            <h3>Escanear Código de Barras</h3>
            <video ref={videoRef} className="scanner-video" />
            <button type="button" className="btn btn-danger" onClick={stopScan}>
              <XCircle size={18} style={{ marginRight: '8px' }} />
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="form-container">
        <div className="header-bar">
          <button type="button" className="btn-back" onClick={() => navigateTo('/')} title="Regresar a Menú Principal">
            <ArrowLeft size={20} />
          </button>
          <h2>Registro de Herramienta y Equipo</h2>
        </div>

        <form className="form-content" onSubmit={(e) => e.preventDefault()}> 
          <div className="form-section" style={{ animationDelay: '100ms' }}>
            <h3><User size={20} /> Datos del Usuario</h3>
            <div className="form-grid">
              <div className="form-field">
                <label>Fecha</label>
                <input type="date" {...register('fecha', { required: "La fecha es requerida" })} />
                {errors.fecha && <p className="error-message">{errors.fecha.message}</p>}
              </div>
              <div className="form-field">
                <label>Usuario (Nombre Completo)</label>
                <Controller
                  name="usuario"
                  control={control}
                  rules={{ required: "Debes seleccionar un usuario" }}
                  render={({ field }) => (
                    <select {...field} disabled={isLoadingUsers}>
                      <option value="" style={{ color: '#555555', backgroundColor: '#ffffff' }}>
                        {isLoadingUsers ? 'Cargando usuarios...' : (metrologos.length === 0 ? 'No se encontraron Metrólogos' : '-- Seleccionar Metrólogo --')}
                      </option>
                      {metrologos.map(user => (
                        <option key={user.id} value={user.nombre} style={{ color: '#333333', backgroundColor: '#ffffff' }}>{user.nombre}</option>
                      ))}
                    </select>
                  )}
                />
                {errors.usuario && <p className="error-message">{errors.usuario.message}</p>}
                {userFetchError && <p className="error-message">{userFetchError}</p>}
              </div>
              <div className="form-field">
                <label>Gafete Contratista</label>
                <input type="text" {...register('gafeteContratista')} />
              </div>
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

          <div className="form-section" style={{ animationDelay: '200ms' }}>
            <h3><Archive size={20} /> Selector de Mochilas</h3>
            <div className="backpack-selector">
              <Controller
                name="selectedBackpacks"
                control={control}
                render={({ field }) => (
                  <>
                    {Object.entries(BACKPACK_CATALOG).map(([id, backpack], index) => (
                      <label key={id} className="backpack-option" htmlFor={`backpack-${id}`} style={{ animationDelay: `${index * 50}ms` }}>
                        <input
                          type="checkbox" id={`backpack-${id}`} value={id}
                          onChange={(e) => {
                            const newSelection = e.target.checked ? [...field.value, id] : field.value.filter((value) => value !== id);
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
            {aggregatedTools.length > 0 && (
              <div className="tool-table-wrapper">
                <table className="tool-table" style={{ marginTop: '20px' }}>
                  <thead>
                    <tr><th>Herramienta (Agregada)</th><th>Qty Total</th><th>Marca</th><th>Modelo/Color</th><th>Serie</th></tr>
                  </thead>
                  <tbody>
                    {aggregatedTools.sort((a, b) => a.herramienta.localeCompare(b.herramienta)).map((tool, index) => (
                      <tr key={`${tool.herramienta}-${tool.marca}-${tool.modelo}-${tool.serie}`} style={{ animationDelay: `${index * 30}ms` }}>
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

          <div className="form-section" style={{ animationDelay: '300ms' }}>
            <h3><ListPlus size={20} /> Herramientas Manuales Adicionales</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                {isAnyPatronVencido && (
                    <div className="text-sm font-bold text-red-700 p-2 bg-red-100 border border-red-300 rounded-lg mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        ⚠️ **ERROR:** Patrón(es) VENCIDO(s)/CRÍTICO(s) o **NO DISPONIBLE** seleccionado(s).
                    </div>
                )}
                
                <div className="ml-auto" style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button" className="btn btn-secondary" onClick={handleOpenScanner}
                      disabled={isLoadingPatrones} title="Escanear un patrón con la cámara"
                    >
                      <Camera size={16} style={{ marginRight: '8px' }} />
                      Escanear Patrón
                    </button>
                    <button
                      type="button" className="btn btn-secondary"
                      onClick={() => append({ herramienta: '', qty: '1', marca: '', modelo: '', serie: '', isVencida: false, isUnavailable: false })}
                      disabled={isLoadingPatrones} title="Agregar una fila manualmente"
                    >
                      {isLoadingPatrones ? (<Loader2 className="w-4 h-4 mr-2 animate-spin inline" />) : ('+ Agregar Manual')}
                    </button>
                </div>
            </div>

            <div className="tool-table-wrapper">
                <table className="tool-table">
                  <thead>
                    <tr><th>#</th><th>Patrón de Medición</th><th>Estatus Venc.</th><th>Estatus Proceso</th><th style={{ width: '60px' }}>Qty</th><th>Marca</th><th>Modelo/Color</th><th>Serie</th><th style={{ width: '80px' }}>Acción</th></tr>
                  </thead>
                  <tbody>
                    {fields.length === 0 && (
                      <tr><td colSpan={9} style={{ textAlign: 'center', color: '#888' }}>{isLoadingPatrones ? 'Cargando patrones de medición...' : 'No se han agregado patrones manuales.'}</td></tr>
                    )}
                    {fields.map((item, index) => {
                      const currentToolName = watchedManualTools[index]?.herramienta;
                      const toolData = patronesDisponibles.get(currentToolName);
                      const rowStatus = toolData?.status || 'pendiente';
                      const rowEstadoProceso = toolData?.estadoProceso || 'operativo';
                      let rowClassName = '';
                      
                      // 🚨 LÓGICA MEJORADA: Bloquear también 'en_servicio' y 'en_prestamo'
                      const isUnavailable = 
                          rowEstadoProceso === 'en_proceso' || 
                          rowEstadoProceso === 'fuera_servicio' || 
                          rowEstadoProceso === 'en_servicio' || 
                          rowEstadoProceso === 'en_prestamo';
                      
                      if (isUnavailable) rowClassName = 'tool-row-unavailable';
                      else if (rowStatus === 'vencido') rowClassName = 'tool-row-vencido';
                      else if (rowStatus === 'critico') rowClassName = 'tool-row-critico';
                      else if (rowStatus === 'vigente') rowClassName = 'tool-row-vigente';

                      return (
                        <tr key={item.id} className={rowClassName} style={{ animationDelay: `${index * 30}ms` }}>
                          <td style={{ width: '40px', textAlign: 'center' }}>{index + 1}</td>
                          <td>
                            <Controller
                              name={`manualTools.${index}.herramienta`} control={control} rules={{ required: true }}
                              render={({ field }) => (
                                <select 
                                  {...field} disabled={isLoadingPatrones}
                                  style={{ color: isUnavailable ? '#a8a29e' : (rowStatus === 'vencido' ? '#9f1c2b' : (rowStatus === 'critico' ? '#925c0e' : '#333')), fontWeight: (rowStatus === 'vencido' || rowStatus === 'critico' || isUnavailable) ? '600' : 'normal', backgroundColor: isUnavailable ? '#f4f4f4' : '#ffffff' }}
                                  onChange={(e) => {
                                    const selectedToolName = e.target.value; 
                                    field.onChange(selectedToolName);
                                    const newToolData = patronesDisponibles.get(selectedToolName); 
                                    if (newToolData) {
                                      const isVencida = (newToolData.status === 'vencido' || newToolData.status === 'critico');
                                      // 🚨 ACTUALIZAR LÓGICA AQUÍ TAMBIÉN
                                      const isUnavailable = (
                                          newToolData.estadoProceso === 'en_proceso' || 
                                          newToolData.estadoProceso === 'fuera_servicio' ||
                                          newToolData.estadoProceso === 'en_servicio' ||
                                          newToolData.estadoProceso === 'en_prestamo'
                                      );
                                      setValue(`manualTools.${index}.qty`, '1');
                                      setValue(`manualTools.${index}.marca`, newToolData.marca);
                                      setValue(`manualTools.${index}.modelo`, newToolData.modelo);
                                      setValue(`manualTools.${index}.serie`, newToolData.serie);
                                      setValue(`manualTools.${index}.isVencida`, isVencida);
                                      setValue(`manualTools.${index}.isUnavailable`, isUnavailable);
                                    } else {
                                      setValue(`manualTools.${index}.qty`, '1'); setValue(`manualTools.${index}.marca`, ''); setValue(`manualTools.${index}.modelo`, ''); setValue(`manualTools.${index}.serie`, ''); setValue(`manualTools.${index}.isVencida`, false); setValue(`manualTools.${index}.isUnavailable`, false); 
                                    }
                                  }}
                                >
                                  <option value="">{isLoadingPatrones ? 'Cargando patrones...' : '-- Seleccionar Patrón --'}</option>
                                  {allAvailableOptions.map(patron => {
                                      const isSelectedInAnotherRow = selectedManualToolNames.has(patron.nombre) && patron.nombre !== currentToolName;
                                      // 🚨 ACTUALIZAR LÓGICA AQUÍ TAMBIÉN
                                      const isUnavailableOption = 
                                          patron.estadoProceso === 'en_proceso' || 
                                          patron.estadoProceso === 'fuera_servicio' ||
                                          patron.estadoProceso === 'en_servicio' ||
                                          patron.estadoProceso === 'en_prestamo';
                                          
                                      let optionColor = '#333';
                                      if (isUnavailableOption) optionColor = '#a8a29e';
                                      else if (patron.status === 'vencido') optionColor = '#9f1c2b';
                                      else if (patron.status === 'critico') optionColor = '#925c0e';
                                      else if (patron.status === 'vigente') optionColor = '#198754';
                                      const isDisabled = isSelectedInAnotherRow || isUnavailableOption;
                                      return (
                                          <option key={patron.nombre} value={patron.nombre} disabled={isDisabled} style={{ color: optionColor, fontWeight: (patron.status === 'vencido' || patron.status === 'critico' || isUnavailableOption) ? 'bold' : 'normal', backgroundColor: '#ffffff' }}>
                                              {patron.nombre} {patron.status === 'vencido' && ' (Vencido)'} {patron.status === 'critico' && ' (Crítico)'} {isUnavailableOption && ` (${patron.estadoProceso.toUpperCase().replace('_', ' ')})`}
                                          </option>
                                      );
                                  })}
                                </select>
                              )}
                            />
                            {isUnavailable && (<p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 inline" /> NO DISPONIBLE</p>)}
                          </td>
                          <td style={{ width: '120px', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${rowStatus === 'vencido' ? 'bg-red-300 text-red-800' : rowStatus === 'critico' ? 'bg-orange-300 text-orange-800' : rowStatus === 'vigente' ? 'bg-green-300 text-green-800' : 'bg-gray-300 text-gray-800'}`}>{rowStatus.toUpperCase()}</span>
                          </td>
                          <td style={{ width: '140px', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${rowEstadoProceso === 'en_proceso' ? 'bg-orange-300 text-orange-800' : rowEstadoProceso === 'fuera_servicio' ? 'bg-red-300 text-red-800' : (rowEstadoProceso === 'en_servicio' || rowEstadoProceso === 'en_prestamo') ? 'bg-slate-300 text-slate-800' : 'bg-green-300 text-green-800'}`}>{rowEstadoProceso.toUpperCase().replace('_', ' ')}</span>
                          </td>
                          <td style={{ width: '80px' }}>
                            <input {...register(`manualTools.${index}.qty`, { required: true, valueAsNumber: true })} placeholder="1" type="number" min="1" disabled={isUnavailable} />
                          </td>
                          <td><input {...register(`manualTools.${index}.marca`)} placeholder="Marca" readOnly tabIndex={-1} className="readonly" /></td>
                          <td><input {...register(`manualTools.${index}.modelo`)} placeholder="Modelo" readOnly tabIndex={-1} className="readonly" /></td>
                          <td><input {...register(`manualTools.${index}.serie`)} placeholder="Serie" readOnly tabIndex={-1} className="readonly" /></td>
                          <td style={{ width: '80px', textAlign: 'center' }}>
                            <button type="button" className="btn btn-danger" onClick={() => remove(index)}>Quitar</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          </div>
          
          <div className="button-bar">
            {isAnyPatronVencido && (
                <span className="text-sm font-bold text-red-600">🔴 Acción bloqueada por patrones VENCIDOS/CRÍTICOS o NO DISPONIBLES.</span>
            )}
            
            <div className="button-bar-right ml-auto" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              
              {fields.length > 0 && (
                  <button 
                    type="button" 
                    className="btn btn-success"
                    onClick={handleRegistrarSalidaMasiva}
                    title="Registrar que el usuario seleccionado se lleva estos equipos"
                    disabled={isAnyPatronVencido || isSavingBatch || isLoadingUsers || isLoadingPatrones}
                  >
                    {isSavingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Registrar Salida en Sistema
                  </button>
              )}

              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleGeneratePdf('celestica')}
                title={isAnyPatronVencido ? 'Acción bloqueada' : "Generar formato oficial de Celestica"}
                disabled={isAnyPatronVencido || (fields.length === 0 && aggregatedTools.length === 0) || isLoadingUsers || isLoadingPatrones}
              >
                Generar PDF Celestica
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleGeneratePdf('generic')}
                title={isAnyPatronVencido ? 'Acción bloqueada' : "Generar formato interno con logo"}
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