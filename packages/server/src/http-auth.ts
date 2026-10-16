import type { Express, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { audit } from "./audit.js";

/**
 * HTTP auth routes for the login flow. Mounted BEFORE any socket wiring so
 * /api/* and socket.io share the same express http server.
 *
 * Security properties:
 *  - failures ALWAYS return the same "invalid credentials" message (no user
 *    enumeration â€” a wrong email and a wrong password look identical)
 *  - credential check via strict string comparison; not timing-hardened,
 *    but no user enumeration is possible from the response body
 *  - /api/login is rate limited to 5 attempts / IP / minute, in-memory
 */

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateEntry>();
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60_000;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_MAX;
}

export function installHttpAuth(app: Express): void {
  app.post("/api/login", (req: Request, res: Response) => {
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";

    if (!rateLimit(ip)) {
      res.status(429).json({ error: "too many attempts" });
      return;
    }

    const email =
      typeof (req.body as { email?: unknown })?.email === "string"
        ? (req.body as { email: string }).email
        : "";
    const password =
      typeof (req.body as { password?: unknown })?.password === "string"
        ? (req.body as { password: string }).password
        : "";

    const expectedEmail = process.env.ADMIN_EMAIL;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (
      !expectedEmail ||
      !expectedPassword ||
      email !== expectedEmail ||
      password !== expectedPassword
    ) {
      void audit.write({
        ts: Date.now(),
        userId: email ?? "unknown",
        action: "login",
        result: "denied",
        detail: "invalid credentials",
      });
      res.status(401).json({ error: "invalid credentials" });
      return;
    }

    // Same payload shape as the socket auth middleware consumes (sub/email/roles).
    const token = jwt.sign(
      { sub: email, email, roles: ["operator", "viewer", "approver"] },
      process.env.JWT_SECRET as string,
      { expiresIn: "8h" },
    );

    void audit.write({
      ts: Date.now(),
      userId: email,
      action: "login",
      result: "ok",
    });
    res.json({ token });
  });

  app.post("/api/logout", (_req: Request, res: Response) => {
    // Stateless JWT â€” the client drops the token from sessionStorage, the
    // server has nothing to invalidate (no server-side session store).
    void audit.write({
      ts: Date.now(),
      userId: "(logout)",
      action: "logout",
      result: "ok",
    });
    res.status(200).json({ ok: true });
  });

  app.get("/api/me", (req: Request, res: Response) => {
    const header = req.headers.authorization;
    const token =
      header?.startsWith("Bearer ") && header.slice(7).trim() !== ""
        ? header.slice(7)
        : null;
    if (!token) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
        sub?: string;
        email?: string;
        roles?: string[];
      };
      if (!payload.sub) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      res.json({
        id: payload.sub,
        email: payload.email ?? "",
        roles: payload.roles ?? [],
      });
    } catch {
      res.status(401).json({ error: "unauthorized" });
    }
  });
}
