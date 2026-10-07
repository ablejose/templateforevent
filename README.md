# event-template

Reusable **catering / event-management website template** (Next.js 14 · TypeScript ·
Tailwind · GSAP/Motion). One codebase, many clients: all personal data sits in a
single per-event file, everything reusable stays in the template.

## Swap an event in one file

```ts
// event.config.ts
import { madeena } from "@/events/madeena.config";
export const event = madeena;
```

Full instructions: **[EVENT-SETUP.md](./EVENT-SETUP.md)**

## One site per row of the business sheet

`npm run sitegen -- --sheet "<google sheet url>"` builds and deploys a site for
every business (their details + their Google photos in the gallery; everything
else from the template). See **[SITEGEN.md](./SITEGEN.md)**.
Keeping each build feeling custom: **[IMPROVEMENT-PLAN.md](./IMPROVEMENT-PLAN.md)**

Live demo (dummy data): https://event-template-demo.vercel.app

## Architecture

```
event.config.ts            <- THE ONE FILE TO SWAP (points at an event)
events/
  madeena.config.ts        <- personal data for one client
  _new-event.config.ts     <- starter to copy
config/
  event-schema.ts          <- shape of an event (types + rules)
  template.ts              <- SHARED copy: what we do, how we work, headings, CTAs
  site.ts                  <- derived: flat `site`, waLink, telLink, nav, brand assets
  services.ts              <- derived: shared cards (+ per-event overrides)
  process.ts               <- derived: shared steps (+ per-event overrides)
  gallery.ts               <- derived: their photos/reels, resolved to media.base
  reviews.ts               <- derived: their real reviews
  menu.ts                  <- derived: Kerala wedding menu for the quote builder (+ per-event override)
  seo.ts                   <- derived: metadata + schema.org LocalBusiness
lib/copy.ts                <- {token} fill + media path resolver
app/                       <- layout (metadata), page, sitemap, robots, manifest
sections/                  <- Hero, TrustBar, Services, Gallery, Process, About,
                              Testimonials, Menu (quote builder), Footer (visit + map)
components/                <- Header, Loader, Lightbox, Reveal, SmoothScroll, WhatsAppFab, ui/
public/
  template/                <- stock art shared by every event
  events/<slug>/           <- ONLY that client's photos, reels, OG image, favicons
```

Data flows one way: `events/<slug>.config.ts` -> `event.config.ts` -> `config/*`
-> sections. No section or component contains a business name, town, phone
number or asset path.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm run type-check
npm run build
```

Optional env (see `.env.example`): `NEXT_PUBLIC_WHATSAPP_NUMBER`,
`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.

## Live builds from this template

- Madeena Catering & Event Management, Perintalmanna — `events/madeena.config.ts`
- Agnel Caters & Events, Changanassery — `events/agnel.config.ts`
