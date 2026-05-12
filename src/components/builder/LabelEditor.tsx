import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface Props {
  labels: Record<string, string>;
  onChange: (labels: Record<string, string>) => void;
}

export function LabelEditor({ labels, onChange }: Props) {
  const entries = Object.entries(labels);
  const [k, setK] = useState('');
  const [v, setV] = useState('');

  const add = () => {
    const key = k.trim();
    if (!key) return;
    onChange({ ...labels, [key]: v });
    setK('');
    setV('');
  };

  const remove = (key: string) => {
    const next = { ...labels };
    delete next[key];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {entries.map(([key, value]) => (
          <li
            key={key}
            className="flex items-center gap-1 rounded border border-input-border bg-input-bg px-2 py-1 text-[11px] font-mono"
          >
            <span className="text-accent">{key}</span>
            <span className="text-text-secondary">=</span>
            <input
              className="flex-1 bg-transparent outline-none"
              value={value}
              onChange={e => onChange({ ...labels, [key]: e.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(key)}
              className="text-text-secondary hover:text-rating-1"
              aria-label="remove label"
            >
              <X size={12} />
            </button>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-[10px] italic text-text-secondary">nothing here yet</li>
        )}
      </ul>
      <div className="flex items-center gap-1">
        <input
          className="flex-1 rounded border border-input-border bg-input-bg px-2 py-1 text-[11px] font-mono"
          placeholder="key"
          value={k}
          onChange={e => setK(e.target.value)}
        />
        <input
          className="flex-1 rounded border border-input-border bg-input-bg px-2 py-1 text-[11px] font-mono"
          placeholder="value"
          value={v}
          onChange={e => setV(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center rounded border border-input-border bg-input-bg px-2 py-1 text-[11px] hover:bg-glow"
          aria-label="add label"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
