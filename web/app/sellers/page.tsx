import { getStats, listSellers } from "../../lib/api";
import { assetLabel, formatAge, rank, short, stellarExpertAccountUrl, toDecimal } from "../../lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  readonly offset?: string;
}

export default async function SellersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const offset = Number.isInteger(Number(params.offset)) && Number(params.offset) >= 0 ? Number(params.offset) : 0;
  const [{ items, pagination, activeLast7Days }, stats] = await Promise.all([
    listSellers({ limit: PAGE_SIZE, offset }),
    getStats(),
  ]);

  const prevHref = offset > 0 ? `/sellers?offset=${Math.max(0, offset - PAGE_SIZE)}` : undefined;
  const nextHref = pagination.hasMore ? `/sellers?offset=${offset + PAGE_SIZE}` : undefined;

  return (
    <main>
      <header className="page-header">
        <h1>Sellers</h1>
        <p>Every API being paid via x402, ranked by activity.</p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Sellers</div>
          <div className="value">{stats.uniqueSellers.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Active Last 7 Days</div>
          <div className="value">{activeLast7Days.toLocaleString()}</div>
        </div>
      </section>

      <div className="toolbar">
        <div className="toolbar-group">
          <span className="toolbar-btn active">All</span>
          <span className="toolbar-btn active">On-Chain Only</span>
          <span className="toolbar-btn disabled" title="No Bazaar integration built yet">
            Bazaar <span className="soon">soon</span>
          </span>
        </div>
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
              <th>Seller</th>
              <th>Registered</th>
              <th>Payments</th>
              <th>Buyers</th>
              <th>Volume</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  No sellers indexed yet.
                </td>
              </tr>
            ) : (
              items.map((s, i) => (
                <tr key={s.seller}>
                  <td className="rank-cell">{rank(offset + i + 1)}</td>
                  <td>
                    <a href={stellarExpertAccountUrl(s.seller)} target="_blank" rel="noreferrer" title={s.seller}>
                      {short(s.seller)}
                    </a>
                    <span className="row-subtitle">first seen {formatAge(s.firstSeen)} ago</span>
                  </td>
                  <td>
                    <span className="badge attributed">On-Chain</span>
                  </td>
                  <td>{s.paymentCount.toLocaleString()}</td>
                  <td>{s.uniqueBuyers.toLocaleString()}</td>
                  <td>
                    {s.volumeByAsset.map(v => (
                      <div key={v.assetContract}>
                        {toDecimal(v.total)} {assetLabel(v.assetContract, v.assetSymbol)}
                      </div>
                    ))}
                  </td>
                  <td>{formatAge(s.lastSeen)} ago</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        {prevHref && <a href={prevHref}>← Previous</a>}
        {nextHref && <a href={nextHref}>Next →</a>}
      </div>
    </main>
  );
}
