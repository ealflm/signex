// app/components/static-webflow-form.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  name: string;
  className: string;
  formKey: "quote" | "contact";       // selects the api submit endpoint + zod schema
  children: React.ReactNode;
  successMarkup: string;
  failMarkup?: string;
  "data-wf-element-id"?: string;
  "data-wf-page-id"?: string;
  "data-w-id"?: string;
  style?: React.CSSProperties;
};

export function StaticWebflowForm({
  id, name, className, formKey, children, successMarkup, failMarkup, ...rest
}: Props) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state === "done") doneRef.current?.focus(); }, [state]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    try {
      const body = new FormData(e.currentTarget); // includes the file upload field
      const res = await fetch(`/api/forms/${formKey}/submit`, {
        method: "POST",
        body,
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="w-form">
      {state !== "done" && (
        <form
          id={id}
          name={name}
          className={className}
          onSubmit={onSubmit}
          {...rest}
        >
          <fieldset disabled={state === "sending"} style={{ border: 0, padding: 0, margin: 0 }}>
            {children}
          </fieldset>
        </form>
      )}
      {state === "done" && (
        <div
          ref={doneRef}
          tabIndex={-1}
          role="status"
          className="success-message w-form-done"
          style={{ display: "block" }}
          dangerouslySetInnerHTML={{ __html: successMarkup }}
        />
      )}
      {state === "error" && failMarkup && (
        <div className="error-message w-form-fail" style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: failMarkup }} />
      )}
    </div>
  );
}
