import type { ReactNode } from "react";
import { AppLayout } from "./AppLayout";

interface Props {
  label: string;
  title: string;
  children: ReactNode;
}

export function LegalPage({ label, title, children }: Props) {
  return (
    <AppLayout>
      <section className="container-wide pt-16">
        <div className="mb-12">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-4">{label}</p>
          <h1
            className="font-extrabold leading-tight tracking-tight uppercase mb-8"
            style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}
          >
            {title}
          </h1>
        </div>
        <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-3xl p-8 md:p-16 space-y-12">
          {children}
        </div>
      </section>
    </AppLayout>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-white">{title}</h2>
      <div className="space-y-3 text-[#888] leading-[1.8]">{children}</div>
    </div>
  );
}
