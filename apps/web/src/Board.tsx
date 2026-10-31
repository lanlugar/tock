import {
  EIGHTHS,
  SEATS,
  SEAT_NAMES,
  STARTS,
  SUITS,
  type LegalAction,
  type Marble,
  type Seat,
} from '@marble/engine';
import {
  breakCoordinates,
  homeCoordinates,
  locationPoint,
  marblePoint,
  trackCoordinates,
} from './board/geometry';
export function Board({
  marbles,
  turn,
  preview,
  onMarble,
  selected,
}: {
  marbles: Marble[];
  turn?: Seat;
  preview?: LegalAction;
  onMarble?: (id: string) => void;
  selected?: string;
}) {
  return (
    <svg
      className="board"
      viewBox="0 0 800 800"
      aria-label="72-space Marble Circuit board. Use the action controls below to play."
      role="img"
    >
      <defs>
        <pattern id="grain" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 8L8 0" stroke="#fff" strokeOpacity=".12" strokeWidth=".6" />
        </pattern>
        <radialGradient id="ball">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#000" stopOpacity=".12" />
        </radialGradient>
      </defs>
      <rect x="8" y="8" width="784" height="784" rx="64" fill="#dfc89f" />
      <rect x="20" y="20" width="760" height="760" rx="54" fill="#f1e4c9" stroke="#b69a6e" />
      <rect x="20" y="20" width="760" height="760" rx="54" fill="url(#grain)" />
      {SEATS.map((seat) => {
        const [x, y] = breakCoordinates[seat]![0]!;
        return (
          <g key={seat} className={`seat-${seat}`}>
            <rect
              x={x - 45}
              y={y - 65}
              width="140"
              height="155"
              rx="28"
              fill="currentColor"
              opacity={turn === seat ? '.16' : '.07'}
            />
            <text x={x + 26} y={y - 30} textAnchor="middle" className="board-suit">
              {SUITS[seat]}
            </text>
            {breakCoordinates[seat]!.map(([bx, by], i) => (
              <circle
                key={i}
                cx={bx}
                cy={by}
                r="18"
                fill="none"
                stroke="currentColor"
                strokeOpacity=".25"
                strokeDasharray="3 4"
              />
            ))}
          </g>
        );
      })}
      <path
        d={trackCoordinates.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ') + ' Z'}
        fill="none"
        stroke="#c3ad85"
        strokeWidth="2"
      />
      {trackCoordinates.map(([x, y], i) => {
        const start = (STARTS as readonly number[]).includes(i),
          eight = (EIGHTHS as readonly number[]).includes(i);
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={start ? 17 : 13}
              fill={eight ? '#d1b170' : '#dcc8a4'}
              stroke={start ? '#53796a' : '#c0a67e'}
              strokeWidth={start ? 3 : 1}
            />
            <text x={x} y={y + 4} textAnchor="middle" className="hole-label">
              {start ? SUITS[Math.floor(i / 18)] : 18 - (i % 18)}
            </text>
          </g>
        );
      })}
      {SEATS.map((s) => (
        <g key={s} className={`seat-${s}`}>
          {homeCoordinates[s]!.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="17" fill="currentColor" opacity=".17" />
              <text x={x} y={y + 4} textAnchor="middle" className="hole-label">
                {4 - i}
              </text>
            </g>
          ))}
        </g>
      ))}
      <circle cx="400" cy="400" r="59" fill="#183f37" />
      <circle cx="400" cy="400" r="51" fill="none" stroke="#bbd0aa" strokeWidth="1" />
      <text x="400" y="393" textAnchor="middle" className="heaven-star">
        ✧
      </text>
      <text x="400" y="420" textAnchor="middle" className="heaven-label">
        HEAVEN
      </text>
      {preview?.destinations
        .filter((d) => d.location.kind !== 'break')
        .map((d) => {
          const m = marbles.find((m) => m.id === d.marbleId)!;
          const [x, y] = locationPoint(d.location, m.owner);
          return (
            <circle
              key={d.marbleId}
              cx={x}
              cy={y}
              r="24"
              fill="none"
              stroke="#d08d28"
              strokeWidth="4"
              strokeDasharray="5 4"
            />
          );
        })}
      {marbles.map((m) => {
        const [x, y] = marblePoint(m);
        return (
          <g
            key={m.id}
            className={`marble seat-${m.owner} ${selected === m.id ? 'selected' : ''}`}
            onClick={() => onMarble?.(m.id)}
          >
            <title>
              {SEAT_NAMES[m.owner]} marble {Number(m.id.split(':')[1]) + 1}: {m.location.kind}
            </title>
            <circle cx={x} cy={y + 2} r="18" fill="#000" opacity=".12" />
            <circle
              cx={x}
              cy={y}
              r="18"
              fill="currentColor"
              stroke={selected === m.id ? '#d5a13a' : '#fff8e8'}
              strokeWidth={selected === m.id ? 5 : 2}
            />
            <circle cx={x} cy={y} r="16" fill="url(#ball)" />
            <text x={x} y={y + 6} textAnchor="middle" fill="white" fontSize="18">
              {SUITS[m.owner]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
