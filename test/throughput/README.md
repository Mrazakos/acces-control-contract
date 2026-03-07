# Throughput & Arrival Rate Testing

## Overview

This directory contains comprehensive throughput and arrival rate tests for the AccessControl smart contract. These tests analyze how the contract performs under increasing transaction loads, measuring latency, throughput, gas consumption, and reliability.

## Purpose

Address key research questions:

- **How does average latency change when the total number of transactions increases?**
- **What is the contract's maximum throughput (transactions per second)?**
- **How does gas consumption evolve through hundreds of consecutive requests?**
- **What is the relationship between arrival rate and processing capacity?**
- **Does performance degrade as state size grows?**

## Test Design

### Progressive Load Testing

The test suite uses a **progressive load strategy**:

- Tests multiple load levels: **10, 25, 50, 100, 200, 500, 1000 transactions**
- Each load level is tested **3 times** (configurable) for statistical reliability
- Results are **averaged** with standard deviation calculated
- Time-series data is captured for **every single transaction**

### Operations Tested

1. **Lock Registration** - Creating new locks in the system
2. **Credential Revocation** - Revoking credentials on existing locks
3. **Credential Verification** - Checking credential status (optional)

## Key Metrics Defined

### Throughput Metrics

| Metric                             | Definition                                               | Unit |
| ---------------------------------- | -------------------------------------------------------- | ---- |
| **Load Level**                     | Number of transactions submitted in a test run           | TX   |
| **Arrival Rate / Submission Rate** | Rate at which transactions are submitted to the contract | TX/s |
| **Processing Throughput**          | Rate at which transactions are successfully confirmed    | TX/s |
| **Success Rate**                   | Percentage of transactions that complete successfully    | %    |

### Latency Metrics

| Metric                     | Definition                                         | Unit |
| -------------------------- | -------------------------------------------------- | ---- |
| **Average Latency**        | Mean time from submission to confirmation          | ms   |
| **Median Latency**         | 50th percentile latency                            | ms   |
| **P95 Latency**            | 95th percentile latency (worst case for 95% of TX) | ms   |
| **P99 Latency**            | 99th percentile latency                            | ms   |
| **Standard Deviation (σ)** | Measure of latency variance across runs            | ms   |

### Gas Metrics

| Metric                 | Definition                              | Unit |
| ---------------------- | --------------------------------------- | ---- |
| **Total Gas Used**     | Sum of gas consumed by all transactions | gas  |
| **Average Gas per TX** | Mean gas consumption per transaction    | gas  |
| **Min/Max Gas**        | Range of gas consumption                | gas  |

## Running the Tests

### Prerequisites

Install dependencies:

```bash
npm install
```

This will install:

- `chart.js` - Chart generation library
- `chartjs-node-canvas` - Node.js canvas for server-side chart rendering
- `canvas` - HTML5 Canvas implementation for Node.js

### Run Throughput Tests Only

```bash
npm run test:throughput
```

This will:

- Execute all progressive load tests
- Save raw data to `reports/throughput-raw-<timestamp>.json`
- Save latest results to `reports/throughput-latest.json`
- Print summary to console

### Run Tests + Generate Visualizations

```bash
npm run test:throughput:full
```

This will:

1. Run all throughput tests
2. Automatically generate all charts and figures
3. Create a comprehensive markdown report

### Generate Visualizations Only

If you've already run tests and just want to regenerate charts:

```bash
npm run visualize
```

## Output Files

### Data Files

**Location:** `reports/`

- `throughput-raw-<timestamp>.json` - Complete test data with all transaction records
- `throughput-latest.json` - Latest test results (used by visualization script)

### Visualizations

**Location:** `reports/figures/`

All charts are generated as **PNG images** at 1200x600 resolution:

1. **latency-vs-load-<operation>.png**

   - Shows how average latency scales with load
   - Includes error bars (±1 standard deviation)
   - Answers: "What happens to latency when TX count increases?"

2. **throughput-vs-load-<operation>.png**

   - Processing throughput across load levels
   - Shows effective TX/s rate
   - Answers: "What is the maximum sustainable throughput?"

3. **gas-vs-load-<operation>.png**

   - Average gas consumption per transaction
   - Shows if gas costs remain stable or increase
   - Answers: "Does gas cost increase with state size?"

4. **latency-distribution-<operation>.png**

   - Shows percentiles (25th, 50th, 75th, 95th)
   - Reveals latency spread and outliers
   - Answers: "How consistent is performance?"

5. **time-series-latency-<operation>.png**

   - Latency for each consecutive transaction
   - Shows if performance degrades over time
   - Answers: "Does latency increase through consecutive requests?"

6. **comparison-all-operations.png**
   - Compares all operation types
   - Shows relative performance
   - Answers: "Which operations scale better?"

### Reports

**Location:** `reports/`

- `throughput-analysis.md` - Comprehensive markdown report with:
  - Test configuration details
  - Metric definitions
  - Summary tables
  - Embedded visualizations
  - Scaling analysis
  - Conclusions and recommendations

## Understanding the Results

### Example Output

