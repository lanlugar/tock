import type { RoomSnapshot } from '@marble/shared';
import { useEffect, useRef } from 'react';
import { SEAT_NAMES } from '@marble/engine';

export function ResetNotice({
  room,
  playerId,
  time,
  disabled,
  respond,
}: {
  room: RoomSnapshot;
  playerId: string;
  time: number;
  disabled: boolean;
  respond: (requestId: string, approve: boolean) => void;
}) {
  const notice = useRef<HTMLElement>(null);
  useEffect(() => {
    if (room.resetRequest) {
      notice.current?.focus({ preventScroll: true });
      notice.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [room.resetRequest?.id]);
  const name = (id: string) => {
    const player = room.players.find((player) => player.id === id);
    return player ? `${player.name} (${SEAT_NAMES[player.seat]})` : 'A player';
  };
  const request = room.resetRequest;
  if (request) {
    const approved = request.approvedIds.includes(playerId);
    const eligible = request.voterIds.includes(playerId);
    return (
      <section ref={notice} tabIndex={-1} className="reset-notice" aria-labelledby="reset-title">
        <h2 id="reset-title">Reset requested</h2>
        <p role="alert">
          {name(request.initiatorId)} wants to destroy the current game and start over.
        </p>
        <p>
          The table will return to the lobby. The game and all hands will be cleared. Confirm now or
          reject to keep playing.
        </p>
        <p>
          Without a rejection, the reset proceeds when everyone confirms or when the countdown ends.
        </p>
        <strong role="timer" aria-live="off">
          {Math.max(0, Math.ceil((request.expiresAt - time) / 1000))} seconds remaining
        </strong>
        <p className="small">
          Confirmed: {request.approvedIds.map(name).join(', ')}. Waiting for:{' '}
          {request.voterIds
            .filter((id) => !request.approvedIds.includes(id))
            .map(name)
            .join(', ') || 'nobody'}
          .
        </p>
        {eligible && !approved ? (
          <div className="reset-actions">
            <button
              className="primary"
              disabled={disabled || time >= request.expiresAt}
              onClick={() => respond(request.id, true)}
            >
              Confirm reset
            </button>
            <button
              disabled={disabled || time >= request.expiresAt}
              onClick={() => respond(request.id, false)}
            >
              Reject reset
            </button>
          </div>
        ) : (
          <p>
            {approved
              ? 'You have confirmed. Waiting for the other players.'
              : 'This request is being decided by the players who were active when it started.'}
          </p>
        )}
      </section>
    );
  }
  const outcome = room.resetOutcome;
  if (!outcome) return null;
  return (
    <div className="notice" role="status">
      {outcome.status === 'completed'
        ? 'The game was reset. Everyone is back in the lobby; mark ready to start a new game.'
        : `${outcome.initiatorId === playerId ? 'Your reset request was rejected by' : 'Reset rejected by'} ${name(outcome.rejectedById!)}. The current game is unchanged. Start a new reset request to try again.`}
    </div>
  );
}
