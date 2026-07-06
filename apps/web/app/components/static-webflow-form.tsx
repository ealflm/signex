// app/components/static-webflow-form.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { LeadFormNotice } from "./lead-form-notice";
import { getAnalyticsIds } from "@/app/lib/analytics/tracker";
import { pushQuoteSubmit } from "@/app/lib/analytics/gtm-events";

type Props = {
  id: string;
  name: string;
  className: string;
  formKey: "quote" | "contact";       // selects the api submit endpoint + zod schema
  children: React.ReactNode;
  successText: string;
  failText?: string;
  "data-wf-element-id"?: string;
  "data-wf-page-id"?: string;
  "data-w-id"?: string;
  style?: React.CSSProperties;
};

export function StaticWebflowForm({
  id, name, className, formKey, children, successText, failText, ...rest
}: Props) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [ids, setIds] = useState<{ visitorId: string; sessionId: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setIds(getAnalyticsIds());
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    try {
      const body = new FormData(e.currentTarget); // includes the file upload field
      const res = await fetch(`/api/forms/${formKey}/submit`, {
        method: "POST",
        body,
      });
      if (res.ok) {
        pushQuoteSubmit(); // GTM: quote_submit → GA4 + Google Ads conversion
        formRef.current?.reset(); // clear the fields but keep the form in place
        setState("done");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div className="w-form">
      {/* The form stays put through the whole flow — success/failure is announced
          by the notice at the top of the form, not by replacing the form. */}
      <form
        ref={formRef}
        id={id}
        name={name}
        className={className}
        onSubmit={onSubmit}
        {...rest}
      >
        <LeadFormNotice
          open={state === "done" || state === "error"}
          variant={state === "error" ? "error" : "success"}
          message={
            state === "error"
              ? failText ?? "Chưa gửi được — vui lòng thử lại."
              : successText
          }
          onClose={() => setState("idle")}
        />
        {ids && (
          <>
            <input type="hidden" name="visitorId" value={ids.visitorId} />
            <input type="hidden" name="sessionId" value={ids.sessionId} />
          </>
        )}
        <fieldset disabled={state === "sending"} style={{ border: 0, padding: 0, margin: 0 }}>
          {children}
        </fieldset>
      </form>
    </div>
  );
}
