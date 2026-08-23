import { useEffect, useMemo, useState } from 'react';

import {
  AsyncList,
  Badge,
  Button,
  CheckboxField,
  CopyButton,
  Detail,
  DetailList,
  Dialog,
  ProblemAlert,
  SelectField,
  TextField,
  TextareaField,
  Time,
  enumOptions,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type {
  RecordingCustomerKey,
  RecordingKeySealAlgorithm,
} from '../../api/types';
import { useRecordingCustomerKey, useSetRecordingCustomerKey } from './api';
import { conflictHint, keyRefError } from './helpers';
import {
  fingerprintSha256,
  fingerprintsMatch,
  inspectSubmittedKey,
  normalizeFingerprint,
  verifySealAlgorithm,
} from './publicKey';

interface Derived {
  publicKeyText: string;
  sealAlgorithm: RecordingKeySealAlgorithm;
  fingerprint: string;
  algorithmError: string | undefined;
}

const SEAL_ALGORITHMS = enumOptions<RecordingKeySealAlgorithm>({
  ecies_p256: 'ecies_p256 — EC public key on P-256',
  rsa_oaep_sha256: 'rsa_oaep_sha256 — RSA public key',
});

export function RecordingCustomerKeyPanel({
  settingsVersion,
  configured,
  recordingRetentionDays,
}: {
  settingsVersion: number;
  configured: boolean;
  recordingRetentionDays: number;
}) {
  const key = useRecordingCustomerKey();
  const canManage = useCan('recording:key-manage');
  const [editing, setEditing] = useState(false);

  return (
    <section className="subsection settings-key">
      <header className="page-header">
        <div>
          <h2 className="page-title">Recording customer key</h2>
          <p className="page-description muted">
            The public key every recording is sealed to. Its private half stays
            offline: the platform cannot decrypt what it records, and this
            screen neither accepts nor displays private key material.
          </p>
        </div>
        <div className="page-actions">
          {configured ? (
            <Badge tone="pass">Configured</Badge>
          ) : (
            <Badge tone="fail">Not configured</Badge>
          )}
        </div>
      </header>

      {!configured && (
        <p className="settings-alarm" role="status">
          No customer recording key is provisioned. Recording is strict and
          fail-closed, so the Control Plane refuses every session until one is
          set — this is the setting that completes a first install.
        </p>
      )}

      <AsyncList
        isPending={key.isPending}
        isError={key.isError}
        error={key.error}
        isEmpty={false}
        emptyTitle="No customer recording key."
      >
        {key.data?.configured === true && (
          <DetailList>
            <Detail label="SHA-256 fingerprint">
              <span className="cluster">
                <code className="secret-value">
                  {key.data.fingerprintSha256}
                </code>
                {key.data.fingerprintSha256 !== undefined && (
                  <CopyButton
                    value={key.data.fingerprintSha256}
                    label="Copy fingerprint"
                  />
                )}
              </span>
            </Detail>
            <Detail label="Seal algorithm">
              <code>{key.data.sealAlgorithm}</code>
            </Detail>
            <Detail label="Key reference">
              {key.data.keyRef ?? (
                <span className="muted">— (no reference recorded)</span>
              )}
            </Detail>
            {key.data.updatedAt !== undefined && (
              <Detail label="Last provisioned or rotated">
                <Time value={key.data.updatedAt} />
              </Detail>
            )}
            {key.data.publicKey !== undefined && (
              <Detail label="Public key (base64 DER SubjectPublicKeyInfo)">
                <span className="cluster">
                  <CopyButton value={key.data.publicKey} label="Copy key" />
                </span>
                <pre className="code-block" aria-label="Customer public key">
                  <code>{key.data.publicKey}</code>
                </pre>
              </Detail>
            )}
          </DetailList>
        )}
      </AsyncList>

      {canManage ? (
        <div className="cluster">
          <Button
            variant={configured ? 'danger' : 'primary'}
            onClick={() => {
              setEditing(true);
            }}
          >
            {configured ? 'Rotate key…' : 'Provision key…'}
          </Button>
        </div>
      ) : (
        <p className="muted" role="note">
          Provisioning or rotating this key requires the{' '}
          <code>recording:key-manage</code> permission, which is separate from{' '}
          <code>settings:write</code>: its holder could point future recordings
          at a key they hold the private half of.
        </p>
      )}

      {editing && (
        <RecordingCustomerKeyDialog
          current={key.data}
          settingsVersion={settingsVersion}
          recordingRetentionDays={recordingRetentionDays}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function RecordingCustomerKeyDialog({
  current,
  settingsVersion,
  recordingRetentionDays,
  onClose,
}: {
  current: RecordingCustomerKey | undefined;
  settingsVersion: number;
  recordingRetentionDays: number;
  onClose: () => void;
}) {
  const rotating = current?.configured === true;
  const currentFingerprint = current?.fingerprintSha256 ?? '';
  const save = useSetRecordingCustomerKey();

  const [publicKeyText, setPublicKeyText] = useState('');
  const [sealAlgorithm, setSealAlgorithm] = useState<RecordingKeySealAlgorithm>(
    current?.sealAlgorithm ?? 'ecies_p256',
  );
  const [keyRef, setKeyRef] = useState(current?.keyRef ?? '');
  // Deliberately NOT pre-filled from the loaded key, however tempting that looks
  // as a convenience. The API demands the outgoing fingerprint so that replacing
  // a key is an act the caller has to perform knowingly; filling it in from the
  // response the page already holds would turn that confirmation into a
  // formality and leave the guard in name only.
  const [expectedFingerprint, setExpectedFingerprint] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [derived, setDerived] = useState<Derived | undefined>();

  const check = useMemo(
    () => inspectSubmittedKey(publicKeyText),
    [publicKeyText],
  );

  useEffect(() => {
    if (!check.ok) return;
    let cancelled = false;
    const { der } = check;
    const run = async () => {
      const [algorithmError, fingerprint] = await Promise.all([
        verifySealAlgorithm(der, sealAlgorithm),
        fingerprintSha256(der),
      ]);
      if (!cancelled) {
        setDerived({
          publicKeyText,
          sealAlgorithm,
          algorithmError,
          fingerprint,
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [check, publicKeyText, sealAlgorithm]);

  // Tagged with the input it came from, so a stale result can never stand in for
  // the current paste - until the check has caught up there is simply no result,
  // and submission stays blocked.
  const fresh =
    derived?.publicKeyText === publicKeyText &&
    derived.sealAlgorithm === sealAlgorithm
      ? derived
      : undefined;

  const touched = publicKeyText.trim() !== '';
  const privateKeySubmitted = !check.ok && check.privateKeyMaterial;
  const keyError = !touched
    ? undefined
    : check.ok
      ? fresh?.algorithmError
      : check.message;
  const refError = keyRefError(keyRef);
  const fingerprintError =
    rotating && expectedFingerprint.trim() !== ''
      ? fingerprintsMatch(expectedFingerprint, currentFingerprint)
        ? undefined
        : 'That is not the fingerprint of the key configured right now. Copy it from the panel behind this dialog.'
      : undefined;

  const rotationReady =
    !rotating ||
    (acknowledged &&
      fingerprintsMatch(expectedFingerprint, currentFingerprint));
  const valid =
    check.ok &&
    fresh !== undefined &&
    fresh.algorithmError === undefined &&
    refError === undefined &&
    rotationReady;

  const submit = () => {
    if (!check.ok) return;
    const trimmedRef = keyRef.trim();
    save.mutate(
      {
        publicKey: publicKeyText.replace(/\s+/g, ''),
        sealAlgorithm,
        version: settingsVersion,
        ...(trimmedRef === '' ? {} : { keyRef: trimmedRef }),
        ...(rotating
          ? {
              expectedFingerprintSha256:
                normalizeFingerprint(expectedFingerprint),
              acknowledgeExistingRecordingsUndecryptable: true,
            }
          : {}),
      },
      { onSuccess: onClose },
    );
  };

  const hint = conflictHint(save.error);

  return (
    <Dialog
      title={
        rotating
          ? 'Rotate the recording customer key'
          : 'Provision the recording customer key'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            variant={rotating ? 'danger' : 'primary'}
            onClick={submit}
            disabled={save.isPending || !valid}
          >
            {save.isPending
              ? 'Saving…'
              : rotating
                ? 'Rotate key'
                : 'Provision key'}
          </Button>
        </>
      }
    >
      {rotating ? (
        <p className="settings-alarm" role="status">
          Rotating replaces the key new recordings are sealed to. Every
          recording already sealed under the outgoing key stays readable only by
          the outgoing private key — the incoming one cannot decrypt them. Keep
          the outgoing private key for at least as long as those recordings are
          retained (currently {recordingRetentionDays} days).
        </p>
      ) : (
        <p className="muted">
          Generate the key pair offline, keep the private half offline, and
          paste only the public half here. Nothing on this screen is sent
          anywhere except this one field, and only the public key is ever
          stored.
        </p>
      )}

      <TextareaField
        label="Public key (base64 DER SubjectPublicKeyInfo)"
        required
        rows={5}
        monospace
        value={publicKeyText}
        onChange={setPublicKeyText}
        error={keyError}
        hint="Export it with `openssl pkey -pubout -outform DER` and base64 the result. Line breaks are fine."
      />

      {privateKeySubmitted && (
        <p className="settings-alarm error" role="alert">
          Not submitted. That is private key material, and it must never leave
          the machine that generated it — the platform is designed so it cannot
          decrypt its own recordings. Nothing was sent to the Control Plane.
        </p>
      )}

      {fresh !== undefined && (
        <p className="field-hint muted">
          Fingerprint of the key you pasted:{' '}
          <code className="secret-value">{fresh.fingerprint}</code> — compare it
          with the one you recorded when you generated the pair.
        </p>
      )}

      <SelectField
        label="Seal algorithm"
        required
        value={sealAlgorithm}
        onChange={setSealAlgorithm}
        options={SEAL_ALGORITHMS}
        hint="Must match the key: a mismatch here would fail closed at the first session that tried to record."
      />

      <TextField
        label="Key reference (optional)"
        value={keyRef}
        onChange={setKeyRef}
        error={refError}
        hint="A note to your future self about where the private half is held — an HSM slot, a safe, a KMS handle. A reference only; never key material."
      />

      {rotating && (
        <>
          <TextField
            label="Fingerprint of the key being replaced"
            required
            value={expectedFingerprint}
            onChange={setExpectedFingerprint}
            error={fingerprintError}
            hint="Paste the current fingerprint to confirm you are replacing the key you think you are. A mismatch — including one caused by someone else rotating first — is refused."
          />
          <CheckboxField
            label="I understand that recordings sealed under the outgoing key will not be readable with the incoming one."
            checked={acknowledged}
            onChange={setAcknowledged}
          />
        </>
      )}

      {save.error !== null && <ProblemAlert error={save.error} />}
      {hint !== undefined && (
        <p className="muted" role="note">
          {hint}
        </p>
      )}
    </Dialog>
  );
}
