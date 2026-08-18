/** Simple CSS-bar daily chart - div heights, not a charting library. */

export interface BarChartPoint {
  readonly date: string;
  readonly value: number;
}

export function BarChart({ points }: { points: readonly BarChartPoint[] }) {
  // A single bar with flex:1 stretches to fill the whole width and just reads as a solid block,
  // not a chart - and a one-day "trend" isn't a trend yet anyway. Say so instead of faking a chart.
  if (points.length < 2) {
    return (
      <div className="bar-chart bar-chart-empty">
        Not enough daily history yet to show a trend — check back after a few days of data.
      </div>
    );
  }

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
