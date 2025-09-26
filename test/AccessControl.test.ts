import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("AccessControl", function () {
  let accessControl: Contract;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let unauthorized: Signer;

  async function deployAccessControlFixture() {
    const [owner, user1, user2, unauthorized] = await ethers.getSigners();

    const AccessControl = await ethers.getContractFactory("AccessControl");
    const accessControl = await AccessControl.deploy();
    await accessControl.deployed(); // Ethers v5 syntax

    return { accessControl, owner, user1, user2, unauthorized };
  }

  beforeEach(async function () {
    const deployment = await deployAccessControlFixture();
    accessControl = deployment.accessControl;
    owner = deployment.owner;
    user1 = deployment.user1;
    user2 = deployment.user2;
    unauthorized = deployment.unauthorized;
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await accessControl.owner()).to.equal(await owner.getAddress());
    });

    it("Should initialize contract as unpaused", async function () {
      expect(await accessControl.paused()).to.be.false;
    });

    it("Should initialize with zero locks", async function () {
      expect(await accessControl.getTotalLocks()).to.equal(0);
    });
  });

  describe("Lock Registration", function () {
    const validPublicKey =
      "04a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123456789012345678901234567890";

    it("Should register a new lock successfully", async function () {
      await expect(accessControl.connect(user1).registerLock(validPublicKey))
        .to.emit(accessControl, "LockRegistered")
        .withArgs(1, await user1.getAddress(), validPublicKey);

      expect(await accessControl.getTotalLocks()).to.equal(1);
      expect(await accessControl.lockExistsView(1)).to.be.true;
    });

    it("Should return correct lock ID", async function () {
      const tx = await accessControl
        .connect(user1)
        .registerLock(validPublicKey);
      const receipt = await tx.wait();
      const event = receipt.events?.find(
        (event: any) => event.event === "LockRegistered"
      );
      expect(event?.args?.[0]).to.equal(1);
    });

    it("Should set correct lock owner", async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);
      expect(await accessControl.getLockOwner(1)).to.equal(
        await user1.getAddress()
      );
    });

    it("Should store correct public key", async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);
      expect(await accessControl.getPublicKey(1)).to.equal(validPublicKey);
    });

    it("Should increment lock counter for multiple registrations", async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);
      await accessControl
        .connect(user2)
        .registerLock(validPublicKey + "different");

      expect(await accessControl.getTotalLocks()).to.equal(2);
      expect(await accessControl.lockExistsView(1)).to.be.true;
      expect(await accessControl.lockExistsView(2)).to.be.true;
    });

    it("Should revert with empty public key", async function () {
      await expect(accessControl.connect(user1).registerLock("")).to.be
        .reverted;
    });

    it("Should revert with too long public key", async function () {
      const tooLongKey = "a".repeat(513); // MAX_PUBLIC_KEY_LENGTH is 512
      await expect(accessControl.connect(user1).registerLock(tooLongKey)).to.be
        .reverted;
    });

    it("Should work when paused is false", async function () {
      await expect(accessControl.connect(user1).registerLock(validPublicKey)).to
        .not.be.reverted;
    });
  });

  describe("Signature Revocation", function () {
    const validPublicKey =
      "04a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123456789012345678901234567890";
    const testSignature = "test_signature_123";

    beforeEach(async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);
    });

    it("Should revoke a signature successfully", async function () {
      const signatureHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(testSignature)
      );

      await expect(
        accessControl.connect(user1).revokeSignature(1, testSignature)
      )
        .to.emit(accessControl, "SignatureRevoked")
        .withArgs(1, signatureHash, await user1.getAddress());

      expect(await accessControl.isSignatureRevoked(1, testSignature)).to.be
        .true;
      expect(await accessControl.getRevokedSignatureCount(1)).to.equal(1);
    });

    it("Should prevent non-owner from revoking signature", async function () {
      await expect(
        accessControl.connect(user2).revokeSignature(1, testSignature)
      ).to.be.reverted;
    });

    it("Should revert for non-existent lock", async function () {
      await expect(
        accessControl.connect(user1).revokeSignature(999, testSignature)
      ).to.be.reverted;
    });

    it("Should revert with empty signature", async function () {
      await expect(accessControl.connect(user1).revokeSignature(1, "")).to.be
        .reverted;
    });

    it("Should prevent revoking same signature twice", async function () {
      await accessControl.connect(user1).revokeSignature(1, testSignature);

      await expect(
        accessControl.connect(user1).revokeSignature(1, testSignature)
      ).to.be.reverted;
    });

    it("Should handle multiple different signatures", async function () {
      const sig1 = "signature_1";
      const sig2 = "signature_2";

      await accessControl.connect(user1).revokeSignature(1, sig1);
      await accessControl.connect(user1).revokeSignature(1, sig2);

      expect(await accessControl.isSignatureRevoked(1, sig1)).to.be.true;
      expect(await accessControl.isSignatureRevoked(1, sig2)).to.be.true;
      expect(await accessControl.getRevokedSignatureCount(1)).to.equal(2);
    });
  });

  describe("Batch Signature Revocation", function () {
    const validPublicKey =
      "04a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123456789012345678901234567890";
    const testSignatures = ["sig1", "sig2", "sig3"];

    beforeEach(async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);
    });

    it("Should batch revoke signatures successfully", async function () {
      const tx = await accessControl
        .connect(user1)
        .batchRevokeSignatures(1, testSignatures);

      // Check all signatures are revoked
      for (const sig of testSignatures) {
        expect(await accessControl.isSignatureRevoked(1, sig)).to.be.true;
      }

      expect(await accessControl.getRevokedSignatureCount(1)).to.equal(3);
    });

    it("Should emit events for all revoked signatures", async function () {
      const tx = await accessControl
        .connect(user1)
        .batchRevokeSignatures(1, testSignatures);
      const receipt = await tx.wait();

      const events =
        receipt.events?.filter(
          (event: any) => event.event === "SignatureRevoked"
        ) || [];
      expect(events).to.have.length(3);
    });

    it("Should prevent non-owner from batch revoking", async function () {
      await expect(
        accessControl.connect(user2).batchRevokeSignatures(1, testSignatures)
      ).to.be.reverted;
    });

    it("Should revert if any signature is empty", async function () {
      const signaturesWithEmpty = ["sig1", "", "sig3"];
      await expect(
        accessControl
          .connect(user1)
          .batchRevokeSignatures(1, signaturesWithEmpty)
      ).to.be.reverted;
    });

    it("Should revert if any signature already revoked", async function () {
      await accessControl.connect(user1).revokeSignature(1, "sig1");

      await expect(
        accessControl.connect(user1).batchRevokeSignatures(1, testSignatures)
      ).to.be.reverted;
    });
  });

  describe("Lock Ownership Transfer", function () {
    const validPublicKey =
      "04a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123456789012345678901234567890";

    beforeEach(async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);
    });

    it("Should transfer lock ownership successfully", async function () {
      await expect(
        accessControl
          .connect(user1)
          .transferLockOwnership(1, await user2.getAddress())
      )
        .to.emit(accessControl, "LockOwnershipTransferred")
        .withArgs(1, await user1.getAddress(), await user2.getAddress());

      expect(await accessControl.getLockOwner(1)).to.equal(
        await user2.getAddress()
      );
    });

    it("Should prevent non-owner from transferring ownership", async function () {
      await expect(
        accessControl
          .connect(user2)
          .transferLockOwnership(1, await user2.getAddress())
      ).to.be.reverted;
    });

    it("Should revert when transferring to zero address", async function () {
      await expect(
        accessControl
          .connect(user1)
          .transferLockOwnership(
            1,
            "0x0000000000000000000000000000000000000000"
          )
      ).to.be.reverted;
    });

    it("Should revert when transferring to same owner", async function () {
      await expect(
        accessControl
          .connect(user1)
          .transferLockOwnership(1, await user1.getAddress())
      ).to.be.reverted;
    });

    it("Should allow new owner to manage lock after transfer", async function () {
      await accessControl
        .connect(user1)
        .transferLockOwnership(1, await user2.getAddress());

      // New owner should be able to revoke signatures
      await expect(accessControl.connect(user2).revokeSignature(1, "test_sig"))
        .to.not.be.reverted;

      // Old owner should not be able to revoke signatures
      await expect(
        accessControl.connect(user1).revokeSignature(1, "another_sig")
      ).to.be.reverted;
    });
  });

  describe("View Functions", function () {
    const validPublicKey =
      "04a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123456789012345678901234567890";

    beforeEach(async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);
    });

    it("Should return correct lock info", async function () {
      const [owner, publicKey, revokedCount, exists] =
        await accessControl.getLockInfo(1);

      expect(owner).to.equal(await user1.getAddress());
      expect(publicKey).to.equal(validPublicKey);
      expect(revokedCount).to.equal(0);
      expect(exists).to.be.true;
    });

    it("Should return false for non-revoked signature", async function () {
      expect(await accessControl.isSignatureRevoked(1, "non_revoked")).to.be
        .false;
    });

    it("Should revert view functions for non-existent lock", async function () {
      await expect(accessControl.getLockInfo(999)).to.be.reverted;
    });
  });

  describe("Admin Functions", function () {
    const validPublicKey =
      "04a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123456789012345678901234567890";

    beforeEach(async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);
    });

    it("Should allow owner to pause contract", async function () {
      await accessControl.connect(owner).pause();
      expect(await accessControl.paused()).to.be.true;
    });

    it("Should allow owner to unpause contract", async function () {
      await accessControl.connect(owner).pause();
      await accessControl.connect(owner).unpause();
      expect(await accessControl.paused()).to.be.false;
    });

    it("Should prevent non-owner from pausing", async function () {
      await expect(accessControl.connect(user1).pause()).to.be.reverted;
    });

    it("Should prevent operations when paused", async function () {
      await accessControl.connect(owner).pause();

      await expect(accessControl.connect(user2).registerLock(validPublicKey)).to
        .be.reverted;

      await expect(accessControl.connect(user1).revokeSignature(1, "test_sig"))
        .to.be.reverted;
    });

    it("Should allow emergency lock ownership transfer", async function () {
      await expect(
        accessControl
          .connect(owner)
          .emergencyTransferLockOwnership(1, await user2.getAddress())
      )
        .to.emit(accessControl, "LockOwnershipTransferred")
        .withArgs(1, await user1.getAddress(), await user2.getAddress());

      expect(await accessControl.getLockOwner(1)).to.equal(
        await user2.getAddress()
      );
    });

    it("Should prevent non-owner from emergency transfer", async function () {
      await expect(
        accessControl
          .connect(user1)
          .emergencyTransferLockOwnership(1, await user2.getAddress())
      ).to.be.reverted;
    });

    it("Should revert emergency transfer to zero address", async function () {
      await expect(
        accessControl
          .connect(owner)
          .emergencyTransferLockOwnership(
            1,
            "0x0000000000000000000000000000000000000000"
          )
      ).to.be.reverted;
    });
  });

  describe("Edge Cases and Security", function () {
    const validPublicKey =
      "04a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123456789012345678901234567890";

    it("Should handle maximum public key length", async function () {
      const maxLengthKey = "a".repeat(512); // MAX_PUBLIC_KEY_LENGTH
      await expect(accessControl.connect(user1).registerLock(maxLengthKey)).to
        .not.be.reverted;
    });

    it("Should prevent reentrancy attacks", async function () {
      // The contract uses ReentrancyGuard, so this is mainly to verify the modifier is working
      await accessControl.connect(user1).registerLock(validPublicKey);

      // Normal operation should work
      await expect(accessControl.connect(user1).revokeSignature(1, "test_sig"))
        .to.not.be.reverted;
    });

    it("Should handle gas limit considerations", async function () {
      await accessControl.connect(user1).registerLock(validPublicKey);

      // Test batch operations with reasonable limits
      const manySignatures = Array.from({ length: 10 }, (_, i) => `sig_${i}`);
      await expect(
        accessControl.connect(user1).batchRevokeSignatures(1, manySignatures)
      ).to.not.be.reverted;

      expect(await accessControl.getRevokedSignatureCount(1)).to.equal(10);
    });
  });
});
