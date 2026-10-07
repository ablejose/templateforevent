"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { copy, heroSlides, logoMark, site, waLink } from "@/config/site";
import { t } from "@/lib/copy";

/** A new slide every 2s. Each one slides in from the right, so the show always moves forward. */
const HERO_INTERVAL_MS = 2000;
const SLIDE_MS = 1100;
const SLIDE_EASE = "cubic-bezier(0.77, 0, 0.18, 1)";

export default function Hero() {
  const mediaRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  // `step` only ever increases; the visible slide is step % length.
  const [step, setStep] = useState(0);
  const count = heroSlides.length;
  const current = step % count;

  useEffect(() => {
    heroSlides.forEach((s) => {
      const im = new window.Image();
      im.src = s.src;
    });
  }, []);

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setStep((s) => s + 1);
    }, HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count]);

  // Incoming slide travels in from the right over the outgoing one, which drifts
  // left a little (parallax). Everything else waits off-stage on the right.
  useLayoutEffect(() => {
    const prev = (step - 1 + count) % count;
    slideRefs.current.forEach((el, i) => {
      if (!el) return;
      el.getAnimations().forEach((a) => a.cancel());
      const img = el.firstElementChild as HTMLElement | null;
      img?.getAnimations().forEach((a) => a.cancel());
      if (i === current) {
        el.style.zIndex = "2";
        el.style.transform = "translateX(0)";
        if (step > 0) {
          el.animate([{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], {
            duration: SLIDE_MS,
            easing: SLIDE_EASE,
          });
        }
        img?.animate([{ transform: "scale(1.12)" }, { transform: "scale(1)" }], {
          duration: HERO_INTERVAL_MS + SLIDE_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        });
      } else if (i === prev && step > 0) {
        el.style.zIndex = "1";
        el.style.transform = "translateX(-30%)";
        el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-30%)" }], {
          duration: SLIDE_MS,
          easing: SLIDE_EASE,
        });
      } else {
        el.style.zIndex = "0";
        el.style.transform = "translateX(100%)";
      }
    });
  }, [step, current, count]);

  useEffect(() => {
    const r = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (r) return;
    let ctx: any;
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        gsap.to(mediaRef.current, {
          y: 80,
          ease: "none",
          scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: true },
        });
      });
    })();
    return () => ctx?.revert();
  }, []);

  return (
    <section id="hero" className="relative h-[100svh] min-h-[600px] w-full overflow-hidden bg-espresso">
      <div ref={mediaRef} className="absolute inset-0" style={{ willChange: "transform" }}>
        {heroSlides.map((s, i) => (
          <div
            key={s.src}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            className="absolute inset-0 overflow-hidden"
            style={{ transform: i === 0 ? "translateX(0)" : "translateX(100%)", zIndex: i === 0 ? 2 : 0 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.src}
              alt={i === current ? s.alt : ""}
              aria-hidden={i !== current}
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover"
              style={{ transformOrigin: "50% 60%" }}
            />
          </div>
        ))}
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-[3]"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 50%, rgba(20,16,12,0.5) 0%, rgba(20,16,12,0.25) 100%), radial-gradient(110% 80% at 50% 45%, rgba(20,16,12,0.2) 0%, rgba(20,16,12,0.55) 60%, rgba(20,16,12,0.85) 100%), linear-gradient(to top, rgba(20,16,12,0.92) 0%, rgba(20,16,12,0) 50%)",
        }}
      />

      <div className="relative z-10 mx-auto flex h-full max-w-shell flex-col items-center justify-center px-6 pt-16 text-center">
        {logoMark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoMark} alt="" aria-hidden className="mb-5 h-14 w-14 object-contain md:h-16 md:w-16" />
        )}
        <p className="eyebrow eyebrow-center" style={{ color: "rgba(255,255,255,0.85)" }}>
          {t(copy.hero.eyebrow)}
        </p>
        <h1 className="mt-4 flex flex-col items-center">
          <span
            className="display-xl text-ivory"
            style={{
              // Long names (generated sites) step down so they stay on one or two lines.
              fontSize: site.name.length > 18 ? "clamp(2.2rem, 5.5vw, 4.4rem)" : site.name.length > 10 ? "clamp(2.8rem, 7vw, 5.6rem)" : "clamp(3.4rem, 9vw, 7rem)",
              textShadow: "0 4px 40px rgba(0,0,0,0.35)",
            }}
          >
            {site.name}
          </span>
          <span
            className="mt-2 font-sans text-[0.78rem] font-semibold uppercase md:text-sm"
            style={{ letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#F1D9A6", textShadow: "0 1px 16px rgba(0,0,0,0.6)" }}
          >
            {site.descriptor}
          </span>
        </h1>

        <p className="display mt-7 max-w-2xl italic" style={{ fontSize: "clamp(1.25rem, 2.6vw, 1.9rem)", color: "rgba(255,255,255,0.95)" }}>
          {site.headline}
        </p>

        {site.taglineMl && <p className="mt-2 max-w-xl font-sans text-sm font-light text-ivory/80">{site.taglineMl}</p>}

        {site.reviews > 0 && (
          <a
            href={site.mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex items-center gap-2.5 rounded-full border border-ivory/25 bg-ivory/10 px-4 py-2 font-sans text-xs text-ivory backdrop-blur-sm transition-colors hover:bg-ivory/15 md:text-sm"
          >
            <span className="flex gap-0.5" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={13} className="fill-saffron text-saffron" />
              ))}
            </span>
            <span>
              <strong className="font-semibold">{site.rating.toFixed(1)}</strong> · {site.reviews} Google reviews
            </span>
          </a>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href={copy.cta.primaryHref} variant="gold">
            {copy.cta.secondary}
          </Button>
          <Button href={waLink()} variant="outline" external className="border-ivory/50 text-ivory hover:bg-ivory/10">
            <WhatsAppIcon size={17} /> {copy.cta.whatsapp}
          </Button>
        </div>
      </div>

    </section>
  );
}
