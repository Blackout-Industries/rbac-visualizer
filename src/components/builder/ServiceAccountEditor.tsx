import { useRbacContext } from '@/state/context';
import { updateSa } from '@/state/actions';
import type { ServiceAccountObj } from '@/types/rbac';

interface Props {
  sa: ServiceAccountObj;
}

function saId(sa: ServiceAccountObj): string {
  return `ServiceAccount/${sa.namespace}/${sa.name}`;
}

export function ServiceAccountEditor({ sa }: Props) {
  const { dispatch } = useRbacContext();

  const patch = (next: Partial<ServiceAccountObj>) => {
    const merged: ServiceAccountObj = { ...sa, ...next };
    dispatch(updateSa(saId(sa), merged));
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded bg-glow px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
          ServiceAccount
        </span>
      </div>

      <Field label="name">
        <input
          className="rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
          value={sa.name}
          onChange={e => patch({ name: e.target.value })}
        />
      </Field>

      <Field label="namespace">
        <input
          className="rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm font-mono"
          value={sa.namespace}
          onChange={e => patch({ namespace: e.target.value || 'default' })}
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="uppercase tracking-wider text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
