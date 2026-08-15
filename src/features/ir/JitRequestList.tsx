import { useState } from 'react';

import type {
  Capability,
  JitApproval,
  JitApprovalLevel,
  JitRequestResource,
} from '../../api/types';
import { useAuth, useCan } from '../../auth/AuthContext';
import {
  AsyncList,
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Detail,
  DetailList,
  Dialog,
  EnumMultiField,
  PageHeader,
  ProblemAlert,
  SelectField,
  TextareaField,
  TextField,
  Time,
} from '../../ui';
import {
  useApproveJit,
  useDenyJit,
  useJitRequest,
  useJitRequests,
  useRevokeJit,
  useSubmitJitRequest,
} from './hooks';
import {
  CAPABILITY_OPTIONS,
  JIT_STATES,
  isGrantedJit,
  isPendingJit,
  jitStateTone,
} from './status';
import './ir.css';

export type DecisionKind = 'approve' | 'deny' | 'revoke';
type Modal =
  | { kind: 'submit' }
  | { kind: 'detail'; row: JitRequestResource }
  | { kind: DecisionKind; row: JitRequestResource };

const STATE_OPTIONS = [
  { value: '', label: 'All states' },
  ...JIT_STATES.map((s) => ({ value: s, label: s })),
];

export function JitRequestList() {
  const [stateFilter, setStateFilter] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const requests = useJitRequests(stateFilter);
  const canApprove = useCan('request:approve');
  const subject = useAuth().user?.subject;
  const close = () => {
    setModal(null);
  };

  const columns: Column<JitRequestResource>[] = [
    {
      header: 'Request',
      cell: (r) => <span className="mono">{r.id.slice(0, 8)}</span>,
    },
    { header: 'Requester', cell: (r) => r.requester },
    {
      header: 'Target',
      cell: (r) => r.targetNodeName ?? r.targetNodeId ?? '—',
    },
    { header: 'Principal', cell: (r) => r.principal },
    { header: 'Reason', cell: (r) => r.reason },
    {
      header: 'Chain',
      cell: (r) =>
        `${String(r.approvals?.length ?? 0)}/${String(r.approvalChain?.length ?? 0)}`,
    },
    {
      header: 'State',
      cell: (r) => <Badge tone={jitStateTone(r.state)}>{r.state}</Badge>,
    },
    { header: 'Requested', cell: (r) => <Time value={r.requestedAt} /> },
    {
      header: 'Actions',
      cell: (r) => {
        const isSelf = subject !== undefined && r.requester === subject;
        const canDecide = canApprove && isPendingJit(r.state) && !isSelf;
        return (
          <div className="ir-row-actions">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setModal({ kind: 'detail', row: r });
              }}
            >
              Details
            </Button>
            {canDecide && (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setModal({ kind: 'approve', row: r });
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setModal({ kind: 'deny', row: r });
                  }}
                >
                  Deny
                </Button>
              </>
            )}
            {canApprove && isGrantedJit(r.state) && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setModal({ kind: 'revoke', row: r });
                }}
              >
                Revoke
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <section className="stack">
      <PageHeader
        title="JIT Access Requests"
        description="Just-in-time access requests and their approval chains."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setModal({ kind: 'submit' });
            }}
          >
            Request access…
          </Button>
        }
      />

      <div className="cluster">
        <SelectField
          label="State"
          value={stateFilter}
          onChange={setStateFilter}
          options={STATE_OPTIONS}
        />
      </div>

      <AsyncList
        isPending={requests.isPending}
        isError={requests.isError}
        error={requests.error}
        isEmpty={(requests.data?.length ?? 0) === 0}
        emptyTitle="No JIT requests match this filter."
      >
        <DataTable
          caption="JIT access requests"
          columns={columns}
          rows={requests.data ?? []}
          rowKey={(r) => r.id}
        />
      </AsyncList>

      {modal?.kind === 'submit' && <SubmitJitDialog onClose={close} />}
      {modal?.kind === 'detail' && (
        <JitDetailDialog id={modal.row.id} onClose={close} />
      )}
      {(modal?.kind === 'approve' ||
        modal?.kind === 'deny' ||
        modal?.kind === 'revoke') && (
        <JitDecisionDialog
          kind={modal.kind}
          request={modal.row}
          onClose={close}
        />
      )}
    </section>
  );
}

const DECISION_COPY: Record<
  DecisionKind,
  { title: string; confirm: string; body: string; danger: boolean }
> = {
  approve: {
    title: 'Approve JIT request',
    confirm: 'Approve',
    body: 'Approve the next level of this request. The grant clock starts once every level is approved.',
    danger: false,
  },
  deny: {
    title: 'Deny JIT request',
    confirm: 'Deny',
    body: 'Deny this request. This is terminal.',
    danger: true,
  },
  revoke: {
    title: 'Revoke JIT grant',
    confirm: 'Revoke',
    body: 'Revoke this grant and write a strict Lock so any live session tears down.',
    danger: true,
  },
};

