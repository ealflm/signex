import { sanitizeSvg, SvgForbiddenError } from './svg-sanitize';

// ─── helpers ────────────────────────────────────────────────────────────────

function svg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// ─── benign SVG passes through ───────────────────────────────────────────────

describe('sanitizeSvg — benign content preserved', () => {
  it('returns clean SVG unchanged (core attrs)', () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="red"/></svg>';
    expect(sanitizeSvg(clean)).toBe(clean);
  });

  it('preserves paths, titles, defs, use with local ref', () => {
    const clean = svg('<defs><path id="p" d="M0 0"/></defs><use href="#p"/><title>icon</title>');
    expect(sanitizeSvg(clean)).toBe(clean);
  });

  it('preserves style block with safe rules', () => {
    const clean = svg('<style>.cls{fill:red}</style><rect class="cls" x="0" y="0" width="10" height="10"/>');
    expect(sanitizeSvg(clean)).toBe(clean);
  });

  it('accepts Buffer input', () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    expect(sanitizeSvg(Buffer.from(clean))).toBe(clean);
  });
});

// ─── <script> removed ───────────────────────────────────────────────────────

describe('sanitizeSvg — <script> elements stripped', () => {
  it('removes inline <script> element', () => {
    const input = svg('<script>alert(1)</script><rect width="1" height="1"/>');
    const output = sanitizeSvg(input);
    expect(output).not.toMatch(/<script/i);
    expect(output).toContain('<rect');
  });

  it('removes <script> with type attribute', () => {
    const input = svg('<script type="text/javascript">alert(1)</script>');
    expect(sanitizeSvg(input)).not.toMatch(/<script/i);
  });

  it('removes <script> with src attribute', () => {
    const input = svg('<script src="https://evil.com/xss.js"></script>');
    expect(sanitizeSvg(input)).not.toMatch(/<script/i);
  });

  it('removes <script> case-insensitively', () => {
    const input = svg('<SCRIPT>alert(1)</SCRIPT>');
    expect(sanitizeSvg(input)).not.toMatch(/<script/i);
  });
});

// ─── on* event handlers removed ─────────────────────────────────────────────

describe('sanitizeSvg — on* event handler attributes stripped', () => {
  it('removes onload attribute', () => {
    const input = svg('<circle onload="alert(1)" cx="5" cy="5" r="5"/>');
    const output = sanitizeSvg(input);
    expect(output).not.toMatch(/\bonload\s*=/i);
    expect(output).toContain('<circle');
  });

  it('removes onclick attribute', () => {
    const input = svg('<rect onclick="evil()" width="10" height="10"/>');
    expect(sanitizeSvg(input)).not.toMatch(/\bonclick\s*=/i);
  });

  it('removes onmouseover attribute', () => {
    const input = svg('<path d="M0 0" onmouseover="steal()"/>');
    expect(sanitizeSvg(input)).not.toMatch(/\bonmouseover\s*=/i);
  });

  it('removes onerror attribute', () => {
    const input = svg('<image href="x" onerror="alert(1)"/>');
    expect(sanitizeSvg(input)).not.toMatch(/\bonerror\s*=/i);
  });

  it('removes arbitrary on* attributes (case-insensitive)', () => {
    const input = svg('<rect ONFOCUS="evil()" width="1" height="1"/>');
    expect(sanitizeSvg(input)).not.toMatch(/\bonfocus\s*=/i);
  });
});

// ─── javascript:/vbscript: in href / xlink:href / src / action ───────────────

describe('sanitizeSvg — javascript: / vbscript: URIs neutralised', () => {
  it('removes javascript: from href', () => {
    const input = svg('<a href="javascript:alert(1)"><text>click</text></a>');
    const output = sanitizeSvg(input);
    expect(output).not.toMatch(/javascript:/i);
  });

  it('removes javascript: from xlink:href', () => {
    const input = svg('<a xlink:href="javascript:void(0)"><text>x</text></a>');
    expect(sanitizeSvg(input)).not.toMatch(/javascript:/i);
  });

  it('removes vbscript: from href', () => {
    const input = svg('<a href="vbscript:msgbox(1)"><text>v</text></a>');
    expect(sanitizeSvg(input)).not.toMatch(/vbscript:/i);
  });

  it('removes data: URI that could execute (data:text/html)', () => {
    const input = svg('<a href="data:text/html,<script>alert(1)</script>"><text>d</text></a>');
    expect(sanitizeSvg(input)).not.toMatch(/data:text\/html/i);
  });

  it('removes javascript: from src attribute', () => {
    const input = svg('<image src="javascript:alert(1)"/>');
    expect(sanitizeSvg(input)).not.toMatch(/javascript:/i);
  });
});

