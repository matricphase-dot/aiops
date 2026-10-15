// packages/server/src/routes/proposals.ts
import type { Express, Request, Response, NextFunction } from "express";
import { promises as fs } from "node:fs";
import jwt from "jsonwebtoken";
import {
  approve,
  createProposal,
  listProposals,
  readProposal,
  reject,
  requestApply,
  writeProposal,
} from "../proposals.js";
import { runPreflight, allPassed } from "../preflight.js";
import { openFixBranch } from "../git.js";
import { audit } from "../audit.js";

interface AuthedRequest extends Request {
  user?: { id: string; email: string; roles: string[] };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? "") as any;
    req.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
    };
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}

function requireRole(role: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.roles.includes(role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}

export function installProposalRoutes(app: Express) {
  app.use("/api/proposals", requireAuth);

  app.get("/api/proposals", async (_req, res) => {
    res.json(await listProposals());
  });

  app.get("/api/proposals/:id", async (req, res) => {
    const p = await readProposal(req.params.id);
    if (!p) return res.status(404).json({ error: "not found" });
    res.json(p);
  });

  app.get("/api/proposals/:id/diff", async (req, res) => {
    const p = await readProposal(req.params.id);
    if (!p) return res.status(404).json({ error: "not found" });
    try {
      const content = await fs.readFile(p.diffPath, "utf8");
      res.type("text/plain").send(content);
    } catch {
      res.status(500).json({ error: "diff unreadable" });
    }
  });

  app.post("/api/proposals", async (req: AuthedRequest, res) => {
    const { runId, diff, target } = req.body ?? {};
    if (typeof runId !== "string" || typeof diff !== "string") {
      return res.status(400).json({ error: "runId and diff required" });
    }
    if (diff.trim().length === 0) {
      return res.status(400).json({ error: "diff is empty" });
    }
    const p = await createProposal({
      runId,
      requester: req.user!.id,
      diff,
      target: typeof target === "string" ? target : "main",
    });
    res.json(p);
  });

  app.post("/api/proposals/:id/request", async (req: AuthedRequest, res) => {
    try {
      res.json(await requestApply(req.params.id, req.user!.id));
    } catch (e: any) {
      res.status(400).json({ error: String(e?.message ?? e) });
    }
  });

  app.post(
    "/api/proposals/:id/approve",
    requireRole("approver"),
    async (req: AuthedRequest, res) => {
      try {
        const p = await approve(req.params.id, req.user!.id);

        const pf = await runPreflight({
          repoRoot: process.env.REPO_ROOT ?? process.cwd(),
          diffPath: p.diffPath,
        });
        p.preflight = {
          applyCheck: pf.applyCheck,
          pathAllowlist: pf.pathAllowlist,
          sizeLimit: pf.sizeLimit,
          noNewFiles: pf.noNewFiles,
          noDeletions: pf.noDeletions,
        };

        if (!allPassed(pf)) {
          p.status = "rejected";
          p.reason = pf.details.join("; ");
          await writeProposal(p);
          await audit.write({
            ts: Date.now(), userId: req.user!.id, action: "proposal.preflight",
            result: "denied", detail: `proposal ${p.id}: ${p.reason}`,
          });
          return res.status(400).json({ error: "preflight failed", details: pf.details });
        }

        p.status = "preflight_ok";
        await writeProposal(p);
        await audit.write({
          ts: Date.now(), userId: req.user!.id, action: "proposal.preflight",
          result: "ok", detail: `proposal ${p.id} passed all checks`,
        });

        try {
          const { branch, prUrl, commitSha } = await openFixBranch(
            {
              repoRoot: process.env.REPO_ROOT ?? process.cwd(),
              remote: process.env.GIT_REMOTE ?? "origin",
              baseBranch: p.target,
            },
            p.id,
            p.diffPath
          );
          p.status = "pr_opened";
          p.prUrl = prUrl;
          p.reason = `branch ${branch}, commit ${commitSha.slice(0, 8)}`;
          await writeProposal(p);
          await audit.write({
            ts: Date.now(), userId: req.user!.id, action: "proposal.pr",
            result: "ok", detail: `proposal ${p.id}: ${prUrl ?? branch}`,
          });
          res.json(p);
        } catch (e: any) {
          p.status = "failed";
          p.reason = String(e?.message ?? e);
          await writeProposal(p);
          await audit.write({
            ts: Date.now(), userId: req.user!.id, action: "proposal.pr",
            result: "error", detail: `proposal ${p.id}: ${p.reason}`,
          });
          res.status(500).json({ error: "git failed", details: p.reason });
        }
      } catch (e: any) {
        res.status(400).json({ error: String(e?.message ?? e) });
      }
    }
  );

  app.post(
    "/api/proposals/:id/reject",
    requireRole("approver"),
    async (req: AuthedRequest, res) => {
      try {
        const reason = String(req.body?.reason ?? "no reason given");
        res.json(await reject(req.params.id, req.user!.id, reason));
      } catch (e: any) {
        res.status(400).json({ error: String(e?.message ?? e) });
      }
    }
  );
}