import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { OnChainService, ECDSACryptoService } from "@mrazakos/vc-ecdsa-crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * Load Testing Suite for AccessControl Contract
 *
 * Tests high-volume operations and concurrent transaction handling
 * Measures throughput, identifies bottlenecks, and validates performance under stress
 */

// Test configuration
const LOAD_CONFIG = {
  BATCH_LOCK_REGISTRATIONS: 100,
  BATCH_REVOCATIONS: 50,
  CONCURRENT_USERS: 10,
  MAX_REVOCATIONS_PER_LOCK: 100,
  STRESS_TEST_ITERATIONS: 500,
};

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

describe("AccessControl - Load & Stress Testing", function () {
  let cryptoService: ECDSACryptoService;
  let onChainService: OnChainService;
  let accessControl: Contract;
  let owner: SignerWithAddress;
  let users: SignerWithAddress[];
  let metrics: LoadTestMetrics[] = [];

  before(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    users = signers.slice(1, LOAD_CONFIG.CONCURRENT_USERS + 1);

    cryptoService = new ECDSACryptoService();
    onChainService = new OnChainService(cryptoService);

    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControl",
    );
    accessControl = await AccessControlFactory.deploy();
    await accessControl.deployed();

    console.log("\n🔧 Load Test Configuration:");
    console.log(
      `   - Batch Lock Registrations: ${LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS}`,
    );
    console.log(`   - Batch Revocations: ${LOAD_CONFIG.BATCH_REVOCATIONS}`);
    console.log(`   - Concurrent Users: ${LOAD_CONFIG.CONCURRENT_USERS}`);
    console.log(
      `   - Max Revocations Per Lock: ${LOAD_CONFIG.MAX_REVOCATIONS_PER_LOCK}`,
    );
  });

  after(async function () {
    // Save metrics to JSON file
    const reportsDir = path.join(__dirname, "../../reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const metricsFile = path.join(reportsDir, "load-test-results.json");
    const report = {
      timestamp: new Date().toISOString(),
      config: LOAD_CONFIG,
      metrics: metrics,
    };

    fs.writeFileSync(metricsFile, JSON.stringify(report, null, 2));
    console.log(`\n📊 Load test metrics saved to: ${metricsFile}`);

    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("LOAD TEST SUMMARY");
    console.log("=".repeat(80));
    metrics.forEach((m) => {
      console.log(`\n${m.testName}:`);
      console.log(`   Operations: ${m.operationCount}`);
      console.log(`   Total Time: ${m.totalTimeMs.toFixed(2)}ms`);
      console.log(`   Avg Time/Op: ${m.avgTimePerOpMs.toFixed(2)}ms`);
      console.log(`   TPS: ${m.transactionsPerSecond.toFixed(2)}`);
      console.log(`   Total Gas: ${m.totalGasUsed}`);
      console.log(`   Avg Gas/Op: ${m.avgGasPerOp}`);
    });
    console.log("=".repeat(80) + "\n");
  });

  describe("Batch Lock Registration", function () {
    it(`Should register ${LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS} locks rapidly`, async function () {
      const startTime = Date.now();
      let totalGas = ethers.BigNumber.from(0);
      const lockIds: number[] = [];

      for (let i = 0; i < LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS; i++) {
        const identity = await cryptoService.generateIdentity();
        const userIndex = i % users.length;
        const tx = await accessControl
          .connect(users[userIndex])
          .registerLock(identity.address);
        const receipt = await tx.wait();

        totalGas = totalGas.add(receipt.gasUsed);
        const event = receipt.events?.find(
          (e: any) => e.event === "LockRegistered",
        );
        lockIds.push(event?.args?.lockId.toNumber());
      }

      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;

      const metric: LoadTestMetrics = {
        testName: "Batch Lock Registration",
        operationCount: LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS,
        totalTimeMs,
        avgTimePerOpMs: totalTimeMs / LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS,
        transactionsPerSecond:
          (LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS / totalTimeMs) * 1000,
        totalGasUsed: totalGas.toString(),
        avgGasPerOp: totalGas
          .div(LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS)
          .toString(),
        timestamp: new Date().toISOString(),
      };

      metrics.push(metric);

      expect(lockIds.length).to.equal(LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS);
      console.log(
        `   ⏱️  ${totalTimeMs}ms for ${LOAD_CONFIG.BATCH_LOCK_REGISTRATIONS} registrations`,
      );
      console.log(`   ⚡ ${metric.transactionsPerSecond.toFixed(2)} TPS`);
    });
  });

  describe("Batch Credential Revocations", function () {
    let lockId: number;
    let lockKeyPair: { publicKey: string; privateKey: string };

    before(async function () {
      const identity = await cryptoService.generateIdentity();
      lockKeyPair = {
        publicKey: identity.address,
        privateKey: identity.privateKey,
      };

      const tx = await accessControl
        .connect(owner)
        .registerLock(lockKeyPair.publicKey);
      const receipt = await tx.wait();
      const event = receipt.events?.find(
        (e: any) => e.event === "LockRegistered",
      );
      lockId = event?.args?.lockId.toNumber();
    });

    it(`Should revoke ${LOAD_CONFIG.BATCH_REVOCATIONS} credentials sequentially`, async function () {
      const startTime = Date.now();
      let totalGas = ethers.BigNumber.from(0);

      for (let i = 0; i < LOAD_CONFIG.BATCH_REVOCATIONS; i++) {
        const userMetaData = {
          email: `user${i}@example.com`,
          name: `User ${i}`,
          timestamp: Date.now() + i,
        };

        const userMetaDataHash = cryptoService.hash(
          JSON.stringify(userMetaData),
        );
        const issuanceDate = new Date().toISOString();
        const vcInput = { userMetaDataHash, issuanceDate };

        const vcHashToSign = cryptoService.hash(JSON.stringify(vcInput));
        const signResult = await onChainService.signForBlockchain(
          vcHashToSign,
          lockKeyPair.privateKey,
        );
        const vcHash = signResult.signedHash;
        const authSignature = signResult.signature;

        const tx = await accessControl
          .connect(owner)
          .revokeCredential(lockId, vcHash, authSignature);
        const receipt = await tx.wait();
        totalGas = totalGas.add(receipt.gasUsed);
      }

      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;

      const metric: LoadTestMetrics = {
        testName: "Batch Credential Revocations",
        operationCount: LOAD_CONFIG.BATCH_REVOCATIONS,
        totalTimeMs,
        avgTimePerOpMs: totalTimeMs / LOAD_CONFIG.BATCH_REVOCATIONS,
        transactionsPerSecond:
          (LOAD_CONFIG.BATCH_REVOCATIONS / totalTimeMs) * 1000,
        totalGasUsed: totalGas.toString(),
        avgGasPerOp: totalGas.div(LOAD_CONFIG.BATCH_REVOCATIONS).toString(),
        timestamp: new Date().toISOString(),
      };

      metrics.push(metric);

      console.log(
        `   ⏱️  ${totalTimeMs}ms for ${LOAD_CONFIG.BATCH_REVOCATIONS} revocations`,
      );
      console.log(`   ⚡ ${metric.transactionsPerSecond.toFixed(2)} TPS`);
    });
  });

  describe("Concurrent Operations Stress Test", function () {
    it("Should handle multiple users performing operations concurrently", async function () {
      const startTime = Date.now();
      const promises: Promise<any>[] = [];
      let totalGas = ethers.BigNumber.from(0);

      for (let i = 0; i < LOAD_CONFIG.CONCURRENT_USERS; i++) {
        const user = users[i];
        const identity = await cryptoService.generateIdentity();

        const promise = accessControl
          .connect(user)
          .registerLock(identity.address);
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      for (const tx of results) {
        const receipt = await tx.wait();
        totalGas = totalGas.add(receipt.gasUsed);
      }

      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;

      const metric: LoadTestMetrics = {
        testName: "Concurrent Lock Registrations",
        operationCount: LOAD_CONFIG.CONCURRENT_USERS,
        totalTimeMs,
        avgTimePerOpMs: totalTimeMs / LOAD_CONFIG.CONCURRENT_USERS,
        transactionsPerSecond:
          (LOAD_CONFIG.CONCURRENT_USERS / totalTimeMs) * 1000,
        totalGasUsed: totalGas.toString(),
        avgGasPerOp: totalGas.div(LOAD_CONFIG.CONCURRENT_USERS).toString(),
        timestamp: new Date().toISOString(),
      };

      metrics.push(metric);

      expect(results.length).to.equal(LOAD_CONFIG.CONCURRENT_USERS);
      console.log(
        `   ⏱️  ${totalTimeMs}ms for ${LOAD_CONFIG.CONCURRENT_USERS} concurrent operations`,
      );
    });
  });

  describe("Storage Growth Impact", function () {
    let lockId: number;
    let lockKeyPair: { publicKey: string; privateKey: string };

    before(async function () {
      const identity = await cryptoService.generateIdentity();
      lockKeyPair = {
        publicKey: identity.address,
        privateKey: identity.privateKey,
      };

      const tx = await accessControl
        .connect(owner)
        .registerLock(lockKeyPair.publicKey);
      const receipt = await tx.wait();
      const event = receipt.events?.find(
        (e: any) => e.event === "LockRegistered",
      );
      lockId = event?.args?.lockId.toNumber();
    });

    it("Should measure performance degradation with growing revocation list", async function () {
      const checkpoints = [10, 50, 100];
      const checkpointMetrics: any[] = [];

      for (const checkpoint of checkpoints) {
        const currentCount = (
          await accessControl.getRevokedSignatureCount(lockId)
        ).toNumber();
        const toRevoke = checkpoint - currentCount;

        if (toRevoke <= 0) continue;

        const startTime = Date.now();
        let totalGas = ethers.BigNumber.from(0);

        for (let i = 0; i < toRevoke; i++) {
          const userMetaData = {
            email: `growth${currentCount + i}@example.com`,
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
            lockKeyPair.privateKey,
          );
          const vcHash = signResult.signedHash;
          const authSignature = signResult.signature;

          const tx = await accessControl
            .connect(owner)
            .revokeCredential(lockId, vcHash, authSignature);
          const receipt = await tx.wait();
          totalGas = totalGas.add(receipt.gasUsed);
        }

        const endTime = Date.now();
        const totalTimeMs = endTime - startTime;

        checkpointMetrics.push({
          revokedCount: checkpoint,
          timeMs: totalTimeMs,
          avgGas: totalGas.div(toRevoke).toString(),
        });

        console.log(
          `   📈 At ${checkpoint} revocations: ${(
            totalTimeMs / toRevoke
          ).toFixed(2)}ms avg, Gas: ${totalGas.div(toRevoke).toString()}`,
        );
      }

      expect(checkpointMetrics.length).to.be.greaterThan(0);
    });
  });

  describe("Read Operation Performance Under Load", function () {
    let lockId: number;
    let revokedHashes: string[] = [];
    let validHashes: string[] = [];

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
      const event = receipt.events?.find(
        (e: any) => e.event === "LockRegistered",
      );
      lockId = event?.args?.lockId.toNumber();

      // Create some revoked credentials
      for (let i = 0; i < 20; i++) {
        const userMetaData = {
          email: `read${i}@example.com`,
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
          keyPair.privateKey,
        );
        const vcHash = signResult.signedHash;
        const authSignature = signResult.signature;

        await accessControl
          .connect(owner)
          .revokeCredential(lockId, vcHash, authSignature);
        revokedHashes.push(vcHash);
      }

      // Create some valid hashes (not revoked)
      for (let i = 0; i < 20; i++) {
        const userMetaData = {
          email: `valid${i}@example.com`,
          timestamp: Date.now() + i + 1000,
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
          keyPair.privateKey,
        );
        const vcHash = signResult.signedHash;

        validHashes.push(vcHash);
      }
    });

    it("Should perform rapid revocation checks", async function () {
      const iterations = 200;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const hash =
          i % 2 === 0
            ? revokedHashes[i % revokedHashes.length]
            : validHashes[i % validHashes.length];
        await accessControl.isCredentialRevoked(lockId, hash);
      }

      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;

      const metric: LoadTestMetrics = {
        testName: "Rapid Revocation Checks",
        operationCount: iterations,
        totalTimeMs,
        avgTimePerOpMs: totalTimeMs / iterations,
        transactionsPerSecond: (iterations / totalTimeMs) * 1000,
        totalGasUsed: "0", // View function, no gas
        avgGasPerOp: "0",
        timestamp: new Date().toISOString(),
      };

      metrics.push(metric);

      console.log(`   ⏱️  ${totalTimeMs}ms for ${iterations} checks`);
      console.log(
        `   ⚡ ${metric.transactionsPerSecond.toFixed(2)} checks/second`,
      );
    });
  });
});
