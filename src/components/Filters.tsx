import { useRbacContext } from '@/state/context';
import {
  setFilterNamespace,
  setFilterResource,
  toggleFilterVerb,
} from '@/state/actions';
import { ALL_VERBS } from '@/types/rbac';

export function Filters() {
  const { state, dispatch } = useRbacContext();
  const namespaces = state.graph?.namespaces ?? [];
  const resourceTypes = state.graph?.resourceTypes ?? [];

  return (
    <div className="flex flex-col gap-4 p-4 text-text-primary">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
        Filters
      </h3>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">Namespace</span>
        <select
          className="rounded border border-input-border bg-input-bg px-2 py-1 text-sm"
          value={state.filter.namespace}
          onChange={e => dispatch(setFilterNamespace(e.target.value))}
        >
          <option value="all">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1 text-xs">
        <legend className="text-text-secondary mb-1">Verbs</legend>
        <div className="grid grid-cols-2 gap-1">
          {ALL_VERBS.map(v => {
            const checked = state.filter.verbs.has(v);
            return (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={checked}
                  onChange={() => dispatch(toggleFilterVerb(v))}
                />
                <span>{v}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-text-secondary">Resource type</span>
        <select
          className="rounded border border-input-border bg-input-bg px-2 py-1 text-sm"
          value={state.filter.resource}
          onChange={e => dispatch(setFilterResource(e.target.value))}
        >
          <option value="all">All resources</option>
          <option value="*">* (wildcard rules)</option>
          {resourceTypes.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
