#!/usr/bin/env node
/**
 * sitegen — one website per business, from the business sheet.
 *
 *   node scripts/sitegen.mjs --sheet "<google sheet url | csv url | ./file.csv>" [options]
 *
 * For every business row it:
 *   1. reads name, address, area, city, phone, email, instagram, facebook, maps link
 *   2. looks the place up on Google Places (by its maps `cid`) for the map pin,
 *      district, opening hours, rating + real reviews and THEIR PHOTOS — photos are
 *      used for the gallery section only; hero/about/services stay template stock
 *   3. writes events/active.json in a worker copy of this repo and runs `next build`
 *   4. deploys the static `out/` to its own Vercel project (only changed files upload)
 *
 * Built to run unattended over thousands of rows:
 *   - every row is isolated: a failure is logged and the run moves on
 *   - everything is cached in .sitegen/ (Places JSON, photos, results), so re-running
 *     the same command resumes: finished sites are skipped, failed ones retried
 *   - builds run in parallel worker copies (--workers), deploys overlap with builds
 *   - Vercel daily-quota errors pause deploying; sites keep building and are deployed
 *     on the next run without rebuilding
 *
 * Env (or put them in .env.sitegen.local — git-ignored):
 *   GOOGLE_MAPS_API_KEY   Places API (New) key            (optional: no key = no photos/pin/reviews)
 *   VERCEL_TOKEN          Vercel token                    (optional with --no-deploy)
 *   VERCEL_TEAM           Vercel team slug or id          (optional)
 *
 * Options:
 *   --sheet <src>      Google Sheet link (reads every city tab), CSV url, or local CSV path
 *   --city <a,b>       only these cities                 --only <slug,slug>  only these sites
 *   --limit <n>        first n businesses                --workers <n>       parallel builds (default 2)
 *   --photos <n>       gallery photos per site (8)       --prefix <p>        Vercel project name prefix
 *   --no-deploy        build only, keep sites in .sitegen/sites/<slug>
 *   --force            rebuild + redeploy even if unchanged
 *   --list             just print the parsed businesses + slugs and exit
 *
 * Run with 64-bit Node 18+ (Next's compiler has no 32-bit Windows build).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, ".sitegen");
const DIRS = {
  places: path.join(WORK, "cache", "places"),
  photos: path.join(WORK, "cache", "photos"),
  workers: path.join(WORK, "workers"),
  sites: path.join(WORK, "sites"),
  logs: path.join(WORK, "logs"),
};
const LEDGER = path.join(WORK, "results.json");

/* ───────────────────────────── args + env ───────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const list = (v) => (v ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : null);

loadEnvFile(path.join(ROOT, ".env.sitegen.local"));
const CFG = {
  sheet: opt("sheet"),
  cities: list(opt("city")),
  only: list(opt("only")),
  limit: Number(opt("limit", 0)) || 0,
  workers: Math.max(1, Number(opt("workers", 2)) || 2),
  photos: Math.max(0, Number(opt("photos", 8))),
  prefix: (opt("prefix", "") || "").toLowerCase(),
  deploy: !flag("no-deploy"),
  force: flag("force"),
  listOnly: flag("list"),
  placesKey: process.env.GOOGLE_MAPS_API_KEY || "",
  vercelToken: process.env.VERCEL_TOKEN || "",
  vercelTeam: process.env.VERCEL_TEAM || "",
};

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/* ───────────────────────────── small utils ───────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);
const mkdirp = (d) => fs.mkdirSync(d, { recursive: true });

/** fetch with timeout + retries on network errors, 429 and 5xx. */
async function http(url, init = {}, { tries = 4, timeout = 45000 } = {}) {
  let last;
  for (let a = 1; a <= tries; a++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`HTTP ${res.status} ${url.split("?")[0]}`);
        last.res = res;
        await sleep(1000 * 2 ** a);
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      last = e;
      await sleep(800 * 2 ** a);
    }
  }
  // Still throttled after retries: hand the response back so callers can read the reason.
  if (last?.res) return last.res;
  throw last;
}

