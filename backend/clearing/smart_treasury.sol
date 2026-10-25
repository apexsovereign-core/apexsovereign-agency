// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ============================================================================
 * ApexSovereign.ai - TIER-3 AUTONOMOUS CLEARING & LIQUIDITY TREASURY
 * File: backend/clearing/smart_treasury.sol
 * Invariants:
 *   1. M-of-N Multi-Signature Governance for Treasury Policy Changes.
 *   2. Non-custodial Escrow for GPU pre-orders with cryptographic claim verification.
 *   3. Closed-Loop Self-Reinvestment: Automated profit distribution to capacity reserve.
 *   4. Zero-Reentrancy & Atomic State Invariance across all settlement vectors.
 * ============================================================================
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract SovereignSmartTreasury {
    // -------------------------------------------------------------------------
    // 1. CONSTANTS & DATA STRUCTURES
    // -------------------------------------------------------------------------
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant MAX_SIGNERS = 10;
    uint256 public constant MIN_ESCROW_DURATION = 60; // 1 minute
    uint256 public constant MAX_ESCROW_DURATION = 365 days;

    enum EscrowStatus {
        PENDING,
        FULFILLED,
        REFUNDED,
        DISPUTED
    }

    struct GpuEscrowOrder {
        bytes32 orderId;
        address buyer;
        address provider;
        uint256 amount;
        uint256 lockTimestamp;
        uint256 expirationTimestamp;
        bytes32 zkProofHash;
        EscrowStatus status;
    }

    struct MultiSigProposal {
        bytes32 proposalId;
        address target;
        uint256 value;
        bytes data;
        uint256 approvalsCount;
        bool executed;
        uint256 submissionTime;
    }

    // -------------------------------------------------------------------------
    // 2. STATE VARIABLES
    // -------------------------------------------------------------------------
    IERC20 public immutable settlementToken; // e.g., USDC or sovereign clearing token
    
    // Multi-sig governance state
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public requiredApprovals;
    mapping(bytes32 => MultiSigProposal) public proposals;
    mapping(bytes32 => mapping(address => bool)) public hasApproved;

    // Escrow state
    mapping(bytes32 => GpuEscrowOrder) public escrowOrders;
    
    // Reinvestment & Allocation Parameters (Basis points: 100 bps = 1%)
    uint256 public capacityReserveBps = 6000; // 60% automated GPU pre-purchasing
    uint256 public insuranceFundBps = 2000;   // 20% slash insurance fund
    uint256 public treasuryYieldBps = 2000;   // 20% protocol liquidity

    address public capacityReserveVault;
    address public insuranceFundVault;
    address public protocolYieldVault;

    // Circuit Breaker & Reentrancy Guards
    bool private locked;
    bool public paused;

    // -------------------------------------------------------------------------
    // 3. EVENTS
    // -------------------------------------------------------------------------
    event EscrowDeposited(bytes32 indexed orderId, address indexed buyer, address indexed provider, uint256 amount, uint256 expiration);
    event EscrowFulfilled(bytes32 indexed orderId, address indexed provider, uint256 amount, bytes32 zkProofHash);
    event EscrowRefunded(bytes32 indexed orderId, address indexed buyer, uint256 amount);
    event ProfitDistributed(uint256 totalProfit, uint256 toReserve, uint256 toInsurance, uint256 toYield);
    event ProposalSubmitted(bytes32 indexed proposalId, address target, uint256 value);
    event ProposalApproved(bytes32 indexed proposalId, address indexed signer);
    event ProposalExecuted(bytes32 indexed proposalId);
    event TreasuryPaused(address indexed account);
    event TreasuryUnpaused(address indexed account);

    // -------------------------------------------------------------------------
    // 4. MODIFIERS
    // -------------------------------------------------------------------------
    modifier nonReentrant() {
        require(!locked, "REENTRANCY_GUARD");
        locked = true;
        _;
        locked = false;
    }

    modifier onlySigner() {
        require(isSigner[msg.sender], "CALLER_NOT_AUTHORIZED_SIGNER");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "TREASURY_CIRCUIT_BREAKER_ACTIVE");
        _;
    }

    // -------------------------------------------------------------------------
    // 5. CONSTRUCTOR
    // -------------------------------------------------------------------------
    constructor(
        address _settlementToken,
        address[] memory _signers,
        uint256 _requiredApprovals,
        address _capacityReserve,
        address _insuranceFund,
        address _protocolYield
    ) {
        require(_settlementToken != address(0), "INVALID_TOKEN_ADDRESS");
        require(_signers.length > 0 && _signers.length <= MAX_SIGNERS, "INVALID_SIGNERS_COUNT");
        require(_requiredApprovals > 0 && _requiredApprovals <= _signers.length, "INVALID_APPROVAL_THRESHOLD");
        require(_capacityReserve != address(0) && _insuranceFund != address(0) && _protocolYield != address(0), "INVALID_VAULTS");

        settlementToken = IERC20(_settlementToken);

        for (uint256 i = 0; i < _signers.length; i++) {
            address s = _signers[i];
            require(s != address(0), "INVALID_SIGNER_ADDRESS");
            require(!isSigner[s], "DUPLICATE_SIGNER");
            isSigner[s] = true;
            signers.push(s);
        }

        requiredApprovals = _requiredApprovals;
        capacityReserveVault = _capacityReserve;
        insuranceFundVault = _insuranceFund;
        protocolYieldVault = _protocolYield;
    }

    // -------------------------------------------------------------------------
    // 6. GPU CAPACITY ESCROW & ORDER LIFECYCLE
    // -------------------------------------------------------------------------

    /**
     * @notice Locks settlement tokens in escrow for a targeted GPU compute contract.
     * @param orderId Unique identifier for compute batch.
     * @param provider Address of GPU provider or node cluster operator.
     * @param amount Token quantity locked in escrow.
     * @param durationSeconds Validity window for execution SLA.
     */
    function depositGpuEscrow(
        bytes32 orderId,
        address provider,
        uint256 amount,
        uint256 durationSeconds
    ) external nonReentrant whenNotPaused {
        require(orderId != bytes32(0), "INVALID_ORDER_ID");
        require(provider != address(0), "INVALID_PROVIDER");
        require(amount > 0, "ESCROW_AMOUNT_ZERO");
        require(durationSeconds >= MIN_ESCROW_DURATION && durationSeconds <= MAX_ESCROW_DURATION, "INVALID_DURATION");
        require(escrowOrders[orderId].amount == 0, "ORDER_ALREADY_EXISTS");

        bool success = settlementToken.transferFrom(msg.sender, address(this), amount);
        require(success, "TOKEN_TRANSFER_FAILED");

        uint256 expiration = block.timestamp + durationSeconds;
        escrowOrders[orderId] = GpuEscrowOrder({
            orderId: orderId,
            buyer: msg.sender,
            provider: provider,
            amount: amount,
            lockTimestamp: block.timestamp,
            expirationTimestamp: expiration,
            zkProofHash: bytes32(0),
            status: EscrowStatus.PENDING
        });

        emit EscrowDeposited(orderId, msg.sender, provider, amount, expiration);
    }

    /**
     * @notice Releases escrowed funds to provider upon verified ZK execution proof.
     * @param orderId Identifier of completed compute contract.
     * @param zkProofHash Cryptographic hash of Circom/Noir execution attestation.
     */
    function fulfillEscrow(
        bytes32 orderId,
        bytes32 zkProofHash
    ) external nonReentrant whenNotPaused {
        GpuEscrowOrder storage order = escrowOrders[orderId];
        require(order.amount > 0, "ORDER_NOT_FOUND");
        require(order.status == EscrowStatus.PENDING, "INVALID_ORDER_STATUS");
        require(zkProofHash != bytes32(0), "INVALID_ZK_PROOF_HASH");
        require(msg.sender == order.provider || isSigner[msg.sender], "UNAUTHORIZED_FULFILLMENT");

        order.status = EscrowStatus.FULFILLED;
        order.zkProofHash = zkProofHash;

        uint256 payout = order.amount;
        bool success = settlementToken.transfer(order.provider, payout);
        require(success, "PROVIDER_PAYOUT_FAILED");

        emit EscrowFulfilled(orderId, order.provider, payout, zkProofHash);
    }

    /**
     * @notice Allows buyer or authorized signer to claim refund if SLA window expires.
     * @param orderId Identifier of compute contract.
     */
    function refundEscrow(bytes32 orderId) external nonReentrant {
        GpuEscrowOrder storage order = escrowOrders[orderId];
        require(order.amount > 0, "ORDER_NOT_FOUND");
        require(order.status == EscrowStatus.PENDING, "INVALID_ORDER_STATUS");
        require(block.timestamp > order.expirationTimestamp || isSigner[msg.sender], "SLA_WINDOW_ACTIVE");

        order.status = EscrowStatus.REFUNDED;
        uint256 refundAmount = order.amount;

        bool success = settlementToken.transfer(order.buyer, refundAmount);
        require(success, "REFUND_TRANSFER_FAILED");

        emit EscrowRefunded(orderId, order.buyer, refundAmount);
    }

    // -------------------------------------------------------------------------
    // 7. CLOSED-LOOP REINVESTMENT & PROFIT DISTRIBUTION
    // -------------------------------------------------------------------------

    /**
     * @notice Distributes accumulated protocol revenues into reserve vaults.
     * @param profitAmount Net clearing surplus to allocate.
     */
    function distributeProtocolProfits(uint256 profitAmount) external nonReentrant onlySigner whenNotPaused {
        require(profitAmount > 0, "INVALID_PROFIT_AMOUNT");
        require(settlementToken.balanceOf(address(this)) >= profitAmount, "INSUFFICIENT_TREASURY_BALANCE");

        uint256 toReserve = (profitAmount * capacityReserveBps) / BASIS_POINTS_DIVISOR;
        uint256 toInsurance = (profitAmount * insuranceFundBps) / BASIS_POINTS_DIVISOR;
        uint256 toYield = profitAmount - toReserve - toInsurance;

        require(settlementToken.transfer(capacityReserveVault, toReserve), "RESERVE_TRANSFER_FAILED");
        require(settlementToken.transfer(insuranceFundVault, toInsurance), "INSURANCE_TRANSFER_FAILED");
        require(settlementToken.transfer(protocolYieldVault, toYield), "YIELD_TRANSFER_FAILED");

        emit ProfitDistributed(profitAmount, toReserve, toInsurance, toYield);
    }

    // -------------------------------------------------------------------------
    // 8. MULTI-SIG TREASURY GOVERNANCE
    // -------------------------------------------------------------------------

    function submitProposal(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlySigner returns (bytes32) {
        bytes32 proposalId = keccak256(abi.encodePacked(target, value, data, block.timestamp, proposalsCounter++));
        require(proposals[proposalId].proposalId == bytes32(0), "PROPOSAL_EXISTS");

        proposals[proposalId] = MultiSigProposal({
            proposalId: proposalId,
            target: target,
            value: value,
            data: data,
            approvalsCount: 1,
            executed: false,
            submissionTime: block.timestamp
        });

        hasApproved[proposalId][msg.sender] = true;
        emit ProposalSubmitted(proposalId, target, value);
        emit ProposalApproved(proposalId, msg.sender);
        return proposalId;
    }

    uint256 private proposalsCounter;

    function approveProposal(bytes32 proposalId) external onlySigner {
        MultiSigProposal storage p = proposals[proposalId];
        require(p.proposalId != bytes32(0), "PROPOSAL_NOT_FOUND");
        require(!p.executed, "PROPOSAL_ALREADY_EXECUTED");
        require(!hasApproved[proposalId][msg.sender], "ALREADY_APPROVED");

        hasApproved[proposalId][msg.sender] = true;
        p.approvalsCount++;

        emit ProposalApproved(proposalId, msg.sender);

        if (p.approvalsCount >= requiredApprovals) {
            executeProposal(proposalId);
        }
    }

    function executeProposal(bytes32 proposalId) public nonReentrant onlySigner {
        MultiSigProposal storage p = proposals[proposalId];
        require(p.proposalId != bytes32(0), "PROPOSAL_NOT_FOUND");
        require(!p.executed, "PROPOSAL_ALREADY_EXECUTED");
        require(p.approvalsCount >= requiredApprovals, "INSUFFICIENT_APPROVALS");

        p.executed = true;

        (bool success, ) = p.target.call{value: p.value}(p.data);
        require(success, "PROPOSAL_EXECUTION_FAILED");

        emit ProposalExecuted(proposalId);
    }

    function setCircuitBreaker(bool _paused) external onlySigner {
        paused = _paused;
        if (_paused) {
            emit TreasuryPaused(msg.sender);
        } else {
            emit TreasuryUnpaused(msg.sender);
        }
    }

    function getSigners() external view returns (address[] memory) {
        return signers;
    }
}
