# Example: Customizing Throughput Tests for Your Thesis

## Scenario 1: High-Confidence Statistical Data

For publication-quality results with strong statistical confidence:

```typescript
const THROUGHPUT_CONFIG = {
  // Test multiple load points for smooth curves
  LOAD_LEVELS: [10, 20, 30, 40, 50, 75, 100, 150, 200, 300, 500, 750, 1000],

  // More runs = more reliable averages
  RUNS_PER_LEVEL: 5, // 5 independent runs per load level

  OPERATIONS: {
    LOCK_REGISTRATION: true,
    CREDENTIAL_REVOCATION: true,
    CREDENTIAL_VERIFICATION: false, // Disable if not needed
  },

  CONCURRENT_USERS: 10,
};
```

**Results:**

- 13 load levels × 5 runs = 65 test runs per operation
- 130 total test runs (2 operations)
- Highly reliable averages with small standard deviation
- Smooth curves in visualizations

**Expected time:** 30-60 minutes

---

## Scenario 2: Quick Validation

For rapid testing during development:

```typescript
const THROUGHPUT_CONFIG = {
  // Just test key load points
  LOAD_LEVELS: [10, 50, 100],

  // Single run for speed
  RUNS_PER_LEVEL: 1,

  OPERATIONS: {
    LOCK_REGISTRATION: true,
    CREDENTIAL_REVOCATION: false, // Test one operation at a time
    CREDENTIAL_VERIFICATION: false,
  },

  CONCURRENT_USERS: 5,
};
```

**Results:**

- 3 load levels × 1 run = 3 test runs
- No statistical averaging (no standard deviation)
- Quick feedback

**Expected time:** 2-5 minutes

---

## Scenario 3: Detailed Arrival Rate Analysis

To specifically study arrival rate impact:

```typescript
const THROUGHPUT_CONFIG = {
  // Fine-grained load levels
  LOAD_LEVELS: [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100],

  // Good statistical confidence
  RUNS_PER_LEVEL: 3,

  OPERATIONS: {
    LOCK_REGISTRATION: true,
    CREDENTIAL_REVOCATION: true,
    CREDENTIAL_VERIFICATION: false,
  },

  CONCURRENT_USERS: 10,
};
```

**Results:**

- Very detailed analysis of 10-100 TX range
- Shows exactly where performance begins to degrade
- Great for identifying bottleneck thresholds

**Expected time:** 20-40 minutes

---

## Scenario 4: Extreme Load Testing

Test the absolute limits:

```typescript
const THROUGHPUT_CONFIG = {
  // Push to higher loads
  LOAD_LEVELS: [100, 250, 500, 750, 1000, 1500, 2000, 3000],

  // Fewer runs due to time constraints
  RUNS_PER_LEVEL: 2,

  OPERATIONS: {
    LOCK_REGISTRATION: true,
    CREDENTIAL_REVOCATION: false, // One at a time for extreme loads
    CREDENTIAL_VERIFICATION: false,
  },

  CONCURRENT_USERS: 20, // More concurrent users
};
```

**Results:**

- Identifies maximum capacity
- May encounter failures at extreme loads (expected)
- Shows breaking point

**Expected time:** 60-120 minutes

---

## Understanding the Tradeoffs

### Number of Runs (RUNS_PER_LEVEL)

| Runs | Pros                              | Cons                      | Use When                        |
| ---- | --------------------------------- | ------------------------- | ------------------------------- |
| 1    | Fast, quick feedback              | No statistical confidence | Development, debugging          |
| 3    | Good balance, moderate confidence | Standard                  | Thesis results, general testing |
| 5    | High confidence, small std dev    | 67% longer than 3 runs    | Publication, final thesis data  |
| 10   | Excellent statistical rigor       | Very time-consuming       | Academic papers, critical data  |

### Load Levels

| Strategy        | Example                     | Best For                         |
| --------------- | --------------------------- | -------------------------------- |
| **Logarithmic** | [10, 50, 100, 500, 1000]    | Quick overview of scaling        |
| **Linear**      | [10, 20, 30, ..., 100]      | Detailed analysis, smooth curves |
| **Hybrid**      | [10, 25, 50, 100, 200, 500] | Balanced detail and speed        |
| **Focused**     | [50, 60, 70, 80, 90, 100]   | Investigating specific range     |

### Operations

| Configuration   | Use Case                        |
| --------------- | ------------------------------- |
| All enabled     | Complete system analysis        |
| One at a time   | Focused deep-dive, faster tests |
| Lock Reg only   | Most critical path, baseline    |
| Revocation only | State growth impact analysis    |

---

## Recommended Thesis Workflow

### Phase 1: Initial Exploration (Week 1)

```typescript
LOAD_LEVELS: [10, 50, 100, 500]
RUNS_PER_LEVEL: 1
Operations: All enabled
```

**Goal:** Understand general behavior, identify interesting patterns

### Phase 2: Focused Testing (Week 2-3)

```typescript
LOAD_LEVELS: [10, 25, 50, 100, 200, 500, 1000]
RUNS_PER_LEVEL: 3
Operations: Focus on 1-2 operations
```

**Goal:** Collect main thesis data

### Phase 3: Final Validation (Week 4)

```typescript
LOAD_LEVELS: [Same as Phase 2]
RUNS_PER_LEVEL: 5
Operations: Same as Phase 2
```

**Goal:** High-confidence data for final thesis submission

---

## Interpreting Your Results

### Good Scaling Characteristics

✅ **Latency increases sub-linearly**

- 100x more TX → <50% latency increase
- Example: 10 TX @ 100ms → 1000 TX @ 140ms (+40%)

✅ **Throughput remains stable**

- Stays within 20% across load levels
- Example: 8 TX/s at low load, 7 TX/s at high load

✅ **Gas is constant**

- No increase with load level
- Indicates O(1) operations

### Needs Optimization

❌ **Latency increases super-linearly**

- 2x more TX → 3x latency
- Example: 100 TX @ 100ms → 200 TX @ 300ms

❌ **Throughput degrades significantly**

- > 50% drop at high loads
- Example: 8 TX/s → 3 TX/s

❌ **Gas increases with load**

- Indicates O(n) operations
- May need to optimize storage access

---

## Citation Example

When presenting in your thesis:

> "Throughput and arrival rate testing was conducted using progressive
> load testing methodology. Tests were performed at load levels of 10,
> 25, 50, 100, 200, 500, and 1000 transactions. Each load level was
> tested independently 3 times and results were averaged to ensure
> statistical reliability. Performance metrics including latency,
> throughput, and gas consumption were measured for each transaction.
>
> Results show that average latency increased from 115.2 ms (±4.3 ms)
> at 10 transactions to 145.7 ms (±8.2 ms) at 1000 transactions,
> representing a 26.4% increase over a 100-fold increase in load. This
> demonstrates sub-linear scaling characteristics. Processing throughput
> remained stable at approximately 7.8 TX/s (±0.3 TX/s) across all load
> levels with a 100% success rate."

---

## Questions?

- **How many load levels?** Start with 5-7, increase if you need smoother curves
- **How many runs?** Use 3 for thesis, 5 for final submission
- **How long will it take?** ~10 load levels × 3 runs × 2 operations × 30 seconds = ~30 minutes
- **Which operations?** Start with Lock Registration (simplest), add others as needed

## Tips

1. **Run overnight** - Set up extensive tests before bed
2. **Save configs** - Document exactly what config produced what results
3. **Version your data** - Keep dated copies of all JSON output
4. **Test incrementally** - Start small, expand gradually
5. **Analyze as you go** - Generate visualizations after each run
