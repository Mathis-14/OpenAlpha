import { Skeleton } from "@/components/ui/skeleton";

export default function MacroLoading() {
  return (
    <div className="min-h-screen bg-[#fafcff] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-32 rounded-full bg-black/[0.06]" />
          <Skeleton className="h-6 w-48 rounded-full bg-black/[0.06]" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 rounded-[16px] bg-black/[0.06]" />
          <Skeleton className="h-36 rounded-[16px] bg-black/[0.06]" />
          <Skeleton className="h-36 rounded-[16px] bg-black/[0.06]" />
          <Skeleton className="h-36 rounded-[16px] bg-black/[0.06]" />
          <Skeleton className="h-36 rounded-[16px] bg-black/[0.06]" />
        </div>

        <Skeleton className="h-[440px] rounded-[16px] bg-black/[0.06]" />
      </div>
    </div>
  );
}
