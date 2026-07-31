import {
  AsyncList,
  Badge,
  CodeBlock,
  Detail,
  DetailList,
  Dialog,
  LoadMore,
  Time,
} from '../../ui';
import type { AuditEventResource } from '../../api/types';
import { useAuditEvents } from './auditHooks';
import { outcomeTone } from './badges';

/**
 * The FR-AUD-9 "full path" view: given one event, show every event sharing its
 * correlation id in chronological order (approve → connect → run → replay). The
 * search returns newest-first, so it is reversed here into story order.
 */
export function CorrelatedStory({
  event,
  onClose,
}: {
  event: AuditEventResource;
  onClose: () => void;
}) {
  const correlationId = event.correlationId;
  const list = useAuditEvents(
    { correlationId },
    { enabled: correlationId !== undefined },
  );
  const story = [...list.items].reverse();

  return (
    <Dialog title="Correlated story" onClose={onClose}>
      <DetailList>
        <Detail label="Event ID">
          <code>{event.id}</code>
        </Detail>
        <Detail label="Actor">{event.actor}</Detail>
        <Detail label="Action">{event.action}</Detail>
        <Detail label="Outcome">
          <Badge tone={outcomeTone(event.outcome)}>{event.outcome}</Badge>
        </Detail>
        <Detail label="Subject">{event.subject ?? '—'}</Detail>
        <Detail label="Session">
          <code>{event.sessionId ?? '—'}</code>
        </Detail>
        <Detail label="Node">
          <code>{event.nodeId ?? '—'}</code>
        </Detail>
        <Detail label="Source IP">{event.sourceIp ?? '—'}</Detail>
        <Detail label="Occurred">
          <Time value={event.occurredAt} />
        </Detail>
        <Detail label="Correlation ID">
          <code>{correlationId ?? '—'}</code>
        </Detail>
        {event.detail !== undefined && (
          <Detail label="Detail">
            <CodeBlock value={event.detail} />
          </Detail>
        )}
      </DetailList>

      {correlationId === undefined ? (
        <p className="muted">
          This event carries no correlation id, so a full correlated path
          isn&rsquo;t available for it.
        </p>
      ) : (
        <div className="story">
          <p className="story-title">Correlated path</p>
          <AsyncList
            isPending={list.isPending}
            isError={list.isError}
            error={list.error}
            isEmpty={story.length === 0}
            emptyTitle="No correlated events."
          >
            <ol className="story-timeline">
              {story.map((e) => (
                <li
                  key={e.id}
                  className={
                    e.id === event.id ? 'story-step current' : 'story-step'
                  }
                >
                  <span className="story-time">
                    <Time value={e.occurredAt} />
                  </span>
                  <span className="story-action">{e.action}</span>
                  <Badge tone={outcomeTone(e.outcome)}>{e.outcome}</Badge>
                  <span className="story-actor muted">{e.actor}</span>
                </li>
              ))}
            </ol>
            <LoadMore
              hasNextPage={list.hasNextPage}
              isFetchingNextPage={list.isFetchingNextPage}
              onLoadMore={list.fetchNextPage}
            />
          </AsyncList>
        </div>
      )}
    </Dialog>
  );
}
