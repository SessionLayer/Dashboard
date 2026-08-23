import {
  Detail,
  DetailList,
  Dialog,
  LabelMapView,
  LoadingState,
  ProblemAlert,
  Time,
} from '../../ui';
import { ConnectorBadge, NodeHealthBadge, NodeStatusBadge } from './badges';
import { useNode } from './api';

export function NodeDetailDialog({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const { data: node, isPending, isError, error } = useNode(nodeId);

  return (
    <Dialog title="Node detail" onClose={onClose}>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ProblemAlert error={error} />
      ) : (
        <DetailList>
          <Detail label="Name">{node.name}</Detail>
          <Detail label="Connector">
            <ConnectorBadge kind={node.connectorKind} />
          </Detail>
          <Detail label="Status">
            <NodeStatusBadge status={node.status} />
          </Detail>
          <Detail label="Health">
            <NodeHealthBadge health={node.health} />
          </Detail>
          <Detail label="Address">
            {node.address ?? <span className="muted">—</span>}
          </Detail>
          <Detail label="Labels">
            <LabelMapView labels={node.labels} />
          </Detail>
          <Detail label="Owning gateway">
            {node.owningGateway ?? <span className="muted">—</span>}
          </Detail>
          <Detail label="Status reason">
            {node.statusReason ?? <span className="muted">—</span>}
          </Detail>
          <Detail label="Status changed by">
            {node.statusChangedBy ?? <span className="muted">—</span>}
          </Detail>
          <Detail label="Status changed">
            <Time value={node.statusChangedAt} />
          </Detail>
          <Detail label="Enrolled">
            <Time value={node.createdAt} />
          </Detail>
          <Detail label="Updated">
            <Time value={node.updatedAt} />
          </Detail>
          <Detail label="ID">
            <code>{node.id}</code>
          </Detail>
        </DetailList>
      )}
    </Dialog>
  );
}
