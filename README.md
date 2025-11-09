# Access Control Smart Contract

Solidity implementation of a decentralized access control system for IoT smart locks with verifiable credential management.

## Overview

This smart contract manages lock registration and credential revocation using cryptographic authentication. It implements a secure system where physical locks can revoke verifiable credentials (VCs) with proof of ownership through ECDSA signatures.

### Key Features

- **Lock Registration**: Register locks with their unique ECDSA public key (as Ethereum address)
- **Credential Revocation**: Revoke verifiable credentials with cryptographic authentication
- **Ownership Transfer**: Transfer lock ownership with signature-based authorization
- **Event-Based Synchronization**: Emit events for real-time off-chain monitoring
- **Security Features**: Pausable, ReentrancyGuard, and owner controls
- **Gas Optimized**: Uses mappings and events rather than arrays for scalability

### Security Architecture

The contract prevents **cross-lock revocation attacks** by binding each lock to a specific ECDSA key pair:

- Each lock stores a `signerAddress` (Ethereum address derived from the lock's public key)
- Revocation requests must include a signature proving possession of the lock's private key
- The signature authenticates the request but is **not** stored (ephemeral authentication)
- Only the credential hash (`vcHash`) is permanently marked as revoked

## Project Structure

```
├── contracts/
│   └── AccessControl.sol          # Main smart contract
├── scripts/
│   └── deploy.ts                  # Deployment script
├── test/
│   └── AccessControl.crypto.test.ts  # Cryptographic tests
├── examples/
│   ├── batch-cache.js             # Batch revocation checking
│   ├── hybrid-cache.js            # Event-based sync pattern
│   └── signature-cache.js         # Simple caching example
├── hardhat.config.ts              # Hardhat configuration
└── typechain-types/               # Generated TypeScript types
```

## Smart Contract API

### Core Functions

#### `registerLock(address signerAddress) → uint256`

Register a new lock with its signing address.

- **Parameters**: `signerAddress` - Ethereum address derived from lock's ECDSA public key
- **Returns**: `lockId` - Unique identifier for the registered lock
- **Events**: `LockRegistered(lockId, owner, signerAddress)`

#### `revokeCredential(uint256 lockId, bytes32 vcHash, bytes authSignature)`

Revoke a verifiable credential with authentication.

- **Parameters**:
  - `lockId` - The lock's unique ID
  - `vcHash` - Hash of the credential to revoke
  - `authSignature` - ECDSA signature proving ownership of lock's private key
- **Events**: `CredentialRevoked(lockId, vcHash, owner)`
- **Security**: Requires signature authentication + owner authorization

#### `transferLockOwnership(uint256 lockId, bytes32 message, bytes authSignature, address newOwner)`

Transfer lock ownership with cryptographic authorization.

- **Parameters**:
  - `lockId` - The lock's ID
  - `message` - Message/nonce that was signed
  - `authSignature` - Signature proving possession of lock's private key
  - `newOwner` - Address of the new owner
- **Events**: `LockOwnershipTransferred(lockId, previousOwner, newOwner)`

### View Functions

#### `isCredentialRevoked(uint256 lockId, bytes32 vcHash) → bool`

Check if a credential is revoked (public view function).

#### `getAllRevokedCredentials(uint256 lockId) → bytes32[]`

Get all revoked credential hashes for a lock.

- **Note**: Returns array of all revoked vcHashes. Gas cost increases with revocation count.

#### `getLockInfo(uint256 lockId) → (address owner, address signerAddress, uint256 revokedCount, bool exists)`

Get comprehensive information about a lock.

#### `getRevokedSignatureCount(uint256 lockId) → uint256`

Get the number of revoked credentials for a lock.

#### `getSignerAddress(uint256 lockId) → address`

Get the signing address associated with a lock.

#### `getLockOwner(uint256 lockId) → address`

Get the owner address of a lock.

#### `getTotalLocks() → uint256`

Get the total number of registered locks.

### Admin Functions

#### `pause()` / `unpause()`

Emergency pause/unpause contract operations (owner only).

#### `emergencyTransferLockOwnership(uint256 lockId, address newOwner)`

Emergency ownership transfer without signature verification (owner only).

## Usage Examples

### Lock Registration

```javascript
const signerAddress = "0x..."; // Derived from lock's ECDSA public key
const tx = await accessControl.registerLock(signerAddress);
const receipt = await tx.wait();
const lockId = receipt.events[0].args.lockId;
```

### Credential Revocation

```javascript
const vcHash = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("credential-data")
);
const authSignature = await lockPrivateKey.signMessage(
  ethers.utils.arrayify(vcHash)
);
await accessControl.revokeCredential(lockId, vcHash, authSignature);
```

### Event-Based Synchronization (Recommended)

```javascript
// Initial sync on setup
const events = await accessControl.queryFilter(
  accessControl.filters.CredentialRevoked(lockId),
  fromBlock,
  "latest"
);

// Real-time listening
accessControl.on(
  accessControl.filters.CredentialRevoked(lockId),
  (lockId, vcHash, owner) => {
    console.log(`Credential ${vcHash} revoked for lock ${lockId}`);
    // Update local cache
  }
);
```

## Development

### Prerequisites

- Node.js >= 16
- npm or yarn
- Hardhat

### Installation

```bash
npm install
```

### Compile

```bash
npx hardhat compile
```

### Testing

```bash
npx hardhat test
```

### Deploy

```bash
# Local network
npx hardhat run scripts/deploy.ts

# Specific network
npx hardhat run scripts/deploy.ts --network <network_name>
```

### Generate TypeChain Types

```bash
npx hardhat typechain
```

## Configuration

### Networks

Configure networks in `hardhat.config.ts`:

- Local Hardhat network (default)
- Add custom networks as needed (testnet, mainnet)

### Compiler Settings

- Solidity: ^0.8.19
- Optimizer: Enabled
- EVM Version: Paris

## Security Considerations

### Authentication Model

- **Two-factor authorization**: Both Ethereum account ownership AND possession of lock's private key required
- **Signature verification**: ECDSA signature recovery validates physical lock authorization
- **Nonce-based protection**: Message/vcHash prevents signature replay attacks
- **Lock-specific binding**: signerAddress prevents cross-lock attacks

### Gas Limits

- Maximum revoked credentials per lock: 1000 (configurable via `MAX_REVOKED_CREDENTIALS`)
- Event-based querying recommended for scalability
- Array retrieval (`getAllRevokedCredentials`) limited by gas costs

### Best Practices

- ✅ Use event filtering for historical data retrieval
- ✅ Implement local caching on lock devices
- ✅ Monitor `CredentialRevoked` events in real-time
- ✅ Use batch queries for multiple credential checks
- ⚠️ Avoid calling `getAllRevokedCredentials` from other contracts
- ⚠️ Consider pagination for locks with many revocations

## License

MIT

## Dependencies

- OpenZeppelin Contracts (^5.0.0)
  - `Ownable`: Ownership management
  - `Pausable`: Emergency pause functionality
  - `ReentrancyGuard`: Reentrancy protection
  - `ECDSA`: Signature verification utilities

## Author

Final Thesis Project - IoT Access Control with Verifiable Credentials
