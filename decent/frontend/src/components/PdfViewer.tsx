"use client";

import React, { useEffect, useRef, useState } from "react";
import { fetchWithAuth } from "@/utils/api";
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

// View-only PDF renderer: fetches the PDF as an authenticated blob and
// draws it page-by-page onto a <canvas>. Deliberately never uses
// <embed>/<iframe src=pdf> or exposes the blob URL directly — both of
// those hand the browser's native PDF viewer (with its own download/save
// controls) straight to the user, which defeats the point.
export default function PdfViewer({ endpoint }: { endpoint: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [fitScale, setFitScale] = useState(1.1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const res = await fetchWithAuth(endpoint);
        if (!res.ok) throw new Error("Failed to load document");
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;

        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum(1);

        const firstPage = await doc.getPage(1);
        const pageWidth = firstPage.getViewport({ scale: 1 }).width;
        const availableWidth = viewerRef.current?.clientWidth ?? pageWidth;
        const nextFitScale = Math.min(1.1, availableWidth / pageWidth);
        setFitScale(nextFitScale);
        setScale(nextFitScale);
      } catch {
        if (!cancelled) setError("Unable to load this document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    const doc = pdfDoc;
    let cancelled = false;

    async function renderPage() {
      setRendering(true);
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport, canvas }).promise;
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    renderPage();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum, scale]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-slate-300" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2 text-slate-400">
        <AlertCircle size={24} />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-between w-full max-w-3xl mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1 || rendering}
            className="btn-secondary py-1.5 px-2.5"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-slate-500 font-medium min-w-[90px] text-center">
            Page {pageNum} of {numPages}
          </span>
          <button
            type="button"
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages || rendering}
            className="btn-secondary py-1.5 px-2.5"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}
            className="btn-secondary py-1.5 px-2.5"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.2, s + 0.15))}
            className="btn-secondary py-1.5 px-2.5"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div
        ref={viewerRef}
        className="w-full overflow-auto rounded-xl border border-gray-100 bg-slate-50 p-4 flex justify-center select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <canvas
          ref={canvasRef}
          onContextMenu={(e) => e.preventDefault()}
          className={`shadow-sm rounded bg-white ${scale <= fitScale ? "max-w-full h-auto" : ""}`}
        />
      </div>
    </div>
  );
}
