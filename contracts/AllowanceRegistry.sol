// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AllowanceRegistry
/// @notice Prototype registry for agent payment policies and receipts.
/// @dev This contract does not custody user funds. It records policy-bounded receipts.
contract AllowanceRegistry {
    struct Policy {
        address controller;
        address agent;
        address settlementToken;
        uint128 epochCap;
        uint128 perTxCap;
        uint64 epochSeconds;
        uint64 epochStartedAt;
        bool active;
    }

    mapping(bytes32 => Policy) public policies;
    mapping(bytes32 => uint256) public spentInEpoch;
    mapping(bytes32 => mapping(bytes32 => bool)) public allowedMerchant;
    mapping(bytes32 => mapping(bytes32 => bool)) public usedIntentNonce;

    event PolicyCreated(
        bytes32 indexed policyId,
        address indexed controller,
        address indexed agent,
        address settlementToken,
        uint128 epochCap,
        uint128 perTxCap,
        uint64 epochSeconds,
        bytes32 controllerNonce
    );

    event PolicyActiveSet(bytes32 indexed policyId, bool active);

    event ReceiptRecorded(
        bytes32 indexed policyId,
        bytes32 indexed receiptId,
        address indexed agent,
        bytes32 merchantId,
        uint128 amount,
        bytes32 intentHash,
        bytes32 intentNonce,
        bytes32 metadataHash
    );

    error NotController();
    error NotAuthorizedRecorder();
    error InvalidPolicy();
    error InactivePolicy();
    error MerchantNotAllowed();
    error PerTransactionCapExceeded();
    error EpochCapExceeded();
    error InvalidReceiptNonce();
    error ReceiptReplay();

    modifier onlyController(bytes32 policyId) {
        if (policies[policyId].controller != msg.sender) revert NotController();
        _;
    }

    function createPolicy(
        address agent,
        address settlementToken,
        uint128 epochCap,
        uint128 perTxCap,
        uint64 epochSeconds,
        bytes32 controllerNonce,
        bytes32[] calldata merchantIds
    ) external returns (bytes32 policyId) {
        if (agent == address(0) || epochCap == 0 || perTxCap == 0 || epochSeconds == 0 || controllerNonce == bytes32(0)) {
            revert InvalidPolicy();
        }

        policyId = keccak256(
            abi.encode(msg.sender, agent, settlementToken, epochCap, perTxCap, epochSeconds, block.chainid, controllerNonce)
        );

        policies[policyId] = Policy({
            controller: msg.sender,
            agent: agent,
            settlementToken: settlementToken,
            epochCap: epochCap,
            perTxCap: perTxCap,
            epochSeconds: epochSeconds,
            epochStartedAt: uint64(block.timestamp),
            active: true
        });

        for (uint256 i = 0; i < merchantIds.length; i++) {
            allowedMerchant[policyId][merchantIds[i]] = true;
        }

        emit PolicyCreated(policyId, msg.sender, agent, settlementToken, epochCap, perTxCap, epochSeconds, controllerNonce);
    }

    function setPolicyActive(bytes32 policyId, bool active) external onlyController(policyId) {
        policies[policyId].active = active;
        emit PolicyActiveSet(policyId, active);
    }

    function setMerchantAllowed(bytes32 policyId, bytes32 merchantId, bool allowed) external onlyController(policyId) {
        allowedMerchant[policyId][merchantId] = allowed;
    }

    function recordReceipt(
        bytes32 policyId,
        bytes32 merchantId,
        uint128 amount,
        bytes32 intentHash,
        bytes32 intentNonce,
        bytes32 metadataHash
    ) external returns (bytes32 receiptId) {
        Policy storage policy = policies[policyId];
        if (!policy.active) revert InactivePolicy();
        if (msg.sender != policy.controller && msg.sender != policy.agent) revert NotAuthorizedRecorder();
        if (!allowedMerchant[policyId][merchantId]) revert MerchantNotAllowed();
        if (amount > policy.perTxCap) revert PerTransactionCapExceeded();
        if (intentNonce == bytes32(0)) revert InvalidReceiptNonce();
        if (usedIntentNonce[policyId][intentNonce]) revert ReceiptReplay();

        if (block.timestamp >= policy.epochStartedAt + policy.epochSeconds) {
            policy.epochStartedAt = uint64(block.timestamp);
            spentInEpoch[policyId] = 0;
        }

        uint256 nextSpent = spentInEpoch[policyId] + amount;
        if (nextSpent > policy.epochCap) revert EpochCapExceeded();
        spentInEpoch[policyId] = nextSpent;
        usedIntentNonce[policyId][intentNonce] = true;

        receiptId = keccak256(
            abi.encode(policyId, merchantId, amount, intentHash, intentNonce, metadataHash, msg.sender, block.chainid)
        );

        emit ReceiptRecorded(policyId, receiptId, policy.agent, merchantId, amount, intentHash, intentNonce, metadataHash);
    }
}
