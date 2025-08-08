import React, { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { getStorage, ref, listAll, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase'; // Ajusta la ruta según tu proyecto
import PdfViewerScreen from './PdfViewerScreen';
import "react-pdf/dist/Page/AnnotationLayer.css";

// Configura el worker de PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface Folder {
  name: string;
  ref: any;
}

interface FileItem {
  name: string;
  url: string;
}

const NormasScreen: React.FC = () => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFolder, setUploadFolder] = useState<string>('');

  useEffect(() => {
    fetchFolders();
  }, []);

  // Obtiene las carpetas desde Firebase Storage
  const fetchFolders = async () => {
    const rootRef = ref(getStorage(), 'normas/');
    try {
      const res = await listAll(rootRef);
      const folderList = res.prefixes.map(prefix => ({
        name: prefix.name,
        ref: prefix,
      }));
      setFolders(folderList);
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  // Crea una nueva carpeta (sube un archivo .keep vacío)
  const createFolder = async () => {
    if (!newFolderName) return;
    const folderRef = ref(getStorage(), `normas/${newFolderName}/`);
    try {
      await uploadBytes(ref(folderRef, '.keep'), new Blob());
      setNewFolderName('');
      fetchFolders();
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  // Obtiene los archivos dentro de una carpeta
  const fetchFiles = async (folder: Folder) => {
    setSelectedFolder(folder);
    setFiles([]);
    setSelectedFile(null);
    setPageNumber(1);
    try {
      const res = await listAll(folder.ref);
      const filePromises = res.items.map(async item => {
        const url = await getDownloadURL(item);
        return { name: item.name, url } as FileItem;
      });
      const fileList = await Promise.all(filePromises);
      setFiles(fileList);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  // Maneja la subida de un PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !uploadFolder) return;
    const file = e.target.files[0];
    const fileRef = ref(getStorage(), `normas/${uploadFolder}/${file.name}`);
    try {
      await uploadBytes(fileRef, file);
      fetchFiles(folders.find(f => f.name === uploadFolder)!);
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  return (
    <div className="flex h-full bg-gray-100">
      {/* Barra lateral */}
      <aside className="w-64 bg-white p-4 shadow-lg overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Normas del Laboratorio</h2>

        {/* Crear carpeta */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Nueva carpeta..."
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          />
          <button
            onClick={createFolder}
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Crear Carpeta
          </button>
        </div>

        {/* Subir PDF */}
        <div className="mb-4">
          <label className="block mb-1">Subir PDF:</label>
          <select
            value={uploadFolder}
            onChange={e => setUploadFolder(e.target.value)}
            className="w-full p-2 border rounded mb-2"
          >
            <option value="">Selecciona carpeta...</option>
            {folders.map(folder => (
              <option key={folder.name} value={folder.name}>
                {folder.name}
              </option>
            ))}
          </select>
          <input type="file" accept="application/pdf" onChange={handleFileUpload} className="w-full" />
        </div>

        {/* Lista de carpetas */}
        <nav>
          <ul>
            {folders.map(folder => (
              <li key={folder.name} className="mb-2">
                <button
                  onClick={() => fetchFiles(folder)}
                  className={`w-full text-left p-2 rounded ${
                    selectedFolder?.name === folder.name ? 'bg-blue-100' : ''
                  }`}
                >
                  {folder.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Área de contenido */}
      <main className="flex-1 p-4 overflow-auto">
        {selectedFile ? (
          <div className="bg-white rounded shadow p-4">
            <Document file={selectedFile.url} onLoadSuccess={() => setPageNumber(1)}>
              <Page pageNumber={pageNumber} />
            </Document>

            {/* Controles de navegación de páginas */}
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setPageNumber(p => Math.max(p - 1, 1))}
                disabled={pageNumber <= 1}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Anterior
              </button>
              <span>Página {pageNumber}</span>
              <button
                onClick={() => setPageNumber(p => p + 1)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Siguiente
              </button>
            </div>
          </div>
        ) : selectedFolder ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map(file => (
              <div
                key={file.name}
                className="bg-white p-2 rounded shadow cursor-pointer hover:bg-gray-50"
                onClick={() => setSelectedFile(file)}
              >
                <p className="text-sm font-medium truncate">{file.name}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Selecciona una carpeta para ver sus normas.</p>
        )}
      </main>
    </div>
  );
};

export default NormasScreen;
