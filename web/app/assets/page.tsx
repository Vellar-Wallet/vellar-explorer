import type { TimeWindowParam } from "../../lib/api";
import { getAssets } from "../../lib/api";
import { assetLabel, rank, short, stellarExpertAccountUrl, toDecimal } from "../../lib/format";
import { CopyButton } from "../components/CopyButton";

export const dynamic = "force-dynamic";

const WINDOWS: readonly TimeWindowParam[] = ["24h", "7d", "30d", "all"];

/** The single source of truth for how a window reads in prose - every label on this page derives
 * from this, so a card can never show numbers for one window under a label naming another (the
 * exact bug being fixed: rail402's card reads "SETTLED IN LAST 30 DAYS" under a 24H filter). */
const WINDOW_LABEL: Record<TimeWindowParam, string> = {
  "24h": "Last 24 Hours",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  all: "All Time",
};

interface SearchParams {
  readonly window?: string;
  readonly page?: string;
}

function isWindow(v: string | undefined): v is TimeWindowParam {
  return v === "24h" || v === "7d" || v === "30d" || v === "all";
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const window: TimeWindowParam = isWindow(params.window) ? params.window : "all";
  const page = Number.isInteger(Number(params.page)) && Number(params.page) >= 1 ? Number(params.page) : 1;

  const { items, pagination, distinctAssets, topAsset, settledInWindow } = await getAssets({ window, page });
  const windowLabel = WINDOW_LABEL[window];

  const hrefFor = (w: TimeWindowParam, p: number) => `/assets?window=${w}&page=${p}`;

  return (
    <main>
      <header className="page-header">
        <h1>Assets</h1>
        <p>Every token x402 payments have settled in.</p>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Distinct Assets — {windowLabel}</div>
          <div className="value">{distinctAssets.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Top Asset — {windowLabel}</div>
          <div className="value small">
            {topAsset ? `${assetLabel(topAsset.assetContract, topAsset.assetSymbol)} — ${((topAsset.count / Math.max(1, settledInWindow)) * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Settled — {windowLabel}</div>
          <div className="value">{settledInWindow.toLocaleString()}</div>
        </div>
      </section>

      <div className="toolbar">
        <div className="toolbar-group">
          {WINDOWS.map(w => (
            <a key={w} href={hrefFor(w, 1)} className={`toolbar-btn${w === window ? " active" : ""}`}>
              {WINDOW_LABEL[w]}
            </a>
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
                  No payments in this window.
                </td>
              </tr>
            ) : (
              items.map((a, i) => {
                const pct = settledInWindow > 0 ? (a.paymentCount / settledInWindow) * 100 : 0;
                return (
                  <tr key={a.assetContract}>
                    <td className="rank-cell">{rank((page - 1) * pagination.limit + i + 1)}</td>
                    <td className="row-title">
                      <a href={`/assets/${encodeURIComponent(a.assetContract)}`}>{assetLabel(a.assetContract, a.assetSymbol)}</a>
                    </td>
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
                      {toDecimal(a.totalVolume)} {assetLabel(a.assetContract, a.assetSymbol)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        {page > 1 && <a href={hrefFor(window, page - 1)}>← Prev</a>}
        <span style={{ color: "var(--muted2)", fontSize: 13, alignSelf: "center" }}>
          Page {page} / {pagination.totalPages}
        </span>
        {page < pagination.totalPages && <a href={hrefFor(window, page + 1)}>Next →</a>}
      </div>

      <p className="feed-caption">
        Each volume is shown in that asset's own unit and is never summed across tokens.
      </p>
    </main>
  );
}
