/** DERIVED — all SEO / schema.org values, generated from the event config. */
import { event } from "@/event.config";
import { templateCopy } from "@/config/template";
import { t } from "@/lib/copy";
import { brandAssets, site } from "@/config/site";
import { services } from "@/config/services";

const s = templateCopy.seo;

export const seo = {
  title: t(s.title),
  titleTemplate: t(s.titleTemplate),
  description: event.seo?.description ?? t(s.description),
  ogDescription: t(s.ogDescription),
  keywords: [...s.keywords.map(t), ...(event.seo?.keywords ?? [])],
  category: s.category,
  locale: s.locale,
  lang: s.lang,
};

/** LocalBusiness structured data for the active event. */
export const jsonLd = {
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "Caterer", "FoodEstablishment"],
  "@id": `${site.url}/#business`,
  name: site.fullName,
  alternateName: site.name,
  description: seo.description,
  slogan: site.tagline,
  image: [`${site.url}${brandAssets.ogImage}`, `${site.url}${brandAssets.heroPoster}`],
  logo: `${site.url}${brandAssets.dir}/android-chrome-512x512.png`,
  url: site.url,
  telephone: site.phone,
  priceRange: s.priceRange,
  currenciesAccepted: s.currency,
  paymentAccepted: s.payment,
  servesCuisine: [...s.cuisines],
  address: {
    "@type": "PostalAddress",
    streetAddress: event.location.street,
    addressLocality: event.location.city,
    addressRegion: event.location.region,
    postalCode: event.location.postalCode,
    addressCountry: event.location.country,
  },
  geo: event.location.geo
    ? { "@type": "GeoCoordinates", latitude: event.location.geo.lat, longitude: event.location.geo.lng }
    : undefined,
  hasMap: site.mapsLink,
  areaServed: site.serviceAreas.map((a) => ({ "@type": "City", name: a })),
  sameAs: [event.web.instagram, event.web.facebook, event.web.youtube].filter(Boolean),
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    opens: event.location.opens ?? "09:00",
    closes: event.location.closes ?? "21:00",
  },
  aggregateRating: site.reviews
    ? { "@type": "AggregateRating", ratingValue: site.rating.toFixed(1), reviewCount: String(site.reviews) }
    : undefined,
  makesOffer: services.map((sv) => ({
    "@type": "Offer",
    itemOffered: { "@type": "Service", name: sv.title, description: sv.blurb },
  })),
};
