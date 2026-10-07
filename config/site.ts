/**
 * DERIVED — do not put client details here. Edit events/<slug>.config.ts instead.
 * This adapter exposes the active event as the flat `site` object the sections use.
 */
import { event } from "@/event.config";
import { templateCopy, variantCopy } from "@/config/template";
import { t, asset } from "@/lib/copy";
import type { GalleryEntry } from "@/config/event-schema";

export { event };

/** Active variant, defaulting to "catering" (the original/default copy + order). */
export const variant = event.variant ?? "catering";

const vc = variantCopy[variant] ?? {};

/** Shared template copy, with this event's variant overrides applied one level deep. */
export const copy = {
  ...templateCopy,
  hero: { ...templateCopy.hero, ...vc.hero },
  services: { ...templateCopy.services, ...vc.services },
  gallery: { ...templateCopy.gallery, ...vc.gallery },
  process: { ...templateCopy.process, ...vc.process },
  about: { ...templateCopy.about, ...vc.about },
};

export const site = {
  name: event.brand.name,
  fullName: event.brand.fullName,
  descriptor: event.brand.descriptor,
  kicker: event.brand.kicker,
  tagline: event.brand.tagline,
  /** Local hero headline. Falls back to the tagline when unset. */
  headline: event.brand.headline ?? event.brand.tagline,
  /** Optional Malayalam line under the tagline/headline. */
  taglineMl: event.brand.taglineMl,
  city: `${event.location.city}, ${event.location.region}`,
  district: event.location.district,
  region: event.location.region,
  area: event.location.area,
  phone: event.contact.phone,
  phoneAlt: event.contact.phoneAlt,
  email: event.contact.email,
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || event.contact.whatsapp,
  address: event.location.address,
  serviceAreas: event.location.serviceAreas,
  rating: event.reputation.rating,
  reviews: event.reputation.reviews,
  hours: event.location.hours,
  delivery: event.location.delivery ?? false,
  mapsLink: event.location.mapsLink,
  mapEmbed: event.location.mapEmbed,
  url: event.web.url,
  instagram: event.web.instagram,
  facebook: event.web.facebook,
  /** Short chips rendered near the hero. Empty when unset. */
  highlights: event.highlights ?? [],
  /** Short service cards for the quick-glance grid. Empty when unset. */
  quickServices: event.services ?? [],
} as const;

/** Drops the "Delivery available" line from shared lists when the event doesn't deliver. */
export const withoutDelivery = (list: string[]) =>
  site.delivery ? list : list.filter((s) => s !== templateCopy.trustBar.deliveryLabel);

/** Stock hero slides shared by every site that sets no `media.heroSlides`. */
const TEMPLATE_HERO_SLIDES = ["/template/hero/03.webp", "/template/hero/01.webp"];

const slide = (e: GalleryEntry, i: number) =>
  typeof e === "string"
    ? { src: asset(e), alt: `${event.brand.fullName} — celebration ${i + 1}` }
    : { src: asset(e.src), alt: e.alt ?? e.caption ?? `${event.brand.fullName} — celebration ${i + 1}` };

export const heroSlides = (event.media.heroSlides ?? TEMPLATE_HERO_SLIDES).map(slide);

/** Optional transparent brand mark for the loader + header. */
export const logoMark = event.media.logoMark ? asset(event.media.logoMark) : undefined;

export const DEFAULT_WA_MESSAGE = t(templateCopy.cta.waMessage);

export const waLink = (text: string = DEFAULT_WA_MESSAGE) =>
  `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;

export const telLink = `tel:${site.phone.replace(/[^\d+]/g, "")}`;

/** Nav, minus links to sections this event doesn't render (no photos / no reviews). */
export const navLinks = templateCopy.nav.filter(
  (l) => !(l.href === "#gallery" && event.media.gallery.length === 0) && !(l.href === "#testimonials" && event.reviews.length === 0)
);

/** Brand icon + share image paths for this event. */
export const brandAssets = {
  dir: asset(event.media.brandDir ?? "brand"),
  ogImage: asset(event.media.ogImage),
  heroPoster: asset(event.media.heroPoster),
};

export const icon = (file: string) => `${brandAssets.dir.replace(/\/$/, "")}/${file}`;
