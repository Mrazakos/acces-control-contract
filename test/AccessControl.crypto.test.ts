import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CryptoUtils } from "@mrazakos/vc-ecdsa-crypto";

describe("AccessControl with VC-ECDSA-Crypto", function () {
  let accessControl: Contract;
  let owner: SignerWithAddress;
  let lockOwner: SignerWithAddress;
  let newOwner: SignerWithAddress;

  // Crypto variables
  let lockKeyPair: { publicKey: string; privateKey: string };
  let vcInput: { userMetaDataHash: string; issuanceDate: string };
  let signature: string;
  let vcHash: string;
  let lockId: number;

  before(async function () {
    [owner, lockOwner, newOwner] = await ethers.getSigners();

    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControl"
    );
    accessControl = await AccessControlFactory.deploy();
    await accessControl.deployed();
  });

  describe("Integration with Real Crypto", function () {
    it("Should generate a valid ECDSA key pair", async function () {
      lockKeyPair = await CryptoUtils.generateKeyPair();

      expect(lockKeyPair.publicKey).to.be.a("string");
      expect(lockKeyPair.privateKey).to.be.a("string");
      expect(lockKeyPair.publicKey.length).to.be.greaterThan(0);
      expect(lockKeyPair.privateKey.length).to.be.greaterThan(0);
    });

    it("Should register a lock with real public key", async function () {
      const tx = await accessControl
        .connect(lockOwner)
        .registerLock(lockKeyPair.publicKey);
      const receipt = await tx.wait();

      const event = receipt.events?.find(
        (e: any) => e.event === "LockRegistered"
      );
      expect(event).to.not.be.undefined;
      lockId = event?.args?.lockId.toNumber();

      expect(lockId).to.equal(1);
      expect(event?.args?.owner).to.equal(lockOwner.address);
    });

    it("Should verify the registered signer address", async function () {
      const isValid = await accessControl.verifySignerAddress(
        lockId,
        lockKeyPair.publicKey
      );
      expect(isValid).to.equal(true);
    });

    it("Should create and sign a verifiable credential", async function () {
      // Create user metadata
      const userMetaData = {
        email: "test@example.com",
        name: "Test User",
        timestamp: Date.now(),
      };

      const userMetaDataHash = CryptoUtils.hash(JSON.stringify(userMetaData));

      vcInput = {
        userMetaDataHash: userMetaDataHash,
        issuanceDate: new Date().toISOString(),
      };

      // Sign the VC
      const signResult = await CryptoUtils.sign(
        vcInput,
        lockKeyPair.privateKey
      );
      signature = signResult.signature;
      vcHash = signResult.signedMessageHash;

      expect(signature).to.be.a("string");
      expect(vcHash).to.be.a("string");
      expect(signature.length).to.be.greaterThan(0);
    });

    it("Should verify signature locally before revoking", async function () {
      // Verify using the crypto library
      const isValid = CryptoUtils.verify(
        vcHash,
        signature,
        lockKeyPair.publicKey
      );
      expect(isValid).to.equal(true);
    });

    it("Should revoke a credential with valid signature", async function () {
      const tx = await accessControl
        .connect(lockOwner)
        .revokeCredential(lockId, vcHash, signature);

      const receipt = await tx.wait();
      const event = receipt.events?.find(
        (e: any) => e.event === "CredentialRevoked"
      );

      expect(event).to.not.be.undefined;
      expect(event?.args?.lockId).to.equal(lockId);
      expect(event?.args?.vcHash).to.equal(vcHash);
    });

    it("Should show credential as revoked", async function () {
      const isRevoked = await accessControl.isCredentialRevoked(lockId, vcHash);
      expect(isRevoked).to.equal(true);
    });

    it("Should increment revoked count", async function () {
      const count = await accessControl.getRevokedSignatureCount(lockId);
      expect(count).to.equal(1);
    });

    it("Should not allow double revocation", async function () {
      await expect(
        accessControl
          .connect(lockOwner)
          .revokeCredential(lockId, vcHash, signature)
      ).to.be.revertedWith("CredentialAlreadyRevoked");
    });
  });

  describe("Transfer Ownership with Real Signatures", function () {
    let transferSignature: string;
    let transferVcHash: string;

    it("Should create a new signature for ownership transfer", async function () {
      const transferVcInput = {
        userMetaDataHash: CryptoUtils.hash("ownership-transfer"),
        issuanceDate: new Date().toISOString(),
      };

      const signResult = await CryptoUtils.sign(
        transferVcInput,
        lockKeyPair.privateKey
      );
      transferSignature = signResult.signature;
      transferVcHash = signResult.signedMessageHash;

      expect(transferSignature).to.be.a("string");
    });

    it("Should transfer lock ownership with valid signature", async function () {
      const tx = await accessControl
        .connect(lockOwner)
        .transferLockOwnership(
          lockId,
          transferVcHash,
          transferSignature,
          newOwner.address
        );

      const receipt = await tx.wait();
      const event = receipt.events?.find(
        (e: any) => e.event === "LockOwnershipTransferred"
      );

      expect(event).to.not.be.undefined;
      expect(event?.args?.lockId).to.equal(lockId);
      expect(event?.args?.previousOwner).to.equal(lockOwner.address);
      expect(event?.args?.newOwner).to.equal(newOwner.address);
    });

    it("Should verify new owner", async function () {
      const currentOwner = await accessControl.getLockOwner(lockId);
      expect(currentOwner).to.equal(newOwner.address);
    });

    it("Should reject transfer from old owner", async function () {
      const anotherSignResult = await CryptoUtils.sign(
        {
          userMetaDataHash: CryptoUtils.hash("another-transfer"),
          issuanceDate: new Date().toISOString(),
        },
        lockKeyPair.privateKey
      );

      await expect(
        accessControl
          .connect(lockOwner)
          .transferLockOwnership(
            lockId,
            anotherSignResult.signedMessageHash,
            anotherSignResult.signature,
            owner.address
          )
      ).to.be.revertedWith("NotLockOwner");
    });
  });

  describe("Multiple Locks with Different Keys", function () {
    it("Should register multiple locks with different key pairs", async function () {
      const keyPair1 = await CryptoUtils.generateKeyPair();
      const keyPair2 = await CryptoUtils.generateKeyPair();
      const keyPair3 = await CryptoUtils.generateKeyPair();

      await accessControl.connect(lockOwner).registerLock(keyPair1.publicKey);
      await accessControl.connect(lockOwner).registerLock(keyPair2.publicKey);
      await accessControl.connect(newOwner).registerLock(keyPair3.publicKey);

      const totalLocks = await accessControl.getTotalLocks();
      expect(totalLocks).to.equal(4); // 1 from previous tests + 3 new ones
    });

    it("Should verify each key pair is unique", async function () {
      const signer1 = await accessControl.getSignerAddress(2);
      const signer2 = await accessControl.getSignerAddress(3);
      const signer3 = await accessControl.getSignerAddress(4);

      expect(signer1).to.not.equal(signer2);
      expect(signer2).to.not.equal(signer3);
      expect(signer1).to.not.equal(signer3);
    });
  });

  describe("Revoke Multiple Credentials", function () {
    let testLockId: number;
    let testKeyPair: { publicKey: string; privateKey: string };

    before(async function () {
      testKeyPair = await CryptoUtils.generateKeyPair();
      const tx = await accessControl
        .connect(lockOwner)
        .registerLock(testKeyPair.publicKey);
      const receipt = await tx.wait();
      const event = receipt.events?.find(
        (e: any) => e.event === "LockRegistered"
      );
      testLockId = event?.args?.lockId.toNumber();
    });

    it("Should revoke multiple different credentials", async function () {
      const credentials: Array<{ signature: string; vcHash: string }> = [];

      // Create and revoke 5 different credentials
      for (let i = 0; i < 5; i++) {
        const vcInput = {
          userMetaDataHash: CryptoUtils.hash(`test-credential-${i}`),
          issuanceDate: new Date().toISOString(),
        };

        const signResult = await CryptoUtils.sign(
          vcInput,
          testKeyPair.privateKey
        );
        credentials.push({
          signature: signResult.signature,
          vcHash: signResult.signedMessageHash,
        });

        await accessControl
          .connect(lockOwner)
          .revokeCredential(
            testLockId,
            signResult.signedMessageHash,
            signResult.signature
          );
      }

      const revokedCount = await accessControl.getRevokedSignatureCount(
        testLockId
      );
      expect(revokedCount).to.equal(5);

      // Verify all are revoked
      for (const cred of credentials) {
        const isRevoked = await accessControl.isCredentialRevoked(
          testLockId,
          cred.vcHash
        );
        expect(isRevoked).to.equal(true);
      }
    });
  });

  describe("Authentication Edge Cases", function () {
    let edgeLockId: number;
    let edgeKeyPair: { publicKey: string; privateKey: string };
    let wrongKeyPair: { publicKey: string; privateKey: string };

    before(async function () {
      edgeKeyPair = await CryptoUtils.generateKeyPair();
      wrongKeyPair = await CryptoUtils.generateKeyPair();

      const tx = await accessControl
        .connect(lockOwner)
        .registerLock(edgeKeyPair.publicKey);
      const receipt = await tx.wait();
      const event = receipt.events?.find(
        (e: any) => e.event === "LockRegistered"
      );
      edgeLockId = event?.args?.lockId.toNumber();
    });

    it("Should reject signature from wrong private key", async function () {
      const vcInput = {
        userMetaDataHash: CryptoUtils.hash("test-data"),
        issuanceDate: new Date().toISOString(),
      };

      // Sign with the WRONG key pair
      const signResult = await CryptoUtils.sign(
        vcInput,
        wrongKeyPair.privateKey
      );

      await expect(
        accessControl
          .connect(lockOwner)
          .revokeCredential(
            edgeLockId,
            signResult.signedMessageHash,
            signResult.signature
          )
      ).to.be.revertedWith("AuthenticationFailed");
    });

    it("Should reject if VC hash doesn't match signature", async function () {
      const vcInput = {
        userMetaDataHash: CryptoUtils.hash("original-data"),
        issuanceDate: new Date().toISOString(),
      };

      const signResult = await CryptoUtils.sign(
        vcInput,
        edgeKeyPair.privateKey
      );

      // Use a different VC hash
      const differentHash = CryptoUtils.hash("different-data");

      await expect(
        accessControl
          .connect(lockOwner)
          .revokeCredential(edgeLockId, differentHash, signResult.signature)
      ).to.be.revertedWith("AuthenticationFailed");
    });
  });
});
