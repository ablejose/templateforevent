"use client";

import { useState } from "react";
import { ChevronDown, Maximize2 } from "lucide-react";
import Reveal from "@/components/Reveal";
import { Img } from "@/components/ui/Img";
import Lightbox from "@/components/Lightbox";
import { galleryImages } from "@/config/gallery";
import { copy } from "@/config/site";
import { t } from "@/lib/copy";

/** Photos shown before "Show all" — enough to fill three masonry columns. */
const INITIAL = 9;

/**
 * OUR WORK — the client's own photos as a masonry wall. Tap any photo for the
 * full-size lightbox. Photos only (no video), straight from the event config.
 */
export default function Gallery() {
  const [active, setActive] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? galleryImages : galleryImages.slice(0, INITIAL);
  const more = galleryImages.length - INITIAL;
  if (galleryImages.length === 0) return null;

  return (
    <section id="gallery" aria-labelledby="gallery-heading" className="bg-cream py-16 md:py-24">
      <div className="mx-auto max-w-shell px-6">
        <div className="grid grid-cols-1 items-end gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow">{copy.gallery.eyebrow}</p>
            <h2 id="gallery-heading" className="display mt-4" style={{ fontSize: "clamp(2rem, 3.8vw, 3.2rem)" }}>
              {copy.gallery.heading}
            </h2>
            <p className="body-copy mt-4 max-w-xl">{t(copy.gallery.body)}</p>
          </Reveal>
          <Reveal delay={0.08}>
            <blockquote className="display border-l border-saffron/50 pl-6 italic text-espresso/85" style={{ fontSize: "clamp(1.25rem, 2.2vw, 1.75rem)" }}>
              &ldquo;{t(copy.gallery.photoQuote)}&rdquo;
            </blockquote>
          </Reveal>
        </div>

        <div className="relative mt-12">
          <div className="columns-2 gap-3 md:columns-3 md:gap-5 [&>*]:mb-3 md:[&>*]:mb-5">
            {shown.map((item, i) => (
              <Reveal key={item.src} delay={(i % 3) * 0.06} className="break-inside-avoid">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Open photo: ${item.alt}`}
                  className="group relative block w-full overflow-hidden rounded-brand bg-sand"
                >
                  <Img
                    src={item.src}
                    alt={item.alt}
                    fallbackSeed={item.src}
                    className="h-auto w-full object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
                  />
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/0 to-ink/0 opacity-70 transition-opacity duration-500 group-hover:opacity-100" />
                  {item.caption && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-left font-sans text-[0.72rem] font-medium text-ivory md:p-4 md:text-sm">
                      {item.caption}
                    </span>
                  )}
                  <span className="pointer-events-none absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-ivory/85 text-espresso opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <Maximize2 size={15} />
                  </span>
                </button>
              </Reveal>
            ))}
          </div>

          {!all && more > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-cream via-cream/80 to-transparent" />
          )}
        </div>

        {more > 0 && (
          <div className="relative mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-espresso/20 bg-white px-6 py-3 font-sans text-sm font-medium text-espresso transition-all duration-300 hover:-translate-y-0.5 hover:border-saffron"
            >
              {all ? copy.gallery.showLess : copy.gallery.showAll.replace("{count}", String(galleryImages.length))}
              <ChevronDown size={16} className={all ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
          </div>
        )}
      </div>

      <Lightbox items={galleryImages} index={active} onClose={() => setActive(null)} onNav={setActive} />
    </section>
  );
}
