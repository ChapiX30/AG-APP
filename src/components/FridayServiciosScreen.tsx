import React, { useEffect, useMemo, useRef, useState } from 'react';
import SidebarFriday from './SidebarFriday';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ArrowLeft, Plus, Calendar, Bell, FileText, FileUp, X, Check,
  Repeat, Download, Trash2, XCircle, Search, Filter, Eye, Edit3,
  Zap, Clock, User, CheckCircle2, RotateCcw, Loader2, Maximize, Minimize,
  ExternalLink, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight
} from 'lucide-react';
import { doc, collection, updateDoc, addDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/* Worker de PDF.js */
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const CURRENT_USER_ID = localStorage.getItem('usuario_id') || 'usuario_123';
const CURRENT_USER_NAME = localStorage.getItem('usuario.nombre') || 'Mi Usuario';

const estados = [
  { value: 'programado', label: 'Programado', color: 'text-blue-400', bgColor: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Calendar, gradient: 'from-blue-500/20 to-blue-600/5' },
  { value: 'en_proceso', label: 'En Proceso', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: Clock, gradient: 'from-emerald-500/20 to-emerald-600/5' },
  { value: 'finalizado', label: 'Finalizado', color: 'text-purple-400', bgColor: 'bg-purple-500/10', border: 'border-purple-500/30', icon: CheckCircle2, gradient: 'from-purple-500/20 to-purple-600/5' },
  { value: 'reprogramacion', label: 'Reprogramación', color: 'text-red-400', bgColor: 'bg-red-500/10', border: 'border-red-500/30', icon: RotateCcw, gradient: 'from-red-500/20 to-red-600/5' }
];

/* --------------------------
   Item de preview en listas
--------------------------- */
const FilePreview = ({ file, onRemove, onView }: { file: File | string; onRemove: () => void; onView: () => void }) => {
  const [ext, setExt] = useState('');
  useEffect(() => {
    const n = typeof file === 'string' ? file.split('?')[0] : file.name;
    setExt((n.split('.').pop() || '').toLowerCase());
  }, [file]);

  const icon = useMemo(() => {
    const base = 'text-gray-500';
    const map: any = { pdf: 'text-red-500', doc: 'text-blue-500', docx: 'text-blue-500', xls: 'text-green-500', xlsx: 'text-green-500' };
    const cls = map[ext] || base;
    return <FileText className={cls} size={18} />;
  }, [ext]);

  return (
    <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded-lg">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="text-sm truncate max-w-[18rem]">
          {typeof file === 'string' ? decodeURIComponent((file.split('/').pop() || '').split('?')[0]) : file.name}
        </span>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onView} className="text-gray-400 hover:text-blue-500" title="Vista previa"><Eye size={16} /></button>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500" title="Eliminar"><X size={16} /></button>
      </div>
    </div>
  );
};

