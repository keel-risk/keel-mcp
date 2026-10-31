import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The Soroban RPC layer, with the Blend SDK replaced: what a hung RPC and a
 * reserve without a V2 supply cap turn into.
 */
const sdk = vi.hoisted(() => ({
  metadata: vi.fn(),
  pool: vi.fn(),
}));

vi.mock('@blend-capital/blend-sdk', () => ({
  PoolMetadata: { load: sdk.metadata },
  PoolV2: { loadWithMetadata: sdk.pool },
  getOracleDecimals: vi.fn(),
  getOraclePrice: vi.fn(),
}));

const { loadBlendPool } = await import('../src/blend/load.js');
const { BlendReadError } = await import('../src/blend/errors.js');

const POOL = 'CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS';
const META = { name: 'YieldBlox', status: 1, oracle: 'CORACLE', latestLedger: 1 };

function poolWith(config: Record<string, unknown>) {
  const reserve = {
    assetId: 'CASSET',
    config: { decimals: 7, c_factor: 7_500_000, ...config },
    totalSupply: () => 10_000_000n,
    totalLiabilities: () => 0n,
  };
  return { reserves: new Map([[reserve.assetId, reserve]]) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('loadBlendPool', () => {
  it('reads a V2 reserve, cap and enabled flag included', async () => {
    sdk.metadata.mockResolvedValue(META);
    sdk.pool.mockResolvedValue(poolWith({ supply_cap: 50_000_000n, enabled: false }));
    const snapshot = await loadBlendPool(POOL, { withOraclePrices: false });
    expect(snapshot.reserves[0]).toMatchObject({ collateralFactor: '0.75', supplyCap: '5', totalSupplied: '1', enabled: false });
  });

  it('refuses a reserve without a V2 supply cap rather than reading it as a cap of 0', async () => {
    sdk.metadata.mockResolvedValue(META);
    sdk.pool.mockResolvedValue(poolWith({}));
    const load = loadBlendPool(POOL, { withOraclePrices: false });
    await expect(load).rejects.toBeInstanceOf(BlendReadError);
    await expect(load).rejects.toThrow(/only Blend V2 pools/);
  });

  it('cuts off an RPC that never answers', async () => {
    vi.useFakeTimers();
    sdk.metadata.mockReturnValue(new Promise(() => {}));
    const load = loadBlendPool(POOL, { withOraclePrices: false, timeoutMs: 1_000 });
    const settled = expect(load).rejects.toThrow(/no answer within 1000 ms/);
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
  });

  it('wraps an RPC failure with the pool and the step that failed', async () => {
    sdk.metadata.mockRejectedValue(new Error('socket hang up'));
    await expect(loadBlendPool(POOL, { withOraclePrices: false })).rejects.toThrow(
      `Reading the pool metadata for pool ${POOL} failed: socket hang up`,
    );
  });
});
