import { useEffect, useState } from "react";
import { subscribeToasts, type ToastItem } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);

  if (!items.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-sm shadow-md",
            item.variant === "error"
              ? "border-destructive/30 bg-destructive text-white"
              : "border-border bg-background text-foreground",
          )}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