/* =========================================================
   VISOR PDF con paginación + triple fallback (pdfjs → blob → iframe)
========================================================= */
const PdfViewer = ({
  url, blobUrl, useBlob, onLoaded, onError, zoom, rotation, page, onPageChange, setNumPages,
}: {
  url: string;
  blobUrl?: string | null;
  useBlob?: boolean;
  onLoaded: () => void;
  onError: () => void;
  zoom: number;
  rotation: number;
  page: number;
  onPageChange: (n: number) => void;
  setNumPages: (n: number) => void;
}) => {
  return (
    <div className="flex items-center justify-center h-full overflow-auto">
      <Document
        file={useBlob && blobUrl ? blobUrl : { url, withCredentials: false }}
        loading={
          <div className="flex items-center justify-center h-[60vh] w-full">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-white text-lg">Cargando PDF…</p>
              <p className="text-gray-400 text-sm mt-2">Preparando vista previa</p>
            </div>
          </div>
        }
        onLoadSuccess={(pdf) => { setNumPages(pdf.numPages); onLoaded(); if (page > pdf.numPages) onPageChange(pdf.numPages); }}
        onLoadError={onError}
        options={{
          cMapUrl: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/cmaps/`,
          cMapPacked: true,
          disableAutoFetch: false,
          disableStream: false,
        }}
      >
        <Page
          pageNumber={page}
          scale={zoom}
          rotate={rotation}
          loading={<div className="h-[60vh] flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
    </div>
  );
};

const FileViewerModal = ({
  file, onClose, type, fileName
}: {
  file: string; onClose: () => void; type: string; fileName?: string;
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // modos: pdfjs -> blob -> iframe
  const [mode, setMode] = useState<'pdfjs' | 'blob' | 'iframe'>(type === 'pdf' ? 'pdfjs' : 'iframe');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  const handleLoaded = () => { setLoading(false); setError(null); };
  const failTo = (next: 'blob' | 'iframe') => { setLoading(true); setError(null); setMode(next); };

  const handlePdfError = async () => {
    try {
      if (mode === 'pdfjs') {
        const r = await fetch(file, { mode: 'cors' });
        if (!r.ok) throw new Error('fetch-failed');
        const b = await r.blob();
        const obj = URL.createObjectURL(b);
        setBlobUrl(obj);
        failTo('blob');
        return;
      }
    } catch { /* continúa */ }
    setBlobUrl(null);
    failTo('iframe');
    setLoading(false);
    setError('No se pudo cargar con PDF.js');
  };

  const handleZoomIn = () => setZoom((v) => Math.min(v + 0.25, 3));
  const handleZoomOut = () => setZoom((v) => Math.max(v - 0.25, 0.5));
  const handleRotate = () => setRotation((v) => (v + 90) % 360);
  const handleReset = () => { setZoom(1); setRotation(0); };

  const header = (
    <div className="sticky top-0 bg-slate-800 p-4 border-b border-slate-700 z-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className={type === 'pdf' ? 'text-red-400' : 'text-gray-400'} size={28} />
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white">Visualizador de Archivos</h3>
            <p className="text-sm text-gray-400 truncate max-w-[42vw]">
              {fileName || decodeURIComponent((file.split('/').pop() || '').split('?')[0])}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {type === 'pdf' && numPages && numPages > 1 && (
            <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1 mr-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-2 hover:bg-slate-600 rounded-lg text-gray-200"
                title="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 text-sm text-white font-medium min-w-[90px] text-center">
                {page} / {numPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(numPages || p + 1, p + 1))}
                className="p-2 hover:bg-slate-600 rounded-lg text-gray-200"
                title="Página siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
            <button onClick={handleZoomOut} className="p-2 hover:bg-slate-600 rounded-lg text-gray-200" title="Alejar"><ZoomOut size={16} /></button>
            <span className="px-2 text-sm text-white font-medium min-w-[60px] text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} className="p-2 hover:bg-slate-600 rounded-lg text-gray-200" title="Acercar"><ZoomIn size={16} /></button>
          </div>
          <button onClick={handleRotate} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-gray-200" title="Rotar"><RotateCw size={16} /></button>
          <button onClick={handleReset} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-gray-200 text-sm font-medium" title="Restablecer">Reset</button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-gray-200" title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}>{isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>
          <button onClick={onClose} className="p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white" title="Cerrar"><X size={20} /></button>
        </div>
      </div>
    </div>
  );

  const footer = (
    <div className="sticky bottom-0 bg-slate-800 p-3 border-t border-slate-700">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          <span>Tipo: {type.toUpperCase()}</span>
          {numPages ? <span> • Páginas: {numPages}</span> : null}
          <span> • Zoom: {Math.round(zoom * 100)}%</span>
          {rotation > 0 && <span> • Rotación: {rotation}°</span>}
          {type === 'pdf' && <span> • Modo: {mode}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.open(file, '_blank')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"><ExternalLink size={14} />Abrir</button>
          <button onClick={() => { const a = document.createElement('a'); a.href = file; a.download = fileName || 'archivo'; a.click(); }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"><Download size={14} />Descargar</button>
        </div>
      </div>
    </div>
  );

  const body = () => {
    if (type === 'pdf') {
      if (mode === 'iframe') {
        return (
          <div className="flex items-center justify-center h-full">
            <iframe
              src={`${file}#toolbar=1&navpanes=0&scrollbar=1`}
              className="border-0 bg-white rounded-lg shadow-lg"
              style={{ width: isFullscreen ? '90vw' : '800px', height: isFullscreen ? '80vh' : '600px' }}
              onLoad={handleLoaded}
              title="PDF (iframe)"
            />
          </div>
        );
      }
      return (
        <PdfViewer
          url={file}
          blobUrl={blobUrl}
          useBlob={mode === 'blob'}
          onLoaded={handleLoaded}
          onError={handlePdfError}
          zoom={zoom}
          rotation={rotation}
          page={page}
          onPageChange={setPage}
          setNumPages={setNumPages}
        />
      );
    }

    // DOC/XLS: visor de Google con acciones rápidas
    return (
      <div className="flex items-center justify-center h-full">
        {loading && (
          <div className="absolute top-1/2 -translate-y-1/2 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-gray-200">Preparando visor…</p>
            <div className="mt-2 flex gap-2 justify-center">
              <a className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm flex items-center gap-1" href={file} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Abrir ahora
              </a>
              <a className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded text-white text-sm flex items-center gap-1" href={file} download>
                <Download size={14} /> Descargar
              </a>
            </div>
          </div>
        )}
        <iframe
          src={`https://docs.google.com/gview?url=${encodeURIComponent(file)}&embedded=true`}
          className="border-0 bg-white rounded-lg shadow-lg"
          style={{ width: isFullscreen ? '90vw' : '800px', height: isFullscreen ? '80vh' : '600px' }}
          onLoad={handleLoaded}
          title="Document Viewer"
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-800 rounded-xl ${isFullscreen ? 'w-full h-full' : 'w-full max-w-4xl max-h-[90vh]'} overflow-hidden`}>
        {header}
        <div className="overflow-auto" style={{ height: 'calc(100% - 120px)' }}>
          {body()}
          {error && mode !== 'iframe' && (
            <div className="p-6 text-center">
              <p className="text-red-400 font-semibold mb-2">Error al cargar</p>
              <div className="flex gap-2 justify-center">
                <a className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm flex items-center gap-1" href={file} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Abrir en pestaña
                </a>
                <a className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded text-white text-sm flex items-center gap-1" href={file} download>
                  <Download size={14} /> Descargar
                </a>
              </div>
            </div>
          )}
        </div>
        {footer}
      </div>
    </div>
  );
};

/* --------------------------
   Detalle + mini-chat
--------------------------- */
const ServicioDetailModal = ({ servicio, usuarios, onClose, handleUpdateField, handleDelete, setFileToView }: any) => {
  if (!servicio) return null;
  const isAsignado = Array.isArray(servicio.personas) && servicio.personas.includes(CURRENT_USER_ID);
  const estadoActual = estados.find(e => e.value === (servicio.estado || 'programado'));

  const [updates, setUpdates] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [msgFiles, setMsgFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'servicios', servicio.id, 'updates'), (snap) => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
      setUpdates(rows);
    });
    return () => unsub();
  }, [servicio.id]);

  const postUpdate = async () => {
    if (!msg.trim() && msgFiles.length === 0) return;
    setSending(true);
    try {
      const attachments: any[] = [];
      for (const f of msgFiles) {
        const sref = ref(storage, `servicios/${servicio.id}/updates/${Date.now()}_${f.name}`);
        const snap = await uploadBytes(sref, f);
        const url = await getDownloadURL(snap.ref);
        attachments.push({ url, name: f.name, type: (f.name.split('.').pop() || '').toLowerCase() });
      }
      await addDoc(collection(db, 'servicios', servicio.id, 'updates'), {
        text: msg.trim(),
        userId: CURRENT_USER_ID,
        userName: CURRENT_USER_NAME,
        timestamp: Date.now(),
        attachments
      });
      setMsg(''); setMsgFiles([]);
    } catch { toast.error('No se pudo enviar la actualización'); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-5xl max-h-[92vh] overflow-hidden">
        <div className="sticky top-0 bg-slate-800 p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${estadoActual?.bgColor} flex items-center justify-center`}>
                <estadoActual.icon className={`w-6 h-6 ${estadoActual?.color}`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{servicio.elemento || 'Elemento sin nombre'}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-sm font-medium ${estadoActual?.color}`}>{estadoActual?.label}</span>
                  {isAsignado && (
                    <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-1 rounded-full">
                      <Bell className="text-emerald-400 w-3 h-3" />
                      <span className="text-emerald-400 text-xs font-medium">Asignado a ti</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-2 hover:bg-slate-700 rounded-lg transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-y-auto max-h-[calc(92vh-160px)]">
          {/* Info */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" /> Información del Servicio
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Estado</label>
                  <select
                    value={servicio.estado || 'programado'}
                    className={`w-full px-4 py-3 rounded-lg border ${estadoActual?.border} ${estadoActual?.bgColor} ${estadoActual?.color} font-medium transition-colors`}
                    onChange={e => handleUpdateField(servicio.id, 'estado', e.target.value)}
                  >
                    {estados.map(est => <option key={est.value} value={est.value}>{est.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Fecha programada</label>
                  <input
                    type="date"
                    value={servicio.fecha || ''}
                    onChange={(e) => handleUpdateField(servicio.id, 'fecha', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {servicio.descripcion && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Descripción</label>
                    <div className="bg-slate-700/50 p-4 rounded-lg">
                      <p className="text-gray-300">{servicio.descripcion}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Personas */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-400" /> Personas Asignadas ({servicio.personas?.length || 0})
              </h3>
              <div className="space-y-3">
                {(servicio.personas?.length ? servicio.personas : []).map((pid: string) => {
                  const user = usuarios.find((u: any) => u.id === pid);
                  if (!user) return null;
                  const isCurrentUser = pid === CURRENT_USER_ID;
                  return (
                    <div key={pid} className={`flex items-center gap-3 p-3 rounded-lg ${isCurrentUser ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-700/30'}`}>
                      <Bubble nombre={user.nombre} short={user.short || user.nombre.split(' ').map((x: string) => x[0]).join('')} />
                      <div className="flex-1">
                        <p className="font-medium text-white">{user.nombre}</p>
                        <p className="text-sm text-gray-400">{user.email || 'Sin email'}</p>
                      </div>
                      {isCurrentUser && <div className="flex items-center gap-1 text-emerald-400 text-sm font-medium"><CheckCircle2 className="w-4 h-4" />Tú</div>}
                    </div>
                  );
                })}
                {(!servicio.personas || servicio.personas.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay personas asignadas</p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/70 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-400">
              <div><span className="font-medium">Creado por:</span><p className="text-white mt-1">{servicio.creadoPorNombre || 'Usuario desconocido'}</p></div>
              <div><span className="font-medium">Creación:</span><p className="text-white mt-1">{servicio.timestamp ? new Date(servicio.timestamp).toLocaleString('es-ES') : 'No disponible'}</p></div>
              <div><span className="font-medium">ID:</span><p className="text-white mt-1 font-mono text-xs">{servicio.id}</p></div>
            </div>
          </div>

          {/* Docs + Mini-chat */}
          <div className="space-y-6">
            {/* Documentos */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" /> Documentos Adjuntos ({servicio.documentos?.length || 0})
              </h3>
              <div className="space-y-3">
                {servicio.documentos?.length > 0 ? (
                  servicio.documentos.map((docUrl: string, index: number) => {
                    const fileName = decodeURIComponent((docUrl.split('/').pop() || '').split('?')[0]) || `Documento ${index + 1}`;
                    const fileExt = (docUrl.split('?')[0].split('.').pop() || '').toLowerCase();
                    const getIcon = () => {
                      const map: any = { pdf: 'text-red-500', doc: 'text-blue-500', docx: 'text-blue-500', xls: 'text-green-500', xlsx: 'text-green-500' };
                      return <FileText className={map[fileExt] || 'text-gray-500'} size={20} />;
                    };
                    return (
                      <div key={index} className="flex items-center justify-between bg-slate-700/30 p-4 rounded-lg hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          {getIcon()}
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">{fileName}</p>
                            <p className="text-sm text-gray-400 uppercase">{fileExt} • Documento</p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => setFileToView({ url: docUrl, type: fileExt, fileName })} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2" title="Vista previa">
                            <Eye size={16} /><span className="hidden sm:inline text-sm">Ver</span>
                          </button>
                          <button onClick={() => { const a = document.createElement('a'); a.href = docUrl; a.download = fileName; a.click(); }} className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-2" title="Descargar">
                            <Download size={16} /><span className="hidden sm:inline text-sm">Descargar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">No hay documentos adjuntos</p>
                    <p className="text-sm">Los archivos aparecerán aquí cuando se agreguen</p>
                  </div>
                )}
              </div>
            </div>

            {/* Mini-chat */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-300" />
                <h4 className="font-semibold">Actualizaciones</h4>
              </div>
              <div className="max-h-[320px] overflow-y-auto px-4 py-3 space-y-4">
                {updates.length === 0 && <div className="text-center text-gray-400 py-8">Aún no hay actualizaciones</div>}
                {updates.map((u: any) => (
                  <div key={u.id} className="flex gap-3">
                    <Bubble nombre={u.userName || 'Usuario'} short={(u.userName || 'U').split(' ').map((x: string) => x[0]).join('').toUpperCase()} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{u.userName || 'Usuario'}</span>
                        <span className="text-xs text-gray-400">• {u.timestamp ? new Date(u.timestamp).toLocaleString('es-ES') : ''}</span>
                      </div>
                      {u.text && <p className="text-gray-200 mt-1 whitespace-pre-wrap">{u.text}</p>}
                      {Array.isArray(u.attachments) && u.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {u.attachments.map((a: any, i: number) => (
                            <button key={i} onClick={() => setFileToView({ url: a.url, type: a.type, fileName: a.name })} className="text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center gap-1" title="Ver adjunto">
                              <FileText size={14} /> {a.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-slate-700/60">
                <div className="flex items-start gap-3">
                  <Bubble nombre={CURRENT_USER_NAME} short={(CURRENT_USER_NAME || 'Yo').split(' ').map((x: string) => x[0]).join('').toUpperCase()} />
                  <div className="flex-1">
                    <textarea
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                      placeholder="Escribe una actualización y menciona a otros con @"
                      rows={2}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-sm cursor-pointer">
                          <FileUp size={16} />
                          Adjuntar
                          <input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => { if (e.target.files) setMsgFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {msgFiles.map((f, i) => (<span key={i} className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-white">{f.name}</span>))}
                        </div>
                      </div>
                      <button onClick={postUpdate} disabled={sending} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium">{sending ? 'Enviando…' : 'Publicar'}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-800 p-6 border-t border-slate-700">
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              <button onClick={() => handleDelete([servicio.id])} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                <Trash2 size={16} /> Eliminar Servicio
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors">Cerrar</button>
              <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                <Edit3 size={16} /> Editar Servicio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Bubble = ({ nombre, color, short }: { nombre: string; color?: string; short?: string }) => (
  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs
    ${color ? color : "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500"}
    text-white shadow-lg border border-white/20 mr-2 hover:scale-110 transition-transform duration-200`}
    title={nombre}
    style={{ minWidth: 36 }}>
    {short || nombre.split(' ').map((x) => x[0]).join('').toUpperCase()}
  </div>
);

/* --------------------------
   Modal: nuevo servicio
--------------------------- */
const ServicioModal = ({ isOpen, onClose, onSave, usuarios }: { isOpen: boolean, onClose: () => void, onSave: (servicio: any) => void, usuarios: any[] }) => {
  const [servicio, setServicio] = useState({ elemento: '', personas: [] as string[], estado: 'programado' as string, fecha: new Date().toISOString().split('T')[0], descripcion: '', documentos: [] as string[] });
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string, type: string, name: string, revoke?: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) { setServicio({ elemento: '', personas: [], estado: 'programado', fecha: new Date().toISOString().split('T')[0], descripcion: '', documentos: [] }); setFiles([]); setPreview(null); }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const valid = Array.from(e.target.files).filter(file =>
      ['application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)
    );
    setFiles(prev => [...prev, ...valid]);
  };
  const removeFile = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  const uploadFiles = async () => {
    const urls: string[] = [];
    setUploading(true);
    try {
      for (const file of files) {
        const storageRef = ref(storage, `documentos/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        urls.push(url);
      }
      return urls;
    } catch { toast.error('Error al subir archivos'); return []; }
    finally { setUploading(false); }
  };

  const handleViewLocal = async (file: File) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') {
      const url = URL.createObjectURL(file);
      setPreview({ url, type: 'pdf', name: file.name, revoke: true });
      return;
    }
    try {
      setUploading(true);
      const sref = ref(storage, `previews/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(sref, file);
      const url = await getDownloadURL(snap.ref);
      setPreview({ url, type: ext, name: file.name });
    } catch { toast.error('No se pudo generar la vista previa'); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!servicio.elemento.trim()) { toast.error('El campo Elemento es requerido'); return; }
    try {
      const uploadedUrls = await uploadFiles();
      const servicioCompleto = {
        ...servicio,
        documentos: [...servicio.documentos, ...uploadedUrls],
        timestamp: Date.now(),
        creadoPor: CURRENT_USER_ID,
        creadoPorNombre: CURRENT_USER_NAME
      };
      await onSave(servicioCompleto);
      toast.success('Servicio creado exitosamente');
      onClose();
    } catch { toast.error('Error al crear el servicio'); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700">
          <h3 className="text-xl font-bold">Nuevo Servicio</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-white">Elemento *</label>
            <input type="text" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={servicio.elemento} onChange={e => setServicio({ ...servicio, elemento: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-white">Personas asignadas</label>
            <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" multiple value={servicio.personas} onChange={e => setServicio({ ...servicio, personas: Array.from(e.target.selectedOptions, o => o.value) })}>
              {usuarios.map((u: any) => (<option key={u.id} value={u.id}>{u.nombre}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Estado</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" value={servicio.estado} onChange={e => setServicio({ ...servicio, estado: e.target.value })}>
                {estados.map(est => (<option key={est.value} value={est.value}>{est.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Fecha</label>
              <input type="date" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" value={servicio.fecha} onChange={e => setServicio({ ...servicio, fecha: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-white">Descripción</label>
            <textarea className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" value={servicio.descripcion} onChange={e => setServicio({ ...servicio, descripcion: e.target.value })} rows={3} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-white">Documentos (PDF, Excel, Word)</label>
            <input type="file" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} />
            <div className="mt-2 space-y-2">
              {files.map((file, idx) => (<FilePreview key={idx} file={file} onRemove={() => removeFile(idx)} onView={() => handleViewLocal(file)} />))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors">Cancelar</button>
            <button type="submit" disabled={uploading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium flex items-center gap-2 disabled:opacity-70 transition-colors">
              {uploading ? (<><Loader2 className="animate-spin" size={18} />Guardando...</>) : 'Guardar Servicio'}
            </button>
          </div>
        </form>
      </div>

      {preview && (
        <FileViewerModal file={preview.url} type={preview.type} fileName={preview.name} onClose={() => { if (preview.revoke) URL.revokeObjectURL(preview.url); setPreview(null); }} />
      )}
    </div>
  );
};

/* --------------------------
   Tarjeta de servicio
--------------------------- */
const ServicioCard = ({ s, group, usuarios, handleUpdateField, setFileToView }: any) => {
  const isAsignado = Array.isArray(s.personas) && s.personas.includes(CURRENT_USER_ID);
  return (
    <div className={`rounded-lg p-3 mb-2 border backdrop-blur-sm transition-all duration-200 hover:shadow-lg cursor-pointer
      ${isAsignado ? 'border-emerald-400/30 bg-emerald-500/5 hover:bg-emerald-500/10'
        : 'border-slate-700/30 bg-slate-800/20 hover:bg-slate-800/40'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg ${group.bgColor} flex items-center justify-center flex-shrink-0`}>
            <group.icon className={`w-4 h-4 ${group.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white truncate">{s.elemento || 'Elemento sin nombre'}</h3>
              {isAsignado && <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-full flex-shrink-0"><Bell className="text-emerald-400 w-3 h-3" /><span className="text-emerald-400 text-xs font-medium">Asignado</span></div>}
            </div>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-xs text-gray-400">{s.fecha || 'Sin fecha'}</span>
              {s.personas?.length > 0 && (<div className="flex items-center gap-1"><User className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-400">{s.personas.length} persona{s.personas.length !== 1 ? 's' : ''}</span></div>)}
              {s.documentos?.length > 0 && (<div className="flex items-center gap-1"><FileText className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-400">{s.documentos.length} archivo{s.documentos.length !== 1 ? 's' : ''}</span></div>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={s.estado || 'programado'}
            className={`text-xs px-2 py-1 rounded-lg border ${group.border} ${group.bgColor} ${group.color} font-medium`}
            onChange={e => handleUpdateField(s.id, 'estado', e.target.value)}
            onClick={e => e.stopPropagation()}
          >
            {estados.map((est: any) => <option key={est.value} value={est.value}>{est.label}</option>)}
          </select>
          <button className="p-1.5 hover:bg-slate-700 rounded-lg text-gray-400 hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); setFileToView({ servicio: s, type: 'detail' }); }} title="Ver detalles">
            <Eye size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

/* --------------------------
   Pantalla principal
--------------------------- */
export const FridayServiciosScreen: React.FC<{ onBack?: () => void }> = () => {
  const { currentScreen, navigateTo } = useNavigation();
  const [servicios, setServicios] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [notifiedServicios, setNotifiedServicios] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`notifiedServicios:${CURRENT_USER_ID}`) || '[]'); } catch { return []; } });
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileToView, setFileToView] = useState<{ url?: string, type: string, servicio?: any, fileName?: string } | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const unsubServicios = onSnapshot(collection(db, 'servicios'), (snap) => {
      const serviciosData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setServicios(serviciosData);
    });
    const unsubUsuarios = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const usuariosData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsuarios(usuariosData);
    });
    return () => { unsubServicios(); unsubUsuarios(); };
  }, []);

  useEffect(() => {
    const key = `notifiedServicios:${CURRENT_USER_ID}`;
    const asignados = servicios.filter(s => Array.isArray(s.personas) && s.personas.includes(CURRENT_USER_ID));
    const prevSet = new Set<string>(notifiedServicios);
    const nuevos = asignados.filter((s:any) => !prevSet.has(s.id));
    if (nuevos.length > 0) {
      setShowPushBanner(true);
      setNotifiedServicios((prev) => {
        const merged = Array.from(new Set([...prev, ...asignados.map((x:any) => x.id)]));
        try { localStorage.setItem(key, JSON.stringify(merged)); } catch {}
        return merged;
      });
      if ('Notification' in window) {
        const notify = () => {
          const body = nuevos.length === 1 ? `Se te asignó: ${nuevos[0].elemento || 'Un servicio'}` : `Se te asignaron ${nuevos.length} servicios`;
          try { new Notification('Nuevo servicio asignado', { body, icon: '/bell.png' }); } catch {}
        };
        if (Notification.permission === 'granted') notify();
        else if (Notification.permission !== 'denied') { Notification.requestPermission().then(p => { if (p === 'granted') notify(); }); }
      }
    } else {
      try { localStorage.setItem(key, JSON.stringify(asignados.map((x:any) => x.id))); } catch {}
    }
    if (showPushBanner) {
      const t = setTimeout(() => setShowPushBanner(false), 6000);
      return () => clearTimeout(t);
    }
  }, [servicios, notifiedServicios, showPushBanner]);

  const handleSaveServicio = async (nuevoServicio: any) => {
    try { await addDoc(collection(db, 'servicios'), nuevoServicio); toast.success('Servicio creado'); }
    catch { toast.error('Error al crear el servicio'); }
  };

  const handleUpdateField = async (servicioId: string, field: string, value: any) => {
    try { await updateDoc(doc(db, 'servicios', servicioId), { [field]: value }); toast.success(`Campo '${field}' actualizado`); }
    catch { toast.error(`Error al actualizar '${field}'`); }
  };

  const handleDelete = async (ids?: string[]) => {
    const idsToDelete = ids || selectedRows;
    if (!window.confirm(`¿Seguro que quieres eliminar ${idsToDelete.length > 1 ? 'estos servicios' : 'este servicio'}?`)) return;
    try { await Promise.all(idsToDelete.map(id => deleteDoc(doc(db, 'servicios', id)))); setSelectedRows([]); toast.success(idsToDelete.length > 1 ? 'Servicios eliminados' : 'Servicio eliminado'); }
    catch { toast.error('Error al eliminar'); }
  };

  const handleDuplicate = async () => {
    try {
      const itemsToDuplicate = servicios.filter(s => selectedRows.includes(s.id));
      for (const s of itemsToDuplicate) { const { id, ...copy } = s; await addDoc(collection(db, 'servicios'), { ...copy, elemento: (copy.elemento || '') + ' (Copia)' }); }
      setSelectedRows([]); toast.success('Servicios duplicados');
    } catch { toast.error('Error al duplicar'); }
  };

  const handleExport = () => {
    const items = servicios.filter(s => selectedRows.includes(s.id));
    if (items.length === 0) return;
    const headers = ['Elemento', 'Personas', 'Estado', 'Fecha', 'Documentos'];
    const rows = items.map(s => [
      s.elemento,
      (s.personas || []).map((pid: string) => { const u = usuarios.find((u) => u.id === pid); return u ? u.nombre : pid; }).join(', '),
      estados.find(e => e.value === s.estado)?.label || s.estado,
      s.fecha || '',
      (s.documentos || []).join('; ')
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'servicios.csv'; a.click();
    setSelectedRows([]); toast.success('Exportación completada');
  };

  const handleDragStart = (e: React.DragEvent, servicioId: string) => { e.dataTransfer.setData('servicioId', servicioId); setIsDragging(true); };
  const handleDragEnd = () => setIsDragging(false);
  const handleDrop = async (e: React.DragEvent, nuevoEstado: string) => {
    e.preventDefault();
    const servicioId = e.dataTransfer.getData('servicioId');
    try { await updateDoc(doc(db, 'servicios', servicioId), { estado: nuevoEstado }); toast.success('Estado actualizado'); }
    catch { toast.error('Error al actualizar el estado'); }
    setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const filteredServicios = servicios.filter(s =>
    (s.elemento || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.personas || []).some((pid: string) => { const user = usuarios.find(u => u.id === pid); return (user?.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()); })
  );
  const grouped = estados.map((est) => ({ ...est, servicios: filteredServicios.filter((s) => (s.estado || 'programado') === est.value) }));

  return (
    <div className="flex bg-neutral-950 min-h-screen font-sans overflow-x-clip">
      <div className="hidden lg:block"><SidebarFriday active={currentScreen} onNavigate={navigateTo} /></div>
      <div className={`${isMobile ? 'w-full' : 'flex-1 ml-[235px]'} min-h-screen relative`}>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans pb-24">
          {showPushBanner && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl px-8 py-4 flex items-center gap-4 shadow-2xl z-50 backdrop-blur-sm border border-emerald-400/30">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Bell className="w-6 h-6 animate-pulse" /></div>
              <div><p className="font-bold text-lg">¡Nuevo servicio asignado!</p><p className="text-emerald-100 text-sm">Revisa tus servicios pendientes</p></div>
            </div>
          )}

          {/* Header */}
          <div className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50">
            <div className={`flex items-center justify-between ${isMobile ? 'px-3 py-3' : 'px-4 lg:px-8 py-4'}`}>
              <div className="flex items-center gap-4">
                <button className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-600 transition-all duration-200 hover:scale-105" onClick={() => navigateTo('mainmenu')} title="Regresar">
                  <ArrowLeft size={24} className="text-white" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><Zap className="w-6 h-6 text-white" /></div>
                  <div><h1 className="text-xl lg:text-2xl font-bold tracking-tight">Servicios de Calibración</h1><p className="text-sm text-gray-400">Gestiona y organiza tus servicios</p></div>
                </div>
              </div>
              {!isMobile && (
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input type="text" placeholder="Buscar servicios..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 bg-slate-800/80 border border-slate-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all duration-200 w-64" />
                  </div>
                  <button className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-xl transition-all duration-200"><Filter className="w-5 h-5 text-gray-400" /></button>
                </div>
              )}
            </div>
            {isMobile && (
              <div className="px-2 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="text" placeholder="Buscar servicios..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-800/80 border border-slate-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all duration-200" />
                </div>
              </div>
            )}
          </div>

          {/* Resumen */}
          <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-5'} gap-4 mb-6 px-2 lg:px-8 pt-4`}>
            {estados.map((estado) => {
              const count = (grouped.find(g => g.value === estado.value)?.servicios.length) || 0;
              const Icon = estado.icon;
              return (
                <div key={estado.value} className={`rounded-xl p-4 border backdrop-blur-sm ${estado.border} bg-gradient-to-br ${estado.gradient} hover:scale-105 transition-transform duration-200 cursor-pointer`} onClick={() => setSearchTerm(estado.label)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${estado.bgColor} flex items-center justify-center`}><Icon className={`w-5 h-5 ${estado.color}`} /></div>
                    <div><p className="text-2xl font-bold text-white">{count}</p><p className={`text-xs ${estado.color} font-medium`}>{estado.label}</p></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal crear */}
          <ServicioModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleSaveServicio} usuarios={usuarios} />

          {/* Columnas */}
          <div className={`${isMobile ? 'flex flex-col gap-6' : 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6'} px-2 lg:px-8`}>
            {grouped.map((group) => (
              <div key={group.value} className={`rounded-2xl shadow-xl border backdrop-blur-sm ${group.border} bg-gradient-to-br ${group.gradient} transition-all duration-300 ${isDragging ? 'border-dashed border-2 border-white/50' : ''}`} onDrop={(e) => handleDrop(e, group.value)} onDragOver={handleDragOver} onDragLeave={handleDragEnd}>
                <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl ${group.bgColor} flex items-center justify-center`}><group.icon className={`w-6 h-6 ${group.color}`} /></div>
                    <div><h2 className={`font-bold text-lg ${group.color}`}>{group.label}</h2><p className="text-sm text-gray-400">{group.servicios.length} servicios</p></div>
                  </div>
                  <div className="flex items-center gap-2"><span className={`text-2xl font-bold ${group.color}`}>{group.servicios.length}</span></div>
                </div>
                <div className="p-4 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                  {group.servicios.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4"><group.icon className="w-8 h-8 text-gray-500" /></div>
                      <p className="text-gray-500 font-medium">No hay servicios {group.label.toLowerCase()}</p>
                    </div>
                  ) : (
                    group.servicios.map((s) => (
                      <div key={s.id} draggable onDragStart={(e) => handleDragStart(e, s.id)} onDragEnd={handleDragEnd}>
                        <ServicioCard s={s} group={group} usuarios={usuarios} handleUpdateField={handleUpdateField} setFileToView={setFileToView} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* FAB */}
          <button onClick={() => setShowModal(true)} className="fixed right-6 bottom-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white p-4 rounded-full shadow-2xl flex items-center justify-center z-40 transition-all duration-200 hover:scale-110 group">
            <Plus size={24} className="group-hover:rotate-90 transition-all duration-300" />
            <span className="sr-only">Agregar servicio</span>
            <span className="absolute -bottom-10 text-xs font-medium bg-blue-700 text-white px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap shadow-lg">Nuevo Servicio</span>
          </button>

          {/* Barra de acciones por selección */}
          {selectedRows.length > 0 && (
            <div className="fixed left-0 bottom-0 w-full z-50 flex justify-center px-2">
              <div className="flex items-center rounded-2xl shadow-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl border border-slate-700/50 px-2 lg:px-6 py-3 space-x-4 max-w-5xl w-full mx-auto mb-2 overflow-x-auto">
                <div className="flex items-center gap-3 font-semibold text-lg text-cyan-300">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><Check size={22} className="text-white" /></div>
                  <span className="hidden sm:inline">{selectedRows.length === 1 ? "1 Elemento seleccionado" : `${selectedRows.length} Elementos seleccionados`}</span>
                  <span className="sm:hidden">{selectedRows.length}</span>
                </div>
                <div className="flex-1 flex items-center gap-3 pl-4">
                  <button onClick={handleDuplicate} className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-white/10 text-gray-300 hover:text-white"><Repeat size={18} /><span className="hidden lg:inline text-sm">Duplicar</span></button>
                  <button onClick={handleExport} className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-white/10 text-gray-300 hover:text-white"><Download size={18} /><span className="hidden lg:inline text-sm">Exportar</span></button>
                  <button onClick={() => handleDelete()} className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-red-500/20 text-red-400 hover:text-red-300"><Trash2 size={18} /><span className="hidden lg:inline text-sm">Eliminar</span></button>
                </div>
                <button className="ml-3 p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all duration-200" onClick={() => setSelectedRows([])}><XCircle size={24} /></button>
              </div>
            </div>
          )}

          {/* Modales */}
          {fileToView && fileToView.type === 'detail' && (
            <ServicioDetailModal
              servicio={fileToView.servicio}
              usuarios={usuarios}
              onClose={() => setFileToView(null)}
              handleUpdateField={handleUpdateField}
              handleDelete={handleDelete}
              setFileToView={setFileToView}
            />
          )}

          {fileToView && fileToView.url && fileToView.type !== 'detail' && (
            <FileViewerModal file={fileToView.url} onClose={() => setFileToView(null)} type={fileToView.type} fileName={fileToView.fileName} />
          )}

          <style>{`
            @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            .animate-fade-in-up { animation: fade-in-up 0.3s ease-out; }
            .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
            .scrollbar-thin::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.5); border-radius: 3px; }
            .scrollbar-thin::-webkit-scrollbar-track { background-color: transparent; }
          `}</style>
        </div>
      </div>
    </div>
  );
};

export default FridayServiciosScreen;