```
THROUGHPUT TEST SUMMARY

Lock Registration - Load Level: 100 TX
  Number of Runs Averaged: 3
  Average Success Rate: 100.00%
  Average Latency: 125.45 ± 8.23 ms
  Average Throughput: 7.96 TX/s
  Average Gas per TX: 89452

Lock Registration - Load Level: 500 TX
  Number of Runs Averaged: 3
  Average Success Rate: 100.00%
  Average Latency: 145.32 ± 12.15 ms
  Average Throughput: 6.88 TX/s
  Average Gas per TX: 89458
```

### Interpreting the Results

**Number of Runs Averaged:** Each data point represents the average of 3 independent test runs. This ensures statistical reliability.

**Success Rate:** Should be close to 100%. Lower values indicate transaction failures.

**Latency Trend:**

- If latency increases **sub-linearly** (e.g., 10% increase for 5x more TX) → **Good scaling** ✅
- If latency increases **linearly** (e.g., 50% increase for 50% more TX) → **Expected behavior** ⚠️
- If latency increases **super-linearly** (e.g., 200% increase for 2x TX) → **Poor scaling, needs optimization** ❌

**Throughput:**

- Higher is better
- Should remain relatively stable across load levels
- Significant drop indicates bottleneck

**Gas Consumption:**

- Should remain **stable** across load levels
- Increase indicates state-dependent costs (e.g., larger arrays)

### Key Observations to Report

When presenting results in your thesis, focus on:

1. **Scaling Behavior:**

   - "Average latency increased by 15.8% when load increased from 100 to 500 transactions"
   - "Throughput remained stable at ~7.5 TX/s across all load levels"

2. **Statistical Confidence:**

   - "Results averaged over 3 runs with standard deviation of ±8.23 ms"
   - "95th percentile latency was 158.3 ms, indicating most transactions complete within this bound"

3. **Performance Characteristics:**

   - "Gas consumption remained constant at ~89,450 gas per transaction, independent of load"
   - "Time-series analysis shows no performance degradation through 1000 consecutive transactions"

4. **Arrival Rate Analysis:**
   - "At submission rate of 10 TX/s, average latency was X ms"
   - "System maintained 100% success rate up to arrival rate of Y TX/s"

## Configuration

Edit `AccessControl.throughput.test.ts` to customize:

```typescript
const THROUGHPUT_CONFIG = {
  // Load levels to test
  LOAD_LEVELS: [10, 25, 50, 100, 200, 500, 1000],

  // Number of runs per level (increase for more statistical confidence)
  RUNS_PER_LEVEL: 3,

  // Operations to test
  OPERATIONS: {
    LOCK_REGISTRATION: true,
    CREDENTIAL_REVOCATION: true,
    CREDENTIAL_VERIFICATION: true,
  },

  // Concurrent users
  CONCURRENT_USERS: 10,
};
```

### Recommendations

**For thesis/publication:**

- Use `RUNS_PER_LEVEL: 5` or higher for more reliable averages
- Test more granular load levels: `[10, 20, 30, ..., 100]`
- Run tests multiple times on different days to account for variability

**For quick validation:**

- Use `RUNS_PER_LEVEL: 1`
- Reduce `LOAD_LEVELS: [10, 50, 100]`

## Figures in Your Thesis

All generated PNG figures are publication-ready:

- High resolution (1200x600)
- Clear labels and titles
- Professional color scheme
- Embedded context in subtitles

### Recommended Presentation

**Figure 1: Latency Scaling**

```
Figure X: Average transaction latency as a function of load level for
lock registration operations. Error bars represent ±1 standard deviation
across 3 independent runs. Results show sub-linear scaling with latency
increasing by only 15.8% from 100 to 500 transactions.
```

**Figure 2: Time-Series Evolution**

```
Figure Y: Latency evolution over 500 consecutive credential revocation
transactions. The relatively flat trend demonstrates stable performance
without degradation as state grows.
```

## Troubleshooting

### Tests are very slow

- Reduce `LOAD_LEVELS` to fewer, smaller values
- Reduce `RUNS_PER_LEVEL` to 1 for quick tests
- Use local Hardhat network (not remote testnet)

### Out of memory errors

- Reduce maximum load level
- Run tests individually per operation type
- Increase Node.js memory: `node --max-old-space-size=4096`

### Chart generation fails

- Ensure all dependencies are installed: `npm install`
- On Windows, you may need to install cairo separately
- Check that `reports/throughput-latest.json` exists

### Canvas installation issues (Windows)

If you encounter issues installing `canvas`:

```bash
# Install windows-build-tools first
npm install --global --production windows-build-tools

# Then install canvas
npm install canvas
```

## Contributing

To add new metrics or visualizations:

1. **Add metric to `ThroughputMetrics` interface** in the test file
2. **Capture the metric** in `runThroughputTest()`
3. **Create visualization function** in `visualize-throughput.ts`
4. **Add to report** in `generateMarkdownReport()`

## References

- Hardhat Documentation: https://hardhat.org/
- Chart.js Documentation: https://www.chartjs.org/
- Performance Testing Best Practices: See test/README.md

## Questions?

For issues or questions:

1. Check if tests ran successfully and produced `throughput-latest.json`
2. Ensure all dependencies are installed
3. Review console output for error messages
4. Check the main project README for setup instructions