/** Run `fn` over `items` with at most `n` in flight. */
async function pool(items, n, fn) {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

function writeJSONAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/* ───────────────────────────── sheet ───────────────────────────── */

/** RFC 4180 CSV → array of objects keyed by the header row. */
function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  const clean = (v) => (/^#(ERROR!|N\/A|REF!|VALUE!|NAME\?|DIV\/0!)$/.test(v.trim()) ? "" : v.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, clean(r[i] ?? "")])));
}

/** Google Sheet link → every tab that looks like a business list. CSV url/path → that file. */
async function readSheet(src) {
  const id = src.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) {
    const text = /^https?:/.test(src) ? await (await http(src)).text() : fs.readFileSync(src, "utf8");
    return parseCSV(text).map((r) => ({ ...r, _tab: path.basename(src) }));
  }
  const html = await (await http(`https://docs.google.com/spreadsheets/d/${id}/htmlview`)).text();
  const gids = [...new Set([...html.matchAll(/gid=(\d+)/g)].map((m) => m[1]))];
  const tabs = new Array(gids.length).fill([]);
  await pool(gids, 6, async (gid, i) => {
    const res = await http(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
    const rows = parseCSV(await res.text());
    // Business tabs have these columns; run logs / "removed" lists don't and are skipped.
    if (!rows.length || !("Business Name" in rows[0]) || !("Full Address" in rows[0]) || !("Google Maps Link" in rows[0])) return;
    tabs[i] = rows.map((r) => ({ ...r, _tab: gid }));
  });
  // Tab order as in the sheet, so slugs come out identical on every run.
  return tabs.flat();
}

/* ───────────────────────────── business shaping ───────────────────────────── */

const GENERIC_WORD =
  /^(&|and|n|events?|eventz|management|caterers?|catering|caters?|services?|planners?|planning|decors?|decorations?|foods?|hospitality|kitchen|weddings?|wedding|photography|media|studios?|productions?|company|co|pvt|ltd|solutions?|team|international)$/i;

const titleCase = (s) =>
  s.replace(/\S+/g, (w) => (w.length <= 3 && /^[A-Z&.]+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()));

/** "SUNDAY EVENTS AND CATERERS - best in town" → { name: "Sunday Events and Caterers", short: "Sunday", descriptor: "Catering & Events" } */
function shapeName(raw) {
  let name = raw.replace(/_/g, " ").split(/\s[-|–:]\s|\s\(|\|/)[0].replace(/\s+/g, " ").trim() || raw.trim();
  if (name === name.toUpperCase()) name = titleCase(name);
  // "sunnys caterers and events" → "Sunnys Caterers and Events" (keeps "and", "of", acronyms).
  name = name.replace(/(^|\s)([a-z])(\S*)/g, (m, sp, c, rest, i) => (i > 0 && /^(and|of|the|by|in|at|n)$/.test(c + rest) ? m : sp + c.toUpperCase() + rest));
  const words = name.split(" ");
  let i = words.length;
  while (i > 1 && GENERIC_WORD.test(words[i - 1].replace(/[.,]/g, ""))) i--;
  const short = words.slice(0, i).join(" ").replace(/[&,]+$/, "").trim() || name;
  const tail = words.slice(i).join(" ").toLowerCase();
  const all = name.toLowerCase();
  const cater = /cater|food|kitchen/.test(tail || all);
  const event = /event|decor|wedding|planner/.test(tail || all);
  const descriptor = cater && event ? "Catering & Events" : cater ? "Catering Services" : event ? "Event Management" : "Catering & Events";
  return { name, short: short.length >= 3 ? short : name, descriptor };
}

const slugify = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

/** "+91 98473 48699" → "919847348699"; flags numbers that can't be on WhatsApp. */
function toWhatsApp(phone) {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "91" + d.replace(/^0+/, "");
  if (d.length === 10) d = "91" + d;
  const mobile = /^91[6-9]\d{9}$/.test(d);
  return { digits: d, mobile };
}

const socialUrl = (v, host) => {
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/^(www\.)?[a-z]+\.com\//i, "").replace(/\/+$/, "");
  return handle ? `https://www.${host}/${handle}/` : undefined;
};

function rowsToBusinesses(rows) {
  const seen = new Map();
  for (const r of rows) {
    const rawName = r["Business Name"];
    if (!rawName) continue;
    const mapsLink = r["Google Maps Link"] || "";
    const cid = mapsLink.match(/cid=(\d+)/)?.[1] || "";
    const key = cid || `${rawName}|${r["Phone Number"]}`.toLowerCase();
    const dup = seen.get(key);
    if (dup) {
      // Same business on two tabs: fill any blanks from the second row.
      for (const [k, col] of [["phone", "Phone Number"], ["email", "Email"], ["area", "Area"]]) if (!dup[k] && r[col]) dup[k] = r[col];
      if (!dup.instagram && r["Instagram"]) dup.instagram = socialUrl(r["Instagram"], "instagram.com");
      if (!dup.facebook && r["Facebook"]) dup.facebook = socialUrl(r["Facebook"], "facebook.com");
      continue;
    }
    const { name, short, descriptor } = shapeName(rawName);
    const city = (r["City"] || "").trim() || (r["Full Address"] || "").split(",").slice(-2, -1)[0]?.trim() || "Kerala";
    seen.set(key, {
      cid,
      name,
      shortName: short,
      descriptor,
      address: (r["Full Address"] || "").replace(/,\s*India\s*$/i, "").trim(),
      area: r["Area"] || "",
      city: titleCase(city),
      phone: r["Phone Number"] || "",
      email: r["Email"] || "",
      instagram: socialUrl(r["Instagram"], "instagram.com"),
      facebook: socialUrl(r["Facebook"], "facebook.com"),
      mapsLink: mapsLink || `https://www.google.com/maps/search/${encodeURIComponent(`${name} ${city}`)}`,
      sheetRating: Number(r["Rating"]) || 0,
      sheetReviews: Number(r["Reviews"]) || 0,
    });
  }
  // Stable, unique slugs: name-city, with the cid tail on collisions.
  const used = new Set();
  return [...seen.values()].map((b) => {
    let slug = slugify(b.name.toLowerCase().includes(b.city.toLowerCase()) ? b.name : `${b.name} ${b.city}`) || `business-${b.cid.slice(-6)}`;
    if (used.has(slug)) slug = `${slug}-${(b.cid || sha1(b.name + b.phone)).slice(-5)}`;
    used.add(slug);
    return { ...b, slug };
  });
}

/* ───────────────────────────── Google Places (New) ───────────────────────────── */

const PLACE_FIELDS = [
  "id", "displayName", "formattedAddress", "addressComponents", "location", "googleMapsUri",
  "rating", "userRatingCount", "photos", "reviews", "regularOpeningHours", "internationalPhoneNumber",
].map((f) => `places.${f}`).join(",");

const nameTokens = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !GENERIC_WORD.test(w)));
const similar = (a, b) => {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.size || !B.size) return 0;
  return [...A].filter((w) => B.has(w)).length / Math.min(A.size, B.size);
};

