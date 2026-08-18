import { getEcosystemTimeseries, getFacilitators, getStats, listSellers } from "../../lib/api";
import { assetLabel, formatAge, short, stellarExpertAccountUrl, toDecimal } from "../../lib/format";
import { ShareBar } from "../components/ShareBar";
import { BarChart } from "../components/BarChart";

export const dynamic = "force-dynamic";

export default async function EcosystemPage() {
  const [stats, timeseries, facilitators, topSellers] = await Promise.all([
    getStats(),
    getEcosystemTimeseries(),
    getFacilitators(),
    listSellers({ limit: 5 }),
  ]);

  return (
    <main>
      <header className="page-header">
        <h1>Ecosystem</h1>
        <p>How big is the x402 economy on Stellar, who runs it, and is it growing?</p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Payments</div>
          <div className="value">{stats.totalPayments.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Top Asset — {stats.topAsset ? assetLabel(stats.topAsset.assetContract) : "—"}</div>
          <div className="value">{stats.topAsset?.count.toLocaleString() ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Buyers</div>
          <div className="value">{stats.uniqueBuyers.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Sellers</div>
          <div className="value">{stats.uniqueSellers.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Facilitators Registered</div>
          <div className="value">{facilitators.registeredCount.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Last Payment</div>
          <div className="value small">{stats.lastPaymentAt ? formatAge(stats.lastPaymentAt) : "—"}</div>
        </div>
      </section>

      <div className="toolbar">
        <div className="toolbar-group">
          <span className="toolbar-btn active">Payments</span>
          <span className="toolbar-btn disabled" title="Not built yet">
            Buyers <span className="soon">soon</span>
          </span>
          <span className="toolbar-btn disabled" title="Not built yet">
            Volume <span className="soon">soon</span>
          </span>
        </div>
        <div className="toolbar-group">
          <span className="toolbar-btn active">All Time</span>
          {["24H", "7D", "30D", "90D"].map(w => (
            <span key={w} className="toolbar-btn disabled" title="Time-windowed queries not built yet">
              {w} <span className="soon">soon</span>
            </span>
          ))}
        </div>
      </div>

      <BarChart points={timeseries.buckets.map(b => ({ date: b.date, value: b.totalPayments }))} />

      <div className="two-col">
        <section className="breakdown">
          <h2>Market Share — All Time, By Payment Count</h2>
          <ShareBar entries={stats.facilitatorBreakdown} />
        </section>

        <section className="breakdown">
          <h2>Growth — Trailing Windows</h2>
          <div className="empty">
            Needs time-windowed aggregation (24H/7D/30D deltas) — not built yet. Tracked as a
            follow-up, not faked here with placeholder numbers.
          </div>
        </section>
      </div>

      <section className="breakdown">
        <h2>Top Sellers — All Time</h2>
        <div className="table-wrap">
          <table className="feed">
            <thead>
              <tr>
                <th>Seller</th>
                <th>Payments</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {topSellers.items.map(s => (
                <tr key={s.seller}>
                  <td>
                    <a href={stellarExpertAccountUrl(s.seller)} target="_blank" rel="noreferrer" title={s.seller}>
                      {short(s.seller)}
                    </a>
                  </td>
                  <td>{s.paymentCount.toLocaleString()}</td>
                  <td>
                    {s.volumeByAsset.map(v => (
                      <div key={v.assetContract}>
                        {toDecimal(v.total)} {assetLabel(v.assetContract)}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <a href="/sellers">Full directory →</a>
        </div>
      </section>
    </main>
  );
}
