// app/components/webflow-runtime.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */ // Webflow/GSAP globals are untyped third-party runtime
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { profileForRoute } from "@/app/lib/webflow-bundles";

declare global {
  interface Window {
    Webflow?: any;
    gsap?: any;
    ScrollTrigger?: any;
    SplitText?: any;
    Lenis?: any;
    __lenis?: any;
    __caladanRaf?: number;
  }
}

// Loaded ONCE per session, in this exact order (jQuery -> Webflow core chunks -> GSAP -> plugins -> Lenis).
const GLOBAL_SCRIPTS: string[] = [
  "/assets/js/jquery-3.5.1.min.dc5e7f18c8.js",
  "/assets/js/caladan-template.schunk.36b8fb49256177c8.js",
  "/assets/js/caladan-template.schunk.368c30933a13e5d4.js",
  "/assets/js/gsap.min.js",
  "/assets/js/ScrollTrigger.min.js",
  "/assets/js/SplitText.min.js",
  "/assets/js/lenis.min.js",
];

// Inject a classic script and resolve after it executes. async=false + sequential await = strict order.
function loadOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-wf-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(src)));
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.dataset.wfSrc = src;
    el.addEventListener("load", () => { el.dataset.loaded = "true"; resolve(); });
    el.addEventListener("error", () => reject(new Error(src)));
    document.body.appendChild(el);
  });
}

// Inject a fresh (non-deduped) script element — used for the per-page bundle, which must RE-RUN per navigation.
// Known limitation: if the user navigates while a page bundle is mid-fetch, that injected script still
// executes after the next navigation's teardown (the `cancelled` flag stops the IIFE but not an already-DOM
// <script>). The window is narrow (bundles are small); plain <a> full-reload navigation (the Task 2.3
// fallback) eliminates it entirely. Revisit only if SPA <Link> navigation is adopted and the race shows up.
function loadFresh(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.dataset.wfPageBundle = "true";
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject(new Error(src)));
    document.body.appendChild(el);
  });
}

function startLenis() {
  if (window.__lenis) { try { window.__lenis.destroy(); } catch {} }
  if (window.__caladanRaf) cancelAnimationFrame(window.__caladanRaf);
  const lenis = new window.Lenis({
    lerp: 0.1, wheelMultiplier: 0.7, gestureOrientation: "vertical",
    normalizeWheel: false, smoothTouch: false,
  });
  window.__lenis = lenis;
  const raf = (time: number) => { lenis.raf(time); window.__caladanRaf = requestAnimationFrame(raf); };
  window.__caladanRaf = requestAnimationFrame(raf);
}

// Verbatim from legacy/caladan/index.html end-of-body inline script (B11).
function initCountUp() {
  const gsap = window.gsap;
  if (!gsap) return;
  document.querySelectorAll<HTMLElement>("[count-up]").forEach((el) => {
    const raw = (el.textContent ?? "").trim();
    const target = parseFloat(raw);
    const suffix = raw.replace(/[\d,.]/g, "");
    const counter = { val: 0 };
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 80%", once: true } });
    tl.fromTo(el, { filter: "blur(6px)" }, { filter: "blur(0px)", duration: 2.25, ease: "power2.out" }, 0);
    tl.to(counter, { val: target, duration: 2, ease: "power2.out",
      onUpdate() { el.textContent = Math.round(counter.val).toLocaleString() + suffix; } }, 0);
  });
}

