import { useCallback, useEffect, useRef } from 'react';
import { Download, Upload, FileText, Eraser } from 'lucide-react';
import { useRbacContext, useTabsContext } from '@/state/context';
import { setGraph, setYaml } from '@/state/actions';
import { parseRbacYaml, RbacParseError } from '@/lib/rbac-parser';

const EXAMPLE = `apiVersion: v1
kind: ServiceAccount
metadata:
  name: deployer
  namespace: prod
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: deployer-secret
  namespace: prod
subjects:
- kind: ServiceAccount
  name: deployer
  namespace: prod
roleRef:
  kind: ClusterRole
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
`;

export function YamlInputPanel() {
  const { state, dispatch } = useRbacContext();
  const { activeTabId } = useTabsContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reparse = useCallback(
    (text: string) => {
      if (!text.trim()) {
        dispatch(setGraph(null, null));
        return;
      }
      try {
        const g = parseRbacYaml(text);
        dispatch(setGraph(g, null));
      } catch (e) {
        const msg =
          e instanceof RbacParseError ? e.message : e instanceof Error ? e.message : String(e);
        dispatch(setGraph(null, msg));
      }
    },
    [dispatch],
  );

  // Track the last yaml we reparsed *per tab*. Switching tabs or hydrating from
  // localStorage must not retrigger a parse (that would clobber baseline + selection).
  // Only an actual textarea edit in the active tab should reparse.
  const lastParsedRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const prev = lastParsedRef.current.get(activeTabId);
    if (prev === state.yaml) return;
    // First time we see this tab during this session — seed the cache without parsing
    // if the tab already has a graph or parse error (it came from localStorage).
    if (prev === undefined && (state.graph !== null || state.parseError !== null)) {
      lastParsedRef.current.set(activeTabId, state.yaml);
      return;
    }
    const id = window.setTimeout(() => {
      lastParsedRef.current.set(activeTabId, state.yaml);
      reparse(state.yaml);
    }, 200);
    return () => window.clearTimeout(id);
  }, [state.yaml, state.graph, state.parseError, activeTabId, reparse]);

  const onFile = useCallback(
    (file: File) => {
      file.text().then(text => dispatch(setYaml(text)));
    },
    [dispatch],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-divider bg-surface px-3 py-2 text-xs">
        <FileText size={14} className="text-text-secondary" />
        <span className="text-text-secondary">RBAC YAML</span>
        <span className="ml-2 text-text-secondary">
          {state.graph
            ? `${state.graph.roles.length} roles · ${state.graph.bindings.length} bindings · ${state.graph.subjects.length} subjects`
            : state.parseError
            ? `parse error: ${state.parseError}`
            : 'no input'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 hover:bg-glow"
            onClick={() => dispatch(setYaml(EXAMPLE))}
          >
            <FileText size={12} /> Example
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 hover:bg-glow"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={12} /> Upload
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 hover:bg-glow"
            disabled={!state.yaml}
            onClick={() => {
              const blob = new Blob([state.yaml], { type: 'text/yaml' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'rbac.yaml';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={12} /> Download
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 hover:bg-glow"
            onClick={() => dispatch(setYaml(''))}
          >
            <Eraser size={12} /> Clear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml,application/x-yaml,text/yaml,text/plain"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.currentTarget.value = '';
            }}
          />
        </div>
      </div>
      <textarea
        className="flex-1 w-full resize-none bg-yaml-bg p-3 font-mono text-xs text-yaml-text outline-none"
        spellCheck={false}
        value={state.yaml}
        onChange={e => dispatch(setYaml(e.target.value))}
        onPaste={() => {
          // Default paste behavior handles inserting; reparse happens automatically.
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        placeholder={'# Paste / drop YAML here. Try:\n# kubectl get roles,clusterroles,rolebindings,clusterrolebindings,serviceaccounts -A -o yaml'}
      />
    </div>
  );
}
