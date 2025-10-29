// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title AccessControl
 * @dev Manages lock registration and credential revocation with cryptographic authentication
 * @notice Revokes CREDENTIALS (by vcHash), not signatures. Signature is only used for authentication.
 * The signature proves the owner has the lock's private key, preventing cross-lock revocation attacks.
 */
contract AccessControl is Ownable, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;
    
    // Security constants
    uint256 public constant MAX_REVOKED_CREDENTIALS = 1000;

    // Lock struct - stores signer address for cryptographic authentication
    struct Lock {
        address owner;              // Owner who can revoke credentials and transfer ownership
        address signerAddress;      // Ethereum address derived from lock's public key - authenticates revocation requests
        uint256 revokedCount;
        bool exists;
    }

    // Storage
    mapping(uint256 => Lock) public locks;
    mapping(uint256 => mapping(bytes32 => bool)) public revokedCredentials; // lockId => vcHash => isRevoked
    
    uint256 private _lockCounter = 0;
    
    // Events
    event LockRegistered(uint256 indexed lockId, address indexed owner, address indexed signerAddress);
    event CredentialRevoked(uint256 indexed lockId, bytes32 indexed vcHash, address owner);
    event LockOwnershipTransferred(uint256 indexed lockId, address indexed previousOwner, address indexed newOwner);
    
    // Custom errors
    error LockNotFound(uint256 lockId);
    error NotLockOwner(address caller, uint256 lockId);
    error CredentialAlreadyRevoked(uint256 lockId, bytes32 vcHash);
    error SignatureEmpty();
    error InvalidAddress();
    error SameOwner();
    error TooManyRevokedCredentials();
    error InvalidVCHash();
    error AuthenticationFailed(bytes32 vcHash, bytes signature);

    // Modifiers
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
     * @dev Register a new lock with its signing address
     * @param signerAddress The Ethereum address derived from the lock's ECDSA public key
     * @notice Critical for security: signerAddress binds this lockId to a specific key pair,
     * preventing cross-lock revocation attacks
     */
    function registerLock(address signerAddress) 
        external 
        whenNotPaused 
        nonReentrant 
        returns (uint256) 
    {
        if (signerAddress == address(0)) revert InvalidAddress();
        
        uint256 lockId = ++_lockCounter;
        
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
     * @dev Revoke a credential (not the signature itself!)
     * @param lockId The lock ID
     * @param vcHash Hash of the verifiable credential to revoke
     * @param authSignature Ethereum-style signature for authentication (proves caller has lock's private key)
     * @notice The signature is ONLY for authentication. We revoke the vcHash (the credential).
     * This prevents cross-lock revocation: the signature must be created by THIS lock's private key.
     */
    function revokeCredential(
        uint256 lockId,
        bytes32 vcHash,
        bytes calldata authSignature
    ) 
        external 
        whenNotPaused
        lockExists(lockId)
        onlyLockOwner(lockId)
        nonReentrant
    {     
        if (authSignature.length == 0) revert SignatureEmpty();
        if (vcHash == bytes32(0)) revert InvalidVCHash();
        
        Lock storage lock = locks[lockId];
        
        // AUTHENTICATION: Prove the caller has THIS lock's private key
        if (!_authenticateOwner(lockId, vcHash, authSignature)) {
            revert AuthenticationFailed(vcHash, authSignature);
        }
        
        if (lock.revokedCount >= MAX_REVOKED_CREDENTIALS) revert TooManyRevokedCredentials();
        
        // Check if credential already revoked
        if (revokedCredentials[lockId][vcHash]) {
            revert CredentialAlreadyRevoked(lockId, vcHash);
        }
        
        // REVOKE THE CREDENTIAL (vcHash), not the signature!
        revokedCredentials[lockId][vcHash] = true;
        ++lock.revokedCount;
        
        emit CredentialRevoked(lockId, vcHash, msg.sender);
    }

    /**
     * @dev Authenticate that the caller possesses the lock's private key
     * @param lockId The lock's ID
     * @param vcHash The message being signed (the credential hash to revoke)
     * @param authSignature The Ethereum-style signature for authentication
     * @return bool True if authentication succeeds
     * @notice This proves the caller owns THIS lock's private key, preventing cross-lock attacks.
     * The signature is ephemeral - we don't store it, only use it for authentication.
     */
    function _authenticateOwner(
        uint256 lockId,
        bytes32 vcHash,
        bytes calldata authSignature
    ) internal view returns (bool) {
        Lock storage lock = locks[lockId];
        
        // Recover the Ethereum address that created this authentication signature
        address recoveredSigner = vcHash.toEthSignedMessageHash().recover(authSignature);
        
        // Compare with the stored signer address from registration
        return recoveredSigner == lock.signerAddress;
    }


    /**
     * @dev Transfer lock ownership with authentication
     * @param lockId The lock ID
     * @param authSignature Authentication signature proving ownership of lock's private key
     * @param message Message that was signed (can be any nonce/message)
     * @param newOwner New owner address
     * @notice Authentication ensures the physical lock authorizes the transfer
     */
    function transferLockOwnership(
        uint256 lockId,
        bytes32 message,
        bytes calldata authSignature,
        address newOwner
    ) 
        external 
        whenNotPaused
        lockExists(lockId)
        onlyLockOwner(lockId)
        nonReentrant
    {
        // Validate new owner FIRST (before expensive signature check)
        if (newOwner == address(0)) revert InvalidAddress();
        if (newOwner == locks[lockId].owner) revert SameOwner();
        
        // Authenticate
        if (authSignature.length == 0) revert SignatureEmpty();
        if (message == bytes32(0)) revert InvalidVCHash();
        if (!_authenticateOwner(lockId, message, authSignature)) {
            revert AuthenticationFailed(message, authSignature);
        }
        
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
    
    function verifySignerAddress(uint256 lockId, address signerAddress) 
        external 
        view 
        lockExists(lockId) 
        returns (bool) 
    {
        return signerAddress == locks[lockId].signerAddress;
    }

    /**
     * @dev Check if a credential (vcHash) is revoked
     * @param lockId The lock ID
     * @param vcHash The credential hash to check
     * @return bool True if the credential is revoked
     * @notice This is what the physical lock calls to verify a credential
     */
    function isCredentialRevoked(uint256 lockId, bytes32 vcHash) external view returns (bool) {
        return revokedCredentials[lockId][vcHash];
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