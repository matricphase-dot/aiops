import type { Proposal } from "../api";

/**
 * Demo-mode fixtures (VITE_DEMO_MODE=true).
 *
 * Everything the pitch video needs, with no backend: the proposal the drawer
 * shows, the diff it renders, the agent's streamed diagnosis, and the terminal
 * boot sequence. Kept in one place so the demo is trivially auditable — every
 * string that can appear on screen is here, never fetched.
 */

export const MOCK_PROPOSAL: Proposal = {
  id: "prop_demo_0001",
  runId: "run_demo_0001",
  requester: "you@aiops.dev",
  approver: null,
  target: "deploy/worker-queue.yaml",
  status: "draft",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  prUrl: null,
  reason: "worker-queue OOM loop: bump image to 1.4.3 and raise memory limits",
  preflight: {
    applyCheck: true,
    pathAllowlist: true,
    sizeLimit: true,
    noNewFiles: true,
    noDeletions: true,
  },
};

export const MOCK_DIFF = `--- a/deploy/worker-queue.yaml
+++ b/deploy/worker-queue.yaml
@@ -12,8 +12,8 @@
 spec:
   containers:
   - name: worker
-    image: registry.local/worker:1.4.2
+    image: registry.local/worker:1.4.3
     resources:
       requests:
-        memory: "256Mi"
+        memory: "512Mi"
       limits:
-        memory: "512Mi"
+        memory: "1Gi"
`;

/** The exact text AgentPanel streams locally in demo mode. */
export const DEMO_DIAGNOSIS = `goal: worker-queue is saturating memory and restarts every few minutes

plan: observe → diagnose → propose

[observe]
container/worker-queue   cpu 87%   mem 74%   restarts 3/10m
cloud/aws-ecs-prod       healthy   12 tasks running
cloud/grafana-cloud      unreachable   last scrape 4m ago

[diagnose]
Root cause: the worker image (1.4.2) leaks memory under burst load. With a 256Mi
request the container is OOM-killed, restarts, and replays the queue — which
drives CPU to 87% and starves the co-located scrape agent. grafana-cloud is a
symptom, not a fault: its timeouts clear once the worker stops flapping.

Blast radius: one deployment, no schema or API changes, fully reversible.

[propose]
Patch deploy/worker-queue.yaml — pin image registry.local/worker:1.4.3 (leak
fix) and raise requests/limits to 512Mi/1Gi. Saved as a draft proposal for
human approval; nothing is applied without sign-off.

=== run complete ===`;

/** Terminal boot sequence shown instead of the phase-by-phase dev chatter. */
export const DEMO_BOOT_LINES = [
  "[boot] AIOps Cockpit v1.0.0",
  "[system] Sandbox environment initialized",
  "[telemetry] Mock data stream active",
  "[safety] Tool allowlist enforced (read-only)",
];
