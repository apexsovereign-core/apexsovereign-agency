export interface CodeFile {
  id: string;
  path: string;
  name: string;
  category: 'core' | 'db' | 'services' | 'api' | 'schemas' | 'infra' | 'tests' | 'frontend' | 'backend';
  language: 'python' | 'sql' | 'yaml' | 'dockerfile' | 'markdown' | 'text' | 'html' | 'javascript' | 'json';
  description: string;
  keyFeatures: string[];
  content: string;
}

export interface ResourceTier {
  id: string;
  name: string;
  category: 'CPU' | 'GPU';
  hourlyBase: number;
  cpuDefault: number;
  memoryMbDefault: number;
  gpuCountDefault: number;
  specs: string;
}

export interface SimulatedLedgerEntry {
  id: string;
  timestamp: string;
  tenantId: string;
  type: 'CREDIT_PURCHASE' | 'COMPUTE_USAGE' | 'REFUND';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  idempotencyKey: string;
  referenceId: string;
  status: 'COMMITTED' | 'REVERTED' | 'REPLAYED';
}

export interface WebhookSimulationLog {
  id: string;
  timestamp: string;
  eventType: string;
  transmissionId: string;
  certUrl: string;
  signatureStatus: 'VERIFIED' | 'FAILED_SIGNATURE' | 'BLOCKED_SSRF' | 'REPLAY_DETECTED';
  tenantId: string;
  creditsAllocated: number;
  details: string;
}

export interface CustomerUser {
  id: string;
  email: string;
  fullName: string;
  company: string;
  tenantId: string;
  role: 'customer' | 'admin';
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  computeCredits: number;
  maxQuota: number;
  apiKey: string;
  createdAt: string;
  subscriptionExpiresAt: string;
}

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'SGD';

export interface SubscriptionTier {
  id: 'starter' | 'pro' | 'enterprise';
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  computeUnits: number;
  description: string;
  tagline?: string;
  popular?: boolean;
  features: string[];
  badge?: string;
  paypalPlanId: string;
  dynamicPriceMonthly?: number;
  dynamicPriceAnnual?: number;
  discountAppliedPct?: number;
  effectiveWeeklyRateUsd?: number;
  epochId?: string;
}

export interface WeeklyEpochSnapshot {
  epoch_id: string;
  week_number: number;
  year: number;
  valid_from_utc: string;
  valid_until_utc: string;
  next_recalibration_utc: string;
  seconds_remaining: number;
  is_active: boolean;
  wholesale_discount_pct: number;
  discount_multiplier: number;
  base_cu_per_1k_usd: number;
  locked_cu_per_1k_usd: number;
  agent_swarm_hour_usd: number;
  energy_efficiency_index: number;
  swarm_density_factor: number;
  hmac_signature: string;
  calibration_notes?: string;
}

export interface WeeklyMarketCalibrationData {
  status: string;
  epoch_id: string;
  week_number: number;
  year: number;
  valid_from_utc: string;
  valid_until_utc: string;
  next_recalibration_utc: string;
  seconds_remaining: number;
  wholesale_discount_pct: number;
  discount_multiplier: number;
  base_cu_per_1k_usd: number;
  locked_cu_per_1k_usd: number;
  agent_swarm_hour_usd: number;
  energy_efficiency_index: number;
  swarm_density_factor: number;
  hmac_signature: string;
  cfo_guarantee: string;
  currency: CurrencyCode;
  fx_rate_to_usd: number;
  all_fx_rates: Record<CurrencyCode, number>;
  historical_snapshots?: WeeklyEpochSnapshot[];
}

export interface DynamicMarketRateData {
  status: string;
  timestampUtc: string;
  marketDemandStatus: 'OFF_PEAK_SURPLUS' | 'OPTIMIZED_WHOLESALE_DISPATCH' | 'HIGH_COMPUTE_UTILIZATION';
  wholesaleEfficiencyDiscountPct: number;
  discountMultiplier: number;
  baseCuPer1kUsd: number;
  dynamicCuPer1kUsd: number;
  currency: CurrencyCode;
  fxRateToUsd: number;
  allFxRates: Record<CurrencyCode, number>;
}

