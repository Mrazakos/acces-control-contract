// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title AccessControl
 * @dev Stores public key hash, verifies signatures before revocation
 * @notice Lock stores full public key locally; sends it with transactions for verification
 */
contract AccessControl is Ownable, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;
    
    // Security constants
    uint256 public constant MAX_PUBLIC_KEY_LENGTH = 512;
    uint256 public constant MAX_REVOKED_SIGNATURES = 1000;

    // Lock struct - stores signer address derived from public key
    struct Lock {
        address owner;              // For access control only (who can revoke signatures)
        address signerAddress;      // Ethereum address derived from lock's ECDSA public key
        uint256 revokedCount;
        bool exists;
    }

    // Storage
    mapping(uint256 => Lock) public locks;
    mapping(uint256 => mapping(bytes32 => bool)) public revokedSignatures;
    
    uint256 private _lockCounter = 0;
    
    // Events
    event LockRegistered(uint256 indexed lockId, address indexed owner, address indexed signerAddress);
    event SignatureRevoked(uint256 indexed lockId, bytes32 indexed signatureHash, bytes32 indexed vcHash, address owner);
    event LockOwnershipTransferred(uint256 indexed lockId, address indexed previousOwner, address indexed newOwner);
    
    // Custom errors
    error LockNotFound(uint256 lockId);
    error NotLockOwner(address caller, uint256 lockId);
    error SignatureAlreadyRevoked(uint256 lockId, bytes32 signatureHash);
    error PublicKeyTooLong(uint256 length);
    error PublicKeyEmpty();
    error SignatureEmpty();
    error InvalidAddress();
    error SameOwner();
    error TooManyRevokedSignatures();
    error InvalidVCHash();
    error SignatureVerificationFailed(bytes32 vcHash, bytes signature);

    // Modifiers
    modifier onlyLockOwner(uint256 lockId) {
        if (locks[lockId].owner != msg.sender) {
            revert NotLockOwner(msg.sender, lockId);
        }
        _;
    }

    modifier onlyWithLockSignature(uint256 lockId, bytes calldata signature, bytes32 vcHash) {
        Lock storage lock = locks[lockId];

        if (!_verifySignature(lockId, signature, vcHash)) {
            revert SignatureVerificationFailed(vcHash, signature);
        }
        _;
    }

    modifier lockExists(uint256 lockId) {
        if (!locks[lockId].exists) {
            revert LockNotFound(lockId);
        }
        _;
    }

    /**
     * @dev Register a new lock - stores signer address derived from public key
     * @param publicKey The lock's ECDSA public key
     * @notice Lock should save its keypair locally; contract stores the derived Ethereum address
     */
    function registerLock(string calldata publicKey) 
        external 
        whenNotPaused 
        nonReentrant 
        returns (uint256) 
    {
        if (bytes(publicKey).length == 0) revert PublicKeyEmpty();
        if (bytes(publicKey).length > MAX_PUBLIC_KEY_LENGTH) revert PublicKeyTooLong(bytes(publicKey).length);
        
        uint256 lockId = ++_lockCounter;
        
        // Derive Ethereum address from the lock's public key
        // This is what ECDSA signature recovery will give us
        address signerAddress = address(uint160(uint256(keccak256(bytes(publicKey)))));
        
        locks[lockId] = Lock({
            owner: msg.sender,
            signerAddress: signerAddress,
            revokedCount: 0,
            exists: true
        });
        
        emit LockRegistered(lockId, msg.sender, signerAddress);
        return lockId;
    }

    /**
     * @dev Revoke a signature with verification
     * @param lockId The lock ID
     * @param signature The signature to revoke (raw bytes)
     * @param vcHash Hash of the verifiable credential that was signed
     * @notice Verifies that signature actually corresponds to the VC before revocation
     */
    function revokeSignature(
        uint256 lockId,
        bytes calldata signature,
        bytes32 vcHash
    ) 
        external 
        whenNotPaused
        lockExists(lockId)
        onlyLockOwner(lockId)
        onlyWithLockSignature(lockId, signature, vcHash)
        nonReentrant
    {
        if (signature.length == 0) revert SignatureEmpty();
        if (vcHash == bytes32(0)) revert InvalidVCHash();
        
        Lock storage lock = locks[lockId];
        
        if (lock.revokedCount >= MAX_REVOKED_SIGNATURES) revert TooManyRevokedSignatures();
        
        bytes32 signatureHash = keccak256(signature);
        
        if (revokedSignatures[lockId][signatureHash]) {
            revert SignatureAlreadyRevoked(lockId, signatureHash);
        }
        
        revokedSignatures[lockId][signatureHash] = true;
        ++lock.revokedCount;
        
        emit SignatureRevoked(lockId, signatureHash, vcHash, msg.sender);
    }


    /**
     * @dev Internal function to verify signature corresponds to VC hash
     * @param lockId The lock's ID
     * @param signature The ECDSA signature bytes from the lock
     * @param vcHash Hash of the verifiable credential that was signed
     * @return bool True if signature is valid for the VC hash
     * @notice Recovers signer address from signature and compares with stored address
     */
    function _verifySignature(
        uint256 lockId,
        bytes calldata signature,
        bytes32 vcHash
    ) internal view returns (bool) {
        Lock storage lock = locks[lockId];
        
        // Recover the Ethereum address that created this signature
        address recoveredSigner = vcHash.toEthSignedMessageHash().recover(signature);
        
        // Compare with the stored signer address from registration
        return recoveredSigner == lock.signerAddress;
    }

    /**
     * @dev Transfer lock ownership with signature verification
     * @param lockId The lock ID
     * @param signature The signature from the lock proving ownership
     * @param vcHash Hash used for signature verification
     * @param newOwner New owner address
     */
    function transferLockOwnership(
        uint256 lockId,
        bytes calldata signature,
        bytes32 vcHash,
        address newOwner
    ) 
        external 
        whenNotPaused
        lockExists(lockId)
        onlyLockOwner(lockId)
        onlyWithLockSignature(lockId, signature, vcHash)
        nonReentrant
    {
        if (newOwner == address(0)) revert InvalidAddress();
        if (newOwner == locks[lockId].owner) revert SameOwner();
        
        address previousOwner = locks[lockId].owner;
        locks[lockId].owner = newOwner;
        
        emit LockOwnershipTransferred(lockId, previousOwner, newOwner);
    }

    
    function getSignerAddress(uint256 lockId) external view lockExists(lockId) returns (address) {
        return locks[lockId].signerAddress;
    }

    function getLockOwner(uint256 lockId) external view lockExists(lockId) returns (address) {
        return locks[lockId].owner;
    }
    
    function verifyPublicKey(uint256 lockId, string calldata publicKey) 
        external 
        view 
        lockExists(lockId) 
        returns (bool) 
    {
        // Derive address from provided public key and compare with stored signer address
        address derivedAddress = address(uint160(uint256(keccak256(bytes(publicKey)))));
        return derivedAddress == locks[lockId].signerAddress;
    }

    function isSignatureRevoked(uint256 lockId, bytes calldata signature) external view returns (bool) {
        return revokedSignatures[lockId][keccak256(signature)];
    }

    function getTotalLocks() external view returns (uint256) {
        return _lockCounter;
    }

    function lockExistsView(uint256 lockId) external view returns (bool) {
        return locks[lockId].exists;
    }

    function getRevokedSignatureCount(uint256 lockId) external view lockExists(lockId) returns (uint256) {
        return locks[lockId].revokedCount;
    }

    function getLockInfo(uint256 lockId) 
        external 
        view 
        lockExists(lockId) 
        returns (address owner, address signerAddress, uint256 revokedCount, bool exists) 
    {
        Lock memory lock = locks[lockId];
        return (lock.owner, lock.signerAddress, lock.revokedCount, lock.exists);
    }

    // Admin functions
    
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyTransferLockOwnership(uint256 lockId, address newOwner) 
        external 
        onlyOwner 
        lockExists(lockId) 
    {
        if (newOwner == address(0)) revert InvalidAddress();
        
        address previousOwner = locks[lockId].owner;
        locks[lockId].owner = newOwner;
        
        emit LockOwnershipTransferred(lockId, previousOwner, newOwner);
    }
}