"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Product image with a click-to-open zoom lightbox: clicking the image opens a full-screen
// overlay where it can be zoomed in/out (scroll wheel, +/− buttons, or click) and panned by
// dragging when zoomed. Closes on ✕, ESC, or backdrop click. Self-contained client component.
const MIN = 1;
const MAX = 5;

export function ProductImageZoom({ src, alt, hint }: { src: string; alt: string; hint: string }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const moved = useRef(false); // did the pointer drag (vs a plain tap) since pointerdown?
  const dialogRef = useRef<HTMLDivElement>(null);

  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));
  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);
  const close = useCallback(() => { setOpen(false); reset(); }, [reset]);

  // While open: lock body scroll + manage focus (move in, trap, restore) + ESC to close.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const restoreTo = document.activeElement as HTMLElement | null; // the trigger button
    dialog?.focus(); // move focus into the dialog so keyboard/AT users land in it

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab" && dialog) {
        // Trap focus among the dialog's controls (the only focusable descendants).
        const f = Array.from(dialog.querySelectorAll<HTMLElement>("button"));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1], active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreTo?.focus?.(); // return focus to the trigger on close
    };
  }, [open, close]);

  const applyScale = (next: number) => {
    const ns = clamp(next);
    setScale(ns);
    if (ns === 1) { setTx(0); setTy(0); }
  };
  const onWheel = (e: React.WheelEvent) => { applyScale(scale - e.deltaY * 0.0016 * scale); };
  const onImgClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // A pan ends with a click event too — if the pointer dragged, DON'T toggle zoom off,
    // just keep the new pan position. Only a plain tap toggles zoom in/out.
    if (moved.current) { moved.current = false; return; }
    applyScale(scale === 1 ? 2.2 : 1);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return; // panning only when zoomed in
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true; // crossed the drag threshold
    setTx(drag.current.tx + dx);
    setTy(drag.current.ty + dy);
  };
  const onPointerUp = () => { drag.current = null; };

  const ZoomIcon = (
    <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6" /><path d="M8 11h6" />
    </svg>
  );

  return (
    <>
      <button type="button" className="product-zoom_trigger" onClick={() => setOpen(true)} aria-label={`${alt} — ${hint}`}>
        <img className="image_cover" src={src} alt={alt} loading="lazy" />
        <span className="product-zoom_hint" aria-hidden="true">{ZoomIcon}{hint}</span>
      </button>

      {open && (
        <div ref={dialogRef} tabIndex={-1} className="product-zoom_overlay" role="dialog" aria-modal="true" aria-label={alt} onClick={close} onWheel={onWheel}>
          <div className="product-zoom_controls" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => applyScale(scale - 0.6)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => applyScale(scale + 0.6)} aria-label="Zoom in">+</button>
            <button type="button" onClick={reset} aria-label="Reset zoom">⟳</button>
            <button type="button" onClick={close} aria-label="Close">✕</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="product-zoom_img"
            src={src}
            alt={alt}
            draggable={false}
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, cursor: scale > 1 ? "grab" : "zoom-in" }}
            onClick={onImgClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
        </div>
      )}
    </>
  );
}
