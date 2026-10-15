import { lazy, Suspense, useEffect, useState } from "react";
import { getToken } from "./auth";
import LoginPage from "./components/LoginPage";
import ProposalsDrawer from "./components/ProposalsDrawer";
import AgentPanel from "./components/AgentPanel";
import NodeMap from "./components/NodeMap";
import TelemetryPanel from "./components/TelemetryPanel";
import Terminal from "./components/Terminal";

// Lazy so the bundled Monaco runtime lands in its own chunk instead of the
// main bundle.
const HotfixEditor = lazy(() => import("./components/HotfixEditor"));

export default function App() {
  const [showProposals, setShowProposals] = useState(false);

  // AgentPanel's "Proposals" button opens the drawer via a window event so
  // the panel stays decoupled from App state.
  useEffect(() => {
    const open = () => setShowProposals(true);
    window.addEventListener("aiops:open-proposals", open);
    return () => window.removeEventListener("aiops:open-proposals", open);
  }, []);

  const devToken = import.meta.env.VITE_DEV_TOKEN;
  const hasAuth = Boolean(getToken() || devToken);
  if (!hasAuth) return <LoginPage />;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-200">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          <span className="text-sm font-semibold tracking-wide">aiops-cockpit</span>
        </div>          <span className="text-xs text-zinc-600">pinch = zoom · wrist x = rotate · point = select</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <TelemetryPanel />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <NodeMap />
        </main>
        <AgentPanel />
      </div>

      <div className="flex h-[220px] shrink-0">
        <Terminal />
        <Suspense fallback={
          <section className="flex min-w-0 flex-1 flex-col border-t border-l border-zinc-800 bg-zinc-950">
            <div className="flex-1 p-4 text-sm text-zinc-600">loading editor…</div>
          </section>
        }        >
          <HotfixEditor />
        </Suspense>
      </div>

      {showProposals && <ProposalsDrawer onClose={() => setShowProposals(false)} />}
    </div>
  );
}
