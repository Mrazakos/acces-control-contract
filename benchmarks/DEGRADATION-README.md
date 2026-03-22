# Performance Degradation Benchmarks

This simplified benchmark suite measures how the performance of critical operations **degrades with increasing transaction count**.

## What Gets Measured

### 1. **Lock Registration Degradation**
- Measures how long it takes to register a new lock at different transaction counts (0 → 100 → 500 → 800)
- Shows if registration latency increases as the contract state grows
- Reports both execution time (ms) and gas consumption

### 2. **Credential Revocation Degradation**
- Measures how long it takes to revoke a credential at different transaction counts (0 → 100 → 500 → 800)
- Shows if revocation performance degrades with more data on-chain
- Reports both execution time (ms) and gas consumption

## Running Benchmarks

### Quick Start
```bash
# Windows PowerShell
./run-degradation-benchmark.ps1

# Linux/Mac
bash run-degradation-benchmark.sh

# Or manually
npm test -- --grep "Degradation"
```

### Example Output
The test will show real-time progress:
```
📊 Starting Degradation Benchmarks...

   📝 Measuring registration at 0 existing transactions...
      ✓ Avg: 25.43ms | Gas: 102341
   📝 Measuring registration at 100 existing transactions...
      → Loaded 100/100 transactions
      ✓ Avg: 26.12ms | Gas: 102341
   📝 Measuring registration at 500 existing transactions...
      → Loaded 200/500 transactions
      → Loaded 400/500 transactions
      ✓ Avg: 27.89ms | Gas: 102341
   ...
```

## Output Files

After benchmarks complete:

1. **Timestamped Results**
   - Location: `benchmarks/degradation-2026-03-22T10-30-45.json`
   - Contains all raw measurement data
   - Saved with ISO timestamp to avoid overwrites

2. **Latest Results** (always current)
   - Location: `benchmarks/degradation-latest.json`
   - Use this for analysis and visualization
   - Data structure:
     ```json
     {
       "timestamp": "2026-03-22T10:30:45.123Z",
       "degradationData": [
         {
           "transactionCount": 0,
           "operation": "register",
           "avgTimeMs": 25.43,
           "avgGas": "102341",
           "iterations": 5
         },
         ...
       ]
     }
     ```

## Generating Visualizations

After running benchmarks, generate plots:

```bash
python3 visualization-scripts/plot_degradation.py
```

This creates:
- `reports/figures/degradation-latency-comparison.png` - Side-by-side latency graphs
- `reports/figures/degradation-gas-comparison.png` - Side-by-side gas consumption graphs
- `benchmarks/degradation-summary.md` - Markdown summary table

## For Your Thesis

The data directly addresses:
- **Performance Stability**: Shows if operations remain performant under load
- **Scalability**: Quantifies how much degradation occurs
- **Degradation Percentage**: Calculated automatically in output

Example summary output:
```
PERFORMANCE DEGRADATION SUMMARY

📝 REGISTRATION Performance:
   At    0 txs: 25.43ms | Gas: 102341
   At  100 txs: 26.12ms | Gas: 102341
   At  500 txs: 27.89ms | Gas: 102341
   At 1000 txs: 29.34ms | Gas: 102341
   Degradation: 15.3%

🔄 REVOCATION Performance:
   At    0 txs: 36.89ms | Gas: 68667
   At  100 txs: 37.42ms | Gas: 68667
   At  500 txs: 38.21ms | Gas: 68675
   At 1000 txs: 40.13ms | Gas: 68675
   Degradation: 8.8%
```

## Customizing the Benchmark

Edit line 178-179 in `test/benchmark/AccessControl.benchmark.gas.test.ts`:

```typescript
const transactionCounts = [0, 100, 500, 800];  // Change these values
const iterations = 5;                          // Change number of iterations per measurement
```

## Notes

- Each measurement runs 5 iterations by default (configurable)
- Transaction loading uses revocation operations to simulate realistic blockchain state
- Tests timeout at 10 minutes per describe block (adjust in test if needed)
- All timing uses `performance.now()` for best precision
- Gas measurements come from transaction receipts
