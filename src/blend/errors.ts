/**
 * A Blend pool could not be read from Soroban RPC, or what was read is not a Blend
 * V2 pool. Distinct from an input error: the pool id may be perfectly valid.
 */
export class BlendReadError extends Error {
  constructor(
    readonly poolId: string,
    message: string,
  ) {
    super(message);
    this.name = 'BlendReadError';
  }
}
