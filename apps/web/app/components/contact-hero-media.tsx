// app/components/contact-hero-media.tsx
// The /contact hero's media (parallax still OR background video) + its configurable overlay —
// ONE source shared by the public route and the /preview editor route (the AboutSections
// precedent), so the two renders cannot drift. Flexible slot: contactPage.hero.image
// (image OR video); overlay: contactPage.hero.overlay (absent = transparent).
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { editable as editableAttrs } from "@/app/lib/edit-attrs";
import { overlayCss } from "@signex/shared";

const FALLBACK_STILL = "/assets/images/69aeefb3f6044f0563d94f4b_sara-dubler-Koei_7yYtIo-unsplash.avif";
const FALLBACK_ALT = "Sara dubler koei 7y yt io unsplash";

export function ContactHeroMedia({
  hero,
  editable = false,
}: {
  hero: Dictionary["contactPage"]["hero"];
  editable?: boolean;
}) {
  const media = hero.media;
  const video = media?.kind === "video" ? media : null;
  return (
    <>
      {video ? (
        <video
          autoPlay
          className="image_cover is-parallax"
          loop
          muted
          playsInline
          poster={video.posterUrl}
          {...editableAttrs(editable, "contactPage.hero.image", { image: true, video: true })}
        >
          <source src={video.mp4Url} type="video/mp4" />
          {video.webmUrl && <source src={video.webmUrl} type="video/webm" />}
        </video>
      ) : (
        <img
          alt={(media?.kind === "image" && media.alt) || FALLBACK_ALT}
          className="image_cover is-parallax"
          loading="lazy"
          src={(media?.kind === "image" && media.url) || FALLBACK_STILL}
          {...editableAttrs(editable, "contactPage.hero.image", { image: true, video: true })}
        />
      )}
      <div
        className="overlay_media-config"
        style={overlayCss(hero.overlay)}
        {...(editable ? { "data-sx-overlay": "contactPage.hero.overlay" } : {})}
      />
    </>
  );
}
