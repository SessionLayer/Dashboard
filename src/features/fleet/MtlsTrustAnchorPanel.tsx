import { AsyncList, CopyButton, Detail, DetailList, Time } from '../../ui';
import { useMtlsTrustAnchor } from './api';

/**
 * The internal mTLS CA certificate a Gateway pins, shown beside the enrollment
 * tokens because installing a Gateway needs both in one sitting. Public
 * material only — the contract gates it on `gateway:enroll` rather than
 * `ca:manage` for exactly this reason.
 */
export function MtlsTrustAnchorPanel() {
  const { data, isPending, isError, error } = useMtlsTrustAnchor();

  return (
    <section className="subsection">
      <header className="page-header">
        <div>
          <h2 className="page-title">mTLS trust anchor</h2>
          <p className="page-description muted">
            The internal mTLS CA certificate a Gateway pins to verify the
            Control Plane. Install it on the Gateway alongside the enrollment
            token, then confirm the fingerprint out of band.
          </p>
        </div>
      </header>

      <AsyncList
        isPending={isPending}
        isError={isError}
        error={error}
        isEmpty={false}
        emptyTitle="No trust anchor."
      >
        {data !== undefined && (
          <>
            <DetailList>
              <Detail label="Subject">{data.subject}</Detail>
              <Detail label="SHA-256 fingerprint">
                <span className="cluster">
                  <code className="secret-value">{data.fingerprintSha256}</code>
                  <CopyButton
                    value={data.fingerprintSha256}
                    label="Copy fingerprint"
                  />
                </span>
              </Detail>
              <Detail label="Valid from">
                <Time value={data.notBefore} />
              </Detail>
              <Detail label="Expires">
                <Time value={data.notAfter} />
              </Detail>
            </DetailList>

            <div className="cluster trust-anchor-pem-actions">
              <CopyButton value={data.pem} label="Copy PEM" />
            </div>
            <pre className="code-block" aria-label="Trust anchor PEM">
              <code>{data.pem}</code>
            </pre>
          </>
        )}
      </AsyncList>
    </section>
  );
}