export interface EnterpriseRoiMetrics {
  headcount: number;
  monthlyWorkflows: number;
  legacyCrmAnnualTco: number;
  legacySuiteAnnualTco: number;
  apexSovereignAnnualCost: number;
  netAnnualSavingsVsLegacyCrm: number;
  netAnnualSavingsVsLegacySuite: number;
  savingsPercentage: number;
  roiMultiple: number;
  manualHoursEliminatedAnnual: number;
}

export interface NeuralMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tokensUsed?: number;
  latencyMs?: number;
  toolsUsed?: string[];
  streaming?: boolean;
  auditSignature?: string;
  model?: string;
}

export interface NeuralSessionState {
  sessionId: string;
  tenantId: string;
  activeModel: 'apex-neural-3.8-sovereign' | 'apex-neural-fast-arbitrage' | 'apex-neural-enclave-deep';
  tokenBudget: number;
  tokensConsumed: number;
  rlsSecurityLevel: string;
  rateLimitRemaining: number;
}

export interface PaymentTransaction {
  id: string;
  paypalOrderId: string;
  tenantId: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  timestamp: string;
  transmissionId: string;
  creditsAwarded: number;
  captureId?: string;
  ledgerEntryId?: string;
  payerEmail?: string;
}

export interface ComputeJob {
  id: string;
  name: string;
  type: string;
  costCredits: number;
  status: 'RUNNING' | 'COMPLETED' | 'QUEUED';
  timestamp: string;
  durationSec: number;
}

export interface AgentToolExecution {
  id: string;
  toolName: 'verify_paypal_transaction' | 'diagnose_pipeline_error' | 'dispatch_resend_documentation' | 'check_gpu_spot_inventory' | 'reconcile_tenant_credits' | 'auto_rebalance_swarm' | 'dispatch_compute_cluster' | 'triage_compute_intent';
  parameters: Record<string, any>;
  resultStatus: 'EXECUTING' | 'SUCCESS' | 'ERROR';
  summary: string;
  latencyMs?: number;
  timestamp: string;
  auditSignature?: string;
}

export interface InboundChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  qualificationTier?: 'SOVEREIGN_HOT' | 'ENTERPRISE_QUALIFIED' | 'EXPLORATORY' | 'NURTURE';
  leadScore?: number;
  suggestedActions?: string[];
  toolInvocations?: AgentToolExecution[];
  agentRole?: 'CONCIERGE' | 'DIAGNOSTIC_DOCTOR' | 'SETTLEMENT_RECONCILER' | 'CLUSTER_ARCHITECT';
  resendConfirmation?: ResendEmailConfirmation;
  actionPayload?: Record<string, any>;
}

export interface LeadQualificationResult {
  sessionId: string;
  agentReply: string;
  leadScore: number;
  qualificationTier: 'SOVEREIGN_HOT' | 'ENTERPRISE_QUALIFIED' | 'EXPLORATORY' | 'NURTURE';
  recommendedPlan: string;
  suggestedActions: string[];
  capturedLeadId?: string;
  crmSynced: boolean;
  emailDispatched: boolean;
  resendConfirmation?: ResendEmailConfirmation;
  activeAgent?: 'CONCIERGE' | 'DIAGNOSTIC_DOCTOR' | 'SETTLEMENT_RECONCILER' | 'CLUSTER_ARCHITECT';
  toolExecutions?: AgentToolExecution[];
}

export interface ResendEmailConfirmation {
  messageId: string;
  recipient: string;
  subject: string;
  docType: string;
  status: 'DELIVERED' | 'QUEUED' | 'SIMULATED';
  timestamp: string;
}

export interface SmsOtpSendRequest {
  phone_number: string;
  tenant_id?: string;
  purpose?: string;
}

export interface SmsOtpSendResponse {
  status: 'OTP_DISPATCHED' | 'RATE_LIMITED' | 'ERROR';
  phone_number: string;
  expires_in_seconds: number;
  purpose: string;
  dev_preview_otp?: string;
  message?: string;
}

export interface SmsOtpVerifyRequest {
  phone_number: string;
  otp: string;
  tenant_id?: string;
}

