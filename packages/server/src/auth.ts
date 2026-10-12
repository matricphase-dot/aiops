import jwt from "jsonwebtoken";
import type { Server, Socket } from "socket.io";

/**
 * Per-connection identity attached by the io.use middleware below.
 * Kept loose so runners can pass it around without casting.
 */
export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

declare module "socket.io" {
  interface SocketData {
    user?: AuthUser;
  }
}

/**
 * Socket.IO auth middleware. The token MUST arrive in
 * socket.handshake.auth.token — never from a query string or header, so it
 * does not leak into access logs or proxy records.
 */
export function installAuth(io: Server): void {
  io.use(async (socket, next) => {
    // Dev escape hatch: explicit, narrow, loudly announced.
    if (process.env.AUTH_DISABLED === "true") {
      socket.data.user = {
        id: "dev",
        email: "dev@local",
        roles: ["operator", "viewer"],
      };
      console.warn("[auth] AUTH DISABLED — dev only. Do not use in production.");
      return next();
    }

    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("unauthorized"));
    }

    try {
      // Throws (does not resolve) when secret is missing — the catch turns
      // that into "unauthorized", which is the safe outcome.
      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
        sub?: string;
        email?: string;
        roles?: string[];
      };
      if (!payload.sub) {
        return next(new Error("unauthorized"));
      }
      socket.data.user = {
        id: payload.sub,
        email: payload.email ?? "",
        roles: payload.roles ?? [],
      };
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });
}

/**
 * Role gate for handlers. Throws; callers decide whether to translate the
 * throw into an emit or let the socket error path handle it.
 */
export function requireRole(socket: Socket, role: string): void {
  if (!socket.data.user?.roles.includes(role)) {
    throw new Error(`forbidden: missing role ${role}`);
  }
}
