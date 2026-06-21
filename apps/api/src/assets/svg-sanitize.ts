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
 *  - data: URIs that are not safe images (only data:image/png|jpeg|gif|webp allowed)
 *  - <!DOCTYPE> / <!ENTITY> declarations (external entity / DTD injection)
 *  - External http(s): refs in <use> href / xlink:href
 *  - External http(s): refs in <image> href / xlink:href / src
 *  - @import in <style> blocks
 *  - expression() in <style> blocks (IE legacy, belt-and-suspenders)
 *  - javascript: / data: (non-image) url() in <style> blocks
 */

export class SvgForbiddenError extends Error {
  constructor(message = 'SVG content is not allowed') {
    super(message);
    this.name = 'SvgForbiddenError';
  }
}

/**
 * Sanitise an SVG Buffer by removing dangerous active content.
 * Returns the cleaned SVG as a UTF-8 Buffer.
 *
 * Throws `SvgForbiddenError` if the input does not contain an `<svg>` root element.
 */
export function sanitizeSvg(input: Buffer): Buffer {
  let s = input.toString('utf8');

  // Guard: must contain an <svg> root element.
  if (!/<svg[\s>]/i.test(s)) {
    throw new SvgForbiddenError('Input does not contain an <svg> root element');
  }

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

  // 6. Remove dangerous URIs from href, xlink:href, src, action attributes.
  //    Allow-list for data: URIs: only data:image/(png|jpeg|gif|webp) is safe.
  //    All other data: URIs (including data:image/svg+xml) are blocked.
  //    Also block javascript: and vbscript: unconditionally.
  function isDangerousUri(uri: string): boolean {
    const u = uri.replace(/\s/g, '').toLowerCase();
    if (u.startsWith('javascript:') || u.startsWith('vbscript:')) return true;
    if (u.startsWith('data:')) {
      // Only allow safe image data URIs; block everything else.
      return !/^data:image\/(png|jpeg|gif|webp)[,;]/.test(u);
    }
    return false;
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
  //    c) url(...) with javascript: or data: non-image URIs
  s = s.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_, open, body, close) => {
    let cleaned = body;
    cleaned = cleaned.replace(/@import\b[^;]*(;|$)/gi, '');
    cleaned = cleaned.replace(/\bexpression\s*\([^)]*\)/gi, '');
    // Neutralize url() with javascript: or non-safe-image data: inside style blocks
    cleaned = cleaned.replace(/\burl\s*\(\s*(["']?)(javascript:|data:(?!image\/(png|jpeg|gif|webp)))[^)]*\1\s*\)/gi, 'url("")');
    return `${open}${cleaned}${close}`;
  });

  return Buffer.from(s, 'utf8');
}
