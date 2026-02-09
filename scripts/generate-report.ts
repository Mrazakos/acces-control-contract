import * as fs from "fs";
import * as path from "path";

/**
 * Performance Report Generator
 * 
 * Aggregates data from:
 * - Gas reports (gas-report.txt)
 * - Load test results (load-test-results.json)
 * - Benchmark results (benchmark-latest.json)
 * 
 * Generates:
 * - Consolidated markdown summary
 * - Machine-readable JSON output
 * - Regression detection
 */

interface LoadTestMetrics {
  testName: string;
  operationCount: number;
  totalTimeMs: number;
  avgTimePerOpMs: number;
  transactionsPerSecond: number;
  totalGasUsed: string;
  avgGasPerOp: string;
  timestamp: string;
}

interface BenchmarkResult {
  scenario: string;
  operation: string;
  iterations: number;
  minTimeMs: number;
  maxTimeMs: number;
  avgTimeMs: number;
  medianTimeMs: number;
  minGas: string;
  maxGas: string;
  avgGas: string;
  stateSize?: number;
  timestamp: string;
}

interface ComparisonResult {
  metric: string;
  emptyState: number;
  partialState: number;
  fullState: number;
  degradation: string;
}

class ReportGenerator {
  private reportsDir: string;
  private benchmarksDir: string;
  private outputFile: string;

  constructor() {
    this.reportsDir = path.join(__dirname, "../reports");
    this.benchmarksDir = path.join(__dirname, "../benchmarks");
    this.outputFile = path.join(this.reportsDir, "performance-summary.md");
  }

  async generate(): Promise<void> {
    console.log("🔍 Generating Performance Report...\n");

    let markdown = this.generateHeader();
    
    // Load test results
    const loadTestData = this.loadJSON<{ metrics: LoadTestMetrics[] }>("load-test-results.json");
    if (loadTestData) {
      markdown += this.generateLoadTestSection(loadTestData.metrics);
    }

    // Benchmark results
    const benchmarkData = this.loadBenchmarkJSON();
    if (benchmarkData) {
      markdown += this.generateBenchmarkSection(benchmarkData.benchmarks, benchmarkData.comparisons);
    }

    // Gas report
    const gasReport = this.loadGasReport();
    if (gasReport) {
      markdown += this.generateGasSection(gasReport);
    }

    // Regression analysis
    markdown += this.generateRegressionSection(benchmarkData);

    // Footer
    markdown += this.generateFooter();

    // Save report
    fs.writeFileSync(this.outputFile, markdown);
    console.log(`✅ Performance summary saved to: ${this.outputFile}\n`);

    // Also save as JSON for machine processing
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      loadTests: loadTestData?.metrics || [],
      benchmarks: benchmarkData?.benchmarks || [],
      comparisons: benchmarkData?.comparisons || [],
    };

