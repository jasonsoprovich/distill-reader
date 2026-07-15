export interface ToastItem {
  id: number;
  message: string;
  variant: "default" | "error";
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(items);
}

// A minimal global toast store (no provider needed) so mutation callbacks
// — which run outside React's render tree — can surface rollback errors
// (PLAN §8.2) without threading a hook through every call site.
export function toast(message: string, variant: ToastItem["variant"] = "default") {
  const id = nextId++;
  items = [...items, { id, message, variant }];
  emit();
  setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, 4000);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
}
