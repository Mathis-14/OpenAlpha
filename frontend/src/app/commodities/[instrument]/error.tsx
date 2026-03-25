"use client";

export default function CommodityDashboardError() {
  return (
    <div className="min-h-screen bg-[#fafcff] p-6">
      <div className="mx-auto max-w-4xl rounded-[16px] border border-[#ef4444]/16 bg-white p-6 text-[#161616] shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
        <h1 className="text-2xl font-medium tracking-tight">Commodity unavailable</h1>
        <p className="mt-3 text-sm font-light leading-7 text-black/64">
          Something went wrong while loading this commodity dashboard. Try again in a moment.
        </p>
      </div>
    </div>
  );
}