    const jsonFile = path.join(this.reportsDir, "performance-summary.json");
    fs.writeFileSync(jsonFile, JSON.stringify(jsonOutput, null, 2));
    console.log(`✅ JSON summary saved to: ${jsonFile}\n`);
  }

  private generateHeader(): string {
    const now = new Date().toISOString();
    return `# AccessControl Performance Report

**Generated:** ${now}  
**Git Commit:** ${process.env.GIT_COMMIT || "N/A"}

---

## Executive Summary

This report consolidates performance metrics from load testing, benchmarking, and gas profiling.

`;
  }

  private generateLoadTestSection(metrics: LoadTestMetrics[]): string {
    if (!metrics || metrics.length === 0) {
      return "## Load Test Results\n\n_No load test data available_\n\n";
    }

    let section = "## Load Test Results\n\n";
    section += "| Test Name | Operations | Avg Time/Op | TPS | Avg Gas/Op |\n";
    section += "|-----------|------------|-------------|-----|------------|\n";

    metrics.forEach(m => {
      section += `| ${m.testName} | ${m.operationCount} | ${m.avgTimePerOpMs.toFixed(2)}ms | ${m.transactionsPerSecond.toFixed(2)} | ${m.avgGasPerOp} |\n`;
    });

    section += "\n### Key Insights\n\n";
    
    const fastest = metrics.reduce((prev, curr) => 
      curr.avgTimePerOpMs < prev.avgTimePerOpMs ? curr : prev
    );
    const slowest = metrics.reduce((prev, curr) => 
      curr.avgTimePerOpMs > prev.avgTimePerOpMs ? curr : prev
    );

    section += `- **Fastest Operation:** ${fastest.testName} (${fastest.avgTimePerOpMs.toFixed(2)}ms avg)\n`;
    section += `- **Slowest Operation:** ${slowest.testName} (${slowest.avgTimePerOpMs.toFixed(2)}ms avg)\n`;
    section += `- **Total Tests:** ${metrics.length}\n\n`;

    return section;
  }

  private generateBenchmarkSection(
    benchmarks: BenchmarkResult[],
    comparisons: ComparisonResult[]
  ): string {
    if (!benchmarks || benchmarks.length === 0) {
      return "## Benchmark Results\n\n_No benchmark data available_\n\n";
    }

    let section = "## Benchmark Results\n\n";
    section += "### Detailed Timing Analysis\n\n";
    section += "| Scenario | Operation | Iterations | Min (ms) | Avg (ms) | Max (ms) | Median (ms) |\n";
    section += "|----------|-----------|------------|----------|----------|----------|-------------|\n";

    benchmarks.forEach(b => {
      section += `| ${b.scenario} | ${b.operation} | ${b.iterations} | ${b.minTimeMs.toFixed(4)} | ${b.avgTimeMs.toFixed(4)} | ${b.maxTimeMs.toFixed(4)} | ${b.medianTimeMs.toFixed(4)} |\n`;
    });

    section += "\n### Gas Usage Analysis\n\n";
    section += "| Scenario | Avg Gas | Min Gas | Max Gas |\n";
    section += "|----------|---------|---------|----------|\n";

    benchmarks.filter(b => b.avgGas !== "0").forEach(b => {
      section += `| ${b.scenario} | ${b.avgGas} | ${b.minGas} | ${b.maxGas} |\n`;
    });

    if (comparisons && comparisons.length > 0) {
      section += "\n### State Impact Comparison\n\n";
      section += "| Metric | Empty State | Partial State | Full State | Degradation |\n";
      section += "|--------|-------------|---------------|------------|-------------|\n";

      comparisons.forEach(c => {
        const emptyVal = typeof c.emptyState === 'number' ? c.emptyState.toFixed(4) : c.emptyState;
        const partialVal = typeof c.partialState === 'number' ? c.partialState.toFixed(4) : c.partialState;
        const fullVal = typeof c.fullState === 'number' ? c.fullState.toFixed(4) : c.fullState;
        section += `| ${c.metric} | ${emptyVal} | ${partialVal} | ${fullVal} | ${c.degradation} |\n`;
      });

      section += "\n**Note:** Degradation shows performance impact from empty to full state.\n\n";
    }

    return section;
  }

  private generateGasSection(gasReport: string): string {
    let section = "## Gas Profiling\n\n";
    section += "```\n";
    section += gasReport;
    section += "\n```\n\n";
    return section;
  }

  private generateRegressionSection(benchmarkData: any): string {
    let section = "## Regression Analysis\n\n";

    const historicalDir = path.join(this.benchmarksDir, "historical");
    if (!fs.existsSync(historicalDir)) {
      section += "_No historical data available for comparison_\n\n";
      return section;
    }

    const historicalFiles = fs.readdirSync(historicalDir)
      .filter(f => f.startsWith("benchmark-") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (historicalFiles.length === 0) {
      section += "_No historical benchmarks found_\n\n";
      return section;
    }

    const previousFile = path.join(historicalDir, historicalFiles[0]);
    const previousData = JSON.parse(fs.readFileSync(previousFile, "utf-8"));

    if (!benchmarkData || !previousData.benchmarks) {
      section += "_Unable to compare with previous benchmark_\n\n";
      return section;
    }

    section += `Comparing with previous benchmark from: ${previousData.timestamp}\n\n`;
    section += "| Operation | Previous Avg | Current Avg | Change |\n";
    section += "|-----------|--------------|-------------|--------|\n";

    benchmarkData.benchmarks.forEach((current: BenchmarkResult) => {
      const previous = previousData.benchmarks.find(
        (b: BenchmarkResult) => b.scenario === current.scenario && b.operation === current.operation
      );

      if (previous) {
        const change = ((current.avgTimeMs - previous.avgTimeMs) / previous.avgTimeMs * 100);
        const changeStr = change > 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
        const indicator = change > 10 ? " ⚠️" : change < -10 ? " ✅" : "";
        
        section += `| ${current.scenario} | ${previous.avgTimeMs.toFixed(4)}ms | ${current.avgTimeMs.toFixed(4)}ms | ${changeStr}${indicator} |\n`;
      }
    });

    section += "\n**Legend:** ⚠️ = Regression (>10% slower) | ✅ = Improvement (>10% faster)\n\n";

    return section;
  }

  private generateFooter(): string {
    return `---

## Recommendations

1. **Monitor gas costs** - Ensure operations stay within acceptable limits
2. **Track state growth** - Performance degrades with more revoked credentials
3. **Optimize hot paths** - Focus on frequently called operations
4. **Set up CI alerts** - Detect regressions early

## Next Steps

- Review benchmarks regularly after contract changes
- Archive current results for historical comparison
- Investigate any significant performance degradations
- Consider optimization opportunities for high-gas operations

---

*Generated by AccessControl Performance Testing Suite*
`;
  }

  private loadJSON<T>(filename: string): T | null {
    const filepath = path.join(this.reportsDir, filename);
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️  ${filename} not found`);
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(filepath, "utf-8"));
    } catch (error) {
      console.error(`❌ Error reading ${filename}:`, error);
      return null;
    }
  }

  private loadBenchmarkJSON(): { benchmarks: BenchmarkResult[], comparisons: ComparisonResult[] } | null {
    const filepath = path.join(this.benchmarksDir, "benchmark-latest.json");
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️  benchmark-latest.json not found`);
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(filepath, "utf-8"));
    } catch (error) {
      console.error(`❌ Error reading benchmark-latest.json:`, error);
      return null;
    }
  }

  private loadGasReport(): string | null {
    const filepath = path.join(this.reportsDir, "gas-report.txt");
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️  gas-report.txt not found`);
      return null;
    }
    try {
      return fs.readFileSync(filepath, "utf-8");
    } catch (error) {
      console.error(`❌ Error reading gas-report.txt:`, error);
      return null;
    }
  }
}

// Run the generator
const generator = new ReportGenerator();
generator.generate().catch(console.error);
