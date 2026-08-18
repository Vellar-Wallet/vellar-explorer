/**
 * A stacked share bar + legend for facilitator breakdowns. Two-color only (signal = attributed,
 * muted2 = unattributed) because that's honestly all we can currently distinguish - one known
 * signer key. Extend this to per-facilitator colors once the registry knows more than one.
 */

export interface ShareEntry {
  readonly facilitatorId: string | null;
  readonly count: number;
}

export function ShareBar({ entries }: { entries: readonly ShareEntry[] }) {
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  if (total === 0) return <div className="empty">No payments indexed yet.</div>;

  return (
    <>
      <div className="share-bar">
        {entries.map(entry => (
          <div
            key={entry.facilitatorId ?? "unattributed"}
            className={`segment ${entry.facilitatorId === null ? "unattributed" : "attributed"}`}
            style={{ width: `${(entry.count / total) * 100}%` }}
            title={`${entry.facilitatorId ?? "Unattributed"}: ${entry.count} (${((entry.count / total) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="share-legend">
        {entries.map(entry => (
          <span key={entry.facilitatorId ?? "unattributed"}>
            <span
              className="dot"
              style={{ background: entry.facilitatorId === null ? "var(--muted2)" : "var(--signal)" }}
            />
            {entry.facilitatorId ?? "Unattributed"} — {entry.count.toLocaleString()} (
            {((entry.count / total) * 100).toFixed(1)}%)
          </span>
        ))}
      </div>
    </>
  );
}
