/**
 * EVENT-TEMPLATE — schema for the per-event data file.
 *
 * Everything in this file is the shape of the ONE file you swap per client:
 * `events/<slug>.config.ts`. Nothing here is template copy — template copy
 * ("what we do", "how we work", section headings) lives in `config/template.ts`.
 *
 * Rules of the architecture:
 *   1. Personal data  (name, phone, address, maps, reviews, photos, videos) -> events/<slug>.config.ts
 *   2. Personal media (only their own photos/videos)                        -> public/events/<slug>/...
 *   3. Reusable copy + stock art (how we work / what we do)                 -> config/template.ts + public/template/
 *   4. Sections/components NEVER hardcode a business detail. They read config.
 *
 * Everything added below this line is OPTIONAL and backward compatible —
 * existing events/<slug>.config.ts files that do not set them keep building
 * and rendering exactly as before.
 */

/** A media path. Relative paths ("gallery/01.webp") resolve against `media.base`. */
export type MediaPath = string;

export interface EventImage {
  /** Relative to media.base, or an absolute "/..." / "https://..." URL. */
  src: MediaPath;
  alt: string;
}

/**
 * A gallery/about entry. Accepts a plain path/URL string (alt is generated),
 * or an object with an optional `alt` and an optional `caption` shown under
 * the photo in the Gallery section.
 */
export type GalleryEntry = MediaPath | { src: MediaPath; alt?: string; caption?: string };

/** One dish on the quote-builder menu. */
export interface MenuItem {
  /** Stable id, unique across the whole menu. */
  id: string;
  name: string;
  /** Malayalam name shown under the English one. */
  ml?: string;
  note?: string;
  veg?: boolean;
}

export interface MenuCategory {
  id: string;
  title: string;
  /** Malayalam category title. */
  ml?: string;
  items: MenuItem[];
}

export interface MenuPreset {
  title: string;
  note: string;
  /** MenuItem ids. */
  items: string[];
}

export interface EventReview {
  name: string;
  rating: number;
  quote: string;
  /** Where the review came from. Default: "Google review". */
  source?: string;
}

/**
 * Which section order + copy set to use. Defaults to "catering" when unset.
 *   catering -> menu/services + food gallery first.
 *   events   -> services, decor and stages first.
 *   wedding  -> planning process and venues first.
 */
export type EventVariant = "catering" | "events" | "wedding";

export interface EventConfig {
  /** URL-safe id. Must match the folder name under public/events/<slug>/. */
  slug: string;

  /** Section order + copy set for this business. Default: "catering". */
  variant?: EventVariant;

  brand: {
    /** Big display word in the hero, header, loader, footer. e.g. "Madeena" */
    name: string;
    /** Legal / full business name used for SEO + schema.org. */
    fullName: string;
    /** Small line under the name. e.g. "Catering & Event Management" */
    descriptor: string;
    /** Tiny uppercase label in header/footer. e.g. "Catering & Events" */
    kicker: string;
    /** One-line promise. e.g. "Weddings & events, catered with care." */
    tagline: string;
    /** Local hero headline shown under the name. Falls back to `tagline` when unset. */
    headline?: string;
    /** Optional Malayalam line shown under the headline/tagline in the hero. */
    taglineMl?: string;
  };

  contact: {
    /** Display phone, e.g. "+91 94951 63651". tel: link is derived. */
    phone: string;
    /** wa.me digits only, e.g. "919495163651". */
    whatsapp: string;
    /** Optional second display phone, shown in the footer. */
    phoneAlt?: string;
    email?: string;
  };

  location: {
    /** Town/city. e.g. "Perintalmanna" */
    city: string;
    /** District or wider area shown next to the city. e.g. "Malappuram" */
    district: string;
    /** State/region. e.g. "Kerala" */
    region: string;
    /** Neighbourhood / landmark area. e.g. "Thelakkad" */
    area?: string;
    /** Full one-line postal address. */
    address: string;
    street: string;
    postalCode: string;
    country: string;
    /** Towns served, used in footer + schema.org areaServed. */
    serviceAreas: string[];
    /** Map pin. Optional for generated sites where Places has no match. */
    geo?: { lat: number; lng: number };
    /** Share link to the Google Business Profile / Maps pin. */
    mapsLink: string;
    /** Embeddable maps URL (output=embed). */
    mapEmbed?: string;
    /** Human hours line, e.g. "Open 24 hours · all days". */
    hours: string;
    /** schema.org opening hours. */
    opens?: string;
    closes?: string;
    delivery?: boolean;
  };

  web: {
    /** Production origin, no trailing slash. */
    url: string;
    instagram?: string;
    facebook?: string;
    youtube?: string;
  };

  reputation: {
    rating: number;
    reviews: number;
  };

  /**
   * Brand theme colours, applied as CSS variables in the layout and picked up
   * by every button/accent/heading that currently uses the saffron palette.
   * Omit to keep the template's default gold palette.
   */
  theme?: {
    /** Hex colour, e.g. "#C4892E". Primary accent (buttons, highlights, eyebrows). */
    primary: string;
    /** Hex colour, e.g. "#A9721F". Secondary accent (hovers, kickers). */
    accent: string;
  };

  /**
   * Short service cards rendered as a lightweight grid near the top of the
   * page. Independent of `overrides.services` (the full "what we do" cards).
   * Leave unset/empty to hide the section.
   */
  services?: { title: string; note?: string }[];

  /** Short chips rendered near the hero (e.g. "500+ events styled"). Leave unset/empty to hide. */
  highlights?: string[];

  media: {
    /** Folder holding ONLY this client's own photos/videos. */
    base: string;
    /** Hero still — also used when the visitor prefers reduced motion. */
    heroPoster: MediaPath;
    /**
     * Hero slideshow, in order. Each slide slides in from the right, always
     * moving forward. Falls back to the template's stock hero slides when unset.
     */
    heroSlides?: GalleryEntry[];
    /** Transparent brand mark (PNG/SVG) used in the loader and header. Optional. */
    logoMark?: MediaPath;
    /** 1200x630 social share image. */
    ogImage: MediaPath;
    /** Favicon/app-icon folder for this brand. */
    brandDir?: MediaPath;
    /** Crossfading pair (or more) in the About section. */
    about: GalleryEntry[];
    /** "Our work" photos — their real events only. */
    gallery: GalleryEntry[];
  };

  /** Real reviews only. Leave empty to hide the Reviews section. */
  reviews: EventReview[];

  seo?: {
    /** Extra keywords on top of the generated ones. */
    keywords?: string[];
    /** Overrides the generated meta description. */
    description?: string;
  };

  /**
   * Optional per-event overrides of template copy. Anything left out falls back
   * to config/template.ts, so a new event usually sets nothing here.
   */
  overrides?: {
    /** Replace the shared service cards for this client. */
    services?: {
      id: string;
      title: string;
      blurb: string;
      bullets: string[];
      image?: MediaPath;
    }[];
    /** Replace the shared "how we work" steps. */
    process?: { n: string; title: string; text: string }[];
    /** About paragraph — supports {tokens}; see config/template.ts. */
    aboutBody?: string;
    /** Replace the shared Kerala wedding menu (config/template.ts `templateMenu`). */
    menu?: MenuCategory[];
    /** Replace the shared "start from a classic menu" presets. Item ids must exist in the menu. */
    menuPresets?: MenuPreset[];
  };
}
