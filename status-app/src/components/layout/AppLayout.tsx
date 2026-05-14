import type { ReactNode } from "react";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/layout/Footer";
import { DesktopShell } from "@/components/layout/DesktopShell";
import { IS_DESKTOP } from "@/lib/desktop";

interface Props {
  children: ReactNode;
  /** Disable the animated background (e.g. on heavy config pages) */
  noBackground?: boolean;
}

export function AppLayout({ children, noBackground }: Props) {
  // In the Tauri desktop app, replace the marketing chrome (Header pill nav,
  // animated background, footer) with a NordVPN-style sidebar shell. The web
  // SPA keeps the editorial layout untouched.
  if (IS_DESKTOP) {
    return <DesktopShell>{children}</DesktopShell>;
  }

  return (
    <div className="relative min-h-screen text-white">
      {!noBackground && (
        <div className="fixed inset-0 pointer-events-none -z-10 opacity-60">
          <BackgroundGradientAnimation
            interactive={false}
            gradientBackgroundStart="rgb(6, 10, 28)"
            gradientBackgroundEnd="rgb(0, 0, 0)"
            firstColor="37, 99, 235"
            secondColor="139, 92, 246"
            thirdColor="30, 64, 175"
            fourthColor="236, 72, 153"
            fifthColor="16, 185, 129"
            size="100%"
            blendingValue="screen"
            containerClassName="!h-full !w-full"
          />
          {/* Top-anchored aurora wash so the hero (above the centered
              gradient blobs) gets the same colored backdrop as the rest of
              the page. Without this the hero sits on a near-black band
              while the sections below catch the centered blobs. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[70vh] [background:radial-gradient(ellipse_80%_70%_at_50%_0%,rgba(91,109,255,0.45)_0%,rgba(139,92,246,0.18)_45%,transparent_75%)]"
          />
        </div>
      )}
      <Header />
      <main className="pt-32 pb-24">{children}</main>
      <Footer />
    </div>
  );
}
