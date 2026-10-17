<div align="center">
  <h1>AIOps Cockpit</h1>
  <p><strong>The open-source, AI-powered SRE control room.</strong></p>
  <p>Diagnose incidents in seconds with an AI agent that reads your logs, checks your metrics, and proposes a fix. 3D visualization. Human-in-the-loop safety. Self-hosted.</p>
</div>

![AIOps Cockpit Demo](docs/screenshot.png)

## Features

- **3D Spatial Topology Map** - See your infrastructure as a living, breathing 3D space. Green is healthy, red is on fire, spinning means failing.
- **AI Agent Diagnostics** - Describe the incident ("checkout API 500s, DB restarting") and the LLM (Claude 3.7) investigates using real tools.
- **Human-in-the-Loop Safety** - The AI *never* applies a fix directly. It generates a unified diff. A human must review and approve it. Requires a two-person rule (requester cannot self-approve).
- **Defense-in-Depth** - Append-only audit logs, prompt-injection defenses, and a strict tool allowlist. Destructive actions are disabled by default.
- **Hand Gestures (Optional)** - Wave your hand to control the camera via MediaPipe (pinch = zoom, wrist = rotate, point = select).
- **Real-time Telemetry** - Live host metrics (CPU, RAM, Disk) and Docker container states via Socket.IO.

## Quick Start (Docker)

The fastest way to run AIOps Cockpit is with Docker. 

```bash
git clone https://github.com/matricphase-dot/aiops.git
cd aiops
docker compose up -d