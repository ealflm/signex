"use client";

import * as React from "react";
import type { EditAttrs } from "@/app/lib/edit-attrs";

/**
 * The public forms' "upload sample" dropzone, with a selected state. Empty, it's
 * the existing dashed dropzone (icon + format hint). Once a file is picked it
 * shows a thumbnail (images) or a file chip (PDF) with the name + size and
 * Change / Remove controls. The native <input> is rendered once (stable) so the
 * chosen file survives the state swap and still rides along in the form's
 * FormData; it clears itself when the form resets after a successful submit.
 *
 * `variant` selects the existing class set so each form keeps its own look
 * (contact = light, hero = dark glass panel).
 */
const VARIANT = {
  contact: {
    box: "contact-upload",
    icon: "contact-upload_icon",
    text: "contact-upload_text",
  },
  hero: {
    box: "hero-quote_upload",
    icon: "hero-quote_upload-icon",
    text: "hero-quote_upload-text",
  },
} as const;

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadIcon() {
  return (
    <svg
      fill="none"
      height="100%"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width="100%"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    </svg>
  );
}

export interface LeadUploadFieldProps {
  variant: "contact" | "hero";
  id: string;
  name: string;
  accept?: string;
  /** Format hint shown in the empty state, e.g. "JPG, PNG, hoặc PDF (tối đa 10MB)". */
  hint: string;
  /** Inline-edit attributes from editText() for the hint (visual editor). */
  hintEditAttrs?: EditAttrs;
  tabIndex?: number;
}

export function LeadUploadField({
  variant,
  id,
  name,
  accept,
  hint,
  hintEditAttrs,
  tabIndex,
}: LeadUploadFieldProps) {
  const c = VARIANT[variant];
  const inputRef = React.useRef<HTMLInputElement>(null);
  const urlRef = React.useRef<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const apply = React.useCallback((next: File | null) => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    const url =
      next && next.type.startsWith("image/")
        ? URL.createObjectURL(next)
        : null;
    urlRef.current = url;
    setPreviewUrl(url);
    setFile(next);
  }, []);

  const clear = React.useCallback(() => {
    if (inputRef.current) inputRef.current.value = "";
    apply(null);
  }, [apply]);

  // The form clears its fields on a successful submit — follow it.
  React.useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => clear();
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [clear]);

  // Release the last object URL on unmount.
  React.useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return (
    <div className="sx-upload">
      <input
        ref={inputRef}
        id={id}
        name={name}
        accept={accept}
        type="file"
        tabIndex={tabIndex}
        onChange={(e) => apply(e.target.files?.[0] ?? null)}
        className="sx-upload__input"
      />

      {file ? (
        <div className={`${c.box} ${c.box}--filled`}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL, not an asset
            <img className="sx-upload__thumb" src={previewUrl} alt="" />
          ) : (
            <span
              className="sx-upload__thumb sx-upload__thumb--file"
              aria-hidden="true"
            >
              <FileIcon />
            </span>
          )}
          <span className="sx-upload__meta">
            <span className="sx-upload__name" title={file.name}>
              {file.name}
            </span>
            <span className="sx-upload__size">{prettySize(file.size)}</span>
          </span>
          <span className="sx-upload__actions">
            <button
              type="button"
              className="sx-upload__btn"
              onClick={() => inputRef.current?.click()}
            >
              Đổi
            </button>
            <button type="button" className="sx-upload__btn" onClick={clear}>
              Xoá
            </button>
          </span>
        </div>
      ) : (
        <label htmlFor={id} className={c.box}>
          <span className={c.icon} aria-hidden="true">
            <UploadIcon />
          </span>
          <span className={c.text}>
            <span {...hintEditAttrs}>{hint}</span>
          </span>
        </label>
      )}
    </div>
  );
}
