import { getEcosystemTimeseries, getStats } from "../../lib/api";

export const dynamic = "force-dynamic";

export default async function EcosystemPage() {
  const [stats, timeseries] = await Promise.all([getStats(), getEcosystemTimeseries()]);
  const total = stats.totalPayments;

  return (
    <main>
      <header className="page-header">
        <h1>Ecosystem</h1>
        <p>
          Market share is a best guess from known signer keys, not a fact — see the caveat below
          the share bar. Unattributed traffic is shown at full size, not folded away to make the
          picture look more complete than it is.
        </p>
      </header>

      <section className="breakdown">
        <h2>Facilitator Share</h2>
        {total === 0 ? (
          <div className="empty">No payments indexed yet.</div>
        ) : (
          <>
            <div className="share-bar">
              {stats.facilitatorBreakdown.map(entry => (
                <div
                  key={entry.facilitatorId ?? "unattributed"}
                  className={`segment ${entry.facilitatorId === null ? "unattributed" : "attributed"}`}
                  style={{ width: `${(entry.count / total) * 100}%` }}
                  title={`${entry.facilitatorId ?? "Unattributed"}: ${entry.count} (${((entry.count / total) * 100).toFixed(1)}%)`}
                />
              ))}
            </div>
            <div className="share-legend">
              {stats.facilitatorBreakdown.map(entry => (
                <span key={entry.facilitatorId ?? "unattributed"}>
                  <span
                    className="dot"
                    style={{
                      background: entry.facilitatorId === null ? "var(--tint-amber-b)" : "var(--signal)",
                    }}
                  />
                  {entry.facilitatorId ?? "Unattributed"} — {entry.count.toLocaleString()} (
                  {((entry.count / total) * 100).toFixed(1)}%)
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="breakdown">
        <h2>Daily Volume</h2>
        {timeseries.buckets.length === 0 ? (
          <div className="empty">No payments indexed yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="feed">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total Payments</th>
                  <th>By Facilitator</th>
                </tr>
              </thead>
              <tbody>
                {timeseries.buckets.map(bucket => (
                  <tr key={bucket.date}>
                    <td>{bucket.date}</td>
                    <td>{bucket.totalPayments.toLocaleString()}</td>
                    <td>
                      {bucket.byFacilitator.map(e => (
                        <div key={e.facilitatorId ?? "unattributed"}>
                          {e.facilitatorId ?? "Unattributed"}: {e.count.toLocaleString()}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
