// app/types/webflow-attrs.d.ts
// Webflow uses empty-string attribute flags (e.g. `button=""`, `nav-link="")
// as CSS/JS hooks. These are non-standard HTML attributes, so React's typings
// reject them. Augment HTMLAttributes so the flags can be written in JSX while
// still rendering to the DOM verbatim (the empty string value is preserved).
import "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `T` must mirror React's HTMLAttributes<T> signature for declaration merging
  interface HTMLAttributes<T> {
    button?: string;
    "button-text"?: string;
    "button-bg"?: string;
    "nav-link"?: string;
    "marquee-up"?: string;
    "marquee-down"?: string;
    "service-animate"?: string;
    "cms-icon-wrap"?: string;
    "count-up"?: string;
    "stagger-text"?: string;
    "gallery-small"?: string;
    // Webflow exports `for="..."` on non-<label> elements (e.g. a checkbox label rendered as
    // <span>). React maps htmlFor -> the `for` DOM attribute on any element, so allow it here.
    htmlFor?: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `T` mirrors React's SVGAttributes<T> for declaration merging
  interface SVGAttributes<T> {
    c?: string; // a stray Webflow flag attr present on one exported <svg>; preserved verbatim
  }
}

// Webflow ports set CSS custom properties inline (e.g. `style={{ ['--i']: '6' }}`
// on progressive-blur panels). React's CSSProperties (from csstype) has no index
// signature for `--*` keys, so augment csstype to allow them while preserving the
// authored string values verbatim.
declare module "csstype" {
  interface Properties {
    [customProperty: `--${string}`]: string | number | undefined;
  }
}
