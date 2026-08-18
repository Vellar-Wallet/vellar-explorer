import { getFacilitators } from "../../lib/api";

export const dynamic = "force-dynamic";

function facilitatorBadge(id: string | null): React.ReactNode {
  return id === null ? (
    <span className="badge unattributed">Unattributed</span>
  ) : (
    <span className="badge attributed">{id}</span>
  );
}

export default async function FacilitatorsPage() {
  const { items } = await getFacilitators();

  return (
    <main>
      <header className="page-header">
        <h1>Facilitators</h1>
        <p>
          Every facilitator identity this explorer has actually matched via a known signer key,
          plus how much traffic could not be matched to any known facilitator.
        </p>
      </header>

      <div className="table-wrap">
        <table className="feed">
          <thead>
            <tr>
              <th>Facilitator</th>
              <th>Payments</th>
              <th>Unique Buyers</th>
              <th>Unique Sellers</th>
              <th>First Seen</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No payments indexed yet.
                </td>
              </tr>
            ) : (
              items.map(f => (
                <tr key={f.facilitatorId ?? "unattributed"}>
                  <td>{facilitatorBadge(f.facilitatorId)}</td>
                  <td>{f.paymentCount.toLocaleString()}</td>
                  <td>{f.uniqueBuyers.toLocaleString()}</td>
                  <td>{f.uniqueSellers.toLocaleString()}</td>
                  <td>{f.firstSeen}</td>
                  <td>{f.lastSeen}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
