// Hybrid: Batch sync every 15 minutes + Real-time event listening
const ethers = require("ethers");
const fs = require("fs");

class HybridSignatureCache {
  constructor(contractAddress, provider, abi) {
    this.contract = new ethers.Contract(contractAddress, abi, provider);
    this.cacheFile = "hybrid_signature_cache.json";
    this.cache = this.loadCache();
    this.lastSyncedBlock = this.cache.lastSyncedBlock || 0;

    // Event listener state
    this.eventListener = null;
    this.batchSyncInterval = null;
    this.isListening = false;
    this.pendingUpdates = new Set(); // Track real-time updates to avoid duplicates

    // Statistics
    this.stats = {
      realTimeUpdates: 0,
      batchUpdates: 0,
      lastBatchSync: null,
      lastRealTimeUpdate: null,
    };
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

  /**
   * Add signature to cache (used by both batch and real-time)
   */
  addSignatureToCache(lockId, signatureHash, source = "unknown") {
    const lockIdStr = lockId.toString();

    if (!this.cache.locks[lockIdStr]) {
      this.cache.locks[lockIdStr] = [];
    }

    // Avoid duplicates
    if (!this.cache.locks[lockIdStr].includes(signatureHash)) {
      this.cache.locks[lockIdStr].push(signatureHash);
      console.log(`Added signature via ${source}: Lock ${lockId}`);
      return true;
    }
    return false;
  }

  /**
   * Start real-time event listening
   */
  startEventListening() {
    if (this.isListening) {
      console.log("Already listening to events");
      return;
    }

    console.log("Starting real-time event listening...");

    // Listen for new SignatureRevoked events
    this.eventListener = this.contract.on(
      "SignatureRevoked",
      (lockId, signatureHash, owner, event) => {
        console.log(`Real-time event: Signature revoked for lock ${lockId}`);

        const added = this.addSignatureToCache(
          lockId,
          signatureHash,
          "real-time"
        );
        if (added) {
          this.stats.realTimeUpdates++;
          this.stats.lastRealTimeUpdate = new Date().toISOString();

          // Track this update to avoid duplicates during batch sync
          const eventKey = `${lockId.toString()}-${signatureHash}`;
          this.pendingUpdates.add(eventKey);

          // Save cache immediately for real-time updates
          this.saveCache();
        }
      }
    );

    this.isListening = true;
    console.log("Real-time event listening started");
  }

  /**
   * Stop real-time event listening
   */
  stopEventListening() {
    if (this.eventListener) {
      this.contract.removeAllListeners("SignatureRevoked");
      this.eventListener = null;
      this.isListening = false;
      console.log("Stopped real-time event listening");
    }
  }

  /**
   * Perform batch sync (every 15 minutes)
   */
  async performBatchSync(batchSize = 1000) {
    console.log("🔄 Starting scheduled batch sync...");

    try {
      const currentBlock = await this.contract.provider.getBlockNumber();
      let fromBlock = this.lastSyncedBlock + 1;
      let totalEvents = 0;

      while (fromBlock <= currentBlock) {
        const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);

        console.log(`Batch syncing blocks ${fromBlock} to ${toBlock}`);

        const filter = this.contract.filters.SignatureRevoked();
        const events = await this.contract.queryFilter(
          filter,
          fromBlock,
          toBlock
        );

        for (const event of events) {
          const { lockId, signatureHash } = event.args;
          const eventKey = `${lockId.toString()}-${signatureHash}`;

          // Skip if we already processed this via real-time events
          if (this.pendingUpdates.has(eventKey)) {
            console.log(`Skipping duplicate: ${eventKey}`);
            continue;
          }

          const added = this.addSignatureToCache(
            lockId,
            signatureHash,
            "batch"
          );
          if (added) {
            totalEvents++;
          }
        }

        fromBlock = toBlock + 1;
      }

      this.cache.lastSyncedBlock = currentBlock;
      this.lastSyncedBlock = currentBlock;
      this.stats.batchUpdates += totalEvents;
      this.stats.lastBatchSync = new Date().toISOString();

      // Clear pending updates after successful batch sync
      this.pendingUpdates.clear();

      this.saveCache();
      console.log(
        `✅ Batch sync complete: ${totalEvents} new signatures, synced to block ${currentBlock}`
      );
    } catch (error) {
      console.error("❌ Batch sync failed:", error.message);
    }
  }

