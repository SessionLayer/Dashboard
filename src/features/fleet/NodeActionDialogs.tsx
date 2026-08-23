import { ConfirmDialog } from '../../ui';
import type { NodeResource } from '../../api/types';
import { useReleaseQuarantine, useRemoveNode } from './api';

export function RemoveNodeDialog({
  node,
  onClose,
}: {
  node: NodeResource;
  onClose: () => void;
}) {
  const remove = useRemoveNode();
  return (
    <ConfirmDialog
      title={`Remove ${node.name}`}
      confirmLabel="Remove"
      variant="danger"
      pending={remove.isPending}
      error={remove.isError ? remove.error : undefined}
      onConfirm={() => {
        remove.mutate(node.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p className="muted">
        Deregisters the node (history preserved). For an agent node this also
        revokes its credential and pushes a covering lock so a stale clone
        cannot reconnect. Idempotent.
      </p>
    </ConfirmDialog>
  );
}

export function ReleaseQuarantineDialog({
  node,
  onClose,
}: {
  node: NodeResource;
  onClose: () => void;
}) {
  const release = useReleaseQuarantine();
  return (
    <ConfirmDialog
      title={`Release ${node.name} from quarantine`}
      confirmLabel="Release"
      variant="primary"
      pending={release.isPending}
      error={release.isError ? release.error : undefined}
      onConfirm={() => {
        release.mutate(node.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p className="muted">
        Lifts the quarantine lock and returns the node to active. Never
        resurrects a torn-down session. Idempotent.
      </p>
    </ConfirmDialog>
  );
}
