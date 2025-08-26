import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PdfViewerScreenProps {
  fileUrl: string;
  fileName?: string;
  onClose?: () => void;
}

const PdfViewerScreen: React.FC<PdfViewerScreenProps> = ({ fileUrl, fileName, onClose }) => {
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-90">
      <div className="bg-white rounded-lg shadow-lg p-4 max-w-2xl w-full flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold truncate">{fileName}</span>
          {onClose && (
            <button
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={onClose}
            >
              Cerrar
            </button>
          )}
        </div>
        <div className="flex-1 flex justify-center overflow-auto" style={{ minHeight: 400 }}>
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={<p className="text-center">Cargando PDF...</p>}
            error={<p className="text-center text-red-600">No se pudo cargar el PDF.</p>}
          >
            <Page
              pageNumber={pageNumber}
              width={window.innerWidth < 600 ? 320 : 500}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
        </div>
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={() => setPageNumber((p) => Math.max(p - 1, 1))}
            disabled={pageNumber <= 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            Anterior
          </button>
          <span>
            Página {pageNumber} de {numPages || '...'}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(p + 1, numPages || 1))}
            disabled={!numPages || pageNumber >= numPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfViewerScreen;
