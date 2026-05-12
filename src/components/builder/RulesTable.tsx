import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { ALL_VERBS, type PolicyRule } from '@/types/rbac';

interface Props {
  rules: PolicyRule[];
  onChange: (next: PolicyRule[]) => void;
}

export function RulesTable({ rules, onChange }: Props) {
  const updateRule = (idx: number, patch: Partial<PolicyRule>) => {
    const next = rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };
  const deleteRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
  };
  const addRule = () => {
    onChange([
      ...rules,
      {
        verbs: ['get'],
        apiGroups: [''],
        resources: [],
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-wider text-text-secondary">rules</h4>
        <button
          type="button"
          onClick={addRule}
          className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 text-xs hover:bg-glow"
        >
          <Plus size={12} /> add rule
        </button>
      </div>
      {rules.length === 0 && (
        <p className="text-[11px] italic text-text-secondary">nothing here yet — add a rule</p>
      )}
      <ul className="flex flex-col gap-3">
        {rules.map((rule, idx) => (
          <li
            key={idx}
            className="rounded border border-card-border bg-card-bg p-3 text-xs flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">rule #{idx + 1}</span>
              <button
                type="button"
                onClick={() => deleteRule(idx)}
                className="text-text-secondary hover:text-rating-1"
                aria-label="delete rule"
              >
                <Trash2 size={12} />
              </button>
            </div>

            <RuleField label="apiGroups">
              <TagInput
                values={rule.apiGroups ?? []}
                placeholder={'"" for core, * for any'}
                onChange={v => updateRule(idx, { apiGroups: v })}
              />
            </RuleField>

            <RuleField label="resources">
              <TagInput
                values={rule.resources ?? []}
                placeholder="pods, secrets, *"
                onChange={v => updateRule(idx, { resources: v })}
              />
            </RuleField>

            <RuleField label="verbs">
              <VerbsPicker
                values={rule.verbs ?? []}
                onChange={v => updateRule(idx, { verbs: v })}
              />
            </RuleField>

            <RuleField label="resourceNames">
              <TagInput
                values={rule.resourceNames ?? []}
                placeholder="(leave empty for no narrowing)"
                onChange={v =>
                  updateRule(idx, { resourceNames: v.length === 0 ? undefined : v })
                }
              />
            </RuleField>

            <RuleField label="nonResourceURLs">
              <TagInput
                values={rule.nonResourceURLs ?? []}
                placeholder="/healthz, /metrics, *"
                onChange={v =>
                  updateRule(idx, { nonResourceURLs: v.length === 0 ? undefined : v })
                }
              />
            </RuleField>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

function VerbsPicker({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const stdSet = new Set<string>(ALL_VERBS);
  const has = (v: string) => values.includes(v);
  const toggle = (v: string) => {
    if (has(v)) onChange(values.filter(x => x !== v));
    else onChange([...values, v]);
  };
  const others = values.filter(v => v !== '*' && !stdSet.has(v));
  const [draft, setDraft] = useState('');
  const addOther = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };
  const removeOther = (v: string) => onChange(values.filter(x => x !== v));

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1">
        {ALL_VERBS.map(v => (
          <label key={v} className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={has(v)}
              onChange={() => toggle(v)}
            />
            <span className="font-mono text-[11px]">{v}</span>
          </label>
        ))}
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={has('*')}
            onChange={() => toggle('*')}
          />
          <span className="font-mono text-[11px] text-rating-1">*</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {others.map(o => (
          <span
            key={o}
            className="inline-flex items-center gap-1 rounded border border-input-border bg-input-bg px-1.5 py-0.5 font-mono text-[10px]"
          >
            {o}
            <button
              type="button"
              onClick={() => removeOther(o)}
              className="text-text-secondary hover:text-rating-1"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          className="rounded border border-input-border bg-input-bg px-2 py-1 text-[11px] font-mono w-36"
          placeholder="other verb…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addOther();
            }
          }}
          onBlur={addOther}
        />
      </div>
    </div>
  );
}

function TagInput({
  values,
  placeholder,
  onChange,
}: {
  values: string[];
  placeholder?: string;
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft;
    if (v.length === 0 && draft !== '') return;
    // We allow empty string "" for the core apiGroup.
    if (values.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-wrap items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1.5">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 rounded bg-glow px-1.5 py-0.5 font-mono text-[10px]"
        >
          {v === '' ? '""' : v}
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-text-secondary hover:text-rating-1"
            aria-label="remove tag"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[6rem] bg-transparent text-[11px] font-mono outline-none"
        placeholder={values.length === 0 ? placeholder : ''}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft !== '') add();
        }}
      />
    </div>
  );
}