export interface SmsOtpVerifyResponse {
  status: 'AUTHENTICATED' | 'INVALID_OTP' | 'EXPIRED' | 'MAX_ATTEMPTS_EXCEEDED';
  session_token?: string;
  tenant_id?: string;
  phone_number?: string;
  authenticated_at?: string;
  rls_claims?: {
    role: string;
    tenant_id: string;
    permissions: string[];
    clearance_level?: string;
    phone_verified?: boolean;
  };
  audit_signature?: string;
  error?: string;
}

export type CrmStage = 
  | 'DISCOVERY'
  | 'QUALIFIED_OPPORTUNITY'
  | 'SECURITY_CLEARANCE'
  | 'HMAC_LEASE_PROVISIONED'
  | 'CLOSED_ACTIVE_COMPUTE'
  | 'EXPANDED';

export interface CrmDealRecord {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  valueUsd: number;
  computeUnitsMonthly: number;
  stage: CrmStage;
  winProbability: number;
  aiSentiment: 'HIGH_INTENT' | 'TECHNICAL_DEEP' | 'STANDARD_EVAL' | 'URGENT';
  clusterTarget: 'A100_SXM4' | 'H100_SXM5' | 'HYBRID_DISTRIBUTED';
  zeroTouchLogs: string[];
  lastActivity: string;
  createdAt: string;
  resendProposalSent: boolean;
  paypalInvoiceLinked: boolean;
}

export interface ProductivityDoc {
  id: string;
  title: string;
  category: 'SLA_SPEC' | 'CLUSTER_ARCHITECTURE' | 'COMPUTE_RUNBOOK' | 'AUDIT_REPORT';
  collaborators: string[];
  content: string;
  lastEdited: string;
  autoSynced: boolean;
  agentApproved: boolean;
  securityClearance: 'PUBLIC' | 'CONFIDENTIAL' | 'RESTRICTED_SOVEREIGN';
}

export interface AutonomousAgentWorker {
  id: string;
  name: string;
  role: 'DIAGNOSTIC_HEALER' | 'QUOTA_SCALER' | 'SETTLEMENT_RECONCILER' | 'CODE_EXEC_DISPATCHER';
  status: 'ACTIVE_PATROL' | 'EXECUTING_REMEDIATION' | 'STANDBY_WATCH' | 'HEALTHY';
  tasksResolvedToday: number;
  lastRemediation: string;
  latencyMs: number;
  description: string;
  capabilities: string[];
}

export interface AgentExecutionEvent {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  targetTenant: string;
  status: 'SUCCESS' | 'EXECUTING' | 'AUTO_REMEDIATED';
  details: string;
  timestamp: string;
  latencyMs: number;
}

export interface DiagnosticCheck {
  id: string;
  subsystem: string;
  checkName: string;
  status: 'PASS' | 'OPTIMIZING' | 'WARMED';
  metric: string;
  autoResolved: boolean;
  timestamp: string;
}

export type GpuNodeHealth = 'OPTIMAL' | 'DEGRADED' | 'THROTTLED' | 'MAINTENANCE';

export interface GpuNodeMetric {
  nodeId: string;
  datacenterRegion: string;
  gpuModel: string;
  gpuCount: number;
  utilizationPct: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  temperatureC: number;
  powerDrawWatts: number;
  powerLimitWatts: number;
  healthStatus: GpuNodeHealth;
  activeLeasesCount: number;
  arbitrageSpotRatePerHour: number;
  interconnectBandwidthGbps: number;
  fanSpeedPct: number;
  timestamp: string;
}

export interface ClusterUtilizationSummary {
  totalGpusOnline: number;
  totalGpusActive: number;
  averageUtilizationPct: number;
  totalMemoryUsedGb: number;
  totalMemoryCapacityGb: number;
  totalPowerWatts: number;
  effectiveSpotRateSavingsPct: number;
  activeWorkloadsCount: number;
  timestamp: string;
}

export interface GpuWebSocketMessage {
  type: 'METRICS_UPDATE' | 'HEARTBEAT_ACK' | 'NODE_ALERT' | 'INITIAL_STATE';
  clusterSummary: ClusterUtilizationSummary;
  nodes: GpuNodeMetric[];
  sequenceId: number;
  serverTimestamp: number;
  hmacSignature?: string;
}


