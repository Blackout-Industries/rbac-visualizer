import { Handle, Position, type NodeProps } from 'reactflow';
import { ListChecks, Asterisk } from 'lucide-react';
import type { PolicyRule } from '@/types/rbac';
import { ruleSeverityColor, type RuleSeverity } from '@/lib/severity';

export interface RuleNodeData {
  rule: PolicyRule;
  severity: RuleSeverity;
  ruleIndex: number;
  dim: boolean;
}

function summarize(list: string[] | undefined, max = 3): string {
  if (!list || list.length === 0) return '·';
  if (list.length <= max) return list.join(', ');
  return `${list.slice(0, max).join(', ')} +${list.length - max}`;
}

export function RuleNode({ data }: NodeProps<RuleNodeData>) {
  const outline = ruleSeverityColor(data.severity);
  const wild = data.severity === 'wildcard';
  return (
    <div
      className="flow-node flow-node--rule"
      style={{
        opacity: data.dim ? 0.15 : 1,
        borderColor: outline,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flow-node-header" style={{ color: outline }}>
        {wild ? <Asterisk size={12} /> : <ListChecks size={12} />}
        <span className="flow-node-kind">rule #{data.ruleIndex}</span>
      </div>
      <div className="flow-node-rule-line">
        <span className="flow-node-rule-label">verbs</span>
        <span className="flow-node-rule-val">{summarize(data.rule.verbs)}</span>
      </div>
      <div className="flow-node-rule-line">
        <span className="flow-node-rule-label">api</span>
        <span className="flow-node-rule-val">{summarize(data.rule.apiGroups)}</span>
      </div>
      <div className="flow-node-rule-line">
        <span className="flow-node-rule-label">res</span>
        <span className="flow-node-rule-val">{summarize(data.rule.resources)}</span>
      </div>
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