export function WebflowRuntime() {
  const pathname = usePathname();
  const globalsReady = useRef(false);
  const loadedPageScripts = useRef<Set<string>>(new Set());
  // The pathname we have already booted. Claimed synchronously so React Strict Mode's
  // double-invoke (and any same-route re-render) is a no-op, and so the FIRST boot is
  // distinguished from a real navigation.
  const bootedPathname = useRef<string | null>(null);

  // NOTE: all internal links in this app are plain <a href> (full-page reloads), so in practice
  // every page load is a fresh first boot — the `!isFirstBoot` teardown/re-init branch below is
  // defensive and only runs if next/link client navigation is later adopted (see Task 2.3 fallback).
  useEffect(() => {
    if (bootedPathname.current === pathname) return; // already booted this route (Strict Mode / re-render)
    const isFirstBoot = bootedPathname.current === null;
    bootedPathname.current = pathname; // claim synchronously, before any await

    let cancelled = false;
    let booted = false; // flips true once this boot fully completes (see cleanup)
    (async () => {
      const html = document.documentElement;
      html.classList.add("w-mod-js");
      if ("ontouchstart" in window) html.classList.add("w-mod-touch");

      // 1) Globals — once per session, in strict order.
      if (!globalsReady.current) {
        for (const src of GLOBAL_SCRIPTS) { if (cancelled) return; await loadOnce(src); }
        window.gsap?.registerPlugin(window.ScrollTrigger, window.SplitText);
        globalsReady.current = true;
      }

      // 2) Teardown — ONLY on a real navigation, never on first boot. On first boot the page
      //    bundle's ix2.init fires the page-load reveal animations exactly like the static export;
      //    tearing down + re-initing IX2 re-applies the hidden initial keyframes but does NOT
      //    re-fire "page load" triggers, leaving reveals stuck hidden. So first boot stays pristine.
      if (!isFirstBoot) {
        try { window.Webflow?.require?.("ix2")?.destroy?.(); } catch {}
        try { window.Webflow?.destroy?.(); } catch {}
        window.ScrollTrigger?.getAll?.().forEach((st: any) => st.kill());
        html.classList.remove("w-mod-ix3");
        document.querySelectorAll('script[data-wf-page-bundle="true"]').forEach((n) => n.remove());
      }

      // 3) This route's page bundle (carries its IX2 config; adds w-mod-ix3 + calls ix2.init).
      //    The shared dcdaa481 chunk loads once (treated like a global); the hashed bundle re-runs per nav.
      const { pageScripts } = profileForRoute(pathname);
      for (const src of pageScripts) {
        if (cancelled) return;
        if (src.includes("schunk.dcdaa481")) {
          if (!loadedPageScripts.current.has(src)) { await loadOnce(src); loadedPageScripts.current.add(src); }
        } else {
          await loadFresh(src);
        }
      }

      // 4) On re-init only, kick Webflow.ready() (on first boot the core chunk auto-fires it on
      //    jQuery DOM-ready, which has already passed when the chunk loads).
      if (!isFirstBoot) { try { window.Webflow?.ready?.(); } catch {} }

      // 5) (Re)start Lenis + custom GSAP, then nudge IX2/ScrollTrigger to evaluate in-view state.
      //    Webflow IX2 "scroll into view" reveals fire on scroll/resize events — on the static
      //    export the real page-load sequence triggers them, but a post-hydration ix2.init does
      //    not, so above-the-fold reveals (e.g. the hero) stay stuck at their hidden initial
      //    keyframe until a scroll/resize tick. Dispatching both reveals the in-view elements;
      //    below-the-fold ones then fire naturally as the user scrolls.
      if (window.Lenis) startLenis();
      initCountUp();
      requestAnimationFrame(() => {
        window.ScrollTrigger?.refresh();
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("scroll"));
      });
      booted = true;
    })().catch((e) => console.error("WebflowRuntime:", e));

    return () => {
      cancelled = true;
      // React Strict Mode (dev) double-invokes effects: setup → cleanup → setup. The route is
      // claimed synchronously (bootedPathname), so if this boot is torn down before it finishes,
      // release the claim so the next setup re-boots — otherwise it no-ops and animations never
      // init in dev. (In prod the runtime mounts once and never unmounts, so this is dev-only.)
      if (!booted) bootedPathname.current = null;
      // Tear down what this boot started so a re-boot doesn't leak the Lenis rAF loop / instance.
      if (typeof window !== "undefined") {
        if (window.__caladanRaf) { cancelAnimationFrame(window.__caladanRaf); window.__caladanRaf = undefined; }
        try { window.__lenis?.destroy?.(); } catch {}
        window.__lenis = undefined;
      }
    };
  }, [pathname]);

  return null;
}
