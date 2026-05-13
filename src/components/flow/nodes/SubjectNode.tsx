import { Handle, Position, type NodeProps } from 'reactflow';
import { User, Users, Bot, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { Subject } from '@/types/rbac';
import { subjectSeverityColor, type SubjectSeverity } from '@/lib/severity';

export interface SubjectNodeData {
  subject: Subject;
  severity: SubjectSeverity;
  dim: boolean;
  selected: boolean;
}

function kindColor(subject: Subject): string {
  // ServiceAccount: teal; User: mauve (accent); Group: a different accent
  if (subject.kind === 'ServiceAccount') return 'var(--theme-arrow-allow)';
  if (subject.kind === 'Group') return 'var(--theme-rating-3)';
  return 'var(--theme-accent)';
}

function KindIcon({ subject }: { subject: Subject }) {
  if (subject.kind === 'ServiceAccount') return <Bot size={12} />;
  if (subject.kind === 'Group') return <Users size={12} />;
  return <User size={12} />;
}

export function SubjectNode({ data }: NodeProps<SubjectNodeData>) {
  const outline =
    data.severity === 'admin' || data.severity === 'sensitive'
      ? subjectSeverityColor(data.severity)
      : kindColor(data.subject);
  const showSkull = data.severity === 'admin';
  const showWarn = data.severity === 'sensitive';

  return (
    <div
      className="flow-node"
      style={{
        opacity: data.dim ? 0.15 : 1,
        borderColor: outline,
        boxShadow: data.selected ? `0 0 0 2px ${outline}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flow-node-header" style={{ color: outline }}>
        <KindIcon subject={data.subject} />
        <span className="flow-node-kind">{data.subject.kind.toLowerCase()}</span>
        {showSkull && <ShieldAlert size={12} className="ml-auto" />}
        {showWarn && <AlertTriangle size={12} className="ml-auto" />}
      </div>
      <div className="flow-node-name">{data.subject.name}</div>
      {data.subject.namespace && data.subject.kind === 'ServiceAccount' && (
        <div className="flow-node-sub">ns · {data.subject.namespace}</div>
      )}
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

const handleStyle = {
  background: 'transparent',
  border: 'none',
  width: 1,
  height: 1,
};
