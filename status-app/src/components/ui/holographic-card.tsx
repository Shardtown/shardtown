import { useRef, type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface HolographicCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function HolographicCard({
  className,
  children,
  ...props
}: HolographicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = (y - centerY) / 18;
    const rotateY = (centerX - x) / 18;

    card.style.setProperty("--x", `${x}px`);
    card.style.setProperty("--y", `${y}px`);
    card.style.setProperty("--bg-x", `${(x / rect.width) * 100}%`);
    card.style.setProperty("--bg-y", `${(y / rect.height) * 100}%`);
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
    card.style.setProperty("--x", "50%");
    card.style.setProperty("--y", "50%");
    card.style.setProperty("--bg-x", "50%");
    card.style.setProperty("--bg-y", "50%");
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("holographic-card", className)}
      {...props}
    >
      <div className="holo-content">{children}</div>
      <div className="holo-glow" aria-hidden />
    </div>
  );
}
