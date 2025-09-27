// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title AccessControl
 * @dev Clean, production-ready smart contract using OpenZeppelin inheritance
 * @notice Much simpler and more secure than custom implementations
 */
contract AccessControl is Ownable, Pausable, ReentrancyGuard {
    
    // Security constants
    uint256 public constant MAX_PUBLIC_KEY_LENGTH = 512;
    uint256 public constant MAX_REVOKED_SIGNATURES = 1000;

    // Lock struct design
    struct Lock {
        address owner;
        string publicKey;
        uint256 revokedCount;
        bool exists;
    }

    // Simple storage
    mapping(uint256 => Lock) public locks;
    mapping(uint256 => mapping(bytes32 => bool)) public revokedSignatures;
    
    uint256 private _lockCounter = 0;
    
    // Events
    event LockRegistered(uint256 indexed lockId, address indexed owner, string publicKey);
    event SignatureRevoked(uint256 indexed lockId, bytes32 indexed signatureHash, address indexed owner);
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

    // Simple modifiers
    modifier onlyLockOwner(uint256 lockId) {
        if (locks[lockId].owner != msg.sender) {
            revert NotLockOwner(msg.sender, lockId);
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
     * @dev Register a new lock
     */
    function registerLock(string calldata publicKey) 
        external 
        whenNotPaused 
        nonReentrant 
        returns (uint256) 
    {
        // Validation
        if (bytes(publicKey).length == 0) revert PublicKeyEmpty();
        if (bytes(publicKey).length > MAX_PUBLIC_KEY_LENGTH) revert PublicKeyTooLong(bytes(publicKey).length);
        
        uint256 lockId = ++_lockCounter;
        
        locks[lockId] = Lock({
            owner: msg.sender,
            publicKey: publicKey,
            revokedCount: 0,
            exists: true
        });
        
        emit LockRegistered(lockId, msg.sender, publicKey);
        return lockId;
    }
    
    /**
     * @dev Revoke a signature
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
        if (lock.revokedCount >= MAX_REVOKED_SIGNATURES) revert TooManyRevokedSignatures();
        
        bytes32 signatureHash = keccak256(bytes(signature));
        if (revokedSignatures[lockId][signatureHash]) {
            revert SignatureAlreadyRevoked(lockId, signatureHash);
        }
        
        revokedSignatures[lockId][signatureHash] = true;
        ++lock.revokedCount;
        
        emit SignatureRevoked(lockId, signatureHash, msg.sender);
    }

    /**
     * @dev Batch revoke signatures
     */
    function batchRevokeSignatures(uint256 lockId, string[] calldata signatures)
        external
        whenNotPaused
        lockExists(lockId)
        onlyLockOwner(lockId)
        nonReentrant
    {
        Lock storage lock = locks[lockId];
        uint256 count = signatures.length;
        
        if (lock.revokedCount + count > MAX_REVOKED_SIGNATURES) revert TooManyRevokedSignatures();
        
        for (uint256 i; i < count;) {
            if (bytes(signatures[i]).length == 0) revert SignatureEmpty();
            
            bytes32 signatureHash = keccak256(bytes(signatures[i]));
            if (revokedSignatures[lockId][signatureHash]) {
                revert SignatureAlreadyRevoked(lockId, signatureHash);
            }
            
            revokedSignatures[lockId][signatureHash] = true;
            emit SignatureRevoked(lockId, signatureHash, msg.sender);
            
            unchecked { ++i; }
        }
        
        lock.revokedCount += count;
    }

    /**
     * @dev Transfer lock ownership
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
        
        emit LockOwnershipTransferred(lockId, previousOwner, newOwner);
    }
    
    // View functions (gas-free when called externally)
    
    function getPublicKey(uint256 lockId) external view lockExists(lockId) returns (string memory) {
        return locks[lockId].publicKey;
    }

    function getLockOwner(uint256 lockId) external view lockExists(lockId) returns (address) {
        return locks[lockId].owner;
    }

    function isSignatureRevoked(uint256 lockId, string calldata signature) external view returns (bool) {
        return revokedSignatures[lockId][keccak256(bytes(signature))];
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
        returns (address owner, string memory publicKey, uint256 revokedCount, bool exists) 
    {
        Lock memory lock = locks[lockId];
        return (lock.owner, lock.publicKey, lock.revokedCount, lock.exists);
    }

    // Admin functions (inherited from OpenZeppelin's Ownable)
    
    function pause() external onlyOwner {
        _pause(); // OpenZeppelin's implementation
    }

    function unpause() external onlyOwner {
        _unpause(); // OpenZeppelin's implementation
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