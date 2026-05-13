import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Plus, X, MoreHorizontal, Copy, XSquare } from 'lucide-react';
import { useTabsContext } from '@/state/context';
import {
  addTab,
  closeOtherTabs,
  duplicateTab,
  removeTab,
  renameTab,
  switchTab,
} from '@/state/actions';
import type { TabState } from '@/state/tabs';

/**
 * Outer workspace tab strip. Each tab is an independent RBAC config
 * (yaml + graph + builder selection + filter). The inner view tabs
 * (graph/flow/reverse/build) live one level down inside the header.
 */
export function TabBar() {
  const { tabs, activeTabId, dispatch } = useTabsContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // close the overflow menu on outside-click / escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const onCommitRename = (id: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed) dispatch(renameTab(id, trimmed));
    setEditingId(null);
  };

  return (
    <div className="flex items-center border-b border-divider bg-canvas">
      <div className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto px-2 py-1">
        {tabs.map(t => (
          <TabPill
            key={t.id}
            tab={t}
            active={t.id === activeTabId}
            editing={editingId === t.id}
            canClose={tabs.length > 1}
            onSelect={() => dispatch(switchTab(t.id))}
            onStartEdit={() => setEditingId(t.id)}
            onCommit={name => onCommitRename(t.id, name)}
            onCancel={() => setEditingId(null)}
            onClose={() => dispatch(removeTab(t.id))}
          />
        ))}
        <button
          type="button"
          onClick={() => dispatch(addTab())}
          className="ml-1 inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-glow hover:text-text-primary"
          title="new tab"
        >
          <Plus size={12} /> new tab
        </button>
      </div>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          className="mr-2 inline-flex items-center rounded px-1.5 py-1 text-text-secondary hover:bg-glow hover:text-text-primary"
          title="tab actions"
          aria-label="tab actions"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-2 top-full z-30 mt-1 w-44 rounded border border-divider bg-surface py-1 text-[11px] shadow-lg">
            <MenuItem
              icon={<Copy size={12} />}
              label="duplicate active tab"
              onClick={() => {
                dispatch(duplicateTab(activeTabId));
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<XSquare size={12} />}
              label="close other tabs"
              disabled={tabs.length <= 1}
              onClick={() => {
                dispatch(closeOtherTabs(activeTabId));
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<X size={12} />}
              label="close active tab"
              onClick={() => {
                dispatch(removeTab(activeTabId));
                setMenuOpen(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TabPill({
  tab,
  active,
  editing,
  canClose,
  onSelect,
  onStartEdit,
  onCommit,
  onCancel,
  onClose,
}: {
  tab: TabState;
  active: boolean;
  editing: boolean;
  canClose: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const onClickPill = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (editing) return;
    // ignore clicks that originated on the close button
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'button' || (e.target as HTMLElement).closest('button')) return;
    onSelect();
  };

  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={onClickPill}
      onDoubleClick={e => {
        e.stopPropagation();
        onStartEdit();
      }}
      title="double-click to rename"
      className={
        'group flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-[11px] cursor-pointer border transition-colors ' +
        (active
          ? 'border-accent bg-glow text-text-primary'
          : 'border-transparent text-text-secondary hover:bg-glow hover:text-text-primary')
      }
    >
      {editing ? (
        <RenameInput initial={tab.name} onCommit={onCommit} onCancel={onCancel} />
      ) : (
        <>
          <span className="truncate max-w-[12rem]">{tab.name}</span>
          {canClose && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onClose();
              }}
              className="ml-1 rounded p-0.5 text-text-secondary opacity-0 hover:bg-canvas hover:text-text-primary group-hover:opacity-100 focus:opacity-100"
              title="close tab"
              aria-label={`close ${tab.name}`}
            >
              <X size={10} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    ref.current?.select();
  }, []);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={ref}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={onKey}
      onClick={e => e.stopPropagation()}
      className="w-32 bg-transparent text-[11px] text-text-primary outline-none border-b border-accent px-0.5"
    />
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-primary hover:bg-glow disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {icon} <span>{label}</span>
    </button>
  );
}
