import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { OnChainService, ECDSACryptoService } from "@mrazakos/vc-ecdsa-crypto";

/**
 * AccessControl Smart Contract Test Suite
 *
 * Uses @mrazakos/vc-ecdsa-crypto v3.0+ with OnChainService for blockchain-compatible signing.
 *
 * Key Changes from v2.x:
 * - Uses OnChainService.signForBlockchain() for Ethereum-prefixed signatures
 * - Compatible with Solidity's ecrecover function
 * - Uses ECDSACryptoService.generateIdentity() for key generation
 * - Public keys are now Ethereum addresses (20 bytes) instead of full public keys (65 bytes)
 * - All signatures include Ethereum's "\x19Ethereum Signed Message:\n32" prefix
 *
 * Testing Strategy:
 * - Real cryptographic operations (no mocks)
 * - Integration with actual smart contract
 * - Tests authentication, revocation, and ownership transfer
 * - Edge cases: wrong keys, mismatched hashes, replay attacks
 */

describe("AccessControl with VC-ECDSA-Crypto", function () {
  let onChainService: OnChainService;
  let cryptoService: ECDSACryptoService;
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

    // Initialize services for blockchain operations
    cryptoService = new ECDSACryptoService();
    onChainService = new OnChainService(cryptoService);

    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControl"
    );
    accessControl = await AccessControlFactory.deploy();
    await accessControl.deployed();
  });

  describe("Integration with Real Crypto", function () {
    it("Should generate a valid ECDSA key pair", async function () {
      const identity = await cryptoService.generateIdentity();
      lockKeyPair = {
        publicKey: identity.address, // Use Ethereum address for on-chain
        privateKey: identity.privateKey,
      };

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

      const userMetaDataHash = cryptoService.hash(JSON.stringify(userMetaData));

      vcInput = {
        userMetaDataHash: userMetaDataHash,
        issuanceDate: new Date().toISOString(),
      };

      // Sign using OnChainService for blockchain compatibility
      const vcHashToSign = cryptoService.hash(JSON.stringify(vcInput));
      const signResult = await onChainService.signForBlockchain(
        vcHashToSign,
        lockKeyPair.privateKey
      );
      signature = signResult.signature;
      vcHash = signResult.signedHash;

      expect(signature).to.be.a("string");
      expect(vcHash).to.be.a("string");
      expect(signature.length).to.be.greaterThan(0);
    });

    it("Should verify signature locally before revoking", async function () {
      // Verify using the on-chain service with Ethereum address
      const isValid = await onChainService.verifyBlockchainSignature(
        vcHash,
        signature,
        lockKeyPair.publicKey // This is the Ethereum address
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
        userMetaDataHash: cryptoService.hash("ownership-transfer"),
        issuanceDate: new Date().toISOString(),
      };

      const hashToSign = cryptoService.hash(JSON.stringify(transferVcInput));
      const signResult = await onChainService.signForBlockchain(
        hashToSign,
        lockKeyPair.privateKey
      );
      transferSignature = signResult.signature;
      transferVcHash = signResult.signedHash;

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
      const anotherTransferInput = {
        userMetaDataHash: cryptoService.hash("another-transfer"),
        issuanceDate: new Date().toISOString(),
      };
      const anotherHash = cryptoService.hash(
        JSON.stringify(anotherTransferInput)
      );
      const anotherSignResult = await onChainService.signForBlockchain(
        anotherHash,
        lockKeyPair.privateKey
      );

      await expect(
        accessControl
          .connect(lockOwner)
          .transferLockOwnership(
            lockId,
            anotherSignResult.signedHash,
            anotherSignResult.signature,
            owner.address
          )
      ).to.be.revertedWith("NotLockOwner");
    });
  });

  describe("Multiple Locks with Different Keys", function () {
    it("Should register multiple locks with different key pairs", async function () {
      const identity1 = await cryptoService.generateIdentity();
      const identity2 = await cryptoService.generateIdentity();
      const identity3 = await cryptoService.generateIdentity();

      await accessControl.connect(lockOwner).registerLock(identity1.address);
      await accessControl.connect(lockOwner).registerLock(identity2.address);
      await accessControl.connect(newOwner).registerLock(identity3.address);

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
      const identity = await cryptoService.generateIdentity();
      testKeyPair = {
        publicKey: identity.address,
        privateKey: identity.privateKey,
      };
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
          userMetaDataHash: cryptoService.hash(`test-credential-${i}`),
          issuanceDate: new Date().toISOString(),
        };

        const hashToSign = cryptoService.hash(JSON.stringify(vcInput));
        const signResult = await onChainService.signForBlockchain(
          hashToSign,
          testKeyPair.privateKey
        );
        credentials.push({
          signature: signResult.signature,
          vcHash: signResult.signedHash,
        });

        await accessControl
          .connect(lockOwner)
          .revokeCredential(
            testLockId,
            signResult.signedHash,
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
      const edgeIdentity = await cryptoService.generateIdentity();
      const wrongIdentity = await cryptoService.generateIdentity();

      edgeKeyPair = {
        publicKey: edgeIdentity.address,
        privateKey: edgeIdentity.privateKey,
      };
      wrongKeyPair = {
        publicKey: wrongIdentity.address,
        privateKey: wrongIdentity.privateKey,
      };

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
        userMetaDataHash: cryptoService.hash("test-data"),
        issuanceDate: new Date().toISOString(),
      };

      const hashToSign = cryptoService.hash(JSON.stringify(vcInput));
      // Sign with the WRONG key pair
      const signResult = await onChainService.signForBlockchain(
        hashToSign,
        wrongKeyPair.privateKey
      );

      await expect(
        accessControl
          .connect(lockOwner)
          .revokeCredential(
            edgeLockId,
            signResult.signedHash,
            signResult.signature
          )
      ).to.be.revertedWith("AuthenticationFailed");
    });

    it("Should reject if VC hash doesn't match signature", async function () {
      const vcInput = {
        userMetaDataHash: cryptoService.hash("original-data"),
        issuanceDate: new Date().toISOString(),
      };

      const hashToSign = cryptoService.hash(JSON.stringify(vcInput));
      const signResult = await onChainService.signForBlockchain(
        hashToSign,
        edgeKeyPair.privateKey
      );

      // Use a different VC hash
      const differentHash = cryptoService.hash("different-data");

      await expect(
        accessControl
          .connect(lockOwner)
          .revokeCredential(edgeLockId, differentHash, signResult.signature)
      ).to.be.revertedWith("AuthenticationFailed");
    });
  });
});
