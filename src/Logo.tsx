import React from "react";

/**
 * The DormTag mark: a house holding a QR code.
 *
 * One drawing at every size. `shape-rendering="crispEdges"` matters more than it
 * looks: at header size the modules are under two pixels, and without it the
 * browser antialiases them into a grey smudge instead of a readable pattern.
 *
 * The house takes `currentColor` so it inherits from its context (light on the
 * slate header, ink on a card). The QR is always the brand yellow.
 */
export function Logo({ size = 24, label }: { size?: number; label?: string }) {
  const a = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x + 1.75} y={y + 1.75} width="8.5" height="8.5" fill="none" strokeWidth="3.5" />
      <rect x={x + 4} y={y + 4} width="4" height="4" stroke="none" />
    </g>
  );
  const m = (c: number, r: number) => (
    <rect key={`m${c}-${r}`} x={13 + 4 * c} y={21 + 4 * r} width="4" height="4" stroke="none" />
  );

  return (
    <svg
      width={size} height={size} viewBox="0 0 62 62"
      shapeRendering="crispEdges"
      role={label ? "img" : "presentation"}
      aria-hidden={label ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {label && <title>{label}</title>}
      <path
        d="M3 19 L31 2 L59 19 L59 60 L3 60 Z"
        fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinejoin="round" shapeRendering="geometricPrecision"
      />
      <g fill="var(--yellow)" stroke="var(--yellow)">
        {a(13, 21)}{a(37, 21)}{a(13, 45)}
        {m(4, 0)}{m(3, 2)}{m(0, 3)}{m(4, 3)}{m(7, 3)}{m(1, 4)}{m(5, 4)}
        {m(8, 4)}{m(3, 5)}{m(6, 5)}{m(5, 6)}{m(6, 6)}{m(4, 7)}{m(7, 8)}
      </g>
    </svg>
  );
}
