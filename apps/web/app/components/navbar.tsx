// app/components/navbar.tsx
import { Fragment } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { LangToggle } from "@/app/components/lang-toggle";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";

export function Navbar({ dict, editable = false }: { dict: Dictionary["nav"]; editable?: boolean }) {
  return (
    // data-sx-block: the scope every generated colour-override selector is anchored to. Rendered
    // on the PUBLIC site too (unlike data-edit-*), because the override CSS must match there.
    <div className="master_navigation" data-sx-block="nav">
      <div className="banner-navbar" />
      <div
        className="navbar w-nav"
        data-animation="default"
        data-collapse="medium"
        data-doc-height="1"
        data-duration="0"
        data-easing="linear"
        data-easing2="linear"
        data-no-scroll="1"
        data-w-id="8cf60b1d-bffe-d9ea-a5b9-44c5b13f8eb0"
        role="banner"
      >
        <div className="wrap_nav-container">
          <div className="nav-container">
            <div className="nav-bg_desktop" />
            <div className="nav-bg_mobile" />
            <div className="nav_left">
              <div className="menu-button w-nav-button">
                <div className="menu-button_inner open">
                  <div className="icon_menu w-embed">
                    <svg fill="none" height="100%" viewBox="0 0 12 12" width="100%" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M2 6L10 6M2 9H10M2 3L10 3"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="var(--_❇️-icon---icon-stroke)"
                      />
                    </svg>
                  </div>
                </div>
                <div className="menu-button_inner close">
                  <div className="icon_menu w-embed">
                    <svg fill="none" height="100%" viewBox="0 0 12 12" width="100%" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M9 3L3 9M3 3L9 9"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.25"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <nav className="nav-menu w-nav-menu" role="navigation">
                <div className="nav_wrap-menu">
                  <div className="nav-menu_inner">
                    {/* Top-level nav: Home / About / Contact (dict-driven, EN + VI). Replaces
                        Caladan's Company-dropdown + About us + Gallery. A .divider_mobile-menu
                        precedes each item (mobile menu styling), matching the original pattern. */}
                    {dict.links.map((l, i) => (
                      <Fragment key={l.label}>
                        <div className="divider_mobile-menu" />
                        <a className="link_nav w-inline-block" href={l.href} nav-link="">
                          <div>
                            <span {...editableAttrs(editable, `nav.links.${i}.label`, { text: { maxLength: 80 } })}>{l.label}</span>
                          </div>
                        </a>
                      </Fragment>
                    ))}
                    {/* EN/VI language switch inside the mobile menu (replaces Caladan's
                        "More Templates" CTA + the © Eclipso Studio / Made-with-Webflow footer,
                        both removed). .nav-menu_mobile-button is display:none on desktop and
                        only shows ≤991px, so this toggle appears only when the mobile menu is
                        open — the desktop toggle lives in .nav_right. */}
                    <div className="divider_mobile-menu" />
                    <div className="nav-menu_mobile-button">
                      <LangToggle editable={editable} />
                    </div>
                  </div>
                </div>
              </nav>
            </div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- faithful port of Webflow markup; navigation is driven by the Webflow runtime, not next/link */}
            <a className="brand_navbar w-nav-brand" href="/">
              {/* Signex logo rendered as a CSS mask filled with the nav links' ink token
                  (tone--strong) so it matches "Trang chủ / Về chúng tôi / Liên hệ" exactly and
                  tracks them in every navbar state. Sized by height (aspect ratio ≈2.4:1).
                  When logoUrl is available from the snapshot, override the CSS mask-image inline
                  so the live CDN URL is used instead of the bundled /assets path (Task 61b). */}
              <span
                className="signex-logo-nav"
                role="img"
                aria-label="Signex"
                style={
                  dict.logoUrl
                    ? { WebkitMaskImage: `url("${dict.logoUrl}")`, maskImage: `url("${dict.logoUrl}")` }
                    : undefined
                }
                {...editableAttrs(editable, "nav.logo", { image: true })}
              />
            </a>
            <div className="nav_corners-wrap">
              <div className="nav_side w-embed">
                <svg fill="none" height="100%" viewBox="0 0 100 100" width="100%" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M48.1 0V1.9C75.7 1.9 98.1 24.3 98.1 51.9H100V0H48.1Z"
                    fill="var(--_🎨-color--tokens---ink--base)"
                  />
                </svg>
              </div>
              <div className="nav_side right w-embed">
                <svg fill="none" height="100%" viewBox="0 0 100 100" width="100%" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M51.9 0V1.9C24.3 1.9 1.9 24.3 1.9 51.9H0V0H51.9Z"
                    fill="var(--_🎨-color--tokens---ink--base)"
                  />
                </svg>
              </div>
            </div>
            <div className="nav_right">
              {/* EN/VI toggle wrapped in Caladan's .nav_button-desktop, which is display:none
                  at ≤991px — so it hides on small screens exactly like the ref's "View Resorts"
                  link (the navbar collapses to the hamburger at the same `medium` breakpoint). */}
              <div className="nav_button-desktop">
                <LangToggle editable={editable} />
              </div>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- faithful port of Webflow markup; navigation is driven by the Webflow runtime, not next/link */}
              <a
                button=""
                className="cta_primary w-inline-block"
                data-cta="nav-quote"
                data-wf--cta-primary--variant="primary"
                href="/contact"
                /* What the colour engine resolves here, VERIFIED against the stylesheet: the .btn-bg
                   child that paints this pill declares
                   background-color: var(--_🎨-color--tokens---button--primary--default--background),
                   i.e. TOKEN_VARS.btnPrimaryBg (#0d2b44 via the accentDarkOcean seed). Recorded as
                   the expected answer, NOT as a declaration — resolveRoles reads it from the live
                   CSSOM at click time; see EditableOpts.color. */
                {...editableAttrs(editable, "nav.cta.color", { color: true })}
              >
                <div className="button_text-mask">
                  <div button-text="" className="text-button">
                    <span {...editableAttrs(editable, "nav.cta.label", { text: { maxLength: 80 } })}>{dict.cta}</span>
                  </div>
                </div>
                <div button-bg="" className="btn-bg" />
              </a>
            </div>
          </div>
        </div>
      </div>
      <div className="nav_bg" />
    </div>
  );
}
