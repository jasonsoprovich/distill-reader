import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ReloadPrompt from "./components/ReloadPrompt";
import { Toaster } from "./components/ui/toaster";
import type { Selection } from "./lib/selection";
import { queryClient } from "./lib/query-client";
import Login from "./routes/Login";
import ProtectedLayout from "./routes/ProtectedLayout";
import Reader, { type MobileView } from "./routes/Reader";
import Settings from "./routes/Settings";
import Setup from "./routes/Setup";

function App() {
  // Lifted out of Reader (rather than left as its own local state) so a
  // round trip to /settings and back doesn't lose it — Reader unmounts and
  // remounts on that route swap, but this survives here in its parent,
  // which the route swap never touches.
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("sidebar");

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route
              path="/"
              element={
                <Reader
                  selection={selection}
                  onSelectionChange={setSelection}
                  selectedArticleId={selectedArticleId}
                  onSelectedArticleIdChange={setSelectedArticleId}
                  mobileView={mobileView}
                  onMobileViewChange={setMobileView}
                />
              }
            />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
      <ReloadPrompt />
    </QueryClientProvider>
  );
}

export default App;
