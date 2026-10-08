import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Grid, Html, Line, OrbitControls } from "@react-three/drei";
import { useStore } from "../store";
import type { NodeStatus, TopoNode } from "../types";
import GestureControl from "./GestureControl";

const STATUS_COLOR: Record<NodeStatus, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
};

function Geometry({ kind }: { kind: TopoNode["kind"] }) {
  if (kind === "host") return <icosahedronGeometry args={[1, 0]} />;
  if (kind === "container") return <boxGeometry args={[1.3, 1.3, 1.3]} />;
  return <octahedronGeometry args={[1.1, 0]} />;
}

function NodeShape({ node }: { node: TopoNode }) {
  const selected = useStore((s) => s.selectedNodeId === node.id);
  const selectNode = useStore((s) => s.selectNode);
  const color = STATUS_COLOR[node.status];

  const handleSelect = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectNode(node.id);
  };

  return (
    <group position={node.position} onClick={handleSelect}>
      <mesh userData={{ nodeId: node.id }}>
        <Geometry kind={node.kind} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 2.2 : 0.9}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
      {/* glow halo */}
      <mesh scale={selected ? 1.6 : 1.35}>
        <Geometry kind={node.kind} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={selected ? 0.5 : 0.22}
        />
      </mesh>
      <Html center position={[0, 1.7, 0]} zIndexRange={[10, 0]}>
        <button
          onClick={() => selectNode(node.id)}
          className={`cursor-pointer whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium transition ${
            selected
              ? "bg-zinc-100 text-zinc-900"
              : "bg-zinc-900/70 text-zinc-300 hover:text-zinc-100"
          }`}
        >
          {node.label}
        </button>
      </Html>
    </group>
  );
}

function NodeShapes() {
  const nodes = useStore((s) => s.snapshot.nodes);
  return (
    <>
      {nodes.map((node) => (
        <NodeShape key={node.id} node={node} />
      ))}
    </>
  );
}

function Edges() {
  const nodes = useStore((s) => s.snapshot.nodes);
  const edges = useStore((s) => s.snapshot.edges);
  const byId = new Map(nodes.map((n) => [n.id, n.position]));

  return (
    <>
      {edges.map((edge) => {
        const a = byId.get(edge.source);
        const b = byId.get(edge.target);
        if (!a || !b) return null;
        return (
          <Line
            key={edge.id}
            points={[a, b]}
            color="#3f3f46"
            lineWidth={1.5}
            transparent
            opacity={0.8}
          />
        );
      })}
    </>
  );
}

export default function NodeMap() {
  const selectNode = useStore.getState().selectNode;

  // R3F connects events to the canvas's parent div, so clicks on drei <Html>
  // overlay labels bubble into R3F and would count as "missed". Only deselect
  // when the click actually landed on the canvas itself.
  const handlePointerMissed = (e: MouseEvent) => {
    if (!(e.target instanceof HTMLCanvasElement)) return;
    selectNode(null);
  };

  return (
    <Canvas
      camera={{ position: [8.5, 6, 9.5], fov: 50 }}
      dpr={[1, 2]}
      onPointerMissed={handlePointerMissed}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} />
      <Grid
        position={[0, -1.6, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.6}
        cellColor="#27272a"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#3f3f46"
        fadeDistance={40}
      />
      <Edges />
      <NodeShapes />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={30}
      />
      <GestureControl />
    </Canvas>
  );
}
