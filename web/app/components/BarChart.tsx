/** Simple CSS-bar daily chart - div heights, not a charting library. */

export interface BarChartPoint {
  readonly date: string;
  readonly value: number;
}

export function BarChart({ points }: { points: readonly BarChartPoint[] }) {
  const max = Math.max(1, ...points.map(p => p.value));

  return (
    <div className="bar-chart">
      {points.map(p => (
        <div
          key={p.date}
          className="bar-chart-col"
          title={`${p.date}: ${p.value.toLocaleString()} payment(s)`}
        >
          <div className="bar-chart-bar" style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}
