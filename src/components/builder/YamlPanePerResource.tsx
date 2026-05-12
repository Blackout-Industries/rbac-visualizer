import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import { useRbacContext } from '@/state/context';
import { updateBinding, updateRole, updateSa } from '@/state/actions';
import { parseRbacYaml } from '@/lib/rbac-parser';
import {
  genBindingYaml,
  genRoleYaml,
  genServiceAccountYaml,
} from '@/lib/rbac-gen';
import type { Binding, Role, ServiceAccountObj } from '@/types/rbac';

type Selection =
  | { kind: 'role'; role: Role }
  | { kind: 'binding'; binding: Binding }
  | { kind: 'sa'; sa: ServiceAccountObj };

interface Props {
  selection: Selection;
}

function saId(sa: ServiceAccountObj): string {
  return `ServiceAccount/${sa.namespace}/${sa.name}`;
}

export function YamlPanePerResource({ selection }: Props) {
  const { dispatch } = useRbacContext();

  const yamlFromIr = useMemo(() => {
    if (selection.kind === 'role') return genRoleYaml(selection.role);
    if (selection.kind === 'binding') return genBindingYaml(selection.binding);
    return genServiceAccountYaml(selection.sa);
  }, [selection]);

  const [draft, setDraft] = useState<string>(yamlFromIr);
  const [error, setError] = useState<string | null>(null);
  const lastIrYaml = useRef<string>(yamlFromIr);
  const editing = useRef<boolean>(false);

  // When the IR changes upstream and we are NOT actively editing, sync the draft.
  useEffect(() => {
    if (!editing.current) {
      setDraft(yamlFromIr);
      setError(null);
      lastIrYaml.current = yamlFromIr;
    } else if (yamlFromIr !== lastIrYaml.current) {
      // IR changed while we were typing — keep user's draft, but remember the new baseline.
      lastIrYaml.current = yamlFromIr;
    }
  }, [yamlFromIr]);

  const onChange = (next: string) => {
    editing.current = true;
    setDraft(next);
    if (!next.trim()) {
      setError('empty document');
      return;
    }
    try {
      const parsed = parseRbacYaml(next);
      const totalObjects =
        parsed.roles.length + parsed.bindings.length + parsed.serviceAccounts.length;
      if (totalObjects === 0) {
        setError('no recognized resource in document');
        return;
      }
      if (totalObjects > 1) {
        setError('per-resource pane only accepts a single document');
        return;
      }
      if (selection.kind === 'role') {
        const parsedRole = parsed.roles[0];
        if (!parsedRole) {
          setError(`expected a ${selection.role.scope} document`);
          return;
        }
        if (parsedRole.scope !== selection.role.scope) {
          setError(`kind mismatch: editor expects ${selection.role.scope}`);
          return;
        }
        setError(null);
        dispatch(updateRole(selection.role.id, parsedRole));
      } else if (selection.kind === 'binding') {
        const parsedBinding = parsed.bindings[0];
        if (!parsedBinding) {
          setError(`expected a ${selection.binding.scope} document`);
          return;
        }
        if (parsedBinding.scope !== selection.binding.scope) {
          setError(`kind mismatch: editor expects ${selection.binding.scope}`);
          return;
        }
        setError(null);
        dispatch(updateBinding(selection.binding.id, parsedBinding));
      } else {
        const parsedSa = parsed.serviceAccounts[0];
        if (!parsedSa) {
          setError('expected a ServiceAccount document');
          return;
        }
        setError(null);
        dispatch(updateSa(saId(selection.sa), parsedSa));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onBlur = () => {
    editing.current = false;
    // If parse currently succeeds, allow upstream IR sync next render.
    if (!error) {
      // No-op: yamlFromIr will recompute from the IR.
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-divider bg-surface px-3 py-2 text-xs">
        <FileText size={14} className="text-text-secondary" />
        <span className="text-text-secondary">resource yaml</span>
        {error && (
          <span className="ml-auto inline-flex items-center gap-1 text-rating-1 text-[11px]">
            <AlertTriangle size={12} /> {error}
          </span>
        )}
      </div>
      <textarea
        className={
          'flex-1 w-full resize-none bg-yaml-bg p-3 font-mono text-xs text-yaml-text outline-none border ' +
          (error ? 'border-rating-1' : 'border-transparent')
        }
        spellCheck={false}
        value={draft}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
