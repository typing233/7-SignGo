import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onLoadSuccess?: (numPages: number) => void;
  width?: number;
  renderOverlay?: (pageWidth: number, pageHeight: number) => React.ReactNode;
}

export default function PDFViewer({
  url,
  currentPage = 1,
  onPageChange,
  onLoadSuccess,
  width = 600,
  renderOverlay,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });

  const handleLoadSuccess = ({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    onLoadSuccess?.(n);
  };

  const handlePageLoadSuccess = useCallback((page: any) => {
    const viewport = page.getViewport({ scale: 1 });
    const scale = width / viewport.width;
    setPageDimensions({
      width: viewport.width * scale,
      height: viewport.height * scale,
    });
  }, [width]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative border border-gray-200 shadow-sm">
        <Document file={url} onLoadSuccess={handleLoadSuccess} loading={<div className="p-12 text-gray-400">加载PDF中...</div>}>
          <Page
            pageNumber={currentPage}
            width={width}
            onLoadSuccess={handlePageLoadSuccess}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
        {renderOverlay && pageDimensions.width > 0 && (
          <div
            className="absolute top-0 left-0"
            style={{ width: pageDimensions.width, height: pageDimensions.height }}
          >
            {renderOverlay(pageDimensions.width, pageDimensions.height)}
          </div>
        )}
      </div>

      {numPages > 1 && (
        <div className="flex items-center gap-4 mt-4">
          <button
            onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm text-gray-600">
            第 {currentPage} / {numPages} 页
          </span>
          <button
            onClick={() => onPageChange?.(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
