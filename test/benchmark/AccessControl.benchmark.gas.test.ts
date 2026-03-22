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
 * Focused performance measurement:
 * - Registration performance degradation with increasing transaction count
 * - Revocation performance degradation with increasing transaction count
 */

interface DegradationDataPoint {
  transactionCount: number;
  operation: "register" | "revoke";
  avgTimeMs: number;
  avgGas: string;
  iterations: number;
  timestamp: string;
}

describe("AccessControl - Degradation Benchmarks", function () {
  let cryptoService: ECDSACryptoService;
  let onChainService: OnChainService;
  let accessControl: Contract;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let degradationData: DegradationDataPoint[] = [];

  before(async function () {
    [owner, user] = await ethers.getSigners();
    cryptoService = new ECDSACryptoService();
    onChainService = new OnChainService(cryptoService);

    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControl",
    );
    accessControl = await AccessControlFactory.deploy();
    await accessControl.deployed();

    console.log("\n📊 Starting Degradation Benchmarks...\n");
  });

  after(async function () {
    // Save degradation results
    const benchmarksDir = path.join(__dirname, "../../benchmarks");
    if (!fs.existsSync(benchmarksDir)) {
      fs.mkdirSync(benchmarksDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const resultsFile = path.join(
      benchmarksDir,
      `degradation-${timestamp}.json`,
    );

    const report = {
      timestamp: new Date().toISOString(),
      degradationData: degradationData,
    };

    fs.writeFileSync(resultsFile, JSON.stringify(report, null, 2));

    // Also save as latest
    const latestFile = path.join(benchmarksDir, "degradation-latest.json");
    fs.writeFileSync(latestFile, JSON.stringify(report, null, 2));

    console.log(`\n✅ Degradation results saved to: ${resultsFile}`);
    console.log(`📊 View data: degradation-latest.json\n`);

    // Print summary
    console.log("=".repeat(80));
    console.log("PERFORMANCE DEGRADATION SUMMARY");
    console.log("=".repeat(80));

    const registrations = degradationData.filter((d) => d.operation === "register");
    const revocations = degradationData.filter((d) => d.operation === "revoke");

    if (registrations.length > 0) {
      console.log("\n📝 REGISTRATION Performance:");
      registrations.forEach((r) => {
        console.log(
          `   At ${r.transactionCount.toString().padStart(4)} txs: ${r.avgTimeMs.toFixed(2)}ms | Gas: ${r.avgGas}`,
        );
      });
      const degradationPct = (
        ((registrations[registrations.length - 1].avgTimeMs -
          registrations[0].avgTimeMs) /
          registrations[0].avgTimeMs) *
        100
      ).toFixed(1);
      console.log(`   Degradation: ${degradationPct}%`);
    }

    if (revocations.length > 0) {
      console.log("\n🔄 REVOCATION Performance:");
      revocations.forEach((r) => {
        console.log(
          `   At ${r.transactionCount.toString().padStart(4)} txs: ${r.avgTimeMs.toFixed(2)}ms | Gas: ${r.avgGas}`,
        );
      });
      const degradationPct = (
        ((revocations[revocations.length - 1].avgTimeMs -
          revocations[0].avgTimeMs) /
          revocations[0].avgTimeMs) *
        100
      ).toFixed(1);
      console.log(`   Degradation: ${degradationPct}%`);
    }

    console.log("=".repeat(80) + "\n");
  });

  /**
   * Helper function to measure operation performance
   */
  async function measureOperation(
    iterations: number,
    testFn: () => Promise<{ timeMs: number; gasUsed?: string }>,
  ): Promise<{ avgTimeMs: number; avgGas: string }> {
    const times: number[] = [];
    const gases: string[] = [];

    for (let i = 0; i < iterations; i++) {
      const result = await testFn();
      times.push(result.timeMs);
      if (result.gasUsed) {
        gases.push(result.gasUsed);
      }
    }

    const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;

    const gasNumbers = gases.map((g) => ethers.BigNumber.from(g));
    const avgGasBN =
      gasNumbers.length > 0
        ? gasNumbers
            .reduce((a, b) => a.add(b), ethers.BigNumber.from(0))
            .div(gases.length)
        : ethers.BigNumber.from(0);

    return {
      avgTimeMs,
      avgGas: avgGasBN.toString(),
    };
  }

  describe("Registration Degradation Test", function () {
    it("Should measure registration performance degradation as transaction count increases", async function () {
      this.timeout(600000); // 10 minutes

      const transactionCounts = [0, 100, 500, 800];
      const iterations = 5;

      for (const txCount of transactionCounts) {
        console.log(
          `\n   📝 Measuring registration at ${txCount} existing transactions...`,
        );

        // Create contract state by performing dummy transactions
        if (txCount > 0) {
          const dummyIdentity = await cryptoService.generateIdentity();
          const dummyLockTx = await accessControl
            .connect(owner)
            .registerLock(dummyIdentity.address);
          await dummyLockTx.wait();
          const dummyLockId = (await dummyLockTx.wait()).events?.find(
            (e: any) => e.event === "LockRegistered",
          )?.args?.lockId;

          // Add revocations to simulate load
          for (let i = 0; i < txCount; i++) {
            const userMetaData = {
              email: `load${i}@example.com`,
              timestamp: Date.now() + i,
            };
            const userMetaDataHash = cryptoService.hash(
              JSON.stringify(userMetaData),
            );
            const vcInput = {
              userMetaDataHash,
              issuanceDate: new Date().toISOString(),
            };
            const vcHashToSign = cryptoService.hash(
              JSON.stringify(vcInput),
            );
            const signResult = await onChainService.signForBlockchain(
              vcHashToSign,
              dummyIdentity.privateKey,
            );
            const vcHash = signResult.signedHash;
            const authSignature = signResult.signature;

            const tx = await accessControl
              .connect(owner)
              .revokeCredential(dummyLockId, vcHash, authSignature);
            await tx.wait();

            if ((i + 1) % 200 === 0) {
              console.log(
                `      → Loaded ${i + 1}/${txCount} transactions`,
              );
            }
          }
        }

        // Now measure registration performance at this state
        const { avgTimeMs, avgGas } = await measureOperation(
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

        degradationData.push({
          transactionCount: txCount,
          operation: "register",
          avgTimeMs,
          avgGas,
          iterations,
          timestamp: new Date().toISOString(),
        });

        console.log(
          `      ✓ Avg: ${avgTimeMs.toFixed(2)}ms | Gas: ${avgGas}`,
        );
      }
    });
  });

  describe("Revocation Degradation Test", function () {
    it("Should measure revocation performance degradation as transaction count increases", async function () {
      this.timeout(600000); // 10 minutes

      const transactionCounts = [0, 100, 500, 800];
      const iterations = 5;

      for (const txCount of transactionCounts) {
        console.log(
          `\n   🔄 Measuring revocation at ${txCount} existing transactions...`,
        );

        // Create a fresh lock for this measurement
        const testIdentity = await cryptoService.generateIdentity();
        const testKeyPair = {
          publicKey: testIdentity.address,
          privateKey: testIdentity.privateKey,
        };

        const lockTx = await accessControl
          .connect(owner)
          .registerLock(testKeyPair.publicKey);
        const lockReceipt = await lockTx.wait();
        const lockId = lockReceipt.events
          ?.find((e: any) => e.event === "LockRegistered")
          ?.args?.lockId.toNumber();

        // Add revocations to this lock to simulate load
        if (txCount > 0) {
          for (let i = 0; i < txCount; i++) {
            const userMetaData = {
              email: `revoke-load${i}@example.com`,
              timestamp: Date.now() + i,
            };
            const userMetaDataHash = cryptoService.hash(
              JSON.stringify(userMetaData),
            );
            const vcInput = {
              userMetaDataHash,
              issuanceDate: new Date().toISOString(),
            };
            const vcHashToSign = cryptoService.hash(
              JSON.stringify(vcInput),
            );
            const signResult = await onChainService.signForBlockchain(
              vcHashToSign,
              testKeyPair.privateKey,
            );
            const vcHash = signResult.signedHash;
            const authSignature = signResult.signature;

            const tx = await accessControl
              .connect(owner)
              .revokeCredential(lockId, vcHash, authSignature);
            await tx.wait();

            if ((i + 1) % 200 === 0) {
              console.log(
                `      → Loaded ${i + 1}/${txCount} transactions`,
              );
            }
          }
        }

        // Now measure revocation performance at this state
        const { avgTimeMs, avgGas } = await measureOperation(
          iterations,
          async () => {
            const userMetaData = {
              email: `revoke-test${Math.random()}@example.com`,
              timestamp: Date.now(),
            };
            const userMetaDataHash = cryptoService.hash(
              JSON.stringify(userMetaData),
            );
            const vcInput = {
              userMetaDataHash,
              issuanceDate: new Date().toISOString(),
            };
            const vcHashToSign = cryptoService.hash(
              JSON.stringify(vcInput),
            );
            const signResult = await onChainService.signForBlockchain(
              vcHashToSign,
              testKeyPair.privateKey,
            );
            const vcHash = signResult.signedHash;
            const authSignature = signResult.signature;

            const start = performance.now();
            const tx = await accessControl
              .connect(owner)
              .revokeCredential(lockId, vcHash, authSignature);
            const receipt = await tx.wait();
            const end = performance.now();

            return {
              timeMs: end - start,
              gasUsed: receipt.gasUsed.toString(),
            };
          },
        );

        degradationData.push({
          transactionCount: txCount,
          operation: "revoke",
          avgTimeMs,
          avgGas,
          iterations,
          timestamp: new Date().toISOString(),
        });

        console.log(
          `      ✓ Avg: ${avgTimeMs.toFixed(2)}ms | Gas: ${avgGas}`,
        );
      }
    });
  });
});

