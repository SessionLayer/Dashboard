import { useState } from 'react';

import {
  Dialog,
  ConfirmDialog,
  Button,
  Badge,
  DetailList,
  Detail,
  CodeBlock,
  Time,
  TextField,
  NumberField,
  SelectField,
  JsonField,
  EnumMultiField,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type {
  Capability,
  JitApprovalLevel,
  JitPolicyResource,
} from '../../api/types';
import {
  ApprovalChainSummary,
  CrudScreen,
  OriginBadge,
  FormDialog,
  SelectorSummary,
} from './common';
import {
  CAPABILITY_OPTIONS,
  APPROVAL_KIND_OPTIONS,
  parseJsonState,
  toJsonText,
} from './helpers';
import {
  useJitPolicies,
  useCreateJitPolicy,
  useUpdateJitPolicy,
  useDeleteJitPolicy,
} from './hooks';

const PERM = 'settings:write';
type ApprovalKind = NonNullable<JitApprovalLevel['kind']>;

type View =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'detail'; row: JitPolicyResource }
  | { kind: 'edit'; row: JitPolicyResource }
  | { kind: 'delete'; row: JitPolicyResource };

export function JitPoliciesScreen() {
  const canWrite = useCan(PERM);
  const list = useJitPolicies();
  const [view, setView] = useState<View>({ kind: 'none' });

  const columns: Column<JitPolicyResource>[] = [
    { header: 'Name', cell: (r) => r.name },
    {
      header: 'Requestable targets',
      cell: (r) => <SelectorSummary selector={r.targetSelector} />,
    },
    {
      header: 'Capabilities',
      cell: (r) =>
        r.capabilities.length > 0 ? (
          r.capabilities.join(', ')
        ) : (
          <span className="muted">—</span>
        ),
    },
    { header: 'Max TTL (s)', cell: (r) => r.maxTtlSeconds, align: 'right' },
    {
      header: 'Approval chain',
      cell: (r) => <ApprovalChainSummary chain={r.approvalChain} />,
    },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
    { header: 'Version', cell: (r) => r.version, align: 'right' },
  ];

  return (
    <>
      <CrudScreen
        title="JIT policies"
        description="Requestable targets, capabilities, max TTL, and the 0–3 level approval chain (FR-ACC-3)."
        newLabel="New JIT policy…"
        canWrite={canWrite}
        onNew={() => {
          setView({ kind: 'new' });
        }}
        list={list}
        columns={columns}
        rowKey={(r) => r.id}
        caption="JIT policies"
        emptyTitle="No JIT policies yet."
        onRowClick={(row) => {
          setView({ kind: 'detail', row });
        }}
      />

      {view.kind === 'detail' && (
        <JitPolicyDetail
          row={view.row}
          canWrite={canWrite}
          onEdit={() => {
            setView({ kind: 'edit', row: view.row });
          }}
          onDelete={() => {
            setView({ kind: 'delete', row: view.row });
          }}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}

      {(view.kind === 'new' || view.kind === 'edit') && (
        <JitPolicyForm
          resource={view.kind === 'edit' ? view.row : undefined}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}

      {view.kind === 'delete' && (
        <JitPolicyDelete
          row={view.row}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}
    </>
  );
}

function JitPolicyDetail({
  row,
  canWrite,
  onEdit,
  onDelete,
  onClose,
}: {
  row: JitPolicyResource;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={row.name}
      onClose={onClose}
      footer={
        canWrite ? (
          <>
            <Button onClick={onEdit}>Edit</Button>
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </>
        ) : undefined
      }
    >
      <DetailList>
        <Detail label="Name">{row.name}</Detail>
        <Detail label="Target selector">
          <CodeBlock value={row.targetSelector} />
        </Detail>
        <Detail label="Capabilities">
          {row.capabilities.length > 0 ? (
            <span className="label-chips">
              {row.capabilities.map((c) => (
                <Badge key={c}>{c}</Badge>
              ))}
            </span>
          ) : (
            <span className="muted">—</span>
          )}
        </Detail>
        <Detail label="Max TTL (seconds)">{row.maxTtlSeconds}</Detail>
        <Detail label="Approval chain">
          {row.approvalChain.length > 0 ? (
            <ol className="approval-chain">
              {row.approvalChain.map((lvl, i) => (
                <li
                  key={`${String(lvl.kind)}:${String(lvl.value)}:${String(i)}`}
                >
                  {lvl.kind ?? 'email'}: {lvl.value ?? ''}
                </li>
              ))}
            </ol>
          ) : (
            <span className="muted">Auto-approve (no approvers)</span>
          )}
        </Detail>
        <Detail label="Origin">
          <OriginBadge origin={row.origin} />
        </Detail>
        <Detail label="Version">{row.version}</Detail>
        <Detail label="Created">
          <Time value={row.createdAt} />
        </Detail>
        <Detail label="Updated">
          <Time value={row.updatedAt} />
        </Detail>
      </DetailList>
    </Dialog>
  );
}

function ApprovalChainField({
  levels,
  onChange,
}: {
  levels: JitApprovalLevel[];
  onChange: (levels: JitApprovalLevel[]) => void;
}) {
  const setLevel = (index: number, patch: Partial<JitApprovalLevel>) => {
    onChange(levels.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  return (
    <fieldset className="field enum-multi">
      <legend className="field-label">Approval chain (0–3 levels)</legend>
      {levels.map((lvl, i) => (
        <div key={i} className="approval-level-row">
          <SelectField
            label={`Level ${String(i + 1)} kind`}
            value={lvl.kind ?? 'email'}
            onChange={(kind: ApprovalKind) => {
              setLevel(i, { kind });
            }}
            options={APPROVAL_KIND_OPTIONS}
          />
          <TextField
            label={`Level ${String(i + 1)} approver`}
            value={lvl.value ?? ''}
            onChange={(value) => {
              setLevel(i, { value });
            }}
          />
          <Button
            variant="ghost"
            onClick={() => {
              onChange(levels.filter((_, idx) => idx !== i));
            }}
          >
            Remove level {i + 1}
          </Button>
        </div>
      ))}
      {levels.length < 3 && (
        <Button
          onClick={() => {
            onChange([...levels, { kind: 'email', value: '' }]);
          }}
        >
          Add approval level
        </Button>
      )}
    </fieldset>
  );
}

function JitPolicyForm({
  resource,
  onClose,
}: {
  resource?: JitPolicyResource;
  onClose: () => void;
}) {
  const editing = resource !== undefined;
  const create = useCreateJitPolicy();
  const update = useUpdateJitPolicy();
  const mutation = editing ? update : create;

  const [name, setName] = useState(resource?.name ?? '');
  const [selectorText, setSelectorText] = useState(
    toJsonText(resource?.targetSelector) === ''
      ? '{}'
      : toJsonText(resource?.targetSelector),
  );
  const [capabilities, setCapabilities] = useState<Capability[]>(
    resource?.capabilities ?? [],
  );
  const [maxTtl, setMaxTtl] = useState<number | ''>(
    resource?.maxTtlSeconds ?? '',
  );
  const [chain, setChain] = useState<JitApprovalLevel[]>(
    resource?.approvalChain ?? [],
  );

  const selector = parseJsonState(selectorText);
  const nameValid = editing || name.trim() !== '';
  const ttlValid = maxTtl !== '' && maxTtl > 0;
  const selectorValid = selector.ok && selector.value !== undefined;
  const valid = nameValid && ttlValid && selectorValid;

  const submit = () => {
    if (maxTtl === '' || selector.value === undefined) return;
    const shared = {
      targetSelector: selector.value,
      capabilities,
      maxTtlSeconds: maxTtl,
      approvalChain: chain,
    };
    if (editing) {
      update.mutate(
        { id: resource.id, body: { ...shared, version: resource.version } },
        { onSuccess: onClose },
      );
    } else {
      create.mutate({ name, ...shared }, { onSuccess: onClose });
    }
  };

  return (
    <FormDialog
      title={editing ? 'Edit JIT policy' : 'New JIT policy'}
      pending={mutation.isPending}
      error={mutation.error}
      submitDisabled={!valid}
      onSubmit={submit}
      onClose={onClose}
    >
      {editing ? (
        <DetailList>
          <Detail label="Name">{resource.name}</Detail>
        </DetailList>
      ) : (
        <TextField label="Name" required value={name} onChange={setName} />
      )}
      <JsonField
        label="Target selector"
        required
        value={selectorText}
        onChange={setSelectorText}
        hint='A JSON selector object matching requestable nodes, e.g. {"env":"prod"}.'
      />
      <EnumMultiField
        label="Capabilities"
        options={CAPABILITY_OPTIONS}
        values={capabilities}
        onChange={setCapabilities}
      />
      <NumberField
        label="Max TTL (seconds)"
        required
        min={1}
        value={maxTtl}
        onChange={setMaxTtl}
        error={
          maxTtl !== '' && maxTtl <= 0 ? 'Must be greater than 0.' : undefined
        }
      />
      <ApprovalChainField levels={chain} onChange={setChain} />
    </FormDialog>
  );
}

function JitPolicyDelete({
  row,
  onClose,
}: {
  row: JitPolicyResource;
  onClose: () => void;
}) {
  const del = useDeleteJitPolicy();
  return (
    <ConfirmDialog
      title={`Delete JIT policy “${row.name}”?`}
      confirmLabel="Delete"
      pending={del.isPending}
      error={del.error}
      onConfirm={() => {
        del.mutate(row.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p>
        Removes this JIT policy. In-flight requests and existing sessions are
        unaffected.
      </p>
    </ConfirmDialog>
  );
}
