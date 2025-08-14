import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  getStorage,
  ref,
  listAll,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { Folder, FileText, ArrowLeft, Download, Eye, Search, Plus, ChevronRight, X, Upload, RefreshCw, Grid, List } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// PDF.js worker (usa CDN para máxima compatibilidad)
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface FolderItem {
  name: string;
  ref: any;
  count?: number;
}

interface FileItem {
  name: string;
  url: string;
}

const NormasScreen: React.FC = () => {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFolder, setUploadFolder] = useState<string>('');
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false);
  const [isFullViewerOpen, setIsFullViewerOpen] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Fuente del PDF cargada por fetch -> Blob | null
  const [pdfSrc, setPdfSrc] = useState<Blob | null>(null);
  const [isFetchingPdf, setIsFetchingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewerWidth, setViewerWidth] = useState<number>(800);

  // Resize handler para que el PDF se adapte al contenedor
  useEffect(() => {
    const handler = () => {
      if (viewerContainerRef.current) {
        const w = viewerContainerRef.current.getBoundingClientRect().width;
        setViewerWidth(Math.max(320, Math.floor(w)));
      }
    };
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    fetchFolders();
  }, []);

  // Carga carpetas y cuenta de archivos
  const fetchFolders = async () => {
    setIsLoadingFolders(true);
    const rootRef = ref(getStorage(), 'normas/');
    try {
      const res = await listAll(rootRef);
      const folderList: FolderItem[] = await Promise.all(
        res.prefixes.map(async (prefix) => {
          const filesInFolder = await listAll(prefix);
          return { name: prefix.name, ref: prefix, count: filesInFolder.items.length };
        })
      );
      // Orden alfabético
      folderList.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      setFolders(folderList);
    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setIsLoadingFolders(false);
    }
  };

  // Crear carpeta (subiendo un marcador .keep)
  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folderRef = ref(getStorage(), `normas/${name}/`);
    try {
      await uploadBytes(ref(folderRef, '.keep'), new Blob());
      setNewFolderName('');
      await fetchFolders();
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  // Carga archivos de carpeta
  const fetchFiles = async (folder: FolderItem) => {
    setSelectedFolder(folder);
    setFiles([]);
    setFilteredFiles([]);
    setSearch('');
    setSelectedFile(null);
    setPdfSrc(null);
    setPdfError(null);
    setIsLoadingFiles(true);
    try {
      const res = await listAll(folder.ref);
      const filePromises = res.items.map(async (item) => {
        const url = await getDownloadURL(item);
        return { name: item.name, url } as FileItem;
      });
      const list = await Promise.all(filePromises);
      // Orden por nombre
      list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      setFiles(list);
      setFilteredFiles(list);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Subir PDFs (múltiples)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !uploadFolder) return;
    const chosen = Array.from(e.target.files);
    for (const file of chosen) {
      const fileRef = ref(getStorage(), `normas/${uploadFolder}/${file.name}`);
      await uploadBytes(fileRef, file);
    }
    // Si estás en esa carpeta, recarga; si no, solo refresca lista de carpetas
    if (selectedFolder?.name === uploadFolder) {
      await fetchFiles(folders.find((f) => f.name === uploadFolder)!);
    }
    await fetchFolders();
    // Limpia input
    e.currentTarget.value = '';
  };

  // Búsqueda por nombre de archivo
  useEffect(() => {
    if (!search) {
      setFilteredFiles(files);
      return;
    }
    const q = search.toLowerCase();
    setFilteredFiles(files.filter((f) => f.name.toLowerCase().includes(q)));
  }, [search, files]);

  // --- Carga segura del PDF a través de fetch -> Blob ---
  const loadPdfBlob = async (file: FileItem) => {
    setIsFetchingPdf(true);
    setPdfError(null);
    try {
      const res = await fetch(file.url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // Verifica tipo
      if (blob.type && !blob.type.includes('pdf')) {
        // Algunos buckets no devuelven type, pero si lo devuelven incorrecto, forzamos
        // Aun así pdf.js puede leer Blob binario
        console.warn('Content-Type no es PDF, intentando igualmente...');
      }
      setPdfSrc(blob);
    } catch (err: any) {
      console.error('loadPdfBlob error:', err);
      setPdfError('No se pudo cargar el PDF (CORS/permiso).');
      setPdfSrc(null);
    } finally {
      setIsFetchingPdf(false);
    }
  };

  const openQuickPreview = (file: FileItem) => {
    setSelectedFile(file);
    setPageNumber(1);
    setNumPages(null);
    setIsQuickPreviewOpen(true);
    loadPdfBlob(file);
  };

  const openFullViewer = (file: FileItem) => {
    setSelectedFile(file);
    setPageNumber(1);
    setNumPages(null);
    setIsFullViewerOpen(true);
    loadPdfBlob(file);
  };

  const closeModals = () => {
    setIsQuickPreviewOpen(false);
    setIsFullViewerOpen(false);
    setPdfSrc(null);
    setPdfError(null);
  };

  const onDocumentLoadSuccess = ({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setPageNumber(1);
  };

  const onDocumentLoadError = (err: any) => {
    console.error('react-pdf error:', err);
    setPdfError('Failed to load PDF file.');
  };

  const downloadFile = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  };

  // Eliminar archivo (opcional)
  const deleteFile = async (file: FileItem) => {
    if (!selectedFolder) return;
    if (!confirm(`¿Eliminar "${file.name}"?`)) return;
    try {
      const fileRef = ref(getStorage(), `normas/${selectedFolder.name}/${file.name}`);
      await deleteObject(fileRef);
      await fetchFiles(selectedFolder);
      await fetchFolders();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('No se pudo eliminar el archivo. Revisa permisos.');
    }
  };

  return (
    <div className="flex h-full bg-gray-100">
      {/* Sidebar */}
      <aside className="w-80 bg-white p-4 shadow-lg overflow-y-auto border-r">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">📚 Normas del Laboratorio</h2>
          <button
            onClick={fetchFolders}
            title="Refrescar"
            className="p-2 rounded hover:bg-gray-100"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Crear carpeta */}
        <div className="mb-6">
          <label className="text-sm text-gray-700">Nueva carpeta</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              placeholder="Nombre..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="flex-1 p-2 border rounded"
            />
            <button
              onClick={createFolder}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
            >
              <Plus size={16} /> Crear
            </button>
          </div>
        </div>

        {/* Subir PDFs */}
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-1">Subir PDF(s)</label>
          <select
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          >
            <option value="">Selecciona carpeta...</option>
            {folders.map((folder) => (
              <option key={folder.name} value={folder.name}>
                {folder.name}
              </option>
            ))}
          </select>
          <label className={`w-full flex items-center gap-2 justify-center p-3 border-2 border-dashed rounded cursor-pointer ${uploadFolder ? 'hover:bg-gray-50' : 'opacity-60 cursor-not-allowed'}`}>
            <Upload size={18} />
            <span>Elegir archivo(s) PDF</span>
            <input type="file" accept="application/pdf" multiple className="hidden" disabled={!uploadFolder} onChange={handleFileUpload} />
          </label>
        </div>

        {/* Lista de carpetas */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Carpetas</p>
          {isLoadingFolders && <p className="text-sm text-gray-500">Cargando...</p>}
          <ul>
            {folders.map((folder) => (
              <li key={folder.name} className="mb-1">
                <button
                  onClick={() => fetchFiles(folder)}
                  className={`w-full flex items-center justify-between p-2 rounded hover:bg-blue-50 transition ${
                    selectedFolder?.name === folder.name ? 'bg-blue-100 font-semibold' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Folder size={18} />
                    {folder.name}
                  </div>
                  <span className="text-xs text-gray-500">{folder.count ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 overflow-auto">
        {/* Breadcrumb / encabezado */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-semibold">Normas</span>
            <ChevronRight size={16} />
            <span className="truncate max-w-[40vw]">
              {selectedFolder ? selectedFolder.name : 'Selecciona una carpeta'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar archivo..."
                className="pl-8 pr-3 py-2 border rounded w-64"
              />
            </div>
            <button
              onClick={() => setLayout('grid')}
              className={`p-2 rounded ${layout === 'grid' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
              title="Vista de cuadrícula"
            >
              <Grid size={18} />
            </button>
            <button
              onClick={() => setLayout('list')}
              className={`p-2 rounded ${layout === 'list' ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
              title="Vista de lista"
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {/* Contenido */}
        {!selectedFolder && (
          <div className="text-gray-500">Selecciona una carpeta para ver sus normas.</div>
        )}

        {selectedFolder && (
          <>
            {isLoadingFiles ? (
              <div className="text-gray-500">Cargando archivos...</div>
            ) : filteredFiles.length === 0 ? (
              <div className="text-gray-500">No hay archivos en esta carpeta.</div>
            ) : layout === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredFiles.map((file) => (
                  <div
                    key={file.name}
                    className="bg-white rounded shadow group relative hover:shadow-lg transition cursor-pointer p-3"
                  >
                    <div className="flex flex-col items-center" onClick={() => openFullViewer(file)}>
                      <FileText size={44} className="text-blue-500" />
                      <p className="text-sm font-medium truncate mt-2 text-center w-full" title={file.name}>
                        {file.name}
                      </p>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition flex gap-2">
                      <button
                        onClick={() => openQuickPreview(file)}
                        className="p-1.5 bg-gray-200 rounded hover:bg-gray-300"
                        title="Vista rápida"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => downloadFile(file.url, file.name)}
                        className="p-1.5 bg-gray-200 rounded hover:bg-gray-300"
                        title="Descargar"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                    <div className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => deleteFile(file)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded shadow">
                <div className="grid grid-cols-12 px-4 py-2 text-xs text-gray-500 border-b">
                  <div className="col-span-7">Nombre</div>
                  <div className="col-span-5 text-right pr-1">Acciones</div>
                </div>
                <ul>
                  {filteredFiles.map((file) => (
                    <li key={file.name} className="grid grid-cols-12 items-center px-4 py-3 border-b last:border-b-0 hover:bg-gray-50">
                      <div className="col-span-7 flex items-center gap-2 truncate">
                        <FileText size={18} className="text-blue-500" />
                        <button onClick={() => openFullViewer(file)} className="truncate text-left hover:underline" title={file.name}>
                          {file.name}
                        </button>
                      </div>
                      <div className="col-span-5 flex justify-end gap-2">
                        <button onClick={() => openQuickPreview(file)} className="px-2 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">
                          Vista rápida
                        </button>
                        <button onClick={() => downloadFile(file.url, file.name)} className="px-2 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">
                          Descargar
                        </button>
                        <button onClick={() => deleteFile(file)} className="px-2 py-1 text-sm text-red-700 bg-red-100 rounded hover:bg-red-200">
                          Eliminar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>

      {/* QUICK PREVIEW MODAL */}
      {isQuickPreviewOpen && selectedFile && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={closeModals}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl relative" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-3 right-3 p-2 rounded hover:bg-gray-100" onClick={closeModals}>
              <X size={18} />
            </button>
            <div className="px-5 pt-5 pb-3 border-b">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText size={16} className="text-blue-500" />
                <span className="truncate" title={selectedFile.name}>{selectedFile.name}</span>
              </div>
            </div>
            <div className="p-5" ref={viewerContainerRef}>
              {isFetchingPdf && <div className="text-gray-500">Cargando vista previa...</div>}
              {pdfError && <div className="text-red-600 text-sm">{pdfError}</div>}
              {pdfSrc && (
                <Document file={pdfSrc} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError} loading={<div className="text-gray-500">Cargando...</div>}>
                  <Page pageNumber={1} width={viewerWidth} renderAnnotationLayer={false} renderTextLayer={false} />
                </Document>
              )}
            </div>
            <div className="px-5 pb-5 flex justify-end gap-2">
              <button className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300" onClick={() => selectedFile && downloadFile(selectedFile.url, selectedFile.name)}>
                <Download size={16} className="inline mr-1" /> Descargar
              </button>
              <button className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onClick={() => { setIsQuickPreviewOpen(false); setIsFullViewerOpen(true); }}>
                Abrir completo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL VIEWER MODAL */}
      {isFullViewerOpen && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
          <div className="bg-white p-3 flex items-center gap-2 shadow">
            <button className="p-2 rounded hover:bg-gray-100" onClick={closeModals} title="Cerrar">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 truncate">{selectedFile.name}</div>
            <button className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300" onClick={() => selectedFile && downloadFile(selectedFile.url, selectedFile.name)}>
              <Download size={16} className="inline mr-1" /> Descargar
            </button>
            <a
              className="ml-2 px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
              href={selectedFile.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir en pestaña
            </a>
          </div>
          <div className="flex-1 overflow-auto p-4" ref={viewerContainerRef}>
            <div className="max-w-5xl mx-auto">
              {isFetchingPdf && <div className="text-gray-100">Cargando documento...</div>}
              {pdfError && <div className="text-red-200 text-sm">{pdfError}</div>}
              {pdfSrc && (
                <Document
                  file={pdfSrc}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={<div className="text-gray-200">Cargando documento...</div>}
                >
                  <Page pageNumber={pageNumber} width={viewerWidth} />
                </Document>
              )}
            </div>
          </div>
          {/* Controles de paginación */}
          <div className="bg-white p-3 shadow flex items-center justify-center gap-3">
            <button
              onClick={() => setPageNumber((p) => Math.max(p - 1, 1))}
              disabled={pageNumber <= 1}
              className="px-3 py-2 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
            >
              Anterior
            </button>
            <div className="text-sm">
              Página {pageNumber} {numPages ? `de ${numPages}` : ''}
            </div>
            <button
              onClick={() => setPageNumber((p) => (numPages ? Math.min(p + 1, numPages) : p + 1))}
              disabled={!!numPages && pageNumber >= numPages}
              className="px-3 py-2 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NormasScreen;
