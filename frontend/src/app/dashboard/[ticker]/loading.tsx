import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-6 w-48" />
        </div>

        {/* Price / overview row */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>

        {/* Chart area */}
        <Skeleton className="h-80 rounded-xl" />

        {/* Bottom row */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
