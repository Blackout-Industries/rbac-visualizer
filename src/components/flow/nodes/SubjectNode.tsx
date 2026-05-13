import { memo } from 'react';
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
  if (subject.kind === 'ServiceAccount') return 'var(--theme-arrow-allow)';
  if (subject.kind === 'Group') return 'var(--theme-rating-3)';
  return 'var(--theme-accent)';
}

function KindIcon({ subject }: { subject: Subject }) {
  if (subject.kind === 'ServiceAccount') return <Bot size={11} />;
  if (subject.kind === 'Group') return <Users size={11} />;
  return <User size={11} />;
}

function SubjectNodeImpl({ data }: NodeProps<SubjectNodeData>) {
  const outline =
    data.severity === 'admin' || data.severity === 'sensitive'
      ? subjectSeverityColor(data.severity)
      : kindColor(data.subject);
  const showSkull = data.severity === 'admin';
  const showWarn = data.severity === 'sensitive';

  return (
    <div
      className="flow-subject-card"
      style={{
        opacity: data.dim ? 0.18 : 1,
        borderColor: outline,
        boxShadow: data.selected ? `0 0 0 2px ${outline}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flow-subject-card__head" style={{ color: outline }}>
        <KindIcon subject={data.subject} />
        <span className="flow-subject-card__kind">{data.subject.kind.toLowerCase()}</span>
        {showSkull && <ShieldAlert size={11} className="ml-auto" />}
        {showWarn && !showSkull && <AlertTriangle size={11} className="ml-auto" />}
      </div>
      <div className="flow-subject-card__name" title={data.subject.name}>
        {data.subject.name}
      </div>
      {data.subject.namespace && data.subject.kind === 'ServiceAccount' && (
        <div className="flow-subject-card__sub">ns · {data.subject.namespace}</div>
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

export const SubjectNode = memo(SubjectNodeImpl);
