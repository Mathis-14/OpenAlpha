export default function CommoditiesLoading() {
  return (
    <div className="min-h-screen bg-[#fafcff] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-10 w-48 animate-pulse rounded-full bg-black/[0.06]" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-[16px] bg-black/[0.06]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