  /**
   * Start the hybrid system (batch + real-time)
   */
  async startHybridSync(batchIntervalMinutes = 15) {
    console.log(
      `🚀 Starting hybrid sync system (batch every ${batchIntervalMinutes} minutes + real-time events)`
    );

    // Initial batch sync to catch up
    await this.performBatchSync();

    // Start real-time event listening
    this.startEventListening();

    // Start periodic batch sync (every 15 minutes)
    this.batchSyncInterval = setInterval(async () => {
      await this.performBatchSync();
    }, batchIntervalMinutes * 60 * 1000);

    console.log("✅ Hybrid sync system started successfully");
  }

  /**
   * Stop the hybrid system
   */
  stopHybridSync() {
    console.log("🛑 Stopping hybrid sync system...");

    this.stopEventListening();

    if (this.batchSyncInterval) {
      clearInterval(this.batchSyncInterval);
      this.batchSyncInterval = null;
    }

    this.saveCache();
    console.log("✅ Hybrid sync system stopped");
  }

  /**
   * Fast local lookups (same as before)
   */
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

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const totalLocks = Object.keys(this.cache.locks).length;
    const totalSignatures = Object.values(this.cache.locks).reduce(
      (sum, sigs) => sum + sigs.length,
      0
    );

    return {
      // Cache stats
      totalLocks,
      totalSignatures,
      lastSyncedBlock: this.lastSyncedBlock,
      cacheSize: JSON.stringify(this.cache).length,

      // Hybrid sync stats
      realTimeUpdates: this.stats.realTimeUpdates,
      batchUpdates: this.stats.batchUpdates,
      lastBatchSync: this.stats.lastBatchSync,
      lastRealTimeUpdate: this.stats.lastRealTimeUpdate,

      // System status
      isListening: this.isListening,
      batchSyncActive: !!this.batchSyncInterval,
      pendingUpdates: this.pendingUpdates.size,
    };
  }

  /**
   * Manual force sync (useful for testing or recovery)
   */
  async forceFullSync() {
    console.log("🔄 Force full sync requested...");

    // Stop current operations
    this.stopEventListening();

    // Reset sync position
    this.lastSyncedBlock = 0;
    this.cache.lastSyncedBlock = 0;
    this.cache.locks = {};

    // Perform full sync
    await this.performBatchSync();

    // Restart event listening
    this.startEventListening();

    console.log("✅ Force full sync complete");
  }

  /**
   * Health check - verify cache consistency
   */
  async healthCheck() {
    try {
      const currentBlock = await this.contract.provider.getBlockNumber();
      const blocksBehind = currentBlock - this.lastSyncedBlock;

      return {
        healthy: blocksBehind < 100, // Consider healthy if less than 100 blocks behind
        currentBlock,
        lastSyncedBlock: this.lastSyncedBlock,
        blocksBehind,
        isListening: this.isListening,
        batchSyncActive: !!this.batchSyncInterval,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  }
}

// Example usage
async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    "http://localhost:8545"
  );

  // You would need to provide the actual ABI
  const abi = [
    /* AccessControlClean ABI */
  ];
  const contractAddress = "0x..."; // Your contract address

  const hybridCache = new HybridSignatureCache(contractAddress, provider, abi);

  try {
    // Start the hybrid system (15-minute batch + real-time events)
    await hybridCache.startHybridSync(15);

    // Example usage after startup
    setInterval(() => {
      // Check signature status (instant local lookup)
      const isRevoked = hybridCache.isSignatureRevoked(1, "test-signature");
      const count = hybridCache.getRevokedCount(1);
      const stats = hybridCache.getStats();

      console.log(
        `Status check: ${isRevoked ? "REVOKED" : "VALID"}, Count: ${count}`
      );
      console.log(
        `Stats: RT: ${stats.realTimeUpdates}, Batch: ${stats.batchUpdates}`
      );
    }, 30000); // Check every 30 seconds

    // Health check every 5 minutes
    setInterval(async () => {
      const health = await hybridCache.healthCheck();
      console.log("Health check:", health);

      if (!health.healthy) {
        console.warn("⚠️ Cache health issue detected, consider force sync");
      }
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error("Failed to start hybrid cache:", error);
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("Shutting down...");
    hybridCache.stopHybridSync();
    process.exit(0);
  });
}

module.exports = HybridSignatureCache;

// Uncomment to run example
// main().catch(console.error);
