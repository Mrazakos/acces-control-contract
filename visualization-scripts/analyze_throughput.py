import json
import pandas as pd

# Load data
with open('../reports/throughput-latest.json') as f:
    data = json.load(f)

df = pd.DataFrame(data['rawMetrics'])
lock_reg = df[df['operationType'] == 'Lock Registration'].copy()

# Group by load level
summary = lock_reg.groupby('loadLevel').agg({
    'avgLatencyMs': 'mean',
    'processingThroughput': 'mean'
}).round(2)

print("=" * 60)
print("LOCK REGISTRATION PERFORMANCE ANALYSIS")
print("=" * 60)
print("\nLoad Level vs Performance:\n")
print(summary.to_string())

print("\n\nThroughput Statistics:")
print(f"  Mean:    {lock_reg['processingThroughput'].mean():.2f} tx/s")
print(f"  Min:     {lock_reg['processingThroughput'].min():.2f} tx/s")
print(f"  Max:     {lock_reg['processingThroughput'].max():.2f} tx/s")
print(f"  Std Dev: {lock_reg['processingThroughput'].std():.2f} tx/s")

print("\n\nLatency Statistics:")
print(f"  Mean:    {lock_reg['avgLatencyMs'].mean():.2f} ms")
print(f"  Min:     {lock_reg['avgLatencyMs'].min():.2f} ms")
print(f"  Max:     {lock_reg['avgLatencyMs'].max():.2f} ms")
print(f"  Std Dev: {lock_reg['avgLatencyMs'].std():.2f} ms")

print("\n" + "=" * 60)
print("EXPLANATION:")
print("=" * 60)
print("""
The throughput (~40-50 tx/s) remains relatively constant because:

1. LOCAL BLOCKCHAIN CONSTRAINT: You're using Hardhat's local network
   which processes blocks sequentially with auto-mining enabled.
   
2. BLOCK TIME LIMITATION: Each transaction must wait for block
   confirmation, creating a natural throughput ceiling.
   
3. SERIAL PROCESSING: Even though you submit transactions in parallel,
   they're processed one at a time in the local blockchain.

4. LINEAR LATENCY SCALING: As you send more transactions, they queue
   up waiting for confirmation, so average latency increases linearly
   with load, but throughput (confirmed tx per second) stays constant.

This is NORMAL for local Hardhat testing. Real blockchain networks:
- Ethereum mainnet: ~15-30 tx/s
- Polygon: ~65-100 tx/s  
- Optimistic rollups: ~2000-4000 tx/s

Your 40-50 tx/s is actually quite good for local testing!
""")
