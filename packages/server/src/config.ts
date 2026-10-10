export const SOCKET_PORT = Number(process.env.SOCKET_PORT ?? 8787);

/** One telemetry tick in ms (the plan's every-2 s cadence). */
export const TICK_MS = 2_000;

/** Set ENABLE_DOCKER=false to skip dockerode container collection. */
export const DOCKER_ENABLED = process.env.ENABLE_DOCKER !== "false";
