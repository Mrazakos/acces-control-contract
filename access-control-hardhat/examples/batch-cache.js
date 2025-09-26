// Batch sync strategy for devices with intermittent connectivity
const ethers = require("ethers");
const fs = require("fs");

class BatchSignatureCache {
  constructor(contractAddress, provider) {
    this.contract = new ethers.Contract(contractAddress, ABI, provider);
    this.cacheFile = "signature_cache.json";
    this.cache = this.loadCache();
    this.lastSyncedBlock = this.cache.lastSyncedBlock || 0;
  }

  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        return JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
      }
    } catch (error) {
      console.warn("Could not load cache, starting fresh:", error.message);
    }
    return { locks: {}, lastSyncedBlock: 0 };
  }

  saveCache() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error("Could not save cache:", error.message);
    }
  }

  async batchSync(batchSize = 10000) {
    console.log("Starting batch sync...");

    const currentBlock = await this.contract.provider.getBlockNumber();
    let fromBlock = this.lastSyncedBlock + 1;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);

      console.log(`Syncing blocks ${fromBlock} to ${toBlock}`);

      try {
        const filter = this.contract.filters.SignatureRevoked();
        const events = await this.contract.queryFilter(
          filter,
          fromBlock,
          toBlock
        );

        for (const event of events) {
          const { lockId, signatureHash } = event.args;
          const lockIdStr = lockId.toString();

          if (!this.cache.locks[lockIdStr]) {
            this.cache.locks[lockIdStr] = [];
          }

          if (!this.cache.locks[lockIdStr].includes(signatureHash)) {
            this.cache.locks[lockIdStr].push(signatureHash);
          }
        }

        this.cache.lastSyncedBlock = toBlock;
        this.lastSyncedBlock = toBlock;

        // Save progress periodically
        if (toBlock % (batchSize * 5) === 0) {
          this.saveCache();
        }
      } catch (error) {
        console.error(
          `Error syncing blocks ${fromBlock}-${toBlock}:`,
          error.message
        );
        break;
      }

      fromBlock = toBlock + 1;
    }

    this.saveCache();
    console.log(`Batch sync complete. Synced to block ${this.lastSyncedBlock}`);
  }

  // Fast local lookups
  isSignatureRevoked(lockId, signature) {
    const signatureHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(signature)
    );
    const lockSignatures = this.cache.locks[lockId.toString()];
    return lockSignatures ? lockSignatures.includes(signatureHash) : false;
  }

  getRevokedSignatures(lockId) {
    return this.cache.locks[lockId.toString()] || [];
  }

  getRevokedCount(lockId) {
    return (this.cache.locks[lockId.toString()] || []).length;
  }

  // Sync only specific locks (for targeted updates)
  async syncSpecificLock(lockId) {
    console.log(`Syncing specific lock ${lockId}...`);

    const filter = this.contract.filters.SignatureRevoked(lockId);
    const events = await this.contract.queryFilter(filter, 0, "latest");

    const lockIdStr = lockId.toString();
    this.cache.locks[lockIdStr] = [];

    for (const event of events) {
      const { signatureHash } = event.args;
      if (!this.cache.locks[lockIdStr].includes(signatureHash)) {
        this.cache.locks[lockIdStr].push(signatureHash);
      }
    }

    this.saveCache();
    console.log(`Synced ${events.length} signatures for lock ${lockId}`);
  }

  // Get statistics
  getStats() {
    const totalLocks = Object.keys(this.cache.locks).length;
    const totalSignatures = Object.values(this.cache.locks).reduce(
      (sum, sigs) => sum + sigs.length,
      0
    );

    return {
      totalLocks,
      totalSignatures,
      lastSyncedBlock: this.lastSyncedBlock,
      cacheSize: JSON.stringify(this.cache).length,
    };
  }

  // Cleanup old data (if needed for storage constraints)
  cleanup(keepRecentBlocks = 100000) {
    // This would require storing block numbers with signatures
    // Implementation depends on your specific needs
    console.log(
      "Cleanup functionality can be implemented based on requirements"
    );
  }
}

// Usage for intermittent connectivity device
async function deviceSync() {
  const provider = new ethers.providers.JsonRpcProvider(
    "http://localhost:8545"
  );
  const cache = new BatchSignatureCache("0x...contract-address...", provider);

  try {
    // Do a full batch sync when connectivity is available
    await cache.batchSync(5000); // Smaller batches for stability

    // Now you can use offline lookups
    console.log("Device can now work offline!");
    console.log("Stats:", cache.getStats());

    // Example offline usage
    const isRevoked = cache.isSignatureRevoked(1, "test-signature");
    const allRevoked = cache.getRevokedSignatures(1);
    const count = cache.getRevokedCount(1);

    console.log({ isRevoked, allRevoked, count });
  } catch (error) {
    console.error("Sync failed:", error.message);
    console.log("Using existing cache for offline operation");
  }
}

module.exports = BatchSignatureCache;
