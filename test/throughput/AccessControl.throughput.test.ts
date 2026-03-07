import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { OnChainService, ECDSACryptoService } from "@mrazakos/vc-ecdsa-crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * Throughput & Arrival Rate Testing Suite for AccessControl Contract
 *
 * Purpose: Analyze contract performance under increasing transaction load
 *
 * Key Metrics:
 * - Transaction Arrival Rate (TX/s): Rate at which transactions are submitted
 * - Transaction Throughput (TX/s): Rate at which transactions are processed
 * - Average Latency (ms): Time from submission to confirmation
 * - Average Gas Consumption: Gas used per transaction
 * - Success Rate (%): Percentage of successful transactions
 *
 * Test Strategy:
 * - Progressive load increase from 10 to 1000 transactions
 * - Multiple runs per load level for statistical significance
 * - Capture time-series data for visualization
 */

// Test configuration
const THROUGHPUT_CONFIG = {
  // Load levels to test (number of transactions)
  LOAD_LEVELS: [10, 25, 50, 100, 200, 500, 1000],

  // Number of runs per load level for averaging
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

interface TransactionRecord {
  txNumber: number;
  submissionTime: number;
  confirmationTime: number;
  latencyMs: number;
  gasUsed: string;
  success: boolean;
}

interface ThroughputMetrics {
  operationType: string;
  loadLevel: number;
  runNumber: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  successRate: number;

  // Time metrics
  totalDurationMs: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  // Throughput metrics
  submissionRate: number; // TX/s - arrival rate
  processingThroughput: number; // TX/s - actual throughput

  // Gas metrics
  totalGasUsed: string;
  avgGasPerTx: string;
  minGas: string;
  maxGas: string;

  // Time-series data for visualization
  transactionRecords: TransactionRecord[];

  timestamp: string;
}

interface AggregatedMetrics {
  operationType: string;
  loadLevel: number;
  numberOfRuns: number;

  // Averaged metrics
  avgSuccessRate: number;
  avgLatencyMs: number;
  stdDevLatencyMs: number;
  avgThroughput: number;
  avgGasPerTx: string;

  // Individual run data
  runs: ThroughputMetrics[];
}

describe("AccessControl - Throughput & Arrival Rate Testing", function () {
  let cryptoService: ECDSACryptoService;
  let onChainService: OnChainService;
  let accessControl: Contract;
  let owner: SignerWithAddress;
  let users: SignerWithAddress[];

  let allMetrics: ThroughputMetrics[] = [];
  let aggregatedResults: AggregatedMetrics[] = [];

  this.timeout(600000); // 10 minutes for long-running tests

  before(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    users = signers.slice(1, THROUGHPUT_CONFIG.CONCURRENT_USERS + 1);

    cryptoService = new ECDSACryptoService();
    onChainService = new OnChainService(cryptoService);

    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControl",
    );
    accessControl = await AccessControlFactory.deploy();
    await accessControl.deployed();

    console.log("\n" + "=".repeat(80));
    console.log("THROUGHPUT & ARRIVAL RATE TEST CONFIGURATION");
    console.log("=".repeat(80));
    console.log(
      `Load Levels: ${THROUGHPUT_CONFIG.LOAD_LEVELS.join(", ")} transactions`,
    );
    console.log(`Runs per Level: ${THROUGHPUT_CONFIG.RUNS_PER_LEVEL}`);
    console.log(`Concurrent Users: ${THROUGHPUT_CONFIG.CONCURRENT_USERS}`);
    console.log(
      `Operations Tested: ${Object.keys(THROUGHPUT_CONFIG.OPERATIONS)
        .filter((k) => (THROUGHPUT_CONFIG.OPERATIONS as any)[k])
        .join(", ")}`,
    );
    console.log("=".repeat(80) + "\n");
  });

  after(async function () {
    // Save raw metrics
    const reportsDir = path.join(__dirname, "../../reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rawDataFile = path.join(
      reportsDir,
      `throughput-raw-${timestamp}.json`,
    );

    fs.writeFileSync(
      rawDataFile,
      JSON.stringify(
        {
          config: THROUGHPUT_CONFIG,
          timestamp: new Date().toISOString(),
          rawMetrics: allMetrics,
          aggregatedMetrics: aggregatedResults,
        },
        null,
        2,
      ),
    );

    // Save latest
    const latestFile = path.join(reportsDir, "throughput-latest.json");
    fs.writeFileSync(
      latestFile,
      JSON.stringify(
        {
          config: THROUGHPUT_CONFIG,
          timestamp: new Date().toISOString(),
          rawMetrics: allMetrics,
          aggregatedMetrics: aggregatedResults,
        },
        null,
        2,
      ),
    );

    console.log(`\n📊 Throughput test results saved to: ${rawDataFile}`);
    console.log(`📊 Latest results: ${latestFile}`);

    // Print summary
    printSummary();
  });

  function printSummary() {
    console.log("\n" + "=".repeat(80));
    console.log("THROUGHPUT TEST SUMMARY");
    console.log("=".repeat(80));

    aggregatedResults.forEach((agg) => {
      console.log(`\n${agg.operationType} - Load Level: ${agg.loadLevel} TX`);
      console.log(`  Number of Runs Averaged: ${agg.numberOfRuns}`);
      console.log(`  Average Success Rate: ${agg.avgSuccessRate.toFixed(2)}%`);
      console.log(
        `  Average Latency: ${agg.avgLatencyMs.toFixed(
          2,
        )} ± ${agg.stdDevLatencyMs.toFixed(2)} ms`,
      );
      console.log(`  Average Throughput: ${agg.avgThroughput.toFixed(2)} TX/s`);
      console.log(`  Average Gas per TX: ${agg.avgGasPerTx}`);
    });

    console.log("\n" + "=".repeat(80));
    console.log("KEY OBSERVATIONS:");
    console.log("=".repeat(80));

    // Analyze latency trend
    const lockRegMetrics = aggregatedResults.filter(
      (m) => m.operationType === "Lock Registration",
    );
    if (lockRegMetrics.length > 1) {
      const firstLatency = lockRegMetrics[0].avgLatencyMs;
      const lastLatency =
        lockRegMetrics[lockRegMetrics.length - 1].avgLatencyMs;
      const latencyIncrease =
        ((lastLatency - firstLatency) / firstLatency) * 100;

      console.log(`\n1. Latency Scaling (Lock Registration):`);
      console.log(
        `   - At ${lockRegMetrics[0].loadLevel} TX: ${firstLatency.toFixed(
          2,
        )} ms`,
      );
      console.log(
        `   - At ${
          lockRegMetrics[lockRegMetrics.length - 1].loadLevel
        } TX: ${lastLatency.toFixed(2)} ms`,
      );
      console.log(
        `   - Change: ${
          latencyIncrease > 0 ? "+" : ""
        }${latencyIncrease.toFixed(2)}%`,
      );

      const firstThroughput = lockRegMetrics[0].avgThroughput;
      const lastThroughput =
        lockRegMetrics[lockRegMetrics.length - 1].avgThroughput;

      console.log(`\n2. Throughput Scaling:`);
      console.log(
        `   - At ${lockRegMetrics[0].loadLevel} TX: ${firstThroughput.toFixed(
          2,
        )} TX/s`,
      );
      console.log(
        `   - At ${
          lockRegMetrics[lockRegMetrics.length - 1].loadLevel
        } TX: ${lastThroughput.toFixed(2)} TX/s`,
      );
    }

    console.log("=".repeat(80) + "\n");
  }

  function calculateStatistics(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance =
      values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      stdDev,
      min: Math.min(...values),
      max: Math.max(...values),
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  async function runThroughputTest(
    operationType: string,
    loadLevel: number,
    runNumber: number,
    testFn: (
      txNum: number,
    ) => Promise<{
      gasUsed: string;
      success: boolean;
      confirmationTime: number;
    }>,
  ): Promise<ThroughputMetrics> {
    console.log(
      `   Running ${operationType} - Load: ${loadLevel} TX, Run: ${
        runNumber + 1
      }/${THROUGHPUT_CONFIG.RUNS_PER_LEVEL}`,
    );

    const transactionRecords: TransactionRecord[] = [];
    const startTime = Date.now();

    // Submit all transactions and track timing
    const submissions: Promise<{
      txNum: number;
      submissionTime: number;
      result: any;
    }>[] = [];

    for (let i = 0; i < loadLevel; i++) {
      const txNum = i;
      const submissionTime = Date.now();

      const promise = testFn(txNum)
        .then((result) => ({
          txNum,
          submissionTime,
          result,
        }))
        .catch((error) => ({
          txNum,
          submissionTime,
          result: {
            gasUsed: "0",
            success: false,
            confirmationTime: Date.now(),
            error,
          },
        }));

      submissions.push(promise);
    }

    // Wait for all transactions to complete
    const results = await Promise.all(submissions);
    const endTime = Date.now();

    // Process results
    let successCount = 0;
    let failCount = 0;

    results.forEach(({ txNum, submissionTime, result }) => {
      const confirmationTime = result.confirmationTime;
      const latencyMs = confirmationTime - submissionTime;

      transactionRecords.push({
        txNumber: txNum,
        submissionTime,
        confirmationTime,
        latencyMs,
        gasUsed: result.gasUsed,
        success: result.success,
      });

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    });

    const totalDurationMs = endTime - startTime;

    // Calculate statistics
    const latencies = transactionRecords.map((r) => r.latencyMs);
    const latencyStats = calculateStatistics(latencies);

    const gasValues = transactionRecords
      .filter((r) => r.success)
      .map((r) => ethers.BigNumber.from(r.gasUsed));

    const totalGas = gasValues.reduce(
      (a, b) => a.add(b),
      ethers.BigNumber.from(0),
    );

    const avgGas =
      gasValues.length > 0
        ? totalGas.div(gasValues.length)
        : ethers.BigNumber.from(0);

    const minGas =
      gasValues.length > 0
        ? gasValues.reduce((a, b) => (a.lt(b) ? a : b))
        : ethers.BigNumber.from(0);

    const maxGas =
      gasValues.length > 0
        ? gasValues.reduce((a, b) => (a.gt(b) ? a : b))
        : ethers.BigNumber.from(0);

    const metrics: ThroughputMetrics = {
      operationType,
      loadLevel,
      runNumber: runNumber + 1,
      totalTransactions: loadLevel,
      successfulTransactions: successCount,
      failedTransactions: failCount,
      successRate: (successCount / loadLevel) * 100,

      totalDurationMs,
      avgLatencyMs: latencyStats.mean,
      minLatencyMs: latencyStats.min,
      maxLatencyMs: latencyStats.max,
      medianLatencyMs: latencyStats.median,
      p95LatencyMs: latencyStats.p95,
      p99LatencyMs: latencyStats.p99,

      submissionRate: (loadLevel / totalDurationMs) * 1000,
      processingThroughput: (successCount / totalDurationMs) * 1000,

      totalGasUsed: totalGas.toString(),
      avgGasPerTx: avgGas.toString(),
      minGas: minGas.toString(),
      maxGas: maxGas.toString(),

      transactionRecords,
      timestamp: new Date().toISOString(),
    };

    allMetrics.push(metrics);

    console.log(
      `      ✓ Success: ${successCount}/${loadLevel} (${metrics.successRate.toFixed(
        1,
      )}%)`,
    );
    console.log(`      ✓ Avg Latency: ${metrics.avgLatencyMs.toFixed(2)} ms`);
    console.log(
      `      ✓ Throughput: ${metrics.processingThroughput.toFixed(2)} TX/s`,
    );

    return metrics;
  }

  function aggregateRuns(
    operationType: string,
    loadLevel: number,
    runs: ThroughputMetrics[],
  ): AggregatedMetrics {
    const avgSuccessRate =
      runs.reduce((sum, r) => sum + r.successRate, 0) / runs.length;
    const latencies = runs.map((r) => r.avgLatencyMs);
    const avgLatencyMs =
      latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const stdDevLatencyMs = Math.sqrt(
      latencies.reduce((sum, l) => sum + Math.pow(l - avgLatencyMs, 2), 0) /
        latencies.length,
    );
    const avgThroughput =
      runs.reduce((sum, r) => sum + r.processingThroughput, 0) / runs.length;

    // Average gas
    const gasValues = runs.map((r) => ethers.BigNumber.from(r.avgGasPerTx));
    const avgGas = gasValues
      .reduce((a, b) => a.add(b), ethers.BigNumber.from(0))
      .div(gasValues.length);

    const aggregated: AggregatedMetrics = {
      operationType,
      loadLevel,
      numberOfRuns: runs.length,
      avgSuccessRate,
      avgLatencyMs,
      stdDevLatencyMs,
      avgThroughput,
      avgGasPerTx: avgGas.toString(),
      runs,
    };

    aggregatedResults.push(aggregated);
    return aggregated;
  }

  describe("Progressive Load Testing - Lock Registration", function () {
    THROUGHPUT_CONFIG.LOAD_LEVELS.forEach((loadLevel) => {
      it(`Should handle ${loadLevel} lock registrations with ${THROUGHPUT_CONFIG.RUNS_PER_LEVEL} runs`, async function () {
        console.log(`\n  Testing Load Level: ${loadLevel} transactions`);

        const runs: ThroughputMetrics[] = [];

        for (let run = 0; run < THROUGHPUT_CONFIG.RUNS_PER_LEVEL; run++) {
          const metrics = await runThroughputTest(
            "Lock Registration",
            loadLevel,
            run,
            async (txNum: number) => {
              try {
                const identity = await cryptoService.generateIdentity();
                const userIndex = txNum % users.length;
                const tx = await accessControl
                  .connect(users[userIndex])
                  .registerLock(identity.address);
                const receipt = await tx.wait();
                const confirmationTime = Date.now();

                return {
                  gasUsed: receipt.gasUsed.toString(),
                  success: true,
                  confirmationTime,
                };
              } catch (error) {
                return {
                  gasUsed: "0",
                  success: false,
                  confirmationTime: Date.now(),
                };
              }
            },
          );

          runs.push(metrics);
        }

        const aggregated = aggregateRuns("Lock Registration", loadLevel, runs);

        console.log(
          `\n  📊 Aggregated Results (${aggregated.numberOfRuns} runs):`,
        );
        console.log(
          `      Average Success Rate: ${aggregated.avgSuccessRate.toFixed(
            2,
          )}%`,
        );
        console.log(
          `      Average Latency: ${aggregated.avgLatencyMs.toFixed(
            2,
          )} ± ${aggregated.stdDevLatencyMs.toFixed(2)} ms`,
        );
        console.log(
          `      Average Throughput: ${aggregated.avgThroughput.toFixed(
            2,
          )} TX/s`,
        );
        console.log(`      Average Gas per TX: ${aggregated.avgGasPerTx}`);

        expect(aggregated.avgSuccessRate).to.be.greaterThan(95);
      });
    });
  });

  describe("Progressive Load Testing - Credential Revocation", function () {
    THROUGHPUT_CONFIG.LOAD_LEVELS.forEach((loadLevel, levelIndex) => {
      it(`Should handle ${loadLevel} credential revocations with ${THROUGHPUT_CONFIG.RUNS_PER_LEVEL} runs`, async function () {
        console.log(`\n  Testing Load Level: ${loadLevel} transactions`);

        const runs: ThroughputMetrics[] = [];

        for (let run = 0; run < THROUGHPUT_CONFIG.RUNS_PER_LEVEL; run++) {
          // Create a fresh lock for each run to avoid duplicate revocations
          const identity = await cryptoService.generateIdentity();
          const lockKeyPair = {
            publicKey: identity.address,
            privateKey: identity.privateKey,
          };

          const tx = await accessControl
            .connect(owner)
            .registerLock(identity.address);
          const receipt = await tx.wait();
          const event = receipt.events?.find(
            (e: any) => e.event === "LockRegistered",
          );
          const lockId = event?.args?.lockId.toNumber();

          console.log(`    Run ${run + 1}: Created lock ${lockId}`);

          const metrics = await runThroughputTest(
            "Credential Revocation",
            loadLevel,
            run,
            async (txNum: number) => {
              try {
                const userMetaData = {
                  email: `user${levelIndex}_${run}_${txNum}@example.com`,
                  timestamp: Date.now() + txNum,
                };

                const userMetaDataHash = cryptoService.hash(
                  JSON.stringify(userMetaData),
                );
                const issuanceDate = new Date().toISOString();
                const vcInput = { userMetaDataHash, issuanceDate };
                const vcHashToSign = cryptoService.hash(
                  JSON.stringify(vcInput),
                );

                const signResult = await onChainService.signForBlockchain(
                  vcHashToSign,
                  lockKeyPair.privateKey,
                );

                const tx = await accessControl
                  .connect(owner)
                  .revokeCredential(
                    lockId,
                    signResult.signedHash,
                    signResult.signature,
                  );
                const receipt = await tx.wait();
                const confirmationTime = Date.now();

                return {
                  gasUsed: receipt.gasUsed.toString(),
                  success: true,
                  confirmationTime,
                };
              } catch (error) {
                return {
                  gasUsed: "0",
                  success: false,
                  confirmationTime: Date.now(),
                };
              }
            },
          );

          runs.push(metrics);
        }

        const aggregated = aggregateRuns(
          "Credential Revocation",
          loadLevel,
          runs,
        );

        console.log(
          `\n  📊 Aggregated Results (${aggregated.numberOfRuns} runs):`,
        );
        console.log(
          `      Average Success Rate: ${aggregated.avgSuccessRate.toFixed(
            2,
          )}%`,
        );
        console.log(
          `      Average Latency: ${aggregated.avgLatencyMs.toFixed(
            2,
          )} ± ${aggregated.stdDevLatencyMs.toFixed(2)} ms`,
        );
        console.log(
          `      Average Throughput: ${aggregated.avgThroughput.toFixed(
            2,
          )} TX/s`,
        );
        console.log(`      Average Gas per TX: ${aggregated.avgGasPerTx}`);

        expect(aggregated.avgSuccessRate).to.be.greaterThan(95);
      });
    });
  });
});
