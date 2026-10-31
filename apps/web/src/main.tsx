import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import {
  cardName,
  SEATS,
  SEAT_NAMES,
  SUITS,
  type Action,
  type LegalAction,
  type Options,
  type Seat,
} from '@marble/engine';
import type {
  ClientEvents,
  Command,
  PrivateHand,
  RoomSnapshot,
  ServerEvents,
} from '@marble/shared';
import { Board } from './Board';
import { copyRoomCode } from './copy-room-code';
import { ResetNotice } from './ResetNotice';
import './style.css';

const socket: Socket<ServerEvents, ClientEvents> = io(
  import.meta.env.VITE_SERVER_URL || undefined,
  { autoConnect: false, auth: { token: localStorage.getItem('marble-session') ?? '' } },
);
const OPTION_LABELS: Record<keyof Options, string> = {
  backward4: '4 · Go backward',
  opponent5: '5 · Move an opponent',
  split7: '7 · Split your steps',
  skip10: '10 · Discard & skip',
  sweepKing: 'K · Sweep the track',
  teams: 'Opposite-seat partnerships',
};
const blankHand: PrivateHand = { version: -1, seat: 0, cards: [], legal: [] };
function App() {
  const [room, setRoom] = useState<RoomSnapshot | null>(null),
    [hand, setHand] = useState(blankHand);
  const [playerId, setPlayerId] = useState(''),
    [connected, setConnected] = useState(false);
  const [name, setName] = useState(localStorage.getItem('marble-name') ?? ''),
    [code, setCode] = useState(new URLSearchParams(location.search).get('room') ?? '');
  const [seat, setSeat] = useState<Seat>(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [card, setCard] = useState(''),
    [marble, setMarble] = useState(''),
    [preview, setPreview] = useState<LegalAction>(),
    [rules, setRules] = useState(false),
    [zoom, setZoom] = useState(false);
  const [steps, setSteps] = useState<{ marbleId: string; count: number }[]>([]),
    [time, setTime] = useState(Date.now());
  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true);
      setError('');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (e) => setError(e.message));
    socket.on('session', (s) => {
      localStorage.setItem('marble-session', s.token);
      socket.auth = { token: s.token };
      setPlayerId(s.playerId);
    });
    socket.on('roomSnapshot', (r) => {
      setRoom(r);
      setTime(Date.now());
      setPreview(undefined);
      setCard('');
      setMarble('');
      setSteps([]);
    });
    socket.on('privateHand', setHand);
    socket.on('roomLeft', () => {
      setRoom(null);
      setHand(blankHand);
      history.replaceState(null, '', location.pathname);
    });
    socket.on('serverError', setError);
    socket.connect();
    const interval = setInterval(() => setTime(Date.now()), 1000);
    return () => {
      clearInterval(interval);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!rules) return;
    const background = [document.querySelector('main'), document.querySelector('header')];
    background.forEach((node) => node?.setAttribute('inert', ''));
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRules(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
      ).filter((button) => !button.disabled);
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => {
      window.removeEventListener('keydown', trap);
      background.forEach((node) => node?.removeAttribute('inert'));
      document.querySelector<HTMLButtonElement>('nav button')?.focus();
    };
  }, [rules]);
  useEffect(() => {
    setCopyStatus('idle');
  }, [room?.code]);
  useEffect(() => {
    if (copyStatus !== 'copied') return;
    const timeout = setTimeout(() => setCopyStatus('idle'), 4000);
    return () => clearTimeout(timeout);
  }, [copyStatus]);
  async function send(command: Command) {
    if (!connected) {
      setError('Reconnect before sending an action.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await socket.timeout(10000).emitWithAck('command', command);
      if (!response.ok) setError(response.error ?? 'Request rejected.');
    } catch {
      setError('No acknowledgement received. Refresh the state before trying again.');
      socket.emit('command', { type: 'requestSnapshot' }, () => {});
    } finally {
      setBusy(false);
    }
  }
  const meta = () => ({
    expectedVersion: room?.version ?? 0,
    clientActionId:
      crypto.randomUUID?.() ??
      Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
        value.toString(16).padStart(2, '0'),
      ).join(''),
  });
  const me = room?.players.find((p) => p.id === playerId);
  const host = room?.hostId === playerId;
  const activeLegal =
    room && !room.paused && !room.resetRequest && hand.version === room.version ? hand.legal : [];
  const choices = activeLegal.filter((a) =>
    'cardId' in a.action ? a.action.cardId === card : true,
  );
  const filtered = choices.filter(
    (a) => !marble || !('marbleId' in a.action) || a.action.marbleId === marble,
  );
  const splitChoices = choices.filter(
    (a): a is LegalAction & { action: Extract<Action, { kind: 'split' }> } =>
      a.action.kind === 'split',
  );
  const compatible = splitChoices.filter((a) =>
    steps.every(
      (s, i) => a.action.steps[i]?.marbleId === s.marbleId && a.action.steps[i]?.count === s.count,
    ),
  );
  const nextSteps = [
    ...new Map(
      compatible.flatMap((a) => {
        const s = a.action.steps[steps.length];
        return s ? [[`${s.marbleId}:${s.count}`, s] as const] : [];
      }),
    ).values(),
  ];
  const splitDone = compatible.find((a) => a.action.steps.length === steps.length);
  const turnPlayer = room?.players.find((p) => p.seat === room.game?.turn);
  const myTurn =
    room?.game?.phase === 'discardChoice'
      ? room.game.pendingDiscard === me?.seat
      : room?.game?.turn === me?.seat;
  const changeCard = (id: string) => {
    setCard((previous) => (previous === id ? '' : id));
    setMarble('');
    setPreview(undefined);
    setSteps([]);
  };
  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (room) e.preventDefault();
          }}
        >
          <span className="brand-mark">✣</span>
          <span>
            marble<span className="brand-light"> circuit</span>
            <small>THE TABLE IS OPEN</small>
          </span>
        </a>
        <nav>
          <span className={`connection ${connected ? 'online' : ''}`}>
            <i />
            {connected ? 'Connected' : 'Connecting'}
          </span>
          <button className="quiet" onClick={() => setRules(true)}>
            How to play <span>↗</span>
          </button>
        </nav>
      </header>
      <main>
        {!room ? (
          <>
            <section className="landing">
              <div className="landing-copy">
                <span className="eyebrow">A FAMILIAR GAME. A NEW WAY TO GATHER.</span>
                <h1>
                  A little luck.
                  <br />A clever move.
                  <br />
                  <em>Your table.</em>
                </h1>
                <p>
                  Four marbles, a handful of cards, and a race back home. Bring your friends. We’ll
                  keep the seats warm.
                </p>
                <div className="feature-row">
                  <span>♧ 2–4 friends</span>
                  <span>↗ Play from anywhere</span>
                  <span>◎ No account needed</span>
                </div>
                <section className="entry-panel" aria-label="Create or join a room">
                  <label>
                    Your name
                    <input
                      value={name}
                      maxLength={24}
                      placeholder="What should we call you?"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <fieldset className="seat-picker">
                    <legend>Pick your seat</legend>
                    {SEATS.map((s) => (
                      <button
                        key={s}
                        className={`seat-choice seat-${s} ${seat === s ? 'chosen' : ''}`}
                        aria-pressed={seat === s}
                        onClick={() => setSeat(s)}
                        aria-label={SEAT_NAMES[s]}
                      >
                        {SUITS[s]}
                        <small>{SEAT_NAMES[s]}</small>
                      </button>
                    ))}
                  </fieldset>
                  <button
                    className="primary"
                    disabled={busy || !connected || !name.trim()}
                    onClick={() => {
                      localStorage.setItem('marble-name', name);
                      void send({ type: 'createRoom', name, seat });
                    }}
                  >
                    Create a table <span>→</span>
                  </button>
                  <div className="join-row">
                    <input
                      aria-label="Room code"
                      placeholder="Have a room code?"
                      value={code}
                      maxLength={12}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                    <button
                      disabled={busy || !connected || !name.trim() || code.length < 6}
                      onClick={() => {
                        localStorage.setItem('marble-name', name);
                        void send({
                          type: 'joinRoom',
                          name,
                          seat,
                          code,
                          joinToken:
                            new URLSearchParams(location.search).get('invite') ?? undefined,
                        });
                      }}
                    >
                      Join table ↗
                    </button>
                  </div>
                </section>
              </div>
              <div className="landing-board">
                <span className="board-caption">
                  <i /> GOOD COMPANY. FRIENDLY COMPETITION.
                </span>
                <Board
                  marbles={SEATS.flatMap((owner) =>
                    Array.from({ length: 4 }, (_, i) => ({
                      id: `${owner}:${i}`,
                      owner,
                      location: { kind: 'break' as const },
                      progress: 0,
                      eligible: false,
                    })),
                  )}
                />
                <div className="sample-cards">
                  <div className="sample-card">
                    A<big>♥</big>
                  </div>
                  <div className="sample-card">
                    7<big>♠</big>
                  </div>
                  <div className="sample-card">
                    K<big>♣</big>
                  </div>
                </div>
                <span className="board-footnote">One card can change the whole game.</span>
              </div>
            </section>
            <footer>
              <span>MADE FOR YOUR KIND OF GAME NIGHT.</span>
              <span>72 spaces. Countless possibilities.</span>
            </footer>
          </>
        ) : (
          <>
            <section className="room-heading">
              <div>
                <span className="eyebrow">
                  {room.phase === 'lobby'
                    ? 'MAKE YOURSELF AT HOME'
                    : 'A LITTLE STRATEGY GOES A LONG WAY'}
                </span>
                <h1>
                  {room.phase === 'lobby'
                    ? 'Your table is ready.'
                    : room.phase === 'ended'
                      ? 'That’s a good game.'
                      : 'The race is on.'}
                </h1>
              </div>
              <div className="room-code">
                <small>ROOM CODE</small>
                <strong>{room.code}</strong>
                <button
                  className="quiet"
                  onClick={async () => {
                    setCopyStatus((await copyRoomCode(room.code)) ? 'copied' : 'manual');
                  }}
                >
                  {copyStatus === 'copied' ? 'Room code copied ✓' : 'Copy invite ↗'}
                </button>
                <span className="copy-status" role="status">
                  {copyStatus === 'copied' ? 'Room code copied to clipboard.' : ''}
                </span>
                {copyStatus === 'manual' && (
                  <label className="manual-copy">
                    Copy this room code:
                    <input
                      aria-label="Room code to copy"
                      value={room.code}
                      readOnly
                      autoFocus
                      onFocus={(event) => event.currentTarget.select()}
                      onClick={(event) => event.currentTarget.select()}
                    />
                    <span>Press Ctrl+C / ⌘C, or select and copy on your phone.</span>
                  </label>
                )}
              </div>
            </section>
            <div className="reset-toolbar">
              <span>Need a fresh game? All active players will be asked to confirm.</span>
              <button
                disabled={busy || !connected || !!room.resetRequest}
                onClick={() => void send({ type: 'requestReset', ...meta() })}
              >
                Reset table
              </button>
            </div>
            <ResetNotice
              room={room}
              playerId={playerId}
              time={time}
              disabled={busy || !connected}
              respond={(requestId, approve) =>
                void send({ type: 'respondReset', requestId, approve, ...meta() })
              }
            />
            {room.paused && !room.resetRequest && (
              <div className="notice" role="status">
                Waiting for{' '}
                {room.players
                  .filter((p) => !p.connected)
                  .map((p) => p.name)
                  .join(', ')}{' '}
                to reconnect. The game is paused.
                {host && room.endAllowedAt && (
                  <button
                    disabled={time < room.endAllowedAt || busy}
                    onClick={() => void send({ type: 'endMatch', ...meta() })}
                  >
                    {time < room.endAllowedAt
                      ? `End available in ${Math.ceil((room.endAllowedAt - time) / 1000)}s`
                      : 'End match without winner'}
                  </button>
                )}
              </div>
            )}
            <div className="game-layout">
              <section className="table-area">
                <div className="table-topline">
                  <span>
                    MARBLE CIRCUIT{' '}
                    <small>
                      · {room.options.teams ? 'PARTNERSHIPS' : 'EVERY MARBLE FOR ITSELF'}
                    </small>
                  </span>
                  <button className="quiet" onClick={() => setZoom(!zoom)}>
                    {zoom ? 'Fit board' : 'Enlarge board'}
                  </button>
                </div>
                <div className={`board-scroll ${zoom ? 'zoomed' : ''}`}>
                  <Board
                    marbles={
                      room.game?.marbles ??
                      room.players.flatMap((p) =>
                        Array.from({ length: 4 }, (_, i) => ({
                          id: `${p.seat}:${i}`,
                          owner: p.seat,
                          location: { kind: 'break' as const },
                          progress: 0,
                          eligible: false,
                        })),
                      )
                    }
                    turn={room.game?.turn}
                    preview={preview}
                    selected={marble}
                    onMarble={(id) => {
                      setMarble(marble === id ? '' : id);
                      setPreview(undefined);
                    }}
                  />
                </div>
                <p className="board-legend">
                  <span>◎ Suit-marked marbles</span>
                  <span>✧ Center heaven</span>
                  <span>◌ Dashed ring = move preview</span>
                </p>
              </section>
              <aside className="sidebar">
                <section className="panel players-panel">
                  <span className="eyebrow">AROUND THE TABLE</span>
                  {SEATS.map((s) => {
                    const p = room.players.find((p) => p.seat === s);
                    return (
                      <div
                        key={s}
                        className={`player-row ${room.game?.turn === s && room.phase === 'playing' ? 'current' : ''}`}
                      >
                        <span className={`player-avatar seat-${s}`}>{SUITS[s]}</span>
                        <div>
                          <strong>
                            {p ? `${p.name}${p.id === playerId ? ' (you)' : ''}` : 'Open seat'}
                          </strong>
                          <small>
                            {p
                              ? `${SEAT_NAMES[s]}${p.id === room.hostId ? ' · host' : ''}${!p.connected ? ' · disconnected' : room.phase === 'lobby' ? (p.ready ? ' · ready' : ' · getting ready') : ` · ${room.game?.handCounts[s] ?? 0} cards`}`
                              : SEAT_NAMES[s]}
                          </small>
                        </div>
                        {p?.ready && room.phase === 'lobby' && (
                          <span className="ready-tick">✓</span>
                        )}
                        {room.game?.skips[s] ? (
                          <span className="skip-badge">skip ×{room.game.skips[s]}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </section>
                {room.phase === 'lobby' ? (
                  <section className="panel">
                    <span className="eyebrow">MAKE IT YOUR GAME</span>
                    <h2>Table rules</h2>
                    <p className="muted">The classic game, with a few optional twists.</p>
                    {(Object.keys(OPTION_LABELS) as (keyof Options)[]).map((key) => (
                      <label className="toggle-row" key={key}>
                        <span>{OPTION_LABELS[key]}</span>
                        <input
                          type="checkbox"
                          checked={room.options[key]}
                          disabled={!host || busy || !!room.resetRequest}
                          onChange={(e) =>
                            void send({
                              type: 'configureRoom',
                              options: { ...room.options, [key]: e.target.checked },
                              ...meta(),
                            })
                          }
                        />
                      </label>
                    ))}
                    <p className="muted small">
                      Changing rules resets everyone’s ready status. Partnerships need four players.
                    </p>
                    <button
                      className={me?.ready ? 'secondary full' : 'primary full'}
                      disabled={busy || !connected || !!room.resetRequest}
                      onClick={() => void send({ type: 'setReady', ready: !me?.ready, ...meta() })}
                    >
                      {me?.ready ? 'Ready ✓ · undo' : 'I’m ready'}
                    </button>
                    {host && (
                      <button
                        className="primary full"
                        disabled={
                          !!room.resetRequest ||
                          busy ||
                          room.players.length < 2 ||
                          !room.players.every((p) => p.ready && p.connected) ||
                          (room.options.teams && room.players.length !== 4)
                        }
                        onClick={() => void send({ type: 'startGame', ...meta() })}
                      >
                        Start the game →
                      </button>
                    )}
                    <button
                      className="quiet full"
                      disabled={busy || !!room.resetRequest}
                      onClick={() => void send({ type: 'leaveRoom', ...meta() })}
                    >
                      Leave table
                    </button>
                  </section>
                ) : room.phase === 'ended' ? (
                  <section className="panel result">
                    <span className="result-symbol">✧</span>
                    <h2>
                      {room.game?.winner?.length
                        ? `${room.game.winner.map((s) => room.players.find((p) => p.seat === s)?.name).join(' & ')} won!`
                        : 'Match ended'}
                    </h2>
                    <p>Same friends. Fresh cards?</p>
                    {host && (
                      <button
                        className="primary full"
                        disabled={busy || !!room.resetRequest}
                        onClick={() => void send({ type: 'rematch', ...meta() })}
                      >
                        Back to lobby · rematch ↻
                      </button>
                    )}
                    <button
                      className="quiet full"
                      disabled={busy || !!room.resetRequest}
                      onClick={() => void send({ type: 'leaveRoom', ...meta() })}
                    >
                      Leave table
                    </button>
                  </section>
                ) : (
                  <section className="panel turn-panel">
                    <span className="eyebrow">{myTurn ? 'YOUR MOVE' : 'TAKE A BREATHER'}</span>
                    <h2 aria-live="polite">
                      {room.resetRequest
                        ? 'Reset confirmation in progress'
                        : room.paused
                          ? 'Game paused'
                          : room.game?.phase === 'discardChoice'
                            ? `${room.players.find((p) => p.seat === room.game?.pendingDiscard)?.name} chooses a discard`
                            : myTurn
                              ? 'Make it a good one.'
                              : `${turnPlayer?.name}’s turn`}
                    </h2>
                    <p className="muted">{room.game?.lastMove}</p>
                    <div className="game-facts">
                      <span>
                        Dealer <b>{room.players.find((p) => p.seat === room.game?.dealer)?.name}</b>
                      </span>
                      <span>
                        Deal <b>{room.game?.dealIndex}</b>
                      </span>
                      <span>
                        Deck <b>{room.game?.deckCount}</b>
                      </span>
                      <span>
                        Discard <b>{room.game?.discardCount}</b>
                      </span>
                    </div>
                  </section>
                )}
              </aside>
            </div>
            {room.phase === 'playing' && (
              <section className="hand-panel">
                <div className="hand-heading">
                  <div>
                    <span className="eyebrow">JUST BETWEEN YOU AND THE TABLE</span>
                    <h2>
                      Your hand <span>({hand.cards.length})</span>
                    </h2>
                  </div>
                  <p>
                    {myTurn
                      ? 'Choose a card, preview a move, then confirm.'
                      : 'Your cards stay private. Plan your next move.'}
                  </p>
                </div>
                <div className="hand-cards">
                  {hand.cards.map((c) => (
                    <button
                      key={c.id}
                      className={`playing-card seat-${c.suit} ${card === c.id ? 'chosen' : ''}`}
                      aria-label={`Select ${cardName(c)}`}
                      aria-pressed={card === c.id}
                      disabled={busy || !connected || room.paused || !!room.resetRequest}
                      onClick={() => changeCard(c.id)}
                    >
                      <span>{cardName(c)}</span>
                      <big>{SUITS[c.suit]}</big>
                      <small>
                        {activeLegal.some((a) => 'cardId' in a.action && a.action.cardId === c.id)
                          ? 'PLAYABLE'
                          : 'IN HAND'}
                      </small>
                    </button>
                  ))}
                  {!hand.cards.length && (
                    <p className="muted">
                      Your hand is empty. The next deal begins when everyone has played.
                    </p>
                  )}
                </div>
                {myTurn && !room.paused && !room.resetRequest && (
                  <div className="action-area">
                    {splitChoices.length > 0 ? (
                      <>
                        <h3>
                          Split seven · {7 - steps.reduce((n, s) => n + s.count, 0)} steps left
                        </h3>
                        <p className="muted">
                          {steps.length
                            ? steps
                                .map(
                                  (s) =>
                                    `${SEAT_NAMES[Number(s.marbleId[0]) as Seat]} marble ${Number(s.marbleId.split(':')[1]) + 1}: ${s.count}`,
                                )
                                .join(' → ')
                            : 'Allocate seven steps. Each marble can move once.'}
                        </p>
                        <div className="action-list">
                          {nextSteps.map((s) => (
                            <button
                              key={`${s.marbleId}:${s.count}`}
                              onClick={() => {
                                const next = [...steps, s];
                                setSteps(next);
                                setPreview(
                                  compatible.find(
                                    (a) =>
                                      a.action.steps.length === next.length &&
                                      next.every(
                                        (x, i) =>
                                          a.action.steps[i]?.marbleId === x.marbleId &&
                                          a.action.steps[i]?.count === x.count,
                                      ),
                                  ),
                                );
                              }}
                            >
                              {SUITS[Number(s.marbleId[0]) as Seat]} Marble{' '}
                              {Number(s.marbleId.split(':')[1]) + 1} · {s.count} steps
                            </button>
                          ))}
                        </div>
                        <button
                          className="quiet"
                          onClick={() => {
                            setSteps([]);
                            setPreview(undefined);
                          }}
                        >
                          Reset allocation
                        </button>
                        {splitDone && (
                          <button
                            className="primary"
                            disabled={busy || !connected}
                            onClick={() =>
                              void send({ type: 'playCard', action: splitDone.action, ...meta() })
                            }
                          >
                            Confirm seven steps →
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="action-list">
                          {filtered
                            .filter((a) => a.action.kind !== 'split')
                            .map((a) => (
                              <button
                                key={JSON.stringify(a.action)}
                                className={preview === a ? 'chosen' : ''}
                                onClick={() => setPreview(a)}
                              >
                                {a.label}
                              </button>
                            ))}
                        </div>
                        {!card && !activeLegal.some((a) => a.action.kind === 'discardHand') && (
                          <p className="muted">Select a card to see its legal moves.</p>
                        )}
                        {card && !filtered.length && (
                          <p className="muted">
                            No legal move for this selection. Choose another card or clear your
                            marble selection.
                          </p>
                        )}
                        {marble && (
                          <button
                            className="quiet"
                            onClick={() => {
                              setMarble('');
                              setPreview(undefined);
                            }}
                          >
                            Clear marble selection
                          </button>
                        )}
                        {preview && (
                          <div className="confirm-row">
                            <span>{preview.label}</span>
                            <button
                              className="primary"
                              disabled={busy || !connected}
                              onClick={() =>
                                void send({ type: 'playCard', action: preview.action, ...meta() })
                              }
                            >
                              Confirm {preview.action.kind === 'chooseDiscard' ? 'discard' : 'move'}{' '}
                              →
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button className="quiet" onClick={() => setError('')}>
              Dismiss
            </button>
            {error.includes('Session expired') && (
              <button
                onClick={() => {
                  localStorage.removeItem('marble-session');
                  location.reload();
                }}
              >
                Start a new session
              </button>
            )}
          </div>
        )}
      </main>
      {rules && (
        <div className="modal-backdrop" onClick={() => setRules(false)}>
          <section
            className="rules-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setRules(false);
            }}
          >
            <button
              className="modal-close"
              autoFocus
              onClick={() => setRules(false)}
              aria-label="Close rules"
            >
              ×
            </button>
            <span className="eyebrow">A QUICK TRIP AROUND THE TABLE</span>
            <h2 id="rules-title">The way home.</h2>
            <Rules />
            <button className="primary" onClick={() => setRules(false)}>
              Got it. Let’s play →
            </button>
          </section>
        </div>
      )}
    </>
  );
}
function Rules() {
  return (
    <div className="rules-copy">
      <p>
        Race your four marbles from break to home. Ace or King starts a marble at your suit’s 18.
        Follow the arrows around 72 track spaces. Turns run clockwise; only you see your hand.
      </p>
      <h3>The cards</h3>
      <p>
        Ace: start or move 1. King: start or move 13. Queen: move 12. Jack: move 11 or swap an
        eligible own track marble with an opponent. Other cards move their number.
      </p>
      <h3>Capture, protect, come home</h3>
      <p>
        Land on an opponent to send it to break. A marble on its own start is protected and blocks
        opponents; its owner can normally pass it. You cannot land on your own marble. Earn home
        eligibility with 72 net forward track steps. At your own 18, enter home from hole 4 toward 1
        with an exact clear move. Otherwise continue on the track. You cannot pass home marbles or
        leave home.
      </p>
      <h3>A shortcut through heaven</h3>
      <p>
        From any numbered 8, use Ace, 10 or King to enter the center instead of moving normally. On
        a later turn, another such card exits to any 8. Heaven and exits allow captures. Heaven
        travel adds no circuit steps; Jack swaps preserve progress.
      </p>
      <h3>Optional twists</h3>
      <p>
        4 replaces its normal move with four backward. 5 moves an opponent’s track marble five
        forward, applying that marble’s ownership to captures. 7 splits exactly seven forward steps
        across distinct marbles, with captures at each final landing. 10 adds a choice to make the
        next player discard a chosen card and skip a turn; skips carry across deals. King’s 13-step
        sweep captures every unprotected marble along the route, including yours; every protected
        start blocks it.
      </p>
      <h3>Partners & dealing</h3>
      <p>
        Opposite seats form teams when enabled. Treat your partner as an opponent until your four
        marbles are home, then keep your hand and turns to move theirs. Home all eight to win. A
        split seven can use remaining steps to help a partner after your fourth arrives.
      </p>
      <p>
        Play a legal card if possible. Otherwise discard your entire hand on your turn. Deal sizes:
        4 players: 5/4/4; 3 players: 5/4/4/4; 2 players: 5/5/4/4/4/4. Redeal when all hands empty,
        rotating dealer after the schedule. Lowest initial draw deals, Ace low; redraw ties.
      </p>
      <p>
        Disconnecting pauses play. Reconnect in the same browser to return. After 90 seconds, the
        connected host may end without a winner. This local edition stores games in memory;
        restarting the server loses them. Empty rooms expire after 30 minutes.
      </p>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