/** Exported so the Overview screen can offer the same inline Approve/Deny flow
 *  without duplicating the mutation wiring. */
export function JitDecisionDialog({
  kind,
  request,
  onClose,
}: {
  kind: DecisionKind;
  request: JitRequestResource;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const approve = useApproveJit();
  const deny = useDenyJit();
  const revoke = useRevokeJit();
  const mutation =
    kind === 'approve' ? approve : kind === 'deny' ? deny : revoke;
  const copy = DECISION_COPY[kind];

  return (
    <ConfirmDialog
      title={copy.title}
      confirmLabel={copy.confirm}
      variant={copy.danger ? 'danger' : 'primary'}
      pending={mutation.isPending}
      error={mutation.error}
      onConfirm={() => {
        mutation.mutate({ id: request.id, reason }, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p className="muted">{copy.body}</p>
      <TextareaField
        label="Reason (optional, audited)"
        value={reason}
        onChange={setReason}
        rows={3}
      />
    </ConfirmDialog>
  );
}

function SubmitJitDialog({ onClose }: { onClose: () => void }) {
  const [targetNodeId, setTargetNodeId] = useState('');
  const [principal, setPrincipal] = useState('');
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [reason, setReason] = useState('');
  const submit = useSubmitJitRequest();

  const valid =
    targetNodeId.trim() !== '' &&
    principal.trim() !== '' &&
    reason.trim() !== '';

  const onSubmit = () => {
    submit.mutate(
      {
        targetNodeId: targetNodeId.trim(),
        principal: principal.trim(),
        reason: reason.trim(),
        capabilities: capabilities.length > 0 ? capabilities : undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog
      title="Request JIT access"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!valid || submit.isPending}
          >
            {submit.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextField
          label="Target node id"
          value={targetNodeId}
          onChange={setTargetNodeId}
          required
          placeholder="uuid of the target node"
        />
        <TextField
          label="Principal (Linux login)"
          value={principal}
          onChange={setPrincipal}
          required
        />
        <EnumMultiField
          label="Capabilities"
          options={CAPABILITY_OPTIONS}
          values={capabilities}
          onChange={setCapabilities}
          hint="Left empty, the JIT policy's default set applies."
        />
        <TextareaField
          label="Reason"
          value={reason}
          onChange={setReason}
          required
          rows={3}
        />
        {submit.error !== null && <ProblemAlert error={submit.error} />}
      </div>
    </Dialog>
  );
}

function JitDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useJitRequest(id, true);
  return (
    <Dialog title="JIT request" onClose={onClose}>
      <AsyncList
        isPending={detail.isPending}
        isError={detail.isError}
        error={detail.error}
        isEmpty={false}
        emptyTitle=""
      >
        {detail.data !== undefined && <JitDetailBody request={detail.data} />}
      </AsyncList>
    </Dialog>
  );
}

function JitDetailBody({ request }: { request: JitRequestResource }) {
  return (
    <div className="stack">
      <DetailList>
        <Detail label="Requester">{request.requester}</Detail>
        <Detail label="Target">
          {request.targetNodeName ?? request.targetNodeId ?? '—'}
        </Detail>
        <Detail label="Principal">{request.principal}</Detail>
        <Detail label="State">
          <Badge tone={jitStateTone(request.state)}>{request.state}</Badge>
        </Detail>
        <Detail label="Policy">{request.jitPolicyName ?? '—'}</Detail>
        <Detail label="Reason">{request.reason}</Detail>
        <Detail label="Requested">
          <Time value={request.requestedAt} />
        </Detail>
        <Detail label="Grant expires">
          <Time value={request.grantExpiresAt} />
        </Detail>
        <Detail label="Decided by">{request.decidedBy ?? '—'}</Detail>
      </DetailList>

      <div>
        <h3 className="detail-subhead">Approval chain</h3>
        <ApprovalChain
          chain={request.approvalChain}
          approvals={request.approvals}
        />
      </div>
    </div>
  );
}

function ApprovalChain({
  chain,
  approvals,
}: {
  chain: JitApprovalLevel[] | undefined;
  approvals: JitApproval[] | undefined;
}) {
  if (chain === undefined || chain.length === 0) {
    return (
      <p className="muted">Auto-approved (no approval levels required).</p>
    );
  }
  return (
    <ol className="stack">
      {chain.map((level, idx) => {
        const acted = approvals?.find((a) => a.level === idx + 1);
        return (
          <li key={`${level.kind ?? 'level'}-${level.value ?? String(idx)}`}>
            <span className="mono">
              L{idx + 1} · {level.kind ?? '—'}:{level.value ?? '—'}
            </span>{' '}
            {acted !== undefined ? (
              <Badge tone={acted.decision === 'deny' ? 'fail' : 'pass'}>
                {acted.decision ?? 'acted'} — {acted.approver ?? 'unknown'}
              </Badge>
            ) : (
              <Badge tone="warn">pending</Badge>
            )}
          </li>
        );
      })}
    </ol>
  );
}
