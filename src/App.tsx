import { useState } from 'react';
import { Network, Search, Shield, Hammer, Workflow } from 'lucide-react';
import { RbacProvider } from '@/state/context';
import { GraphView } from '@/components/GraphView';
import { ReverseQuery } from '@/components/ReverseQuery';
import { Filters } from '@/components/Filters';
import { SubjectDetail } from '@/components/SubjectDetail';
import { YamlInputPanel } from '@/components/YamlInputPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BuilderTab } from '@/components/builder/BuilderTab';
import { FlowChart } from '@/components/FlowChart';
import { TabBar } from '@/components/TabBar';

type Tab = 'graph' | 'flow' | 'reverse' | 'build';

declare const __APP_VERSION__: string;

export default function App() {
  return (
    <RbacProvider>
      <AppShell />
    </RbacProvider>
  );
}

function AppShell() {
  const [tab, setTab] = useState<Tab>('graph');
  const [splitPct, setSplitPct] = useState(55);
  const [draggingDivider, setDraggingDivider] = useState(false);

  const showYamlInputPanel = tab !== 'build';
  const showFilters = tab !== 'build' && tab !== 'flow';

  return (
    <div
      className="flex h-screen flex-col bg-canvas text-text-primary"
      onMouseUp={() => setDraggingDivider(false)}
      onMouseMove={e => {
        if (!draggingDivider) return;
        const pct = (e.clientY / window.innerHeight) * 100;
        setSplitPct(Math.max(20, Math.min(80, pct)));
      }}
    >
      <TabBar />
      <header className="flex items-center justify-between border-b border-divider bg-surface px-4 py-2">
        <div className="flex items-center gap-3">
          <Shield size={18} className="text-accent" />
          <h1 className="text-sm font-semibold tracking-wide">RBAC Visualizer</h1>
          <span className="text-[10px] text-text-secondary">v{__APP_VERSION__}</span>
        </div>
        <nav className="flex items-center gap-1">
          <TabButton active={tab === 'graph'} onClick={() => setTab('graph')}>
            <Network size={14} /> Graph
          </TabButton>
          <TabButton active={tab === 'flow'} onClick={() => setTab('flow')}>
            <Workflow size={14} /> Flow
          </TabButton>
          <TabButton active={tab === 'reverse'} onClick={() => setTab('reverse')}>
            <Search size={14} /> Reverse query
          </TabButton>
          <TabButton active={tab === 'build'} onClick={() => setTab('build')}>
            <Hammer size={14} /> Build
          </TabButton>
          <div className="ml-3">
            <ThemeToggle />
          </div>
        </nav>
      </header>

      <div className="flex flex-1 min-h-0">
        {showFilters && (
          <aside className="w-64 shrink-0 border-r border-divider bg-surface overflow-y-auto">
            <Filters />
          </aside>
        )}
        <main className="relative flex flex-1 min-w-0 flex-col">
          <section
            className="relative overflow-hidden"
            style={{ height: showYamlInputPanel ? `${splitPct}%` : '100%' }}
          >
            {tab === 'graph' ? (
              <GraphView />
            ) : tab === 'flow' ? (
              <FlowChart />
            ) : tab === 'reverse' ? (
              <ReverseQuery />
            ) : (
              <BuilderTab />
            )}
            {tab !== 'build' && tab !== 'flow' && <SubjectDetail />}
          </section>
          {showYamlInputPanel && (
            <>
              <div
                role="separator"
                aria-orientation="horizontal"
                className="h-1.5 cursor-row-resize bg-divider hover:bg-accent"
                onMouseDown={() => setDraggingDivider(true)}
              />
              <section
                className="overflow-hidden bg-yaml-bg"
                style={{ height: `${100 - splitPct}%` }}
              >
                <YamlInputPanel />
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors ' +
        (active
          ? 'bg-glow text-tab-active'
          : 'text-tab-inactive hover:bg-glow hover:text-tab-active')
      }
    >
      {children}
    </button>
  );
}
