import { getAssets } from "../../lib/api";
import { assetLabel, rank, short, stellarExpertAccountUrl, toDecimal } from "../../lib/format";
import { CopyButton } from "../components/CopyButton";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const { items, settledLast30Days } = await getAssets();
  const total = items.reduce((sum, a) => sum + a.paymentCount, 0);
  const top = items[0];

  return (
    <main>
      <header className="page-header">
        <h1>Assets</h1>
        <p>Every token x402 payments have settled in.</p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Distinct Assets</div>
          <div className="value">{items.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Top Asset</div>
          <div className="value small">
            {top ? `${assetLabel(top.assetContract)} — ${((top.paymentCount / total) * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Settled in Last 30 Days</div>
          <div className="value">{settledLast30Days.toLocaleString()}</div>
        </div>
      </section>

      <div className="toolbar">
        <div className="toolbar-group">
          <span className="toolbar-btn active">All Time</span>
          {["24H", "7D", "30D"].map(w => (
            <span key={w} className="toolbar-btn disabled" title="Time-windowed queries not built yet">
              {w} <span className="soon">soon</span>
            </span>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="feed">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Asset</th>
              <th>Contract</th>
              <th>Share of Payments</th>
              <th>Payments</th>
              <th>Unique Sellers</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  No payments indexed yet.
                </td>
              </tr>
            ) : (
              items.map((a, i) => {
                const pct = total > 0 ? (a.paymentCount / total) * 100 : 0;
                return (
                  <tr key={a.assetContract}>
                    <td className="rank-cell">{rank(i + 1)}</td>
                    <td className="row-title">{assetLabel(a.assetContract)}</td>
                    <td>
                      <a href={stellarExpertAccountUrl(a.assetContract)} target="_blank" rel="noreferrer" title={a.assetContract}>
                        {short(a.assetContract)}
                      </a>
                      <CopyButton value={a.assetContract} />
                    </td>
                    <td>
                      <div className="share-bar" style={{ width: 90, margin: 0 }}>
                        <div className="segment attributed" style={{ width: `${pct}%` }} />
                      </div>
                      {pct.toFixed(1)}%
                    </td>
                    <td>{a.paymentCount.toLocaleString()}</td>
                    <td>{a.uniqueSellers.toLocaleString()}</td>
                    <td>
                      {toDecimal(a.totalVolume)} {assetLabel(a.assetContract)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="feed-caption">
        Each volume is shown in that asset's own unit and is never summed across tokens.
      </p>
    </main>
  );
}
