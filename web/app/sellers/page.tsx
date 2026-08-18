import { listSellers } from "../../lib/api";
import { short, stellarExpertAccountUrl, toDecimal } from "../../lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  readonly offset?: string;
}

export default async function SellersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const offset = Number.isInteger(Number(params.offset)) && Number(params.offset) >= 0 ? Number(params.offset) : 0;
  const { items, pagination } = await listSellers({ limit: PAGE_SIZE, offset });

  const prevHref = offset > 0 ? `/sellers?offset=${Math.max(0, offset - PAGE_SIZE)}` : undefined;
  const nextHref = pagination.hasMore ? `/sellers?offset=${offset + PAGE_SIZE}` : undefined;

  return (
    <main>
      <header className="page-header">
        <h1>Sellers</h1>
        <p>Every seller (payTo) address that has received an x402-shaped payment, ranked by payment count.</p>
      </header>

      <div className="table-wrap">
        <table className="feed">
          <thead>
            <tr>
              <th>Seller</th>
              <th>Payments</th>
              <th>Unique Buyers</th>
              <th>Volume by Asset</th>
              <th>First Seen</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No sellers indexed yet.
                </td>
              </tr>
            ) : (
              items.map(s => (
                <tr key={s.seller}>
                  <td>
                    <a href={stellarExpertAccountUrl(s.seller)} target="_blank" rel="noreferrer" title={s.seller}>
                      {short(s.seller)}
                    </a>
                  </td>
                  <td>{s.paymentCount.toLocaleString()}</td>
                  <td>{s.uniqueBuyers.toLocaleString()}</td>
                  <td>
                    {s.volumeByAsset.map(v => (
                      <div key={v.assetContract} title={v.assetContract}>
                        {toDecimal(v.total)} {short(v.assetContract)}
                      </div>
                    ))}
                  </td>
                  <td>{s.firstSeen}</td>
                  <td>{s.lastSeen}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        {prevHref && <a href={prevHref}>← Previous</a>}
        {prevHref && nextHref && <span style={{ margin: "0 8px" }} />}
        {nextHref && <a href={nextHref}>Next →</a>}
      </div>
    </main>
  );
}
