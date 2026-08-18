import { getFacilitators, getStats, listPayments } from "../lib/api";
import { assetLabel, formatAge, short, stellarExpertAccountUrl, stellarExpertTxUrl, toDecimal } from "../lib/format";
import { ShareBar } from "./components/ShareBar";
import { CopyButton } from "./components/CopyButton";

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
  const [stats, payments, facilitators] = await Promise.all([
    getStats(),
    listPayments({
      limit: 50,
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.facilitator ? { facilitator: params.facilitator } : {}),
      ...(params.payTo ? { payTo: params.payTo } : {}),
    }),
    getFacilitators(),
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
        <h1>The public record of x402 payments on Stellar.</h1>
        <p>Every payment, live from the ledger. Who paid, who got paid, who settled it.</p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Payments Indexed</div>
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
      </section>

      <section className="breakdown">
        <h2>Who Settled It</h2>
        <ShareBar entries={stats.facilitatorBreakdown} />
      </section>

      <form className="filters" action="/" method="get">
        <select name="facilitator" defaultValue={params.facilitator ?? ""}>
          <option value="">All facilitators</option>
          {facilitators.items.map(f => (
            <option key={f.facilitatorId ?? "unattributed"} value={f.facilitatorId ?? "unattributed"}>
              {f.facilitatorId ?? "Unattributed"} ({f.paymentCount.toLocaleString()})
            </option>
          ))}
        </select>
        <input type="text" name="payTo" placeholder="Filter by seller (payTo) address" defaultValue={params.payTo ?? ""} />
        <button type="submit">Filter</button>
        {(params.facilitator || params.payTo) && <a className="clear" href="/">Clear</a>}
      </form>

      <div className="table-wrap">
        <table className="feed">
          <thead>
            <tr>
              <th>Age</th>
              <th>Tx</th>
              <th>Buyer → Seller</th>
              <th>Scheme</th>
              <th>Settled By</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No payments match this filter.
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
                  <td title={p.feeBumped ? "sponsored via a CAP-15 fee-bump wrapper" : "sponsored via a plain tx (sponsor as source)"}>
                    EXACT
                  </td>
                  <td>{facilitatorBadge(p.facilitator.id)}</td>
                  <td>
                    {toDecimal(p.amount)} {assetLabel(p.assetContract)}
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

      <p className="feed-caption">
        <strong>Unattributed:</strong> a real on-chain x402 payment that no known facilitator signer
        key claims — see the Facilitators tab for what "known" actually means here.
      </p>
    </main>
  );
}
