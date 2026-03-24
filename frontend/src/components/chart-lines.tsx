const LINES = [
  { color: "#534AB7", width: 1.5, opacity: 0.25, startY: 820, endY: 260 },
  { color: "#7F77DD", width: 2, opacity: 0.3, startY: 780, endY: 200 },
  { color: "#9B93F5", width: 2.5, opacity: 0.2, startY: 720, endY: 140 },
  { color: "#3C3489", width: 1.2, opacity: 0.2, startY: 860, endY: 310 },
  { color: "#AFA9EC", width: 1.2, opacity: 0.15, startY: 660, endY: 80 },
];

function buildPoints(startY: number, endY: number, seed: number): string {
  const n = 48;
  const dx = 1920 / (n - 1);
  const drop = (startY - endY) / (n / 2);
  const pts: string[] = [];
  let y = startY;
  for (let i = 0; i < n; i++) {
    pts.push(`${Math.round(i * dx)},${Math.round(y)}`);
    if (i % 2 === 0) {
      y -= drop + Math.sin(i * seed) * 8;
    } else {
      y += drop * 0.3 + Math.sin(i * seed * 1.5) * 5;
    }
  }
  return pts.join(" ");
}

export default function ChartLines() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {LINES.map((l, i) => (
        <polyline
          key={i}
          points={buildPoints(l.startY, l.endY, 0.7 + i * 0.3)}
          fill="none"
          stroke={l.color}
          strokeWidth={l.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={l.opacity}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
