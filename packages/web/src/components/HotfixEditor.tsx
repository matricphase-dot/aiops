import Editor from "@monaco-editor/react";

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
  return (
    <section className="flex min-w-0 flex-1 flex-col border-t border-l border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-zinc-500">
          HOTFIX EDITOR
        </h2>
        <span className="text-[10px] text-zinc-600">
          apply path lands in phase 5 — PR only
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          theme="vs-dark"
          language="diff"
          value={SAMPLE_DIFF}
          options={{
            readOnly: true,
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
