import { authClient } from "../lib/auth-client";

export default function Reader() {
  return (
    <div className="flex h-screen bg-neutral-50 text-neutral-900">
      <aside className="w-64 shrink-0 border-r border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <span className="text-sm font-semibold">Distill</span>
          <button
            type="button"
            onClick={() => authClient.signOut()}
            className="text-xs text-neutral-500 hover:text-neutral-900"
          >
            Sign out
          </button>
        </div>
        <div className="p-4 text-sm text-neutral-400">Feeds coming in Phase 2.</div>
      </aside>

      <section className="w-96 shrink-0 border-r border-neutral-200 bg-white">
        <div className="p-4 text-sm text-neutral-400">Article list coming in Phase 2.</div>
      </section>

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 text-sm text-neutral-400">Select an article to read it here.</div>
      </main>
    </div>
  );
}