// ─── <foreignObject> removed ─────────────────────────────────────────────────

describe('sanitizeSvg — <foreignObject> stripped', () => {
  it('removes <foreignObject> element', () => {
    const input = svg('<foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml">evil</div></foreignObject>');
    expect(sanitizeSvg(input)).not.toMatch(/<foreignObject/i);
  });

  it('removes nested content inside <foreignObject>', () => {
    const input = svg('<foreignObject><script>alert(1)</script></foreignObject>');
    const output = sanitizeSvg(input);
    expect(output).not.toMatch(/<foreignObject/i);
    expect(output).not.toMatch(/<script/i);
  });
});

// ─── external entity / DTD injections ────────────────────────────────────────

describe('sanitizeSvg — external entity / DTD references stripped', () => {
  it('strips <!DOCTYPE with SYSTEM reference', () => {
    const input = '<!DOCTYPE svg SYSTEM "http://evil.com/evil.dtd"><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(sanitizeSvg(input)).not.toMatch(/<!DOCTYPE/i);
  });

  it('strips <!ENTITY declarations', () => {
    const input = '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>';
    expect(sanitizeSvg(input)).not.toMatch(/<!ENTITY/i);
  });

  it('strips entire <!DOCTYPE block', () => {
    const input = '<!DOCTYPE foo [ <!ENTITY xxe "data"> ]><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    expect(sanitizeSvg(input)).not.toMatch(/<!DOCTYPE/i);
  });
});

// ─── <use> with external href blocked ────────────────────────────────────────

describe('sanitizeSvg — <use> with external href stripped', () => {
  it('strips external href from <use>', () => {
    const input = svg('<use href="https://evil.com/sprite.svg#icon"/>');
    const output = sanitizeSvg(input);
    // either the href attr is removed or the whole use element is stripped
    expect(output).not.toMatch(/href\s*=\s*["']https?:/i);
  });

  it('strips external xlink:href from <use>', () => {
    const input = svg('<use xlink:href="http://evil.com/sprite.svg#x"/>');
    expect(sanitizeSvg(input)).not.toMatch(/xlink:href\s*=\s*["']https?:/i);
  });

  it('allows <use> with local fragment ref', () => {
    const input = svg('<defs><circle id="c" r="5"/></defs><use href="#c"/>');
    expect(sanitizeSvg(input)).toContain('href="#c"');
  });
});

// ─── <image> with external src blocked ───────────────────────────────────────

describe('sanitizeSvg — <image> with external href/src stripped', () => {
  it('strips external href from <image>', () => {
    const input = svg('<image href="https://evil.com/track.gif" width="1" height="1"/>');
    expect(sanitizeSvg(input)).not.toMatch(/href\s*=\s*["']https?:/i);
  });

  it('strips http src from <image>', () => {
    const input = svg('<image src="http://evil.com/track.png" width="1" height="1"/>');
    expect(sanitizeSvg(input)).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
  });
});

// ─── CSS @import / expression() in <style> ───────────────────────────────────

describe('sanitizeSvg — dangerous CSS in <style> stripped', () => {
  it('removes @import in <style>', () => {
    const input = svg('<style>@import url("https://evil.com/evil.css");</style>');
    expect(sanitizeSvg(input)).not.toMatch(/@import/i);
  });

  it('removes expression() in <style>', () => {
    const input = svg('<style>rect{width:expression(alert(1))}</style>');
    expect(sanitizeSvg(input)).not.toMatch(/expression\s*\(/i);
  });
});

// ─── SvgForbiddenError export ─────────────────────────────────────────────────

describe('SvgForbiddenError', () => {
  it('is exported and is an Error subclass', () => {
    const err = new SvgForbiddenError('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SvgForbiddenError);
    expect(err.message).toBe('test message');
    expect(err.name).toBe('SvgForbiddenError');
  });
});
