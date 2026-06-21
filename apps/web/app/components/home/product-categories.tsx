import type { Dictionary } from "@/app/[lang]/dictionaries";
import { categoryImage } from "@/app/lib/product-images";

/**
 * ProductCategories — the home-page product-category grid. Repurposes Caladan's
 * "section_hero-resorts" 2×2 card grid (formerly the resort "Choose Your Lagoon Sanctuary"
 * collection) IN PLACE: the section slot, card grid, and IX2 reveal/hover/parallax data-w-id
 * bindings are kept verbatim so the Webflow animations still fire on the home page. Only the
 * content is signex's — four product categories, each card linking to /products/<slug>
 * (detail pages are a later step). Dict-driven Server Component (EN + VI), like Features.
 *
 * The headline is restyled to MATCH the HomeAbout section: a two-tone h2 (.tone-medium accent)
 * + a description paragraph, reusing Caladan's .headline_home-about / .home_about-p classes
 * (so the globals.css 10-column width override applies here too — identical to "About SIGNEX").
 *
 * data-w-id REUSE (do NOT change — these were re-pointed to home-page triggers; see git
 * history of resorts-collection.tsx for the cross-page IX2 gating fix):
 *   • section          ad1a3029-…eb18
 *   • headline wrapper  0f29df12-…d663  (home reveal a-124: opacity + unblur)
 *   • grid wrapper      b3ac1ddc-…ce8d  (home reveal a-124)
 *   • each card <a>     6d379b8b-…676f  (card hover-zoom a-112/a-113, relative CHILDREN selector)
 *   • each image wrap   6d379b8b-…6770  (image parallax a-114, relative CHILDREN selector)
 * The 6d379b8b ids are shared across all four cards on purpose: their actionLists use
 * useEventTarget:"CHILDREN", so each card animates only its own .image_cover.
 */
export function ProductCategories({ dict }: { dict: Dictionary["products"] }) {
  const t = dict;

  return (
    <section className="section_hero-resorts" data-w-id="ad1a3029-1630-4dbd-9a8f-fd5ea3c4eb18">
      <div className="padding-global">
        <div className="w-layout-blockcontainer container-large w-container">
          <div className="headline_home-about" data-w-id="0f29df12-8c38-da6f-794d-3989ac10d663" style={{ opacity: 0, filter: 'blur(5px)' }}>
            <div className="master_label" data-wf--tag--variant="base">
              <div className="label-small">
                {t.eyebrow}
              </div>
            </div>
            <h2 className="margin-0">
              {t.title}
              <span className="tone-medium">
                {t.titleAccent}
              </span>
            </h2>
            <div className="home_about-p">
              <p className="tone-medium">
                {t.body}
              </p>
            </div>
          </div>
          <div className="resorts w-dyn-list" data-w-id="b3ac1ddc-636d-f345-c58d-b372a067ce8d" style={{ opacity: 0, filter: 'blur(5px)' }}>
            <div className="grid_resorts w-dyn-items" role="list">
              {t.categories.map((cat, i) => (
                <div className="w-dyn-item" role="listitem" key={cat.slug}>
                  <a className="card_resort-v1 w-inline-block" data-w-id="6d379b8b-4b7f-2d17-709e-271c021c676f" href={`/products/${cat.slug}`}>
                    <div className="image_resort-v1" data-w-id="6d379b8b-4b7f-2d17-709e-271c021c6770">
                      <div className="overlay_resort-card-v1">
                        <div className="master_label w-variant-84e91bde-75c3-dd4c-a083-7846b4ae6170" data-wf--tag--variant="lighter">
                          <div className="label-small">
                            {cat.tag}
                          </div>
                        </div>
                      </div>
                      <img alt="" className="image_cover is-parallax" loading="lazy" src={cat.image.url || categoryImage(i)} />
                    </div>
                    <div className="wrap_content-resort-v1">
                      <div className="text-size-large text_body-bold">
                        {cat.title}
                      </div>
                      <div className="card-resort_info-tile-v1">
                        <div className="tile_room-summary">
                          <div className="icon_summary w-embed">
                            <svg className="lucide lucide-package-icon lucide-package" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
                              <path d="M12 22V12" />
                              <polyline points="3.29 7 12 12 20.71 7" />
                              <path d="m7.5 4.27 9 5.15" />
                            </svg>
                          </div>
                          <div className="wrap_text-room-summary">
                            <div>
                              {cat.products}
                            </div>
                            <div>
                              {t.statLabels.products}
                            </div>
                          </div>
                        </div>
                        <div className="tile_room-summary">
                          <div className="icon_summary w-embed">
                            <svg className="lucide lucide-layers-icon lucide-layers" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                              <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
                              <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
                              <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
                            </svg>
                          </div>
                          <div className="wrap_text-room-summary">
                            <div>
                              {cat.materials}
                            </div>
                            <div>
                              {t.statLabels.materials}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
