/**
 * SVG sanitizer — strips active/dangerous content from SVG markup.
 *
 * Strategy: SANITIZE (conservative regex-based, no native dep, node-only).
 * When in doubt, strip. Output is valid-enough SVG for serving via R2.
 *
 * Attack vectors neutralised:
 *  - <script> elements (any case, any attributes)
 *  - <foreignObject> elements (arbitrary HTML embedding)
 *  - on* event-handler attributes (onload, onclick, onerror, ...)
 *  - javascript: / vbscript: URIs in href / xlink:href / src / action attributes
 *  - data:text/html and other executable data: URIs in those attributes
 *  - <!DOCTYPE> / <!ENTITY> declarations (external entity / DTD injection)
 *  - External http(s): refs in <use> href / xlink:href
 *  - External http(s): refs in <image> href / xlink:href / src
 *  - @import in <style> blocks
 *  - expression() in <style> blocks (IE legacy, belt-and-suspenders)
 */

export class SvgForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgForbiddenError';
  }
}

/**
 * Sanitise an SVG string (or Buffer) by removing dangerous active content.
 * Returns the cleaned SVG as a UTF-8 string.
 *
 * Callers that want to forbid SVG entirely (e.g. admin upload path) should
 * throw a `SvgForbiddenError` BEFORE calling this function. This function
 * always sanitises — it never throws.
 */
export function sanitizeSvg(svg: string | Buffer): string {
  let s = typeof svg === 'string' ? svg : svg.toString('utf8');

  // 1. Strip <!DOCTYPE ...> blocks (covers SYSTEM entity refs, nested brackets)
  //    Use a two-pass approach: first strip nested [...] content, then the decl.
  s = s.replace(/<!DOCTYPE\b[^>]*(?:\[[^\]]*\])?[^>]*>/gi, '');

  // 2. Strip <!ENTITY ...> declarations (belt-and-suspenders, in case they
  //    appear outside a DOCTYPE block)
  s = s.replace(/<!ENTITY\b[^>]*>/gi, '');

  // 3. Strip <script ...>...</script> blocks (greedy inner match, DOTALL via [\s\S])
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  // Also strip self-closing <script ... />
  s = s.replace(/<script\b[^>]*\/>/gi, '');
  // And opening tags with no close (paranoia — malformed)
  s = s.replace(/<script\b[^>]*>/gi, '');

  // 4. Strip <foreignObject ...>...</foreignObject> blocks
  s = s.replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '');
  s = s.replace(/<foreignObject\b[^>]*\/>/gi, '');
  s = s.replace(/<foreignObject\b[^>]*>/gi, '');

  // 5. Remove on* event-handler attributes from any element.
  //    Matches: onFOO="..." or onFOO='...' or onFOO=value (unquoted).
  //    Repeat until stable (handles adjacent handlers on same element).
  const ON_ATTR = /\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
  let prev: string;
  do {
    prev = s;
    s = s.replace(ON_ATTR, '');
  } while (s !== prev);

  // 6. Remove javascript: / vbscript: / executable data: URIs from
  //    href, xlink:href, src, action attributes.
  //    Dangerous data: URIs: data:text/html, data:application/xhtml+xml,
  //    data:application/javascript, data:application/ecmascript.
  //    We strip the VALUE, leaving the attribute name pointing at an empty string
  //    (which is safe: href="" is a same-page reference).
  //
  //    Approach: replace the attribute=value pair, reconstructing with safe value.
  //    We handle double-quoted, single-quoted, and unquoted values separately.
  function isDangerousUri(uri: string): boolean {
    const u = uri.replace(/\s/g, '').toLowerCase();
    return (
      u.startsWith('javascript:') ||
      u.startsWith('vbscript:') ||
      u.startsWith('data:text/html') ||
      u.startsWith('data:application/xhtml+xml') ||
      u.startsWith('data:application/javascript') ||
      u.startsWith('data:application/ecmascript')
    );
  }

  // Matches: attrName="value" or attrName='value' or attrName=value
  const URL_ATTR_DOUBLE =
    /\b((?:xlink:)?href|src|action)\s*=\s*"([^"]*)"/gi;
  const URL_ATTR_SINGLE =
    /\b((?:xlink:)?href|src|action)\s*=\s*'([^']*)'/gi;
  const URL_ATTR_UNQUOTED =
    /\b((?:xlink:)?href|src|action)\s*=\s*([^\s>"'][^\s>]*)/gi;

  s = s.replace(URL_ATTR_DOUBLE, (_, attr, val) =>
    isDangerousUri(val) ? `${attr}=""` : `${attr}="${val}"`,
  );
  s = s.replace(URL_ATTR_SINGLE, (_, attr, val) =>
    isDangerousUri(val) ? `${attr}=""` : `${attr}='${val}'`,
  );
  s = s.replace(URL_ATTR_UNQUOTED, (_, attr, val) =>
    isDangerousUri(val) ? `${attr}=""` : `${attr}=${val}`,
  );

  // 7. Strip external (http/https/protocol-relative) refs from
  //    href, xlink:href, src attributes.
  //    Strategy: replace the URI value with "" (keeps the element, drops the leak).
  function isExternalUri(uri: string): boolean {
    const u = uri.replace(/\s/g, '').toLowerCase();
    return u.startsWith('http:') || u.startsWith('https:') || u.startsWith('//');
  }

  s = s.replace(URL_ATTR_DOUBLE, (_, attr, val) =>
    isExternalUri(val) ? `${attr}=""` : `${attr}="${val}"`,
  );
  s = s.replace(URL_ATTR_SINGLE, (_, attr, val) =>
    isExternalUri(val) ? `${attr}=""` : `${attr}='${val}'`,
  );

  // 8. Strip dangerous CSS from <style> blocks.
  //    a) @import rules
  //    b) expression(...) (legacy IE CSS injection)
  s = s.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_, open, body, close) => {
    let cleaned = body;
    cleaned = cleaned.replace(/@import\b[^;]*(;|$)/gi, '');
    cleaned = cleaned.replace(/\bexpression\s*\([^)]*\)/gi, '');
    return `${open}${cleaned}${close}`;
  });

  return s;
}
