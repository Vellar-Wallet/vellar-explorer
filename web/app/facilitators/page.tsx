import { getFacilitators } from "../../lib/api";
import { assetLabel, formatAge, rank, toDecimal } from "../../lib/format";
import { DonutChart, type DonutEntry } from "../components/DonutChart";

export const dynamic = "force-dynamic";

function facilitatorBadge(id: string | null): React.ReactNode {
  return id === null ? (
    <span className="badge unattributed">Unattributed</span>
  ) : (
    <span className="badge attributed">{id}</span>
  );
}

export default async function FacilitatorsPage() {
  const { items, registeredCount } = await getFacilitators();
  const totalPayments = items.reduce((sum, f) => sum + f.paymentCount, 0);
  const attributedPayments = items
    .filter(f => f.facilitatorId !== null)
    .reduce((sum, f) => sum + f.paymentCount, 0);
  const unattributed = items.find(f => f.facilitatorId === null);
  const unattributedPct = totalPayments > 0 ? ((unattributed?.paymentCount ?? 0) / totalPayments) * 100 : 0;

  const donutEntries: DonutEntry[] = items.map(f => ({
    label: f.facilitatorId ?? "Unattributed",
    count: f.paymentCount,
    color: f.facilitatorId === null ? "var(--muted2)" : "var(--signal)",
  }));

  // Sorted so rank 1 is always the highest-volume ATTRIBUTED facilitator — unattributed traffic
  // is real and shown, but it isn't "a facilitator" with a rank the way a known one is.
  const ranked = [...items].filter(f => f.facilitatorId !== null).sort((a, b) => b.paymentCount - a.paymentCount);

  return (
    <main>
      <header className="page-header">
        <h1>Facilitators</h1>
        <p>The services this explorer can confirm settle x402 traffic on Stellar.</p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Registered</div>
          <div className="value">{registeredCount.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label" title="Same as Registered — our registry only holds independently-verified signer keys; there's no unverified 'seeded' state yet.">
            Verified
          </div>
          <div className="value">{registeredCount.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Attributed Payments</div>
          <div className="value">{attributedPayments.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Unattributed Traffic</div>
          <div className="value">
            {(unattributed?.paymentCount ?? 0).toLocaleString()}{" "}
            <span className="value small">({unattributedPct.toFixed(1)}%)</span>
          </div>
        </div>
      </section>

      <div className="two-col">
        <div className="donut-wrap">
          <DonutChart entries={donutEntries} centerLabel={totalPayments.toLocaleString()} />
          <div className="donut-legend">
            {items.map(f => (
              <div className="donut-legend-row" key={f.facilitatorId ?? "unattributed"}>
                <span
                  className="dot"
                  style={{ background: f.facilitatorId === null ? "var(--muted2)" : "var(--signal)" }}
                />
                {f.facilitatorId ?? "Unattributed"}
                <span className="pct">
                  {totalPayments > 0 ? ((f.paymentCount / totalPayments) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table className="feed">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Facilitator</th>
                <th>Payments</th>
                <th>Buyers</th>
                <th>Sellers</th>
                <th>Top Volume</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {unattributed && (
                <tr>
                  <td className="rank-cell">—</td>
                  <td>
                    <span className="row-title">
                      {facilitatorBadge(null)}
                      <span className="row-subtitle">x402-shaped traffic, no known signer match</span>
                    </span>
                  </td>
                  <td>{unattributed.paymentCount.toLocaleString()}</td>
                  <td>{unattributed.uniqueBuyers.toLocaleString()}</td>
                  <td>{unattributed.uniqueSellers.toLocaleString()}</td>
                  <td>
                    {unattributed.topVolume
                      ? `${toDecimal(unattributed.topVolume.total)} ${assetLabel(unattributed.topVolume.assetContract, unattributed.topVolume.assetSymbol)}`
                      : "—"}
                  </td>
                  <td>{formatAge(unattributed.lastSeen)} ago</td>
                </tr>
              )}
              {ranked.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No known-signer traffic indexed yet.
                  </td>
                </tr>
              ) : (
                ranked.map((f, i) => (
                  <tr key={f.facilitatorId}>
                    <td className="rank-cell">{rank(i + 1)}</td>
                    <td>
                      <span className="row-title">{facilitatorBadge(f.facilitatorId)}</span>
                      <span className="row-subtitle">first seen {formatAge(f.firstSeen)} ago</span>
                    </td>
                    <td>{f.paymentCount.toLocaleString()}</td>
                    <td>{f.uniqueBuyers.toLocaleString()}</td>
                    <td>{f.uniqueSellers.toLocaleString()}</td>
                    <td>{f.topVolume ? `${toDecimal(f.topVolume.total)} ${assetLabel(f.topVolume.assetContract, f.topVolume.assetSymbol)}` : "—"}</td>
                    <td>{formatAge(f.lastSeen)} ago</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="feed-caption">
        Market share covers every indexed payment. Traffic no verified signer key claims is
        counted as the unattributed slice.
      </p>

      <div className="cta-banner">
        <div>
          <h3>New to x402? Facilitators are the services that settle these payments.</h3>
          <p>
            Self-serve registration (probing a facilitator's own /supported endpoint to verify it,
            rather than hardcoding a guessed key) isn't built yet — see the docs for how attribution
            currently works.
          </p>
        </div>
        <div className="cta-banner-actions">
          <a className="cta-secondary" href="https://docs.vellar.xyz/docs/facilitator" target="_blank" rel="noreferrer">
            What is a facilitator? →
          </a>
          <span className="toolbar-btn disabled" title="Not built yet">
            Add your facilitator <span className="soon">soon</span>
          </span>
        </div>
      </div>
    </main>
  );
}
