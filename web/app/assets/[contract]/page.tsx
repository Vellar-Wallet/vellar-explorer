import { getAssetStats, getAssetTimeseries, listAssetPayments } from "../../../lib/api";
import { assetLabel, formatAge, short, stellarExpertAccountUrl, stellarExpertTxUrl, toDecimal } from "../../../lib/format";
import { CopyButton } from "../../components/CopyButton";

export const dynamic = "force-dynamic";

const WINDOW_LABEL: Record<"24h" | "7d" | "30d", string> = {
  "24h": "24 Hours",
  "7d": "7 Days",
  "30d": "30 Days",
};

function facilitatorBadge(id: string | null): React.ReactNode {
  return id === null ? (
    <span className="badge unattributed">Unattributed</span>
  ) : (
    <span className="badge attributed">{id}</span>
  );
}

interface PageParams {
  readonly contract: string;
}

interface SearchParams {
  readonly cursor?: string;
}

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<SearchParams>;
}) {
  const { contract } = await params;
  const { cursor } = await searchParams;

  const [stats, timeseries, payments] = await Promise.all([
    getAssetStats(contract),
    getAssetTimeseries(contract),
    listAssetPayments(contract, { limit: 50, ...(cursor ? { cursor } : {}) }),
  ]);

  const label = assetLabel(contract, stats.assetSymbol);
  const nextHref = payments.pagination.nextCursor
    ? `/assets/${encodeURIComponent(contract)}?cursor=${encodeURIComponent(payments.pagination.nextCursor)}`
    : undefined;

  return (
    <main>
      <header className="page-header">
        <h1>{label}</h1>
        <p>
          <a href={stellarExpertAccountUrl(contract)} target="_blank" rel="noreferrer" title={contract}>
            {short(contract)}
          </a>
          <CopyButton value={contract} />
        </p>
        <p style={{ marginTop: 8 }}>
          <a href="/assets">← Back to Assets</a>
        </p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Payments</div>
          <div className="value">{stats.totalPayments.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Volume</div>
          <div className="value small">
            {toDecimal(stats.totalVolume)} {label}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Unique Buyers</div>
          <div className="value">{stats.uniqueBuyers.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Unique Sellers</div>
          <div className="value">{stats.uniqueSellers.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">First Payment</div>
          <div className="value small">{stats.firstPaymentAt ? `${formatAge(stats.firstPaymentAt)} ago` : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Last Payment</div>
          <div className="value small">{stats.lastPaymentAt ? `${formatAge(stats.lastPaymentAt)} ago` : "—"}</div>
        </div>
      </section>

      <section className="breakdown">
        <h2>Activity Matrix</h2>
        <div className="table-wrap">
          <table className="feed">
            <thead>
              <tr>
                <th>Window</th>
                <th>Payments</th>
                <th>Volume</th>
                <th>Buyers</th>
                <th>Sellers</th>
              </tr>
            </thead>
            <tbody>
              {timeseries.windows.map(w => (
                <tr key={w.window}>
                  <td className="row-title">{WINDOW_LABEL[w.window]}</td>
                  <td>{w.payments.toLocaleString()}</td>
                  <td>
                    {toDecimal(w.volume)} {label}
                  </td>
                  <td>{w.buyers.toLocaleString()}</td>
                  <td>{w.sellers.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="breakdown">
        <h2>Payments in {label}</h2>
        <div className="table-wrap">
          <table className="feed">
            <thead>
              <tr>
                <th>Age</th>
                <th>Tx</th>
                <th>Buyer → Seller</th>
                <th>Settled By</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No payments for this asset yet.
                  </td>
                </tr>
              ) : (
                payments.items.map(p => (
                  <tr key={p.txHash}>
                    <td title={p.closedAt}>{formatAge(p.closedAt)}</td>
                    <td>
                      <a href={stellarExpertTxUrl(p.txHash)} target="_blank" rel="noreferrer">
                        {short(p.txHash)}
                      </a>
                      <CopyButton value={p.txHash} />
                    </td>
                    <td>
                      <a href={stellarExpertAccountUrl(p.buyer)} target="_blank" rel="noreferrer" title={p.buyer}>
                        {short(p.buyer)}
                      </a>
                      {" → "}
                      <a href={stellarExpertAccountUrl(p.seller)} target="_blank" rel="noreferrer" title={p.seller}>
                        {short(p.seller)}
                      </a>
                    </td>
                    <td>{facilitatorBadge(p.facilitator.id)}</td>
                    <td>
                      {toDecimal(p.amount)} {label}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {nextHref && (
            <a href={nextHref} className="load-more">
              Load more ↓
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
