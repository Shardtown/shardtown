import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type Direction = "left" | "right" | "up" | "down";

interface RevealProps {
  children: ReactNode;
  /** Slide-in direction. Default "up". */
  direction?: Direction;
  /** Pixel distance traveled. Default 60. */
  distance?: number;
  /** Delay in seconds. Default 0. */
  delay?: number;
  /** Duration in seconds. Default 0.75. */
  duration?: number;
  /** Tailwind className passthrough. */
  className?: string;
  /** Re-trigger on every viewport entry (default false: animate once). */
  replay?: boolean;
}

const offset = (dir: Direction, d: number) => {
  switch (dir) {
    case "left":  return { x: -d, y: 0 };
    case "right": return { x:  d, y: 0 };
    case "up":    return { x: 0, y:  d };
    case "down":  return { x: 0, y: -d };
  }
};

/**
 * Wrap a block to make it slide in from a direction when it enters the viewport.
 * Respects prefers-reduced-motion (no movement, just fade).
 */
export function Reveal({
  children,
  direction = "up",
  distance = 60,
  delay = 0,
  duration = 0.75,
  className,
  replay = false,
}: RevealProps) {
  const reduce = useReducedMotion();
  const off = reduce ? { x: 0, y: 0 } : offset(direction, distance);

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...off }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: !replay, margin: "-12%" }}
      transition={{
        duration: reduce ? 0.3 : duration,
        delay,
        ease: [0.16, 1, 0.3, 1], // expo-out: snappy entrance, gentle landing
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Container for staggered children. Each child wrapped in <RevealItem> joins
 * the cascade with a 80ms offset by default.
 */
export function RevealStagger({
  children,
  direction = "up",
  distance = 50,
  delayChildren = 0.1,
  staggerChildren = 0.08,
  className,
}: {
  children: ReactNode;
  direction?: Direction;
  distance?: number;
  delayChildren?: number;
  staggerChildren?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-12%" }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            delayChildren,
            staggerChildren: reduce ? 0 : staggerChildren,
          },
        },
      }}
      data-direction={direction}
      data-distance={distance}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  direction = "up",
  distance = 50,
  className,
}: {
  children: ReactNode;
  direction?: Direction;
  distance?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const off = reduce ? { x: 0, y: 0 } : offset(direction, distance);
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, ...off },
        visible: {
          opacity: 1, x: 0, y: 0,
          transition: { duration: reduce ? 0.3 : 0.7, ease: [0.16, 1, 0.3, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
