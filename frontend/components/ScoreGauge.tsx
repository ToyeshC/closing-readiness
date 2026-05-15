// Circular score gauge with animated fill + threshold tick at 60%.
// SVG-based; respects prefers-reduced-motion via the keyframes in globals.css.

import { formatPct } from "../lib/format";

interface ScoreGaugeProps {
  score: number;            // 0..1
  size?: number;            // px
  threshold?: number;       // 0..1, default 0.6
  variant?: "default" | "light";  // "light" for dark backgrounds
  className?: string;
}

export function ScoreGauge({
  score,
  size = 160,
  threshold = 0.6,
  variant = "default",
  className = "",
}: ScoreGaugeProps) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const clamped = Math.max(0, Math.min(1, score));
  const dashTarget = circumference * (1 - clamped);

  // Threshold tick: a small radial line at the threshold angle.
  // 0 starts at 12 o'clock (rotate -90deg). Angle increases clockwise.
  const thresholdAngle = (threshold * 360) - 90;
  const thresholdRad = (thresholdAngle * Math.PI) / 180;
  const tickInner = radius - 4;
  const tickOuter = radius + 4;
  const tickX1 = cx + tickInner * Math.cos(thresholdRad);
  const tickY1 = cy + tickInner * Math.sin(thresholdRad);
  const tickX2 = cx + tickOuter * Math.cos(thresholdRad);
  const tickY2 = cy + tickOuter * Math.sin(thresholdRad);

  const isReady = score >= threshold;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={variant === "light" ? "rgba(255,255,255,0.15)" : "var(--color-brand-cream-deep)"}
          strokeWidth={stroke}
        />
        {/* Threshold tick */}
        <line
          x1={tickX1}
          y1={tickY1}
          x2={tickX2}
          y2={tickY2}
          stroke="var(--color-brand-rose-deep)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={isReady ? "var(--color-status-pass)" : "var(--color-brand-rose-deep)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashTarget}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            ["--gauge-length" as string]: circumference,
            ["--gauge-target" as string]: dashTarget,
          }}
          className="animate-gauge-fill"
        />
      </svg>
      <div className="absolute flex flex-col items-center pointer-events-none">
        <span className={`text-3xl font-semibold tracking-tight ${variant === "light" ? "text-[var(--color-brand-cream)]" : "text-[var(--color-brand-navy)]"}`}>
          {formatPct(clamped)}
        </span>
        <span className={`text-[10px] uppercase tracking-widest mt-0.5 ${variant === "light" ? "text-[var(--color-brand-cream)]/70" : "text-[var(--color-brand-muted)]"}`}>
          Readiness
        </span>
      </div>
    </div>
  );
}
