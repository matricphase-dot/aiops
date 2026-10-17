<div align="center">
  <h1>AIOps Cockpit</h1>
  <p><strong>The open-source, AI-powered SRE control room.</strong></p>
  <p>Diagnose incidents in seconds with an AI agent that reads your logs, checks your metrics, and proposes a fix. 3D visualization. Human-in-the-loop safety. Self-hosted.</p>
</div>

![AIOps Cockpit Demo](docs/screenshot.png)

## Features

- **3D Spatial Topology Map** — See your infrastructure as a living, breathing 3D space. Green is healthy, red is on fire, spinning means failing.
- **AI Agent Diagnostics** — Describe the incident ("checkout API 500s, DB restarting") and the LLM (Claude 3.7) investigates using real tools.
- **Human-in-the-Loop Safety** — The AI *never* applies a fix directly. It generates a unified diff. A human must review and approve it. Requires a two-person rule (requester cannot self-approve).
- **Defense-in-Depth** — Append-only audit logs, prompt-injection defenses, and a strict tool allowlist. Destructive actions are disabled by default.
- **Hand Gestures (Optional)** — Wave your hand to control the camera via MediaPipe (pinch = zoom, wrist = rotate, point = select).
- **Real-time Telemetry** — Live host metrics (CPU, RAM, Disk) and Docker container states via Socket.IO.

## Quick Start

**Prerequisites:** Node.js 20+, pnpm, Docker (optional, for container telemetry).

```bash
# 1. Clone and install
git clone https://github.com/matricphase-dot/aiops.git
cd aiops
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY (optional, falls back to deterministic mode)

# 3. Start the backend (no watch mode)
cd packages/server
pnpm exec tsx src/index.ts

# 4. In a new terminal, start the frontend
cd packages/web
pnpm dev