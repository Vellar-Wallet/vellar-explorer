import { getStats, listPayments } from "../lib/api";
import { short, stellarExpertAccountUrl, stellarExpertTxUrl, toDecimal } from "../lib/format";

export const dynamic = "force-dynamic"; // always live — never statically cache this page

interface SearchParams {
  readonly cursor?: string;
  readonly facilitator?: string;
  readonly payTo?: string;
}

function facilitatorBadge(id: string | null): React.ReactNode {
  return id === null ? (
    <span className="badge unattributed">Unattributed</span>
  ) : (
    <span className="badge attributed">{id}</span>
  );
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [stats, payments] = await Promise.all([
    getStats(),
    listPayments({
      limit: 50,
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.facilitator ? { facilitator: params.facilitator } : {}),
      ...(params.payTo ? { payTo: params.payTo } : {}),
    }),
  ]);

  const nextHref = payments.pagination.nextCursor
    ? `/?${new URLSearchParams({
        ...(params.facilitator ? { facilitator: params.facilitator } : {}),
        ...(params.payTo ? { payTo: params.payTo } : {}),
        cursor: payments.pagination.nextCursor,
      }).toString()}`
    : undefined;

  return (
    <main>
      <header className="page-header">
        <h1>x402 Payment Explorer — Stellar</h1>
        <p>
          Live x402 payments observed on Stellar testnet, across any facilitator. Attribution is a
          best guess from known signer keys — unattributed traffic is shown, not hidden.
        </p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Payments</div>
          <div className="value">{stats.totalPayments.toLocaleString()}</div>
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
          <div className="label">Top Asset</div>
          <div className="value small" title={stats.topAsset?.assetContract ?? ""}>
            {stats.topAsset ? short(stats.topAsset.assetContract) : "—"}
          </div>
        </div>
      </section>

      <section className="breakdown">
        <h2>Facilitator Breakdown</h2>
        {stats.facilitatorBreakdown.length === 0 ? (
          <div className="empty">No payments indexed yet.</div>
        ) : (
          stats.facilitatorBreakdown.map(entry => (
            <div className="breakdown-row" key={entry.facilitatorId ?? "unattributed"}>
              {facilitatorBadge(entry.facilitatorId)}
              <span>{entry.count.toLocaleString()} payment(s)</span>
            </div>
          ))
        )}
      </section>

      <form className="filters" action="/" method="get">
        <input type="text" name="facilitator" placeholder="Filter by facilitator id" defaultValue={params.facilitator ?? ""} />
        <input type="text" name="payTo" placeholder="Filter by seller (payTo) address" defaultValue={params.payTo ?? ""} />
        <button type="submit">Filter</button>
        {(params.facilitator || params.payTo) && <a className="clear" href="/">Clear</a>}
      </form>

      <div className="table-wrap">
        <table className="feed">
          <thead>
            <tr>
              <th>Tx Hash</th>
              <th>Ledger</th>
              <th>Closed At</th>
              <th>Buyer</th>
              <th>Seller</th>
              <th>Amount</th>
              <th>Asset</th>
              <th>Pattern</th>
              <th>Facilitator</th>
            </tr>
          </thead>
          <tbody>
            {payments.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty">
                  No payments match this filter.
                </td>
              </tr>
            ) : (
              payments.items.map(p => (
                <tr key={p.txHash}>
                  <td>
                    <a href={stellarExpertTxUrl(p.txHash)} target="_blank" rel="noreferrer">
                      {short(p.txHash)}
                    </a>
                  </td>
                  <td>{p.ledger}</td>
                  <td>{p.closedAt}</td>
                  <td>
                    <a href={stellarExpertAccountUrl(p.buyer)} target="_blank" rel="noreferrer" title={p.buyer}>
                      {short(p.buyer)}
                    </a>
                  </td>
                  <td>
                    <a href={stellarExpertAccountUrl(p.seller)} target="_blank" rel="noreferrer" title={p.seller}>
                      {short(p.seller)}
                    </a>
                  </td>
                  <td>{toDecimal(p.amount)}</td>
                  <td title={p.assetContract}>{short(p.assetContract)}</td>
                  <td>{p.feeBumped ? "fee-bump" : "plain tx"}</td>
                  <td>{facilitatorBadge(p.facilitator.id)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nextHref && (
        <div className="pagination">
          <a href={nextHref}>Next page →</a>
        </div>
      )}
    </main>
  );
}
