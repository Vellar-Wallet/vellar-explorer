/** Hand-rolled SVG donut via stroke-dasharray - no charting library for one chart. */

export interface DonutEntry {
  readonly label: string;
  readonly count: number;
  readonly color: string;
}

const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({ entries, centerLabel }: { entries: readonly DonutEntry[]; centerLabel: string }) {
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  let offset = 0;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Facilitator market share">
      <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--line)" strokeWidth={STROKE} />
      {total > 0 &&
        entries.map(entry => {
          const fraction = entry.count / total;
          const dash = fraction * CIRCUMFERENCE;
          const segment = (
            <circle
              key={entry.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={entry.color}
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            >
              <title>{`${entry.label}: ${entry.count.toLocaleString()} (${(fraction * 100).toFixed(1)}%)`}</title>
            </circle>
          );
          offset += dash;
          return segment;
        })}
      <text x="50%" y="47%" textAnchor="middle" fill="var(--ink)" fontFamily="Clash Display, sans-serif" fontSize="20" fontWeight={600}>
        {centerLabel}
      </text>
      <text x="50%" y="60%" textAnchor="middle" fill="var(--muted2)" fontSize="10" letterSpacing="0.08em">
        PAYMENTS
      </text>
    </svg>
  );
}
