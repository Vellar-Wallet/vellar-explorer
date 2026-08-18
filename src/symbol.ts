import { Account, Contract, Keypair, TransactionBuilder, rpc as StellarRpc, scValToNative } from "@stellar/stellar-sdk";

/**
 * On-chain asset labeling, the way rail402's own explorer does it (confirmed by reading their
 * client bundle 2026-08-19): the asset's real SEP-41 `symbol()`, not an external name/metadata
 * service. Icons are a separate, deliberately-deferred concern (their approach for those - a
 * client-side call to api.stellar.expert reading the issuer's stellar.toml - is a real follow-up,
 * not built here).
 *
 * simulateTransaction reads current ledger state for the invoked contract; it does not require
 * the source account to exist or be funded, so a fresh, never-registered keypair is a valid,
 * zero-cost source for a read-only call. This transaction is never signed or submitted.
 */
export async function resolveAssetSymbol(
  rpcUrl: string,
  passphrase: string,
  assetContract: string,
): Promise<string | undefined> {
  try {
    const server = new StellarRpc.Server(rpcUrl);
    const contract = new Contract(assetContract);
    const source = new Account(Keypair.random().publicKey(), "0");
    const tx = new TransactionBuilder(source, { fee: "100", networkPassphrase: passphrase })
      .addOperation(contract.call("symbol"))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (StellarRpc.Api.isSimulationError(sim)) return undefined;
    if (!sim.result?.retval) return undefined;
    const native = scValToNative(sim.result.retval);
    return typeof native === "string" && native.length > 0 ? native : undefined;
  } catch {
    // Not a standard SEP-41 token, RPC hiccup, malformed contract - all the same "couldn't
    // resolve" outcome. Caller decides what to do with undefined (cache it as a null attempt).
    return undefined;
  }
}
