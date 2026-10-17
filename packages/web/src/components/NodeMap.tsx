import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../store";
import type { TopoNode } from "@aiops/shared";

const COLOR: Record<TopoNode["status"], string> = {
  ok: "#22c55e",
  warn: "#f59e0b",
  critical: "#ef4444",
  unknown: "#64748b",
};

function NodeMesh({ node }: { node: TopoNode }) {
  const ref = useRef<THREE.Mesh>(null!);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected) === node.id;

  useFrame((_, delta) => {
    if (!ref.current) return;
    const speed = node.status === "critical" ? 6 : 1.2;
    ref.current.rotation.y += delta * speed * 0.3;
    const s = selected ? 1.4 : 1;
    ref.current.scale.lerp(new THREE.Vector3(s, s, s), 0.15);
  });

  const geo = useMemo(() => {
    switch (node.kind) {
      case "host": return <icosahedronGeometry args={[0.9, 1]} />;
      case "container": return <boxGeometry args={[0.7, 0.7, 0.7]} />;
      case "cloud": return <octahedronGeometry args={[0.8, 0]} />;
      default: return <sphereGeometry args={[0.6, 16, 16]} />;
    }
  }, [node.kind]);

  return (
    <mesh
      ref={ref}
      position={node.position}
      userData={{ nodeId: node.id }}
      onClick={(e) => { e.stopPropagation(); select(node.id); }}
    >
      {geo}
      <meshStandardMaterial
        color={COLOR[node.status]}
        emissive={COLOR[node.status]}
        emissiveIntensity={node.status === "critical" ? 1.4 : 0.35}
        roughness={0.4}
        metalness={0.6}
      />
    </mesh>
  );
}

export default function NodeMap() {
  const snapshot = useStore((s) => s.snapshot);
  if (!snapshot) return null;
  const nodes = snapshot.nodes;

  return (
    <group>
      {nodes.map((n) => <NodeMesh key={n.id} node={n} />)}
      {snapshot.edges.map((e, i) => {
        const a = nodes.find((n) => n.id === e.source);
        const b = nodes.find((n) => n.id === e.target);
        if (!a || !b) return null;
        return (
          <Line
            key={i}
            points={[a.position, b.position]}
            color="#334155"
            lineWidth={1}
            dashed
            dashSize={0.3}
            gapSize={0.2}
          />
        );
      })}
    </group>
  );
}