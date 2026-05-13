import { Handle, Position, type NodeProps } from 'reactflow';
import { Box, Asterisk } from 'lucide-react';

export interface ResourceNodeData {
  apiGroup: string;
  resource: string;
  dim: boolean;
  highlighted: boolean;
  sensitive: boolean;
}

const SENSITIVE_HINTS = [
  'secrets',
  'serviceaccounts',
  'pods/exec',
  'pods/attach',
  'nodes',
];

export function ResourceNode({ data }: NodeProps<ResourceNodeData>) {
  const isWildcard = data.resource === '*';
  const outline = isWildcard || data.sensitive
    ? 'var(--theme-arrow-deny)'
    : 'var(--theme-arrow-allow)';
  const group = data.apiGroup === '' || data.apiGroup === 'core' ? 'core' : data.apiGroup;
  return (
    <div
      className="flow-resource-card"
      style={{
        opacity: data.dim ? 0.18 : 1,
        borderColor: outline,
        boxShadow: data.highlighted ? `0 0 0 2px ${outline}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flow-resource-card__head" style={{ color: outline }}>
        {isWildcard ? <Asterisk size={11} /> : <Box size={11} />}
        <span className="flow-resource-card__group">{group}</span>
      </div>
      <div className="flow-resource-card__name" title={data.resource}>{data.resource}</div>
    </div>
  );
}

export function isSensitiveResource(apiGroup: string, resource: string): boolean {
  if (resource === '*' || apiGroup === '*') return true;
  return SENSITIVE_HINTS.includes(resource);
}

const handleStyle = {
  background: 'transparent',
  border: 'none',
  width: 1,
  height: 1,
};
