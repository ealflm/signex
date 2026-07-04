/**
 * SIGNEX lotus mark — the same emblem the public site uses for its favicon/brand.
 * Filled petals in `currentColor` so it inherits the surrounding text color (e.g.
 * `text-primary-foreground` inside the tinted brand box). Geometry mirrors the
 * public site's lotus (5 outer + 4 interleaved inner petals fanning up).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="21 21 470 470"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <defs>
        <path id="signex-petal-outer" d="M0 0 C -64 -64 -46 -168 0 -212 C 46 -168 64 -64 0 0 Z" />
        <path id="signex-petal-inner" d="M0 0 C -42 -42 -28 -112 0 -146 C 28 -112 42 -42 0 0 Z" />
      </defs>
      <g transform="translate(256 362)">
        <use href="#signex-petal-outer" transform="rotate(-72)" />
        <use href="#signex-petal-outer" transform="rotate(-36)" />
        <use href="#signex-petal-outer" />
        <use href="#signex-petal-outer" transform="rotate(36)" />
        <use href="#signex-petal-outer" transform="rotate(72)" />
        <use href="#signex-petal-inner" transform="rotate(-54)" />
        <use href="#signex-petal-inner" transform="rotate(-18)" />
        <use href="#signex-petal-inner" transform="rotate(18)" />
        <use href="#signex-petal-inner" transform="rotate(54)" />
      </g>
    </svg>
  );
}
