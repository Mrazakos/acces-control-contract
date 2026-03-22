import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { OnChainService, ECDSACryptoService } from "@mrazakos/vc-ecdsa-crypto";

describe("AccessControl - Simple Latency Averages", function () {
  const REGISTRATION_COUNT = 200;
  const REVOCATION_COUNT = 200;

  let cryptoService: ECDSACryptoService;
  let onChainService: OnChainService;
  let accessControl: Contract;
  let owner: SignerWithAddress;

  before(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];

    cryptoService = new ECDSACryptoService();
    onChainService = new OnChainService(cryptoService);

    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControl",
    );
    accessControl = await AccessControlFactory.deploy();
    await accessControl.deployed();
  });

  it("Measures average latency for 200 registrations", async function () {
    const latencies: number[] = [];

    for (let i = 0; i < REGISTRATION_COUNT; i++) {
      const identity = await cryptoService.generateIdentity();

      const start = Date.now();
      const tx = await accessControl
        .connect(owner)
        .registerLock(identity.address);
      await tx.wait();
      const end = Date.now();

      latencies.push(end - start);
    }

    const avgLatencyMs =
      latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;

    console.log(
      `Registration average latency (${REGISTRATION_COUNT} tx): ${avgLatencyMs.toFixed(
        2,
      )} ms/tx`,
    );

    expect(latencies.length).to.equal(REGISTRATION_COUNT);
  });

  it("Measures average latency for 200 revocations", async function () {
    const lockIdentity = await cryptoService.generateIdentity();
    const registerTx = await accessControl
      .connect(owner)
      .registerLock(lockIdentity.address);
    const registerReceipt = await registerTx.wait();
    const event = registerReceipt.events?.find(
      (e: any) => e.event === "LockRegistered",
    );
    const lockId = event?.args?.lockId.toNumber();

    const latencies: number[] = [];

    for (let i = 0; i < REVOCATION_COUNT; i++) {
      const userMetaData = {
        email: `simple-latency-${i}@example.com`,
        timestamp: Date.now() + i,
      };

      const userMetaDataHash = cryptoService.hash(JSON.stringify(userMetaData));
      const vcInput = {
        userMetaDataHash,
        issuanceDate: new Date().toISOString(),
      };
      const vcHashToSign = cryptoService.hash(JSON.stringify(vcInput));

      const signResult = await onChainService.signForBlockchain(
        vcHashToSign,
        lockIdentity.privateKey,
      );

      const start = Date.now();
      const tx = await accessControl
        .connect(owner)
        .revokeCredential(lockId, signResult.signedHash, signResult.signature);
      await tx.wait();
      const end = Date.now();

      latencies.push(end - start);
    }

    const avgLatencyMs =
      latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;

    console.log(
      `Revocation average latency (${REVOCATION_COUNT} tx): ${avgLatencyMs.toFixed(
        2,
      )} ms/tx`,
    );

    expect(latencies.length).to.equal(REVOCATION_COUNT);
  });
});
