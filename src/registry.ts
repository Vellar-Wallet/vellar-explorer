/**
 * Facilitator attribution — deliberately minimal. This maps a payment's `sponsor` address
 * (whoever paid — see classify.ts) to a facilitator id, but ONLY for signer keys we have
 * independently verified. It does NOT probe `/supported` endpoints or self-serve register
 * anything yet; that's the real registry (a later, separate piece), which is what "matched-known-
 * signer" should mean once it exists for more than one facilitator.
 *
 * OpenZeppelin Channels is not in this map on purpose: we don't have its real signer key, and
 * hardcoding a guess would make "matched-known-signer" a lie about what was actually checked.
 */

export type AttributionConfidence = "matched-known-signer" | "unattributed";

export interface Attribution {
  readonly facilitatorId: string | null;
  readonly confidence: AttributionConfidence;
}

/** Verified against docs/accounts.md in vellar-facilitator: the hosted sponsor that signs every
 * fee-bump — or, per classify.ts's v2 finding, is the plain tx source — for that facilitator's
 * settlements. */
const KNOWN_SIGNERS: ReadonlyMap<string, string> = new Map([
  ["GBUCR6H22CZC5OYHBJIEUS2JFZBOB63AHEGTCV6UEPMD2TMLKG2ZMIW4", "vellar"],
]);

export function attributeFacilitator(sponsor: string): Attribution {
  const facilitatorId = KNOWN_SIGNERS.get(sponsor);
  return facilitatorId !== undefined
    ? { facilitatorId, confidence: "matched-known-signer" }
    : { facilitatorId: null, confidence: "unattributed" };
}

/** How many facilitators this registry actually knows a signer key for — "registered" in the
 * honest sense (statically confirmed), not "self-announced." */
export function registeredFacilitatorCount(): number {
  return KNOWN_SIGNERS.size;
}
