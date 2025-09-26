// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AccessControlOptimized
 * @dev Production-ready, gas-optimized smart contract for managing locks and access control
 * @notice Minimal dependencies version with built-in security features
 */
contract AccessControlOptimized {
    // Maximum constraints to prevent abuse
    uint256 public constant MAX_PUBLIC_KEY_LENGTH = 512;
    uint256 public constant MAX_REVOKED_SIGNATURES = 1000;

    // Contract owner
    address public immutable owner;
    
    // Contract state
    bool public paused = false;

    // Packed struct for gas efficiency (fits in one storage slot)
    struct Lock {
        address owner;      // 20 bytes
        bool exists;        // 1 byte  
        uint32 revokedCount; // 4 bytes
        // 7 bytes remaining in slot
    }

    // Storage mappings
    mapping(uint256 => Lock) public locks;
    mapping(uint256 => string) private _lockPublicKeys;
    mapping(uint256 => mapping(bytes32 => bool)) public revokedSignatures;
    
    // Lock counter (starts at 1)
    uint256 private _lockCounter = 1;
    
    // Events
    event LockRegistered(uint256 indexed lockId, address indexed lockOwner, string publicKey);
    event SignatureRevoked(uint256 indexed lockId, bytes32 indexed signatureHash, address indexed revoker);
    event LockOwnershipTransferred(uint256 indexed lockId, address indexed previousOwner, address indexed newOwner);
    event ContractPaused(address indexed pauser);
    event ContractUnpaused(address indexed unpauser);
    
    // Custom errors (more gas efficient than require strings)
    error Unauthorized();
    error ContractIsPaused();
    error LockNotFound();
    error NotLockOwner();
    error SignatureAlreadyRevoked();
    error PublicKeyTooLong();
    error PublicKeyEmpty();
    error SignatureEmpty();
    error InvalidAddress();
    error SameOwner();
    error TooManyRevokedSignatures();
    error ArrayLengthMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractIsPaused();
        _;
    }

    modifier onlyLockOwner(uint256 lockId) {
        if (locks[lockId].owner != msg.sender) revert NotLockOwner();
        _;
    }

    modifier validLock(uint256 lockId) {
        if (!locks[lockId].exists) revert LockNotFound();
        _;
    }

    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @dev Registers a new lock with gas-optimized storage
     * @param publicKey The public key associated with the lock
     * @return lockId The generated unique lock ID
     */
    function registerLock(string calldata publicKey) 
        external 
        whenNotPaused 
        returns (uint256 lockId) 
    {
        uint256 keyLength = bytes(publicKey).length;
        if (keyLength == 0) revert PublicKeyEmpty();
        if (keyLength > MAX_PUBLIC_KEY_LENGTH) revert PublicKeyTooLong();
        
        lockId = _lockCounter++;
        
        // Single storage write for the struct
        locks[lockId] = Lock({
            owner: msg.sender,
            exists: true,
            revokedCount: 0
        });
        
        _lockPublicKeys[lockId] = publicKey;
        
        emit LockRegistered(lockId, msg.sender, publicKey);
    }
    
    /**
     * @dev Revokes a signature with O(1) complexity
     * @param lockId The ID of the lock
     * @param signature The signature to revoke
     */
    function revokeSignature(uint256 lockId, string calldata signature) 
        external 
        whenNotPaused
        validLock(lockId)
        onlyLockOwner(lockId)
    {
        if (bytes(signature).length == 0) revert SignatureEmpty();
        
        Lock storage lock = locks[lockId];
        if (lock.revokedCount >= MAX_REVOKED_SIGNATURES) revert TooManyRevokedSignatures();
        
        bytes32 sigHash = keccak256(bytes(signature));
        if (revokedSignatures[lockId][sigHash]) revert SignatureAlreadyRevoked();
        
        revokedSignatures[lockId][sigHash] = true;
        ++lock.revokedCount; // More gas efficient than lock.revokedCount++
        
        emit SignatureRevoked(lockId, sigHash, msg.sender);
    }

    /**
     * @dev Batch revoke signatures for maximum efficiency
     * @param lockId The ID of the lock
     * @param signatures Array of signatures to revoke
     */
    function batchRevokeSignatures(uint256 lockId, string[] calldata signatures)
        external
        whenNotPaused
        validLock(lockId)
        onlyLockOwner(lockId)
    {
        Lock storage lock = locks[lockId];
        uint256 sigCount = signatures.length;
        
        if (lock.revokedCount + sigCount > MAX_REVOKED_SIGNATURES) {
            revert TooManyRevokedSignatures();
        }
        
        bytes32 sigHash;
        for (uint256 i; i < sigCount;) {
            if (bytes(signatures[i]).length == 0) revert SignatureEmpty();
            
            sigHash = keccak256(bytes(signatures[i]));
            if (revokedSignatures[lockId][sigHash]) revert SignatureAlreadyRevoked();
            
            revokedSignatures[lockId][sigHash] = true;
            emit SignatureRevoked(lockId, sigHash, msg.sender);
            
            unchecked { ++i; } // Gas optimization for loop
        }
        
        lock.revokedCount += uint32(sigCount);
    }

    /**
     * @dev Transfers lock ownership with proper validation
     * @param lockId The ID of the lock
     * @param newOwner The address of the new owner
     */
    function transferLockOwnership(uint256 lockId, address newOwner) 
        external 
        whenNotPaused
        validLock(lockId)
        onlyLockOwner(lockId)
    {
        if (newOwner == address(0)) revert InvalidAddress();
        
        address currentOwner = locks[lockId].owner;
        if (newOwner == currentOwner) revert SameOwner();
        
        locks[lockId].owner = newOwner;
        
        emit LockOwnershipTransferred(lockId, currentOwner, newOwner);
    }
    
    // View functions (no gas cost when called externally)
    
    /**
     * @dev Gets public key for a lock
     */
    function getPublicKey(uint256 lockId) 
        external 
        view 
        validLock(lockId) 
        returns (string memory) 
    {
        return _lockPublicKeys[lockId];
    }

    /**
     * @dev Gets lock owner
     */
    function getLockOwner(uint256 lockId) 
        external 
        view 
        validLock(lockId) 
        returns (address) 
    {
        return locks[lockId].owner;
    }

    /**
     * @dev Checks if signature is revoked (O(1) lookup)
     */
    function isSignatureRevoked(uint256 lockId, string calldata signature) 
        external 
        view 
        returns (bool) 
    {
        return revokedSignatures[lockId][keccak256(bytes(signature))];
    }

    /**
     * @dev Gets total locks created
     */
    function getTotalLocks() external view returns (uint256) {
        return _lockCounter - 1;
    }

    /**
     * @dev Checks if lock exists
     */
    function lockExists(uint256 lockId) external view returns (bool) {
        return locks[lockId].exists;
    }

    /**
     * @dev Gets revoked signature count for a lock
     */
    function getRevokedSignatureCount(uint256 lockId) 
        external 
        view 
        validLock(lockId) 
        returns (uint256) 
    {
        return locks[lockId].revokedCount;
    }

    /**
     * @dev Gets complete lock information in single call
     * @param lockId The lock ID to query
     * @return lockOwner The owner of the lock
     * @return publicKey The public key
     * @return revokedCount Number of revoked signatures
     * @return exists Whether lock exists
     */
    function getLockInfo(uint256 lockId) 
        external 
        view 
        validLock(lockId)
        returns (
            address lockOwner,
            string memory publicKey,
            uint256 revokedCount,
            bool exists
        ) 
    {
        Lock memory lock = locks[lockId];
        return (
            lock.owner,
            _lockPublicKeys[lockId],
            lock.revokedCount,
            lock.exists
        );
    }

    // Admin functions
    
    /**
     * @dev Pause contract in emergency
     */
    function pause() external onlyOwner {
        paused = true;
        emit ContractPaused(msg.sender);
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyOwner {
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    /**
     * @dev Emergency transfer of lock ownership by contract owner
     */
    function emergencyTransferLockOwnership(uint256 lockId, address newOwner) 
        external 
        onlyOwner 
        validLock(lockId) 
    {
        if (newOwner == address(0)) revert InvalidAddress();
        
        address currentOwner = locks[lockId].owner;
        locks[lockId].owner = newOwner;
        
        emit LockOwnershipTransferred(lockId, currentOwner, newOwner);
    }
}