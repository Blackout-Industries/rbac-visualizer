import { Handle, Position, type NodeProps } from 'reactflow';
import { Link2 } from 'lucide-react';
import type { Binding } from '@/types/rbac';

export interface BindingNodeData {
  binding: Binding;
  dim: boolean;
}

export function BindingNode({ data }: NodeProps<BindingNodeData>) {
  const isCluster = data.binding.scope === 'ClusterRoleBinding';
  return (
    <div
      className="flow-node flow-node--binding"
      style={{
        opacity: data.dim ? 0.15 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flow-node-header">
        <Link2 size={12} />
        <span className="flow-node-kind">
          {isCluster ? 'clusterrolebinding' : 'rolebinding'}
        </span>
      </div>
      <div className="flow-node-name">{data.binding.name}</div>
      {data.binding.namespace && (
        <div className="flow-node-sub">ns · {data.binding.namespace}</div>
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
