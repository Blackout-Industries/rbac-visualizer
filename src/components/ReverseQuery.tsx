import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useRbacContext } from '@/state/context';
import { findSubjectsWith } from '@/lib/rbac-resolver';
import { detectRedFlags } from '@/lib/redflags';
import { ALL_VERBS, type PermissionChain } from '@/types/rbac';

interface Row {
  chain: PermissionChain;
}

const columnHelper = createColumnHelper<Row>();

export function ReverseQuery() {
  const { state } = useRbacContext();
  const graph = state.graph;

  const [verb, setVerb] = useState<string>('get');
  const [resource, setResource] = useState<string>('secrets');
  const [namespace, setNamespace] = useState<string>('');
  const [apiGroup, setApiGroup] = useState<string>('');

  const results = useMemo(() => {
    if (!graph) return [] as PermissionChain[];
    return findSubjectsWith(
      {
        verb: verb.trim(),
        resource: resource.trim(),
        namespace: namespace.trim() === '' ? undefined : namespace.trim(),
        apiGroup,
      },
      graph,
    );
  }, [graph, verb, resource, namespace, apiGroup]);

  const flags = useMemo(() => (graph ? detectRedFlags(graph) : []), [graph]);

  const rows: Row[] = results.map(c => ({ chain: c }));

  const columns = useMemo(
    () => [
      columnHelper.accessor(r => r.chain.subject, {
        id: 'subject',
        header: 'Subject',
        cell: info => {
          const s = info.getValue();
          return (
            <div className="flex flex-col">
              <span className="font-mono text-accent">{s.id}</span>
              <span className="text-[10px] text-text-secondary">{s.kind}</span>
            </div>
          );
        },
      }),
      columnHelper.accessor(r => r.chain.binding, {
        id: 'binding',
        header: 'Binding',
        cell: info => {
          const b = info.getValue();
          return (
            <span className="font-mono text-xs">
              {b.scope}/{b.namespace ? `${b.namespace}/` : ''}{b.name}
            </span>
          );
        },
      }),
      columnHelper.accessor(r => r.chain.role, {
        id: 'role',
        header: 'Role',
        cell: info => {
          const r = info.getValue();
          return (
            <span className="font-mono text-xs">
              {r.scope}/{r.namespace ? `${r.namespace}/` : ''}{r.name}
            </span>
          );
        },
      }),
      columnHelper.accessor(r => r.chain.rule, {
        id: 'rule',
        header: 'Rule',
        cell: info => {
          const rule = info.getValue();
          const wildcard =
            rule.verbs?.includes('*') ||
            rule.resources?.includes('*') ||
            rule.apiGroups?.includes('*');
          return (
            <div className="font-mono text-[11px]">
              <div>
                verbs: [{(rule.verbs ?? []).join(',')}]
              </div>
              <div>
                api: [{(rule.apiGroups ?? []).join(',')}] resources: [{(rule.resources ?? []).join(',')}]
              </div>
              {wildcard && (
                <span className="inline-flex items-center gap-1 text-rating-1 text-[10px] mt-1">
                  <AlertTriangle size={10} /> contains wildcard
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor(r => r.chain.appliesNamespace, {
        id: 'scope',
        header: 'Applies',
        cell: info => {
          const ns = info.getValue();
          return ns ? (
            <span className="text-xs font-mono">ns: {ns}</span>
          ) : (
            <span className="text-xs font-mono text-rating-1">cluster-wide</span>
          );
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <form
        className="flex flex-wrap gap-3 items-end border-b border-divider bg-surface px-4 py-3"
        onSubmit={e => e.preventDefault()}
      >
        <Field label="Verb" width="9rem">
          <select
            className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
            value={verb}
            onChange={e => setVerb(e.target.value)}
          >
            {ALL_VERBS.map(v => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
            <option value="*">*</option>
          </select>
        </Field>
        <Field label="Resource" width="12rem">
          <input
            type="text"
            className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
            value={resource}
            onChange={e => setResource(e.target.value)}
            placeholder="secrets"
          />
        </Field>
        <Field label="apiGroup" width="10rem">
          <input
            type="text"
            className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
            value={apiGroup}
            onChange={e => setApiGroup(e.target.value)}
            placeholder='"" (core)'
          />
        </Field>
        <Field label="Namespace" width="10rem">
          <input
            type="text"
            className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
            value={namespace}
            onChange={e => setNamespace(e.target.value)}
            placeholder="prod (blank = cluster)"
          />
        </Field>

        <div className="flex items-center gap-2 ml-auto text-xs">
          {results.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-rating-1">
              <ShieldCheck size={12} /> No subjects can perform this.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rating-4">
              {results.length} grant chain{results.length === 1 ? '' : 's'} found
            </span>
          )}
        </div>
      </form>

      <div className="flex-1 overflow-auto">
        {graph ? (
          <table className="rbac-table">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => (
                    <th key={h.id}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(r => (
                <tr key={r.id}>
                  {r.getVisibleCells().map(c => (
                    <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center text-text-secondary text-sm">
            Paste or upload RBAC YAML first.
          </div>
        )}
      </div>

      {flags.length > 0 && (
        <div className="border-t border-divider bg-surface max-h-48 overflow-auto p-3 text-xs">
          <h4 className="mb-2 inline-flex items-center gap-1 font-semibold text-text-secondary uppercase tracking-wider">
            <AlertTriangle size={12} /> Red flags ({flags.length})
          </h4>
          <ul className="flex flex-col gap-1">
            {flags.slice(0, 20).map((f, i) => (
              <li
                key={i}
                className={
                  f.severity === 'critical'
                    ? 'text-rating-1'
                    : f.severity === 'warning'
                    ? 'text-rating-2'
                    : 'text-text-secondary'
                }
              >
                [{f.severity}] {f.message}
              </li>
            ))}
            {flags.length > 20 && (
              <li className="text-text-secondary">+{flags.length - 20} more…</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  width,
  children,
}: {
  label: string;
  width: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ width }}>
      <span className="text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
