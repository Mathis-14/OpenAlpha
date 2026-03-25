export default function CommodityDashboardLoading() {
  return (
    <div className="min-h-screen bg-[#fafcff] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-48 animate-pulse rounded-full bg-black/[0.06]" />
          <div className="h-8 w-40 animate-pulse rounded-full bg-black/[0.06]" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-40 animate-pulse rounded-[16px] bg-black/[0.06]" />
          <div className="h-40 animate-pulse rounded-[16px] bg-black/[0.06]" />
          <div className="h-40 animate-pulse rounded-[16px] bg-black/[0.06]" />
        </div>
        <div className="h-80 animate-pulse rounded-[16px] bg-black/[0.06]" />
      </div>
    </div>
  );
}
