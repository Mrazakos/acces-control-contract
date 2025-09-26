// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title AccessControlImproved
 * @dev Production-ready smart contract for managing locks and access control
 * @notice Implements gas-efficient signature revocation and proper access controls
 */
contract AccessControlImproved is Ownable, Pausable, ReentrancyGuard {
    // Maximum length for public keys to prevent abuse
    uint256 public constant MAX_PUBLIC_KEY_LENGTH = 512;
    
    // Maximum number of revoked signatures per lock to prevent DoS
    uint256 public constant MAX_REVOKED_SIGNATURES = 1000;

    // Struct to represent a Lock (packed for gas efficiency)
    struct Lock {
        address owner;      // 20 bytes
        bool exists;        // 1 byte
        uint32 revokedCount; // 4 bytes (up to 4.2B revoked signatures)
        // Total: 32 bytes (1 storage slot)
    }

    // Mappings
    mapping(uint256 => Lock) public locks;
    mapping(uint256 => string) public lockPublicKeys;
    mapping(uint256 => mapping(bytes32 => bool)) public revokedSignatures;
    
    // Counter for generating unique lock IDs
    uint256 private _lockCounter;
    
    // Events
    event LockRegistered(uint256 indexed lockId, address indexed owner, string publicKey);
    event SignatureRevoked(uint256 indexed lockId, bytes32 indexed signatureHash, address indexed owner);
    event OwnershipTransferred(uint256 indexed lockId, address indexed previousOwner, address indexed newOwner);
    event MaxSignaturesUpdated(uint256 newMax);
    
    // Custom errors (gas efficient)
    error LockNotFound(uint256 lockId);
    error NotLockOwner(address caller, uint256 lockId);
    error SignatureAlreadyRevoked(uint256 lockId, bytes32 signatureHash);
    error PublicKeyTooLong(uint256 length, uint256 maxLength);
    error PublicKeyEmpty();
    error SignatureEmpty();
    error InvalidAddress();
    error SameOwner();
    error TooManyRevokedSignatures(uint256 current, uint256 max);

    /**
     * @dev Modifier to check if the caller is the owner of the lock
     */
    modifier onlyLockOwner(uint256 lockId) {
        if (locks[lockId].owner != msg.sender) {
            revert NotLockOwner(msg.sender, lockId);
        }
        _;
    }

    /**
     * @dev Modifier to check if a lock exists
     */
    modifier lockExists(uint256 lockId) {
        if (!locks[lockId].exists) {
            revert LockNotFound(lockId);
        }
        _;
    }

    constructor() {
        _lockCounter = 1; // Start with ID 1
    }
    
    /**
     * @dev Registers a new lock in the smart contract
     * @param publicKey The public key associated with the lock
     * @return lockId The generated lock ID
     */
    function registerLock(string calldata publicKey) 
        external 
        whenNotPaused 
        nonReentrant 
        returns (uint256) 
    {
        if (bytes(publicKey).length == 0) revert PublicKeyEmpty();
        if (bytes(publicKey).length > MAX_PUBLIC_KEY_LENGTH) {
            revert PublicKeyTooLong(bytes(publicKey).length, MAX_PUBLIC_KEY_LENGTH);
        }
        
        uint256 lockId = _lockCounter++;
        
        locks[lockId] = Lock({
            owner: msg.sender,
            exists: true,
            revokedCount: 0
        });
        
        lockPublicKeys[lockId] = publicKey;
        
        emit LockRegistered(lockId, msg.sender, publicKey);
        return lockId;
    }
    
    /**
     * @dev Revokes a signature for a specific lock
     * @param lockId The ID of the lock
     * @param signature The signature to revoke
     */
    function revokeSignature(uint256 lockId, string calldata signature) 
        external 
        whenNotPaused
        lockExists(lockId)
        onlyLockOwner(lockId)
        nonReentrant
    {
        if (bytes(signature).length == 0) revert SignatureEmpty();
        
        Lock storage lock = locks[lockId];
        if (lock.revokedCount >= MAX_REVOKED_SIGNATURES) {
            revert TooManyRevokedSignatures(lock.revokedCount, MAX_REVOKED_SIGNATURES);
        }
        
        bytes32 signatureHash = keccak256(bytes(signature));
        if (revokedSignatures[lockId][signatureHash]) {
            revert SignatureAlreadyRevoked(lockId, signatureHash);
        }
        
        revokedSignatures[lockId][signatureHash] = true;
        lock.revokedCount++;
        
        emit SignatureRevoked(lockId, signatureHash, msg.sender);
    }

    /**
     * @dev Revokes multiple signatures for a specific lock (batch operation)
     * @param lockId The ID of the lock
     * @param signatures Array of signatures to revoke
     */
    function batchRevokeSignatures(uint256 lockId, string[] calldata signatures)
        external
        whenNotPaused
        lockExists(lockId)
        onlyLockOwner(lockId)
        nonReentrant
    {
        Lock storage lock = locks[lockId];
        uint256 signaturesLength = signatures.length;
        
        if (lock.revokedCount + signaturesLength > MAX_REVOKED_SIGNATURES) {
            revert TooManyRevokedSignatures(lock.revokedCount + signaturesLength, MAX_REVOKED_SIGNATURES);
        }
        
        for (uint256 i = 0; i < signaturesLength;) {
            if (bytes(signatures[i]).length == 0) revert SignatureEmpty();
            
            bytes32 signatureHash = keccak256(bytes(signatures[i]));
            if (revokedSignatures[lockId][signatureHash]) {
                revert SignatureAlreadyRevoked(lockId, signatureHash);
            }
            
            revokedSignatures[lockId][signatureHash] = true;
            emit SignatureRevoked(lockId, signatureHash, msg.sender);
            
            unchecked { ++i; }
        }
        
        lock.revokedCount += uint32(signaturesLength);
    }

    /**
     * @dev Transfers ownership of a lock to a new owner
     * @param lockId The ID of the lock
     * @param newOwner The address of the new owner
     */
    function transferLockOwnership(uint256 lockId, address newOwner) 
        external 
        whenNotPaused
        lockExists(lockId)
        onlyLockOwner(lockId)
        nonReentrant
    {
        if (newOwner == address(0)) revert InvalidAddress();
        if (newOwner == locks[lockId].owner) revert SameOwner();
        
        address previousOwner = locks[lockId].owner;
        locks[lockId].owner = newOwner;
        
        emit OwnershipTransferred(lockId, previousOwner, newOwner);
    }
    
    /**
     * @dev Fetches the public key for a lock
     * @param lockId The ID of the lock
     * @return The public key associated with the lock
     */
    function getPublicKey(uint256 lockId) 
        external 
        view 
        lockExists(lockId) 
        returns (string memory) 
    {
        return lockPublicKeys[lockId];
    }

    /**
     * @dev Gets the owner of a lock
     * @param lockId The ID of the lock
     * @return The owner address of the lock
     */
    function getLockOwner(uint256 lockId) 
        external 
        view 
        lockExists(lockId) 
        returns (address) 
    {
        return locks[lockId].owner;
    }

    /**
     * @dev Checks if a signature is revoked for a specific lock (O(1) lookup)
     * @param lockId The ID of the lock
     * @param signature The signature to check
     * @return True if the signature is revoked, false otherwise
     */
    function isSignatureRevoked(uint256 lockId, string calldata signature) 
        external 
        view 
        returns (bool) 
    {
        bytes32 signatureHash = keccak256(bytes(signature));
        return revokedSignatures[lockId][signatureHash];
    }

    /**
     * @dev Gets the total number of locks created
     * @return The total number of locks
     */
    function getTotalLocks() external view returns (uint256) {
        return _lockCounter - 1;
    }

    /**
     * @dev Checks if a lock exists
     * @param lockId The ID of the lock
     * @return True if the lock exists, false otherwise
     */
    function lockExistsView(uint256 lockId) external view returns (bool) {
        return locks[lockId].exists;
    }

    /**
     * @dev Gets the number of revoked signatures for a lock
     * @param lockId The ID of the lock
     * @return The number of revoked signatures
     */
    function getRevokedSignatureCount(uint256 lockId) 
        external 
        view 
        lockExists(lockId) 
        returns (uint256) 
    {
        return locks[lockId].revokedCount;
    }

    /**
     * @dev Gets lock information in a single call (gas efficient)
     * @param lockId The ID of the lock
     * @return owner The owner of the lock
     * @return publicKey The public key of the lock  
     * @return revokedCount The number of revoked signatures
     * @return exists Whether the lock exists
     */
    function getLockInfo(uint256 lockId) 
        external 
        view 
        lockExists(lockId) 
        returns (
            address owner,
            string memory publicKey,
            uint256 revokedCount,
            bool exists
        ) 
    {
        Lock memory lock = locks[lockId];
        return (
            lock.owner,
            lockPublicKeys[lockId],
            lock.revokedCount,
            lock.exists
        );
    }

    // Admin functions
    /**
     * @dev Pause the contract (emergency use)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Emergency function to transfer lock ownership by contract owner
     * @param lockId The ID of the lock
     * @param newOwner The new owner address
     */
    function emergencyTransferLockOwnership(uint256 lockId, address newOwner) 
        external 
        onlyOwner 
        lockExists(lockId) 
    {
        if (newOwner == address(0)) revert InvalidAddress();
        
        address previousOwner = locks[lockId].owner;
        locks[lockId].owner = newOwner;
        
        emit OwnershipTransferred(lockId, previousOwner, newOwner);
    }
}