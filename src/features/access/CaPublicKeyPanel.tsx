import {
  AsyncList,
  Badge,
  CopyButton,
  Detail,
  DetailList,
  enumMembers,
  type BadgeTone,
} from '../../ui';
import type { CaKind, CaRotationState } from '../../api/types';
import { useCaPublicKey } from './hooks';

// Session first: it is the key a node install needs in `TrustedUserCAKeys`, and
// this panel exists for that lookup. Key order is the presented order.
const SSH_KINDS = enumMembers<CaKind>({
  session: true,
  user: true,
  host: true,
});

const ROTATION_TONE: Record<CaRotationState, BadgeTone> = {
  incoming: 'info',
  active: 'pass',
  outgoing: 'warn',
  expired: 'fail',
};

/**
 * The SSH CA public keys, in the form a node install needs them. Installing a
 * node means putting the session CA's public key into `TrustedUserCAKeys`, and
 * this is where an operator looks for it — the alternative was reading it out
 * of the database as its owner.
 *
 * Public verification material only. The internal mTLS CA is deliberately absent:
 * it is not a member of this collection and its trust anchor has its own export
 * beside the Gateway enrollment tokens.
 */
export function CaPublicKeyPanel() {
  return (
    <section className="subsection">
      <header className="page-header">
        <div>
          <h2 className="page-title">CA public keys</h2>
          <p className="page-description muted">
            The active signing key of each SSH CA, as an OpenSSH authorized-key
            line. Install the session CA into every node&apos;s
            <code> TrustedUserCAKeys</code>, then check the fingerprint against{' '}
            <code>ssh-keygen -l</code> on the node.
          </p>
        </div>
      </header>
      {SSH_KINDS.map((kind) => (
        <CaPublicKeyRow key={kind} caKind={kind} />
      ))}
    </section>
  );
}

function CaPublicKeyRow({ caKind }: { caKind: CaKind }) {
  const { data, isPending, isError, error } = useCaPublicKey(caKind);

  return (
    <div className="subsection">
      <h3 className="page-title">{caKind} CA</h3>
      <AsyncList
        isPending={isPending}
        isError={isError}
        error={error}
        isEmpty={false}
        emptyTitle={`No ${caKind} CA.`}
      >
        {data !== undefined && (
          <DetailList>
            <Detail label="Algorithm">
              <span className="cluster">
                <code>{data.algorithm}</code>
                <Badge tone={ROTATION_TONE[data.rotationState]}>
                  {data.rotationState}
                </Badge>
              </span>
            </Detail>
            <Detail label="Fingerprint">
              <span className="cluster">
                <code className="secret-value">{data.fingerprint}</code>
                <CopyButton value={data.fingerprint} label="Copy fingerprint" />
              </span>
            </Detail>
            <Detail label="OpenSSH public key">
              <span className="cluster">
                <CopyButton
                  value={data.opensshPublicKey}
                  label="Copy OpenSSH line"
                />
              </span>
              <pre
                className="code-block"
                aria-label={`${caKind} CA OpenSSH public key`}
              >
                <code>{data.opensshPublicKey}</code>
              </pre>
            </Detail>
          </DetailList>
        )}
      </AsyncList>
    </div>
  );
}