/** Find the exact place by its maps cid (text search, then match googleMapsUri). Cached on disk. */
async function getPlace(b) {
  const file = path.join(DIRS.places, `${b.cid || b.slug}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  if (!CFG.placesKey) return null;
  const search = async (textQuery) => {
    const res = await http("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": CFG.placesKey, "X-Goog-FieldMask": PLACE_FIELDS },
      body: JSON.stringify({ textQuery, languageCode: "en", regionCode: "IN", pageSize: 5 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Places ${res.status}: ${data.error?.message || "error"}`);
    return data.places || [];
  };
  let place = null;
  for (const q of [`${b.name}, ${b.address}`, `${b.name} ${b.city}`]) {
    const found = await search(q);
    place =
      (b.cid && found.find((p) => (p.googleMapsUri || "").match(/cid=(\d+)/)?.[1] === b.cid)) ||
      (!b.cid && found.find((p) => similar(p.displayName?.text || "", b.name) >= 0.6)) ||
      null;
    if (place) break;
  }
  const result = { matched: !!place, place };
  mkdirp(DIRS.places);
  writeJSONAtomic(file, result);
  return result;
}

/** Download up to `n` of the place's photos into the cache. Returns local file paths. */
async function getPhotos(b, place, n) {
  const dir = path.join(DIRS.photos, b.cid || b.slug);
  mkdirp(dir);
  const have = fs.readdirSync(dir).filter((f) => /^\d+\.(jpg|png|webp)$/.test(f)).sort();
  const want = (place?.photos || []).slice(0, n);
  if (have.length >= Math.min(n, want.length) || !CFG.placesKey) return have.slice(0, n).map((f) => path.join(dir, f));
  await pool(want, 4, async (p, i) => {
    const base = String(i + 1).padStart(2, "0");
    if (have.some((f) => f.startsWith(base + "."))) return;
    const res = await http(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=1600&maxHeightPx=1600&key=${CFG.placesKey}`);
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) return;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    fs.writeFileSync(path.join(dir, `${base}.${ext}`), Buffer.from(await res.arrayBuffer()));
  });
  return fs.readdirSync(dir).filter((f) => /^\d+\.(jpg|png|webp)$/.test(f)).sort().slice(0, n).map((f) => path.join(dir, f));
}

const fmtTime = (h, m) => `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Places opening periods → one honest human line (+ schema.org opens/closes when uniform). */
function hoursLine(oh) {
  const periods = oh?.periods || [];
  if (!periods.length) return {};
  if (periods.length === 1 && !periods[0].close && periods[0].open?.hour === 0) return { hours: "Open 24 hours · all days", opens: "00:00", closes: "23:59" };
  const byDay = new Map();
  for (const p of periods) if (p.open && p.close) byDay.set(p.open.day, `${p.open.hour}:${p.open.minute ?? 0}-${p.close.hour}:${p.close.minute ?? 0}`);
  const spans = new Set(byDay.values());
  if (spans.size !== 1) return {};
  const p = periods.find((x) => x.open && x.close);
  const [o, c] = [p.open, p.close];
  const range = `${fmtTime(o.hour, o.minute ?? 0)} – ${fmtTime(c.hour, c.minute ?? 0)}`;
  const closed = DAYS.filter((_, d) => !byDay.has(d));
  const hhmm = (h, m) => `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
  return {
    hours: closed.length ? `Open ${range} · closed ${closed.join(", ")}` : `Open ${range} · all days`,
    opens: hhmm(o.hour, o.minute),
    closes: hhmm(c.hour, c.minute),
  };
}

function shortQuote(t) {
  const s = t.replace(/\s+/g, " ").trim();
  if (s.length <= 340) return s;
  const cut = s.slice(0, 340);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return (end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "")) + (end > 120 ? "" : "…");
}

/** District for the common towns in the sheet — used when Places has no answer. */
const KERALA_DISTRICT = Object.fromEntries(
  Object.entries({
    Alappuzha: "alappuzha cherthala muhamma kavalam ambalapuzha chengannur mannar mararikulam arthunkal",
    Ernakulam: "kochi ernakulam muvattupuzha kothamangalam angamaly nedumbassery karukutty mookkannoor piravom perumbavoor kakkanad kalamassery aluva kolenchery ramamangalam koonammavu",
    Idukki: "thodupuzha",
    Kannur: "kannur thalassery taliparamba kuthuparamba mattannur pinarayi panoor azhikode pappinisseri mayyil",
    Kollam: "kollam kottarakkara chavara",
    Kottayam: "kottayam changanassery changanacherry pampady ettumanoor pala thrikkodithanam manarcadu kidangoor neendoor arpookara",
    Kozhikode: "kozhikode vatakara vadakara",
    Malappuram: "malappuram tirur kottakkal perinthalmanna manjeri vengara kadampuzha ponnani edappal valanchery chemmad mankada tanur kuttippuram tirurangadi angadipuram",
    Palakkad: "palakkad mannarkkad ottapalam alathur cherpulassery",
    Pathanamthitta: "thiruvalla mallappally",
    Thrissur: "thrissur guruvayur kunnamkulam koratty chavakkad triprayar pavaratty kanjany",
  }).flatMap(([d, towns]) => towns.split(" ").map((t) => [t, d]))
);

const component = (place, type) => place?.addressComponents?.find((c) => c.types?.includes(type))?.longText;

/** Sheet row + Places → the BusinessInput the app understands (events/from-business.ts). */
const phoneOf = (b, place) => b.phone || place?.internationalPhoneNumber || "";

function toInput(b, place, galleryFiles, url) {
  const phone = phoneOf(b, place);
  const wa = toWhatsApp(phone);
  const reviews = (place?.reviews || [])
    .filter((r) => r.rating >= 4 && (r.text?.text || r.originalText?.text || "").trim().length >= 30)
    .slice(0, 5)
    .map((r) => ({ name: r.authorAttribution?.displayName || "Google user", rating: r.rating, quote: shortQuote(r.text?.text || r.originalText?.text) }));
  const district =
    component(place, "administrative_area_level_3") ||
    component(place, "administrative_area_level_2") ||
    KERALA_DISTRICT[b.city.toLowerCase()] ||
    "";
  return {
    slug: b.slug,
    name: b.name,
    shortName: b.shortName,
    descriptor: b.descriptor,
    address: b.address || place?.formattedAddress?.replace(/,\s*India\s*$/i, "") || b.city,
    area: b.area || undefined,
    city: b.city,
    district,
    region: component(place, "administrative_area_level_1")?.replace(/^Keralam$/, "Kerala") || "Kerala",
    postalCode: component(place, "postal_code") || b.address.match(/\b6\d{5}\b/)?.[0] || "",
    geo: place?.location ? { lat: place.location.latitude, lng: place.location.longitude } : undefined,
    mapsLink: b.mapsLink,
    phone,
    whatsapp: wa.digits,
    email: b.email || undefined,
    instagram: b.instagram,
    facebook: b.facebook,
    ...hoursLine(place?.regularOpeningHours),
    rating: place?.rating ?? b.sheetRating ?? 0,
    reviewCount: place?.userRatingCount ?? b.sheetReviews ?? 0,
    reviews,
    gallery: galleryFiles.map((f, i) => `gallery/${String(i + 1).padStart(2, "0")}${path.extname(f)}`),
    url,
  };
}

/* ───────────────────────────── build ───────────────────────────── */

const COPY_ITEMS = ["app", "components", "config", "event.config.ts", "events", "lib", "sections", "public", "package.json", "next.config.mjs", "tsconfig.json", "tailwind.config.ts", "postcss.config.mjs"];

/** A worker is a light copy of the repo (shared node_modules) with its own .next cache. */
function prepareWorker(n) {
  const w = path.join(DIRS.workers, `w${n}`);
  mkdirp(w);
  for (const item of COPY_ITEMS) {
    const dst = path.join(w, item);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(path.join(ROOT, item), dst, {
      recursive: true,
      // Never ship other clients' media into a generated site.
      filter: (src) => !path.relative(path.join(ROOT, "public"), src).replace(/\\/g, "/").startsWith("events/"),
    });
  }
  const nm = path.join(w, "node_modules");
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(ROOT, "node_modules"), nm, "junction");
  return w;
}

function runBuild(w, slug) {
  return new Promise((resolve) => {
    mkdirp(DIRS.logs);
    const logFile = path.join(DIRS.logs, `${slug}.log`);
    const out = fs.createWriteStream(logFile);
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "build"], {
      cwd: w,
      env: { ...process.env, SITEGEN: "1", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: "--max-old-space-size=3072" },
    });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    child.on("close", (code) => resolve({ ok: code === 0, secs: Math.round((Date.now() - t0) / 1000), logFile }));
  });
}

async function buildSite(w, b, input, galleryFiles) {
  const pub = path.join(w, "public", "events");
  fs.rmSync(pub, { recursive: true, force: true });
  const gal = path.join(pub, b.slug, "gallery");
  mkdirp(gal);
  galleryFiles.forEach((f, i) => fs.copyFileSync(f, path.join(gal, `${String(i + 1).padStart(2, "0")}${path.extname(f)}`)));
  fs.writeFileSync(path.join(w, "events", "active.json"), JSON.stringify(input, null, 2));
  fs.rmSync(path.join(w, "out"), { recursive: true, force: true });
  const r = await runBuild(w, b.slug);
  if (!r.ok) return r;
  // Keep a copy outside the worker so a later run can deploy without rebuilding.
  const keep = path.join(DIRS.sites, b.slug);
  const fresh = `${keep}.new`;
  fs.rmSync(fresh, { recursive: true, force: true });
  fs.cpSync(path.join(w, "out"), fresh, { recursive: true });
  try {
    fs.rmSync(keep, { recursive: true, force: true });
    fs.renameSync(fresh, keep);
    return { ...r, dir: keep };
  } catch {
    // Old copy locked (open in a viewer/server): deploy from the fresh copy instead.
    return { ...r, dir: fresh };
  }
}

/* ───────────────────────────── deploy (Vercel REST, static) ───────────────────────────── */

let deployBlocked = "";
const teamQ = () => (CFG.vercelTeam ? (CFG.vercelTeam.startsWith("team_") ? `teamId=${CFG.vercelTeam}` : `slug=${CFG.vercelTeam}`) : "");
const vapi = (p, q = "") => `https://api.vercel.com${p}?${[q, teamQ()].filter(Boolean).join("&")}`;
const vhead = () => ({ Authorization: `Bearer ${CFG.vercelToken}` });

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [{ abs: p, file: path.relative(base, p).replace(/\\/g, "/") }];
  });
}

const projectName = (slug) => `${CFG.prefix ? `${CFG.prefix}-` : ""}${slug}`.slice(0, 95).replace(/-+$/, "");

/** Upload only files Vercel doesn't already have (template assets dedupe across all sites). */
async function deploySite(dir, slug) {
  const files = walk(dir).map((f) => {
    const buf = fs.readFileSync(f.abs);
    return { ...f, buf, sha: sha1(buf), size: buf.length };
  });
  const body = JSON.stringify({
    name: projectName(slug),
    target: "production",
    files: files.map(({ file, sha, size }) => ({ file, sha, size })),
    projectSettings: { framework: null, buildCommand: null, installCommand: null, outputDirectory: null, devCommand: null },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await http(vapi("/v13/deployments", "skipAutoDetectionConfirmation=1"), {
      method: "POST",
      headers: { ...vhead(), "Content-Type": "application/json" },
      body,
    });
    const data = await res.json();
    if (res.ok) return waitReady(data, slug);
    const code = data.error?.code || "";
    if (code === "missing_files") {
      const need = new Set(data.error.missing || []);
      await pool(files.filter((f) => need.has(f.sha)), 8, async (f) => {
        const up = await http(vapi("/v2/files"), {
          method: "POST",
          headers: { ...vhead(), "Content-Type": "application/octet-stream", "x-vercel-digest": f.sha, "Content-Length": String(f.size) },
          body: f.buf,
        });
        if (!up.ok) throw new Error(`upload ${f.file}: HTTP ${up.status}`);
      });
      continue;
    }
    if (res.status === 429 || /limit|quota|too_many/i.test(code + (data.error?.message || ""))) {
      deployBlocked = data.error?.message || "Vercel rate limit";
      throw new Error(`deploy paused: ${deployBlocked}`);
    }
    throw new Error(`deploy ${res.status}: ${data.error?.message || code}`);
  }
  throw new Error("deploy: files kept going missing");
}

async function waitReady(dep, slug) {
  const want = `${projectName(slug)}.vercel.app`;
  for (let i = 0; i < 40; i++) {
    const res = await http(vapi(`/v13/deployments/${dep.id}`), { headers: vhead() });
    const d = await res.json();
    if (d.readyState === "READY") {
      const aliases = d.alias || [];
      const host = aliases.find((a) => a === want) || aliases.find((a) => a.endsWith(".vercel.app") && !a.includes(dep.id)) || d.url;
      return `https://${host}`;
    }
    if (d.readyState === "ERROR" || d.readyState === "CANCELED") throw new Error(`deployment ${d.readyState}`);
    await sleep(1500);
  }
  return `https://${want}`;
}

/* ───────────────────────────── main ───────────────────────────── */

async function main() {
  if (!CFG.sheet) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*?/, ""));
    process.exit(1);
  }
  if (process.arch === "ia32") throw new Error("Use 64-bit Node — Next's compiler has no 32-bit Windows build.");
  if (CFG.deploy && !CFG.vercelToken && !CFG.listOnly) throw new Error("VERCEL_TOKEN missing (or pass --no-deploy).");
  Object.values(DIRS).forEach(mkdirp);

  log("Reading sheet…");
  let biz = rowsToBusinesses(await readSheet(CFG.sheet));
  if (CFG.cities) biz = biz.filter((b) => CFG.cities.includes(b.city.toLowerCase()));
  if (CFG.only) biz = biz.filter((b) => CFG.only.includes(b.slug));
  if (CFG.limit) biz = biz.slice(0, CFG.limit);
  log(`${biz.length} businesses`);
  if (CFG.listOnly) {
    biz.forEach((b) => console.log(`${b.slug.padEnd(48)} ${b.shortName.padEnd(26)} ${b.city.padEnd(16)} ${b.phone}`));
    return;
  }
  if (!CFG.placesKey) log("No GOOGLE_MAPS_API_KEY — sites build without photos, map pin or Google reviews.");

  const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : {};
  const save = () => {
    writeJSONAtomic(LEDGER, ledger);
    const rows = [["Business Name", "City", "Phone Number", "Slug", "Status", "URL", "Photos", "Note"]];
    for (const [slug, r] of Object.entries(ledger)) rows.push([r.name, r.city, r.phone, slug, r.status, r.url || "", r.photos ?? "", r.error || r.note || ""]);
    fs.writeFileSync(path.join(WORK, "results.csv"), rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"));
  };

  // 1. Places + photos for everyone first (network-bound, runs wide).
  log(`Places + photos (${CFG.placesKey ? "live, cached" : "skipped"})…`);
  const prepared = new Map();
  let placeDone = 0;
  await pool(biz, 8, async (b) => {
    try {
      const pl = await getPlace(b);
      const files = pl?.place ? await getPhotos(b, pl.place, CFG.photos) : [];
      prepared.set(b.slug, { place: pl?.place || null, files, matched: !!pl?.matched });
    } catch (e) {
      prepared.set(b.slug, { place: null, files: [], matched: false, warn: String(e.message || e) });
    }
    if (++placeDone % 25 === 0) log(`  places ${placeDone}/${biz.length}`);
  });

  // 2. Build + deploy, `workers` at a time. Deploys overlap with the next build.
  const workers = Array.from({ length: Math.min(CFG.workers, biz.length) }, (_, i) => prepareWorker(i));
  let next = 0, done = 0;
  const started = Date.now();
  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    log("Stopping after the sites in progress (Ctrl+C again to quit now)…");
  });

  await Promise.all(
    workers.map(async (w) => {
      while (!stopping && next < biz.length) {
        const b = biz[next++];
        const prep = prepared.get(b.slug);
        const prev = ledger[b.slug] || {};
        const phone = phoneOf(b, prep.place);
        if (!phone) {
          // No phone in the sheet or on Google: a site with no way to call/WhatsApp is pointless.
          ledger[b.slug] = { ...prev, name: b.name, city: b.city, phone: "", status: "skipped", error: "no phone number (sheet cell empty/#ERROR!, none on Google)" };
          done++;
          save();
          log(`[${done}/${biz.length}] ${b.slug} · skipped · no phone number`);
          continue;
        }
        const url = prev.url || `https://${projectName(b.slug)}.vercel.app`;
        const input = toInput(b, prep.place, prep.files, url);
        const hash = sha1(JSON.stringify(input) + prep.files.map((f) => fs.statSync(f).size).join());
        const rec = (ledger[b.slug] = { ...prev, name: b.name, city: b.city, phone, photos: prep.files.length, hash, error: "" });
        const notes = [prep.matched ? "" : "no Places match", toWhatsApp(phone).mobile ? "" : "phone may not be on WhatsApp", prep.warn || ""].filter(Boolean);
        rec.note = notes.join("; ");
        try {
          const unchanged = prev.hash === hash && !CFG.force;
          if (unchanged && prev.status === "live") { done++; continue; }
          let dir = unchanged && prev.status === "built" && prev.dir && fs.existsSync(prev.dir) ? prev.dir : null;
          if (!dir) {
            const r = await buildSite(w, b, input, prep.files);
            if (!r.ok) throw new Error(`build failed (${r.secs}s) — see ${path.relative(ROOT, r.logFile)}`);
            dir = r.dir;
            rec.dir = dir;
            rec.status = "built";
            rec.buildSecs = r.secs;
          }
          if (CFG.deploy && !deployBlocked) {
            const live = await deploySite(dir, b.slug);
            rec.url = live;
            rec.status = "live";
            // Vercel gave a different address (name taken): the next run rebuilds once with the real URL.
            if (live !== url) rec.note = [rec.note, `got ${live}; next run updates its canonical URL`].filter(Boolean).join("; ");
          }
        } catch (e) {
          rec.status = rec.status === "built" ? "built" : "failed";
          rec.error = String(e.message || e);
        }
        done++;
        save();
        const eta = Math.round(((Date.now() - started) / done) * (biz.length - done) / 60000);
        log(`[${done}/${biz.length}] ${b.slug} · ${rec.photos} photos · ${rec.status}${rec.url && rec.status === "live" ? ` · ${rec.url}` : ""}${rec.error ? ` · ${rec.error}` : ""} · ~${eta} min left`);
      }
    })
  );
  save();

  const counts = Object.values(ledger).reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  log(`Done. ${JSON.stringify(counts)} — results in .sitegen/results.csv`);
  if (deployBlocked) log(`Deploys paused (${deployBlocked}). Run the same command later; built sites deploy without rebuilding.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
