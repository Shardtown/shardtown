import type { CSSProperties } from "react";

/**
 * Slow, soft aurora-like background — large blurred gradient blobs drifting
 * in a loop. Designed to live behind login / boot / hero screens to bring
 * the desktop app closer to the website's visual language.
 *
 * Styles live in `src/index.css` under `.aurora-root` so they ship in the
 * bundled stylesheet and apply on the first paint of the host screen.
 * Inlining the rules via <style>{...}</style> here used to cause a brief
 * unstyled flash on the Tauri boot screen because React injects the tag
 * only after the surrounding JSX is mounted.
 *
 * The dynamic palette comes through as CSS variables on the root element.
 */
export function AuroraBackground({
  tone = "default",
}: {
  /** Lets caller bias the color palette (e.g. amber for Premium screens). */
  tone?: "default" | "amber";
}) {
  const palette =
    tone === "amber"
      ? { a: "251, 191, 36", b: "248, 113, 113", c: "168, 85, 247" }
      : { a: "91, 109, 255",  b: "139, 92, 246",  c: "59, 130, 246" };

  const style = {
    "--aurora-a": palette.a,
    "--aurora-b": palette.b,
    "--aurora-c": palette.c,
  } as CSSProperties;

  return (
    <div className="aurora-root" style={style} aria-hidden>
      <span className="aurora-blob a" />
      <span className="aurora-blob b" />
      <span className="aurora-blob c" />
      <span className="aurora-grain" />
    </div>
  );
}
