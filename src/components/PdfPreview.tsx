import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type PdfPreviewHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  scrollToPosition: (page: number, xPt: number, yPt: number) => void;
};

const PdfPreview = forwardRef<
  PdfPreviewHandle,
  {
    pdfPath: string | null;
    reloadToken: number;
    onCompile: () => void;
    compiling: boolean;
    canCompile: boolean;
    onSyncClick?: (page: number, xPt: number, yPt: number) => void;
    onSyncToPdf?: () => void;
    standalone?: boolean;
  }
>(function PdfPreview(
  {
    pdfPath,
    reloadToken,
    onCompile,
    compiling,
    canCompile,
    onSyncClick,
    onSyncToPdf,
    standalone,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTokenRef = useRef(0);
  const zoomRef = useRef(1);
  const [error, setError] = useState<string | null>(null);
  const [hasDoc, setHasDoc] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);

  // Load the PDF document whenever the file path or its content changes.
  useEffect(() => {
    let cancelled = false;

    if (!pdfPath) {
      pdfDocRef.current = null;
      setHasDoc(false);
      return;
    }

    window.api
      .readBinaryFileBase64(pdfPath)
      .then(async (base64) => {
        if (cancelled) return;
        const bytes = base64ToUint8Array(base64);
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setError(null);
        setHasDoc(true);
        zoomRef.current = 1;
        setZoomPct(100);
        renderAllPages();
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, reloadToken]);

  async function renderAllPages() {
    const doc = pdfDocRef.current;
    const container = pagesRef.current;
    if (!doc || !container) return;

    const myToken = ++renderTokenRef.current;
    const width = container.clientWidth;
    if (width <= 0) return;

    const fragment = document.createDocumentFragment();

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      if (renderTokenRef.current !== myToken) return; // superseded by a newer render
      const page = await doc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = (width / unscaledViewport.width) * zoomRef.current;
      const viewport = page.getViewport({ scale });

      // Render at (at least) 2x the CSS-pixel size — on a HiDPI screen this
      // matches the real device-pixel density; on a standard screen it still
      // supersamples text for the crisper look other PDF viewers give, since
      // rendering 1:1 with the display and letting the browser downsample
      // slightly looks noticeably softer than native anti-aliased text.
      const outputScale = Math.max(window.devicePixelRatio || 1, 2);

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-page";
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.dataset.page = String(pageNum);
      canvas.dataset.scale = String(scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      }).promise;
      if (renderTokenRef.current !== myToken) return;
      fragment.appendChild(canvas);
    }

    if (renderTokenRef.current !== myToken) return;
    container.replaceChildren(fragment);
  }

  function setZoom(next: number) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    zoomRef.current = clamped;
    setZoomPct(Math.round(clamped * 100));
    renderAllPages();
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => setZoom(zoomRef.current + 0.1),
    zoomOut: () => setZoom(zoomRef.current - 0.1),
    resetZoom: () => setZoom(1),
    scrollToPosition: (page, _xPt, yPt) => {
      const container = pagesRef.current;
      const scroller = scrollRef.current;
      if (!container || !scroller) return;
      const canvas = container.querySelector(
        `canvas[data-page="${page}"]`,
      ) as HTMLCanvasElement | null;
      if (!canvas) return;
      const scale = parseFloat(canvas.dataset.scale ?? "1");
      const targetY = canvas.offsetTop + yPt * scale;
      scroller.scrollTo({
        top: targetY - scroller.clientHeight / 2,
        behavior: "smooth",
      });
      canvas.classList.add("pdf-page-flash");
      window.setTimeout(() => canvas.classList.remove("pdf-page-flash"), 700);
    },
  }));

  // Re-render at the new width when the pane is resized, throttled to
  // animation frames so dragging the split divider stays smooth.
  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        renderAllPages();
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDoc]);

  // Ctrl+scroll (mouse wheel) and touchpad pinch (browsers report pinch as a
  // wheel event with ctrlKey set) zoom the preview, like Overleaf.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let rafId: number | null = null;
    let pendingDeltaY = 0;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      pendingDeltaY += e.deltaY;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const factor = Math.exp(-pendingDeltaY * 0.001);
          pendingDeltaY = 0;
          setZoom(zoomRef.current * factor);
        });
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDoc]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-zoom-bar">
        {!standalone && (
          <button
            className={"pdf-compile-btn" + (compiling ? " compiling" : "")}
            onClick={onCompile}
            disabled={compiling || !canCompile}
          >
            {compiling && <span className="pdf-compile-spinner" />}
            {compiling ? "Compiling…" : "Compile"}
          </button>
        )}
        {onSyncToPdf && hasDoc && (
          <button
            className="sync-pdf-btn"
            onClick={onSyncToPdf}
            title="Jump the PDF preview to the cursor's position"
          >
            ⇅ Sync to PDF
          </button>
        )}
        <div className="pdf-zoom-controls">
          <button
            onClick={() => setZoom(zoomRef.current - 0.1)}
            disabled={!hasDoc}
            title="Zoom out"
          >
            −
          </button>
          <span className="pdf-zoom-pct">{zoomPct}%</span>
          <button
            onClick={() => setZoom(zoomRef.current + 0.1)}
            disabled={!hasDoc}
            title="Zoom in"
          >
            +
          </button>
          <button onClick={() => setZoom(1)} disabled={!hasDoc} title="Reset to fit width">
            Fit width
          </button>
        </div>
      </div>
      <div className={"pdf-progress-bar" + (compiling ? " active" : "")} />
      {error ? (
        <div className="pdf-empty pdf-error">{error}</div>
      ) : !hasDoc ? (
        <div className="pdf-empty">No PDF yet — compile to see a preview.</div>
      ) : (
        <div ref={scrollRef} className="pdf-scroll">
          <div
            ref={pagesRef}
            className="pdf-pages"
            onDoubleClick={(e) => {
              if (!onSyncClick) return;
              const target = e.target as HTMLElement;
              if (target.tagName !== "CANVAS") return;
              const canvas = target as HTMLCanvasElement;
              const page = parseInt(canvas.dataset.page ?? "0", 10);
              const scale = parseFloat(canvas.dataset.scale ?? "1");
              if (!page || !scale) return;
              const rect = canvas.getBoundingClientRect();
              const xPt = (e.clientX - rect.left) / scale;
              const yPt = (e.clientY - rect.top) / scale;
              onSyncClick(page, xPt, yPt);
            }}
          />
        </div>
      )}
    </div>
  );
});

export default PdfPreview;
