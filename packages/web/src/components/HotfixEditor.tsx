import { useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { api } from "../api";

// Self-host Monaco from public/monaco (copied from the monaco-editor package
// via `pnpm --filter @aiops/web setup:monaco`) instead of the public CDN, so
// the editor works offline and behind firewalls.
loader.config({ paths: { vs: "/monaco" } });

const SAMPLE_DIFF = `--- a/deploy/worker-queue.yaml
+++ b/deploy/worker-queue.yaml
@@ -12,7 +12,7 @@
 spec:
   containers:
   - name: worker
-    image: registry.local/worker:1.4.2
+    image: registry.local/worker:1.4.3
     resources:
       requests:
-        memory: "256Mi"
+        memory: "512Mi"
`;

export default function HotfixEditor() {
  const [value, setValue] = useState(SAMPLE_DIFF);
  const [saving, setSaving] = useState(false);

  const saveAsProposal = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const p = await api.createProposal({
        runId: "manual-" + Date.now(),
        diff: value,
        target: "main",
      });
      alert(`Proposal created: ${p.id}`);
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col border-t border-l border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-zinc-500">
          HOTFIX EDITOR
        </h2>
        <button
          onClick={() => void saveAsProposal()}
          disabled={saving || value.length === 0}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save as proposal"}
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          theme="vs-dark"
          language="diff"
          value={value}
          onChange={(v) => setValue(v ?? "")}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "off",
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </section>
  );
}
