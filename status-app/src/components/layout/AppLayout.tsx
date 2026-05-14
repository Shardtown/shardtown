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
        <div className="fixed inset-0 pointer-events-none -z-10">
          <BackgroundGradientAnimation
            interactive={false}
            gradientBackgroundStart="rgb(28, 18, 64)"
            gradientBackgroundEnd="rgb(10, 8, 28)"
            firstColor="59, 130, 246"
            secondColor="168, 85, 247"
            thirdColor="79, 70, 229"
            fourthColor="236, 72, 153"
            fifthColor="16, 185, 129"
            size="120%"
            blendingValue="screen"
            containerClassName="!h-full !w-full"
          />
        </div>
      )}
      <Header />
      <main className="pt-32 pb-24">{children}</main>
      <Footer />
    </div>
  );
}
