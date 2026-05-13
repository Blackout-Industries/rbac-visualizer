import { Handle, Position, type NodeProps } from 'reactflow';
import { Box, Asterisk } from 'lucide-react';

export interface ResourceNodeData {
  apiGroup: string;
  resource: string;
  dim: boolean;
  highlighted: boolean;
}

export function ResourceNode({ data }: NodeProps<ResourceNodeData>) {
  const isWildcard = data.resource === '*';
  const outline = isWildcard
    ? 'var(--theme-arrow-deny)'
    : 'var(--theme-arrow-allow)';
  const group = data.apiGroup === '' || data.apiGroup === 'core' ? 'core' : data.apiGroup;
  return (
    <div
      className="flow-node flow-node--resource"
      style={{
        opacity: data.dim ? 0.15 : 1,
        borderColor: outline,
        boxShadow: data.highlighted ? `0 0 0 2px ${outline}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flow-node-header" style={{ color: outline }}>
        {isWildcard ? <Asterisk size={12} /> : <Box size={12} />}
        <span className="flow-node-kind">{group}</span>
      </div>
      <div className="flow-node-name">{data.resource}</div>
    </div>
  );
}

const handleStyle = {
  background: 'transparent',
  border: 'none',
  width: 1,
  height: 1,
};
