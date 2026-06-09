import type { CSSProperties } from "react";

/**
 * Identique à status-app/src/components/AuroraBackground.tsx
 * Blobs à ~50 vmax avec blur 80px — même look que le site principal.
 * Les styles sont dans index.css sous .aurora-root pour éviter le flash.
 */
export function AuroraBackground({
    tone = "default",
}: {
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
