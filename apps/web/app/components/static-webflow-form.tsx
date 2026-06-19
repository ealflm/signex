// app/components/static-webflow-form.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  name: string;
  className: string;
  children: React.ReactNode;          // the fields + submit (the original <form> inner markup)
  successMarkup: string;              // the original .w-form-done inner HTML (curly apostrophes preserved)
  failMarkup?: string;
  "data-wf-element-id"?: string;
  "data-wf-page-id"?: string;
  "data-w-id"?: string;            // some Webflow forms carry an animation hook on the <form> itself
  style?: React.CSSProperties;     // forwarded to the <form> (e.g. the runtime's opacity/blur reveal)
};

export function StaticWebflowForm({ id, name, className, children, successMarkup, failMarkup, ...rest }: Props) {
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLDivElement>(null);
  // On success, announce the confirmation (role=status live region) + move focus to it.
  useEffect(() => { if (done) doneRef.current?.focus(); }, [done]);
  return (
    <div className="w-form">
      {!done && (
        <form
          id={id}
          name={name}
          className={className}
          onSubmit={(e) => { e.preventDefault(); setDone(true); }}
          {...rest}
        >
          {children}
        </form>
      )}
      {done && <div ref={doneRef} tabIndex={-1} role="status" className="success-message w-form-done" style={{ display: "block" }} dangerouslySetInnerHTML={{ __html: successMarkup }} />}
      {!done && failMarkup && <div className="error-message w-form-fail" dangerouslySetInnerHTML={{ __html: failMarkup }} />}
    </div>
  );
}
