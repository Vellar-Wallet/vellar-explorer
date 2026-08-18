import { getAssets } from "../../lib/api";
import { short, stellarExpertAccountUrl, toDecimal } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const { items } = await getAssets();

  return (
    <main>
      <header className="page-header">
        <h1>Assets</h1>
        <p>Every asset contract this explorer has seen move through an x402-shaped payment.</p>
      </header>

      <div className="table-wrap">
        <table className="feed">
          <thead>
            <tr>
              <th>Asset Contract</th>
              <th>Payments</th>
              <th>Unique Sellers</th>
              <th>Total Volume</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No payments indexed yet.
                </td>
              </tr>
            ) : (
              items.map(a => (
                <tr key={a.assetContract}>
                  <td>
                    <a href={stellarExpertAccountUrl(a.assetContract)} target="_blank" rel="noreferrer" title={a.assetContract}>
                      {short(a.assetContract)}
                    </a>
                  </td>
                  <td>{a.paymentCount.toLocaleString()}</td>
                  <td>{a.uniqueSellers.toLocaleString()}</td>
                  <td>{toDecimal(a.totalVolume)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
