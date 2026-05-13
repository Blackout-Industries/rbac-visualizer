import { Handle, Position, type NodeProps } from 'reactflow';
import { Shield, ShieldAlert } from 'lucide-react';
import type { Role } from '@/types/rbac';

export interface RoleNodeData {
  role: Role;
  adminLike: boolean;
  dim: boolean;
}

export function RoleNode({ data }: NodeProps<RoleNodeData>) {
  const isCluster = data.role.scope === 'ClusterRole';
  const outline = data.adminLike ? 'var(--theme-arrow-deny)' : 'var(--theme-accent)';
  return (
    <div
      className="flow-node flow-node--role"
      style={{
        opacity: data.dim ? 0.15 : 1,
        borderColor: outline,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flow-node-header" style={{ color: outline }}>
        {data.adminLike ? <ShieldAlert size={12} /> : <Shield size={12} />}
        <span className="flow-node-kind">
          {isCluster ? 'clusterrole' : 'role'}
        </span>
      </div>
      <div className="flow-node-name">{data.role.name}</div>
      {data.role.namespace && (
        <div className="flow-node-sub">ns · {data.role.namespace}</div>
      )}
      {data.role.aggregationRule && (
        <div className="flow-node-sub">aggregated</div>
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
