import { useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import NodeMap from "./components/NodeMap";
import TelemetryPanel from "./components/TelemetryPanel";
import AgentPanel from "./components/AgentPanel";
import Terminal from "./components/Terminal";
import HotfixEditor from "./components/HotfixEditor";
import GestureControl from "./components/GestureControl";
import ProposalsDrawer from "./components/ProposalsDrawer";
import LoginPage from "./components/LoginPage";
import { getToken } from "./auth";
import { isDemoMode } from "./socket";

export default function App() {
  const [showProposals, setShowProposals] = useState(false);

  // Listen for the event dispatched by AgentPanel to open the drawer
  useEffect(() => {
    const handler = () => setShowProposals(true);
    window.addEventListener("aiops:open-proposals", handler);
    return () => window.removeEventListener("aiops:open-proposals", handler);
  }, []);

  const devToken = import.meta.env.VITE_DEV_TOKEN;
  const hasAuth = isDemoMode || Boolean(getToken() || devToken);

  if (!hasAuth) {
    return <LoginPage />;
  }

  return (
    <>
      <div className="grid h-full grid-cols-[280px_1fr_380px] grid-rows-[1fr_220px]">
        <aside className="row-span-2 border-r border-neutral-800 p-3 overflow-auto">
          <TelemetryPanel />
        </aside>

        <main className="relative">
          {/* CRITICAL: NodeMap and GestureControl MUST be inside <Canvas> */}
          <Canvas camera={{ position: [0, 6, 16], fov: 55 }}>
            <color attach="background" args={["#050505"]} />
            <ambientLight intensity={0.4} />
            <pointLight position={[10, 10, 10]} intensity={1.2} />
            <Stars radius={100} depth={50} count={2000} factor={3} />
            <NodeMap />
            <OrbitControls enablePan enableZoom enableRotate />
            <GestureControl />
          </Canvas>
          
          <div className="pointer-events-none absolute left-3 top-3 text-xs text-neutral-500">
            gestures: pinch = zoom · wrist x = rotate · point = select
          </div>
        </main>

        <aside className="row-span-2 border-l border-neutral-800 flex flex-col overflow-hidden">
          <AgentPanel />
        </aside>

        <section className="col-start-2 border-t border-neutral-800 grid grid-cols-2">
          <Terminal />
          <HotfixEditor />
        </section>
      </div>

      {/* Proposals Drawer overlays the whole screen when open */}
      {showProposals && <ProposalsDrawer onClose={() => setShowProposals(false)} />}
    </>
  );
}