import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular"
}

function Skeleton({ className, variant = "text", ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "skeleton",
        variant === "text" && "h-4 w-full",
        variant === "circular" && "h-10 w-10 rounded-full",
        variant === "rectangular" && "h-20 w-full",
        className
      )}
      {...props}
    />
  )
}

function MessageSkeleton() {
  return (
    <div className="flex gap-3 p-4">
      <Skeleton variant="circular" className="h-8 w-8 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  )
}

function FileSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2">
      <Skeleton variant="circular" className="h-6 w-6 shrink-0" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-2 w-1/3" />
      </div>
    </div>
  )
}

export { Skeleton, MessageSkeleton, FileSkeleton }
