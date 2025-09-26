// Example: How to cache revoked signatures using events
// This would be in your device's JavaScript/TypeScript code

const ethers = require("ethers");

class SignatureCache {
  constructor(contractAddress, provider) {
    this.contract = new ethers.Contract(contractAddress, ABI, provider);
    this.revokedSignatures = new Map(); // lockId -> Set of signature hashes
    this.initialized = false;
  }

  // Initialize cache by fetching all historical events
  async initializeCache() {
    console.log("Initializing signature cache...");

    // Get all historical SignatureRevoked events
    const filter = this.contract.filters.SignatureRevoked();
    const events = await this.contract.queryFilter(filter, 0, "latest");

    for (const event of events) {
      const { lockId, signatureHash } = event.args;
      this.addToCache(lockId.toString(), signatureHash);
    }

    // Start listening for new events
    this.contract.on("SignatureRevoked", (lockId, signatureHash, owner) => {
      this.addToCache(lockId.toString(), signatureHash);
      console.log(`Cached revoked signature for lock ${lockId}`);
    });

    this.initialized = true;
    console.log(
      `Cache initialized with ${this.getTotalCachedSignatures()} revoked signatures`
    );
  }

  // Add signature hash to cache
  addToCache(lockId, signatureHash) {
    if (!this.revokedSignatures.has(lockId)) {
      this.revokedSignatures.set(lockId, new Set());
    }
    this.revokedSignatures.get(lockId).add(signatureHash);
  }

  // Check if signature is revoked (O(1) lookup)
  isSignatureRevoked(lockId, signature) {
    if (!this.initialized) {
      throw new Error("Cache not initialized. Call initializeCache() first.");
    }

    const signatureHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(signature)
    );
    const lockSignatures = this.revokedSignatures.get(lockId.toString());
    return lockSignatures ? lockSignatures.has(signatureHash) : false;
  }

  // Get all revoked signatures for a lock (what the removed function did)
  getRevokedSignatures(lockId) {
    const lockSignatures = this.revokedSignatures.get(lockId.toString());
    return lockSignatures ? Array.from(lockSignatures) : [];
  }

  // Get count of revoked signatures (matches contract's getRevokedSignatureCount)
  getRevokedCount(lockId) {
    const lockSignatures = this.revokedSignatures.get(lockId.toString());
    return lockSignatures ? lockSignatures.size : 0;
  }

  // Utility functions
  getTotalCachedSignatures() {
    let total = 0;
    for (const signatures of this.revokedSignatures.values()) {
      total += signatures.size;
    }
    return total;
  }

  // Save cache to local storage/file for persistence
  saveCache() {
    const cacheData = {};
    for (const [lockId, signatures] of this.revokedSignatures.entries()) {
      cacheData[lockId] = Array.from(signatures);
    }
    // Save to localStorage or file
    localStorage.setItem("revokedSignatureCache", JSON.stringify(cacheData));
  }

  // Load cache from local storage/file
  loadCache() {
    const cached = localStorage.getItem("revokedSignatureCache");
    if (cached) {
      const cacheData = JSON.parse(cached);
      for (const [lockId, signatures] of Object.entries(cacheData)) {
        this.revokedSignatures.set(lockId, new Set(signatures));
      }
    }
  }
}

// Usage example:
async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    "http://localhost:8545"
  );
  const cache = new SignatureCache("0x...contract-address...", provider);

  // Load existing cache
  cache.loadCache();

  // Initialize and sync with blockchain
  await cache.initializeCache();

  // Now you can use it
  const isRevoked = cache.isSignatureRevoked(1, "some-signature");
  const revokedSigs = cache.getRevokedSignatures(1);
  const count = cache.getRevokedCount(1);

  console.log("Signature revoked:", isRevoked);
  console.log("All revoked signatures:", revokedSigs);
  console.log("Revoked count:", count);

  // Periodically save cache
  setInterval(() => cache.saveCache(), 60000); // Save every minute
}
