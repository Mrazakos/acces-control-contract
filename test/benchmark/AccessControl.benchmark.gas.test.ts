import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { OnChainService, ECDSACryptoService } from "@mrazakos/vc-ecdsa-crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * Benchmark Testing Suite for AccessControl Contract
 *
 * Detailed performance analysis and comparison across different scenarios
 * Focuses on timing precision, gas efficiency, and state impact
 */

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

describe("AccessControl - Performance Benchmarks", function () {
  let cryptoService: ECDSACryptoService;
  let onChainService: OnChainService;
  let accessControl: Contract;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let benchmarkResults: BenchmarkResult[] = [];
  let comparisons: ComparisonResult[] = [];

  before(async function () {
    [owner, user] = await ethers.getSigners();
    cryptoService = new ECDSACryptoService();
    onChainService = new OnChainService(cryptoService);

    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControl",
    );
    accessControl = await AccessControlFactory.deploy();
    await accessControl.deployed();

    console.log("\n📊 Starting Benchmark Tests...\n");
  });

  after(async function () {
    // Save benchmark results
    const benchmarksDir = path.join(__dirname, "../../benchmarks");
    if (!fs.existsSync(benchmarksDir)) {
      fs.mkdirSync(benchmarksDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const resultsFile = path.join(benchmarksDir, `benchmark-${timestamp}.json`);

    const report = {
      timestamp: new Date().toISOString(),
      gitCommit: process.env.GIT_COMMIT || "unknown",
      benchmarks: benchmarkResults,
      comparisons: comparisons,
    };

    fs.writeFileSync(resultsFile, JSON.stringify(report, null, 2));

    // Also save as latest
    const latestFile = path.join(benchmarksDir, "benchmark-latest.json");
    fs.writeFileSync(latestFile, JSON.stringify(report, null, 2));

    console.log(`\n📁 Benchmark results saved to: ${resultsFile}`);

    // Print comparison summary
    console.log("\n" + "=".repeat(80));
    console.log("PERFORMANCE COMPARISON: Empty vs Partial vs Full State");
    console.log("=".repeat(80));
    comparisons.forEach((c) => {
      console.log(`\n${c.metric}:`);
      console.log(`   Empty State:   ${c.emptyState.toFixed(4)}ms`);
      console.log(`   Partial State: ${c.partialState.toFixed(4)}ms`);
      console.log(`   Full State:    ${c.fullState.toFixed(4)}ms`);
      console.log(`   Degradation:   ${c.degradation}`);
    });
    console.log("=".repeat(80) + "\n");
  });

  /**
   * Helper function to run a benchmark with multiple iterations
   */
  async function runBenchmark(
    scenario: string,
    operation: string,
    iterations: number,
    testFn: () => Promise<{ timeMs: number; gasUsed?: string }>,
    stateSize?: number,
  ): Promise<BenchmarkResult> {
    const times: number[] = [];
    const gases: string[] = [];

    for (let i = 0; i < iterations; i++) {
      const result = await testFn();
      times.push(result.timeMs);
      if (result.gasUsed) {
        gases.push(result.gasUsed);
      }
    }

    times.sort((a, b) => a - b);
    const medianTimeMs = times[Math.floor(times.length / 2)];

    const gasNumbers = gases.map((g) => ethers.BigNumber.from(g));
    const avgGasBN =
      gasNumbers.length > 0
        ? gasNumbers
            .reduce((a, b) => a.add(b), ethers.BigNumber.from(0))
            .div(gases.length)
        : ethers.BigNumber.from(0);

    const result: BenchmarkResult = {
      scenario,
      operation,
      iterations,
      minTimeMs: Math.min(...times),
      maxTimeMs: Math.max(...times),
      avgTimeMs: times.reduce((a, b) => a + b, 0) / times.length,
      medianTimeMs,
      minGas:
        gasNumbers.length > 0
          ? gasNumbers.reduce((a, b) => (a.lt(b) ? a : b)).toString()
          : "0",
      maxGas:
        gasNumbers.length > 0
          ? gasNumbers.reduce((a, b) => (a.gt(b) ? a : b)).toString()
          : "0",
      avgGas: avgGasBN.toString(),
      stateSize,
      timestamp: new Date().toISOString(),
    };

    benchmarkResults.push(result);

    console.log(`   ✓ ${scenario} - ${operation}:`);
    console.log(
      `      Avg: ${result.avgTimeMs.toFixed(
        4,
      )}ms | Median: ${result.medianTimeMs.toFixed(4)}ms`,
    );
    if (result.avgGas !== "0") {
      console.log(`      Avg Gas: ${result.avgGas}`);
    }

    return result;
  }

  describe("Lock Registration Benchmark", function () {
    it("Should benchmark lock registration with precise timing", async function () {
      const iterations = 20;

      await runBenchmark(
        "Lock Registration",
        "registerLock()",
        iterations,
        async () => {
          const identity = await cryptoService.generateIdentity();
          const start = performance.now();
          const tx = await accessControl
            .connect(user)
            .registerLock(identity.address);
          const receipt = await tx.wait();
          const end = performance.now();

          return {
            timeMs: end - start,
            gasUsed: receipt.gasUsed.toString(),
          };
        },
      );
    });
  });

  describe("Credential Revocation Benchmark - State Impact", function () {
    let emptyLockId: number;
    let partialLockId: number;
    let fullLockId: number;
    let keyPairs: { [key: string]: { publicKey: string; privateKey: string } } =
      {};

    before(async function () {
      // Create three locks with different revocation counts
      console.log("\n   Setting up locks with different states...");

      // Empty lock (0 revocations)
      const emptyIdentity = await cryptoService.generateIdentity();
      keyPairs["empty"] = {
        publicKey: emptyIdentity.address,
        privateKey: emptyIdentity.privateKey,
      };
      let tx = await accessControl
        .connect(owner)
        .registerLock(keyPairs["empty"].publicKey);
      let receipt = await tx.wait();
      emptyLockId = receipt.events
        ?.find((e: any) => e.event === "LockRegistered")
        ?.args?.lockId.toNumber();

      // Partial lock (50 revocations)
      const partialIdentity = await cryptoService.generateIdentity();
      keyPairs["partial"] = {
        publicKey: partialIdentity.address,
        privateKey: partialIdentity.privateKey,
      };
      tx = await accessControl
        .connect(owner)
        .registerLock(keyPairs["partial"].publicKey);
      receipt = await tx.wait();
      partialLockId = receipt.events
        ?.find((e: any) => e.event === "LockRegistered")
        ?.args?.lockId.toNumber();

      for (let i = 0; i < 50; i++) {
        const userMetaData = {
          email: `partial${i}@example.com`,
          timestamp: Date.now() + i,
        };
        const userMetaDataHash = cryptoService.hash(
          JSON.stringify(userMetaData),
        );
        const vcInput = {
          userMetaDataHash,
          issuanceDate: new Date().toISOString(),
        };
        const vcHashToSign = cryptoService.hash(JSON.stringify(vcInput));
        const signResult = await onChainService.signForBlockchain(
          vcHashToSign,
          keyPairs["partial"].privateKey,
        );
        const vcHash = signResult.signedHash;
        const authSignature = signResult.signature;
        await accessControl
          .connect(owner)
          .revokeCredential(partialLockId, vcHash, authSignature);
      }

      // Full lock (200 revocations)
      const fullIdentity = await cryptoService.generateIdentity();
      keyPairs["full"] = {
        publicKey: fullIdentity.address,
        privateKey: fullIdentity.privateKey,
      };
      tx = await accessControl
        .connect(owner)
        .registerLock(keyPairs["full"].publicKey);
      receipt = await tx.wait();
      fullLockId = receipt.events
        ?.find((e: any) => e.event === "LockRegistered")
        ?.args?.lockId.toNumber();

      for (let i = 0; i < 200; i++) {
        const userMetaData = {
          email: `full${i}@example.com`,
          timestamp: Date.now() + i,
        };
        const userMetaDataHash = cryptoService.hash(
          JSON.stringify(userMetaData),
        );
        const vcInput = {
          userMetaDataHash,
          issuanceDate: new Date().toISOString(),
        };
        const vcHashToSign = cryptoService.hash(JSON.stringify(vcInput));
        const signResult = await onChainService.signForBlockchain(
          vcHashToSign,
          keyPairs["full"].privateKey,
        );
        const vcHash = signResult.signedHash;
        const authSignature = signResult.signature;
        await accessControl
          .connect(owner)
          .revokeCredential(fullLockId, vcHash, authSignature);
      }

      console.log(`   ✓ Empty lock (ID ${emptyLockId}): 0 revocations`);
      console.log(`   ✓ Partial lock (ID ${partialLockId}): 50 revocations`);
      console.log(`   ✓ Full lock (ID ${fullLockId}): 200 revocations\n`);
    });

    it("Should compare revocation performance across different states", async function () {
      const iterations = 10;

      // Benchmark on empty lock
      const emptyResult = await runBenchmark(
        "Revocation - Empty State",
        "revokeCredential()",
        iterations,
        async () => {
          const userMetaData = {
            email: `empty-bench${Math.random()}@example.com`,
            timestamp: Date.now(),
          };
          const userMetaDataHash = cryptoService.hash(
            JSON.stringify(userMetaData),
          );
          const vcInput = {
            userMetaDataHash,
            issuanceDate: new Date().toISOString(),
          };
          const vcHashToSign = cryptoService.hash(JSON.stringify(vcInput));
          const signResult = await onChainService.signForBlockchain(
            vcHashToSign,
            keyPairs["empty"].privateKey,
          );
          const vcHash = signResult.signedHash;
          const authSignature = signResult.signature;

          const start = performance.now();
          const tx = await accessControl
            .connect(owner)
            .revokeCredential(emptyLockId, vcHash, authSignature);
          const receipt = await tx.wait();
          const end = performance.now();

          return { timeMs: end - start, gasUsed: receipt.gasUsed.toString() };
        },
        0,
      );

      // Benchmark on partial lock
      const partialResult = await runBenchmark(
        "Revocation - Partial State",
        "revokeCredential()",
        iterations,
        async () => {
          const userMetaData = {
            email: `partial-bench${Math.random()}@example.com`,
            timestamp: Date.now(),
          };
          const userMetaDataHash = cryptoService.hash(
            JSON.stringify(userMetaData),
          );
          const vcInput = {
            userMetaDataHash,
            issuanceDate: new Date().toISOString(),
          };
          const vcHashToSign = cryptoService.hash(JSON.stringify(vcInput));
          const signResult = await onChainService.signForBlockchain(
            vcHashToSign,
            keyPairs["partial"].privateKey,
          );
          const vcHash = signResult.signedHash;
          const authSignature = signResult.signature;

          const start = performance.now();
          const tx = await accessControl
            .connect(owner)
            .revokeCredential(partialLockId, vcHash, authSignature);
          const receipt = await tx.wait();
          const end = performance.now();

          return { timeMs: end - start, gasUsed: receipt.gasUsed.toString() };
        },
        50,
      );

      // Benchmark on full lock
      const fullResult = await runBenchmark(
        "Revocation - Full State",
        "revokeCredential()",
        iterations,
        async () => {
          const userMetaData = {
            email: `full-bench${Math.random()}@example.com`,
            timestamp: Date.now(),
          };
          const userMetaDataHash = cryptoService.hash(
            JSON.stringify(userMetaData),
          );
          const vcInput = {
            userMetaDataHash,
            issuanceDate: new Date().toISOString(),
          };
          const vcHashToSign = cryptoService.hash(JSON.stringify(vcInput));
          const signResult = await onChainService.signForBlockchain(
            vcHashToSign,
            keyPairs["full"].privateKey,
          );
          const vcHash = signResult.signedHash;
          const authSignature = signResult.signature;

          const start = performance.now();
          const tx = await accessControl
            .connect(owner)
            .revokeCredential(fullLockId, vcHash, authSignature);
          const receipt = await tx.wait();
          const end = performance.now();

          return { timeMs: end - start, gasUsed: receipt.gasUsed.toString() };
        },
        200,
      );

      // Calculate degradation
      const timeDegradation = (
        ((fullResult.avgTimeMs - emptyResult.avgTimeMs) /
          emptyResult.avgTimeMs) *
        100
      ).toFixed(2);
      const gasDegradation = (
        ((parseInt(fullResult.avgGas) - parseInt(emptyResult.avgGas)) /
          parseInt(emptyResult.avgGas)) *
        100
      ).toFixed(2);

      comparisons.push({
        metric: "Revocation Time",
        emptyState: emptyResult.avgTimeMs,
        partialState: partialResult.avgTimeMs,
        fullState: fullResult.avgTimeMs,
        degradation: `${timeDegradation}%`,
      });

      comparisons.push({
        metric: "Revocation Gas",
        emptyState: parseInt(emptyResult.avgGas),
        partialState: parseInt(partialResult.avgGas),
        fullState: parseInt(fullResult.avgGas),
        degradation: `${gasDegradation}%`,
      });
    });
  });

  describe("Read Operations Benchmark", function () {
    let lockId: number;
    let revokedHash: string;
    let validHash: string;

    before(async function () {
      const identity = await cryptoService.generateIdentity();
      const keyPair = {
        publicKey: identity.address,
        privateKey: identity.privateKey,
      };

      const tx = await accessControl
        .connect(owner)
        .registerLock(keyPair.publicKey);
      const receipt = await tx.wait();
      lockId = receipt.events
        ?.find((e: any) => e.event === "LockRegistered")
        ?.args?.lockId.toNumber();

      // Revoke one credential
      const userMetaData1 = {
        email: "revoked@example.com",
        timestamp: Date.now(),
      };
      const userMetaDataHash1 = cryptoService.hash(
        JSON.stringify(userMetaData1),
      );
      const vcInput1 = {
        userMetaDataHash: userMetaDataHash1,
        issuanceDate: new Date().toISOString(),
      };
      const vcHashToSign1 = cryptoService.hash(JSON.stringify(vcInput1));
      const result1 = await onChainService.signForBlockchain(
        vcHashToSign1,
        keyPair.privateKey,
      );
      revokedHash = result1.signedHash;
      const authSig = result1.signature;
      await accessControl
        .connect(owner)
        .revokeCredential(lockId, revokedHash, authSig);

      // Create a valid hash (not revoked)
      const userMetaData2 = {
        email: "valid@example.com",
        timestamp: Date.now() + 1000,
      };
      const userMetaDataHash2 = cryptoService.hash(
        JSON.stringify(userMetaData2),
      );
      const vcInput2 = {
        userMetaDataHash: userMetaDataHash2,
        issuanceDate: new Date().toISOString(),
      };
      const vcHashToSign2 = cryptoService.hash(JSON.stringify(vcInput2));
      const result2 = await onChainService.signForBlockchain(
        vcHashToSign2,
        keyPair.privateKey,
      );
      validHash = result2.signedHash;
    });

    it("Should benchmark isCredentialRevoked() for revoked credential", async function () {
      await runBenchmark(
        "Read - Revoked Credential",
        "isCredentialRevoked()",
        50,
        async () => {
          const start = performance.now();
          await accessControl.isCredentialRevoked(lockId, revokedHash);
          const end = performance.now();
          return { timeMs: end - start };
        },
      );
    });

    it("Should benchmark isCredentialRevoked() for valid credential", async function () {
      await runBenchmark(
        "Read - Valid Credential",
        "isCredentialRevoked()",
        50,
        async () => {
          const start = performance.now();
          await accessControl.isCredentialRevoked(lockId, validHash);
          const end = performance.now();
          return { timeMs: end - start };
        },
      );
    });

    it("Should benchmark getLockInfo()", async function () {
      await runBenchmark("Read - Lock Info", "getLockInfo()", 50, async () => {
        const start = performance.now();
        await accessControl.getLockInfo(lockId);
        const end = performance.now();
        return { timeMs: end - start };
      });
    });
  });

  describe("Signature Verification Benchmark", function () {
    let lockId: number;
    let keyPair: { publicKey: string; privateKey: string };

    before(async function () {
      const identity = await cryptoService.generateIdentity();
      keyPair = {
        publicKey: identity.address,
        privateKey: identity.privateKey,
      };

      const tx = await accessControl
        .connect(owner)
        .registerLock(keyPair.publicKey);
      const receipt = await tx.wait();
      lockId = receipt.events
        ?.find((e: any) => e.event === "LockRegistered")
        ?.args?.lockId.toNumber();
    });

    it("Should benchmark transferLockOwnership with signature verification", async function () {
      await runBenchmark(
        "Ownership Transfer",
        "transferLockOwnership()",
        10,
        async () => {
          const message = ethers.utils.id("transfer-" + Date.now());
          const signResult = await onChainService.signForBlockchain(
            message,
            keyPair.privateKey,
          );
          const authSignature = signResult.signature;

          const start = performance.now();
          const tx = await accessControl
            .connect(owner)
            .transferLockOwnership(
              lockId,
              message,
              authSignature,
              user.address,
            );
          const receipt = await tx.wait();
          const end = performance.now();

          // Transfer back
          await accessControl
            .connect(user)
            .transferLockOwnership(
              lockId,
              message,
              authSignature,
              owner.address,
            );

          return { timeMs: end - start, gasUsed: receipt.gasUsed.toString() };
        },
      );
    });
  });
});
