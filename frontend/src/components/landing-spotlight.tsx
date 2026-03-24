export default function LandingSpotlight() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] opacity-85"
      style={{
        background: `
          radial-gradient(40rem 18rem at 50% 12%, rgba(16,128,255,0.08), transparent 72%),
          radial-gradient(circle at 1px 1px, rgba(16,128,255,0.14) 1px, transparent 0)
        `,
        backgroundSize: "100% 100%, 28px 28px",
        maskImage:
          "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.16) 48%, rgba(0,0,0,0))",
      }}
    />
  );
}
