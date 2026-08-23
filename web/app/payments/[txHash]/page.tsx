import { getPayment } from "../../../lib/api";
import {
  assetLabel,
  formatAge,
  short,
  stellarExpertAccountUrl,
  stellarExpertTxUrl,
  toDecimal,
} from "../../../lib/format";
import { CopyButton } from "../../components/CopyButton";

export const dynamic = "force-dynamic";

interface PageParams {
  readonly txHash: string;
}

/** Full address row: short link out to stellar.expert + copy, full value in the title. */
function AddressCell({ address }: { address: string }) {
  return (
    <>
      <a href={stellarExpertAccountUrl(address)} target="_blank" rel="noreferrer" title={address}>
        <span className="addr-full">{address}</span>
        <span className="addr-short">{short(address)}</span>
      </a>
      <CopyButton value={address} />
    </>
  );
}

export default async function PaymentDetailPage({ params }: { params: Promise<PageParams> }) {
  const { txHash } = await params;
  const payment = await getPayment(txHash);

  if (!payment) {
    return (
      <main>
        <header className="page-header">
          <h1>Payment not found</h1>
          <p>
            No indexed x402 payment matches <span title={txHash}>{short(txHash)}</span>. Not every
            Stellar transaction is an x402 payment, and very recent ones may still be on their way
            through the indexer.
          </p>
          <p style={{ marginTop: 8 }}>
            <a href="/">← Back to Feed</a>
            {"  ·  "}
            <a href={stellarExpertTxUrl(txHash)} target="_blank" rel="noreferrer">
              Look it up on stellar.expert ↗
            </a>
          </p>
        </header>
      </main>
    );
  }

  const label = assetLabel(payment.assetContract, payment.assetSymbol);

  return (
    <main>
      <header className="page-header">
        <h1>Payment</h1>
        <p>
          <span title={payment.txHash}>{short(payment.txHash)}</span>
          <CopyButton value={payment.txHash} />
        </p>
        <p style={{ marginTop: 8 }}>
          <a href="/">← Back to Feed</a>
        </p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Amount</div>
          <div className="value small">
            {toDecimal(payment.amount)} {label}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Age</div>
          <div className="value small" title={payment.closedAt}>
            {formatAge(payment.closedAt)} ago
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Scheme</div>
          <div className="value small">{(payment.scheme ?? "exact").toUpperCase()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Settled By</div>
          <div className="value small">
            {payment.facilitator.id === null ? (
              <span className="badge unattributed">Unattributed</span>
            ) : (
              <span className="badge attributed">{payment.facilitator.id}</span>
            )}
          </div>
        </div>
      </section>

      <section className="breakdown">
        <h2>Participants</h2>
        <div className="table-wrap">
          <table className="feed detail">
            <tbody>
              <tr>
                <td className="row-title">Buyer</td>
                <td>
                  <AddressCell address={payment.buyer} />
                </td>
              </tr>
              <tr>
                <td className="row-title">Seller</td>
                <td>
                  <AddressCell address={payment.seller} />
                </td>
              </tr>
              <tr>
                <td className="row-title">Sponsor</td>
                <td>
                  <AddressCell address={payment.sponsor} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="breakdown">
        <h2>On-chain Details</h2>
        <div className="table-wrap">
          <table className="feed detail">
            <tbody>
              <tr>
                <td className="row-title">Transaction</td>
                <td>
                  <a
                    href={stellarExpertTxUrl(payment.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    title={payment.txHash}
                  >
                    <span className="addr-full">{payment.txHash}</span>
                    <span className="addr-short">{short(payment.txHash)}</span>
                  </a>
                  <CopyButton value={payment.txHash} />
                </td>
              </tr>
              <tr>
                <td className="row-title">Asset</td>
                <td>
                  {label} · <AddressCell address={payment.assetContract} />
                </td>
              </tr>
              <tr>
                <td className="row-title">Ledger</td>
                <td>{payment.ledger.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="row-title">Closed At</td>
                <td>{payment.closedAt}</td>
              </tr>
              <tr>
                <td
                  className="row-title"
                  title="CAP-15 fee-bump wrapper vs a plain tx with the sponsor as source"
                >
                  Fee Sponsorship
                </td>
                <td>{payment.feeBumped ? "Fee-bump wrapper (CAP-15)" : "Plain tx, sponsor as source"}</td>
              </tr>
              <tr>
                <td className="row-title">Attribution</td>
                <td>
                  {payment.facilitator.confidence === "matched-known-signer"
                    ? "Matched a known facilitator signer key"
                    : "No known facilitator signer key claims this payment"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="feed-caption">
        Raw transaction, operations and fees live on{" "}
        <a href={stellarExpertTxUrl(payment.txHash)} target="_blank" rel="noreferrer">
          stellar.expert ↗
        </a>
        . This page shows what the indexer extracted from the payment: the x402 view.
      </p>
    </main>
  );
}
