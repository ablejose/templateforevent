"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { logoMark, site } from "@/config/site";

/**
 * Intro: a gold ring draws itself around the brand mark, the name rises in
 * letter by letter, a hairline fills like a progress bar — then a gold seam
 * opens across the middle and the two halves part like curtains to reveal the
 * page. Locks scroll while visible; honours prefers-reduced-motion.
 */
const EASE = [0.22, 1, 0.36, 1] as const;
const CURTAIN = [0.76, 0, 0.24, 1] as const;
const HOLD_MS = 2300;

type Phase = "intro" | "reveal" | "done";

export default function Loader() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const r = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduce(r);
    // Lock on <html>, not <body>: the Header manages body overflow for its drawer.
    const root = document.documentElement;
    root.style.overflow = "hidden";
    window.scrollTo(0, 0);
    const t = window.setTimeout(() => setPhase("reveal"), r ? 400 : HOLD_MS);
    return () => {
      window.clearTimeout(t);
      root.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (phase !== "reveal") return;
    document.documentElement.style.overflow = "";
    const t = window.setTimeout(() => setPhase("done"), reduce ? 350 : 1500);
    return () => window.clearTimeout(t);
  }, [phase, reduce]);

  if (phase === "done") return null;

  const revealing = phase === "reveal";
  const letters = Array.from(site.name);

  return (
    <div className={`fixed inset-0 z-[300] ${revealing ? "pointer-events-none" : ""}`}>
      {/* Curtains */}
      {(["top", "bottom"] as const).map((side) => (
        <motion.div
          key={side}
          className={`absolute inset-x-0 ${side === "top" ? "top-0" : "bottom-0"} h-1/2 bg-espresso`}
          initial={false}
          animate={revealing ? { y: side === "top" ? "-100%" : "100%" } : { y: "0%" }}
          transition={{ duration: reduce ? 0.3 : 1.05, delay: reduce ? 0 : 0.42, ease: CURTAIN }}
        />
      ))}

      {/* Gold seam that opens the curtains */}
      <motion.span
        aria-hidden
        className="absolute left-0 right-0 top-1/2 block h-px origin-center"
        style={{ background: "linear-gradient(90deg, transparent, var(--saffron), transparent)" }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={revealing ? { scaleX: [0, 1, 1], opacity: [1, 1, 0] } : { scaleX: 0, opacity: 0 }}
        transition={{ duration: reduce ? 0.2 : 0.9, times: [0, 0.5, 1], ease: EASE }}
      />

      {/* Warm glow */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(60% 50% at 50% 50%, rgba(196,137,46,0.16) 0%, rgba(196,137,46,0) 70%)" }}
        animate={{ opacity: revealing ? 0 : 1 }}
        transition={{ duration: 0.4 }}
      />

      <motion.div
        role="status"
        aria-label={`${site.fullName} — loading`}
        className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
        animate={revealing ? { opacity: 0, y: -14, filter: "blur(4px)" } : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {/* Ring + mark */}
        <div className="relative grid h-28 w-28 place-items-center md:h-32 md:w-32">
          <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(196,137,46,0.18)" strokeWidth="1" />
            <motion.circle
              cx="60"
              cy="60"
              r="56"
              fill="none"
              stroke="var(--saffron)"
              strokeWidth="1.4"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduce ? 0 : 1.6, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
          {logoMark ? (
            <motion.img
              src={logoMark}
              alt=""
              className="h-[58%] w-[58%] object-contain"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.25, ease: EASE }}
            />
          ) : (
            <motion.span
              className="display-xl text-saffron"
              style={{ fontSize: "3rem" }}
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.25, ease: EASE }}
            >
              {letters[0]}
            </motion.span>
          )}
        </div>

        {/* Name, letter by letter */}
        {/* Words wrap as whole words on long names; letters within each word still rise one by one. */}
        <p className="mt-8 flex max-w-[92vw] flex-wrap justify-center gap-x-[0.3em]" aria-hidden>
          {site.name.split(/\s+/).map((word, w, words) => {
            const offset = words.slice(0, w).join("").length;
            return (
              <span key={w} className="flex overflow-hidden">
                {Array.from(word).map((ch, i) => (
                  <motion.span
                    key={i}
                    className="display-xl inline-block text-ivory"
                    style={{ fontSize: letters.length > 14 ? "clamp(1.8rem, 5vw, 3rem)" : "clamp(2.6rem, 7vw, 4.4rem)", lineHeight: 1.08 }}
                    initial={{ y: "110%" }}
                    animate={{ y: "0%" }}
                    transition={{ duration: 0.9, delay: 0.45 + Math.min(offset + i, 20) * 0.05, ease: EASE }}
                  >
                    {ch}
                  </motion.span>
                ))}
              </span>
            );
          })}
        </p>

        <motion.p
          aria-hidden
          className="mt-3 font-sans text-[0.7rem] font-medium uppercase text-saffron md:text-xs"
          initial={{ opacity: 0, letterSpacing: "0.8em" }}
          animate={{ opacity: 1, letterSpacing: "0.42em" }}
          transition={{ duration: 1.2, delay: 0.9, ease: EASE }}
        >
          {site.descriptor}
        </motion.p>

        {/* Progress hairline */}
        <span aria-hidden className="mt-8 block h-px w-40 overflow-hidden bg-ivory/10">
          <motion.span
            className="block h-full origin-left bg-saffron"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduce ? 0 : HOLD_MS / 1000 - 0.2, ease: [0.45, 0, 0.2, 1] }}
          />
        </span>
      </motion.div>
    </div>
  );
}
