/**
 * ============================================================
 *  THE ONE FILE TO SWAP.
 * ============================================================
 * Point this at the event you are building. Everything else —
 * pages, SEO, schema.org, manifest, icons, WhatsApp links, media —
 * follows from it.
 *
 *   1. copy events/_new-event.config.ts -> events/<slug>.config.ts
 *   2. drop their photos/videos in     -> public/events/<slug>/
 *   3. change the two lines below.
 *
 * Nothing else in the repo needs to change between events.
 *
 * Available events:
 *   demo     -> events/demo.config.ts     (dummy data; what the hosted preview shows)
 *   madeena  -> events/madeena.config.ts  (Madeena Catering, Perintalmanna)
 *   agnel    -> events/agnel.config.ts    (Agnel Caters & Events, Changanassery)
 */
import type { EventConfig } from "@/config/event-schema";
import { agnel } from "@/events/agnel.config";
import { fromBusiness, type BusinessInput } from "@/events/from-business";
import active from "@/events/active.json";

/**
 * Bulk sites: `scripts/sitegen.mjs` writes one business into events/active.json
 * before each build. When it's `null` (the default, committed state) the site
 * builds the hand-made event below.
 */
const generated = active as unknown as BusinessInput | null;

export const event: EventConfig = generated ? fromBusiness(generated) : agnel;

export default event;
