/** Catastrophe impact: pixel cracks spreading from under the card and a burst of dust. Pure decoration. */
const CRACKS = [
  '50,0 46,8 52,14 47,24 50,32',
  '50,0 58,6 62,4 70,12 78,10 86,18',
  '50,0 40,5 36,3 28,11 20,9 12,17',
  '58,6 60,16 66,22',
  '40,5 38,15 32,20',
];

/** Dust squares: horizontal drift and rise in px. */
const DUST: [number, number][] = [
  [-150, -40],
  [-110, -70],
  [-70, -30],
  [-30, -60],
  [10, -45],
  [50, -75],
  [90, -35],
  [130, -65],
  [160, -30],
  [-180, -20],
];

export function CatastropheFx() {
  return (
    <div className="quake-fx" aria-hidden="true">
      <svg className="quake-fx__cracks" viewBox="0 0 100 34" preserveAspectRatio="none" shapeRendering="crispEdges">
        {CRACKS.map((points, i) => (
          <polyline key={i} points={points} style={{ animationDelay: `${0.52 + i * 0.05}s` }} />
        ))}
      </svg>
      {DUST.map(([dx, dy], i) => (
        <span
          key={i}
          className="quake-fx__dust"
          style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${0.5 + (i % 3) * 0.04}s` }}
        />
      ))}
    </div>
  );
}
