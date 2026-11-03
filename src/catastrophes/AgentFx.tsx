/** Agent sparkles: pixel stars twinkling around the card after it flips. Pure decoration. */
const SPARKS: [string, string, number][] = [
  ['-6%', '8%', 0],
  ['104%', '14%', 0.3],
  ['-4%', '62%', 0.55],
  ['102%', '70%', 0.15],
  ['18%', '-4%', 0.4],
  ['80%', '-3%', 0.7],
  ['30%', '102%', 0.25],
  ['72%', '101%', 0.5],
];

export function AgentFx() {
  return (
    <div className="agent-fx" aria-hidden="true">
      {SPARKS.map(([x, y, d], i) => (
        <span key={i} className="agent-fx__spark" style={{ left: x, top: y, animationDelay: `${1.25 + d}s` }} />
      ))}
    </div>
  );
}

/** Pixel star, 9 x 9: [row, first column, last column] runs. */
const STAR: [number, number, number][] = [
  [0, 4, 4],
  [1, 4, 4],
  [2, 3, 5],
  [3, 0, 8],
  [4, 1, 7],
  [5, 2, 6],
  [6, 1, 3],
  [6, 5, 7],
  [7, 1, 2],
  [7, 6, 7],
  [8, 0, 1],
  [8, 7, 8],
];

/** Back of the agent card: pixel pattern and a star emblem. */
export function AgentCardBack() {
  return (
    <div className="special-face special-face--back" aria-hidden="true">
      <svg viewBox="-1 -1 11 11" width="88" height="88" shapeRendering="crispEdges">
        {STAR.map(([y, x0, x1]) => (
          <rect key={`${y}-${x0}`} x={x0} y={y} width={x1 - x0 + 1} height={1} fill="currentColor" />
        ))}
      </svg>
    </div>
  );
}
