/**
 * Návrh rozhraní, nikoli implementace runtime.
 * Autoritativní validátory review/QA jsou sousední JSON Schema soubory.
 * Všechny cesty/handles dodává validovaný controller, nikdy ne JSON od modelu.
 */

export type RunMode = 'review_qa' | 'implement_review_qa' | 'qa_only';
export type AgentRole = 'implementer' | 'reviewer';
export type ProviderKey = 'codex-cli' | 'claude-code-cli' | 'fake';
export type PermissionProfile = 'approved-worktrees-write' | 'review-export-read-only';

export interface ModelChoice {
  provider: ProviderKey;
  model: string;
  effort: string | null;
  timeoutSeconds: number;
  maxTurns: number | null;
}

export interface AvailableModel {
  id: string;
  label: string;
  effortOptions: string[];
  availability: 'verified' | 'unverified' | 'unavailable';
}

export interface DoctorResult {
  executablePath: string | null;
  version: string | null;
  status: 'ready' | 'unverified' | 'blocked';
  problems: Array<{ code: string; message: string; remediation: string }>;
  capabilities: {
    streaming: boolean;
    structuredOutput: boolean;
    explicitSessionResume: boolean;
    modelDiscovery: boolean;
    verifiedReadOnlyReview: boolean;
  };
  checkedAt: string;
}

export interface WorkspaceHandle {
  repositoryId: string;
  repoKey: string;
  absolutePath: string;
  baseSha: string;
  headSha: string;
}

export interface AgentRequest {
  runId: string;
  stepId: string;
  role: AgentRole;
  selection: ModelChoice;
  snapshotId: string;
  contextPacketPath: string;
  workingDirectory: string;
  workspaces: WorkspaceHandle[];
  permissionProfile: PermissionProfile;
  outputSchemaPath: string;
  outputDirectory: string;
  resumeSessionId: string | null;
}

export interface AgentEvent {
  type: 'started' | 'progress' | 'tool' | 'usage' | 'warning' | 'completed' | 'error';
  runId: string;
  stepId: string;
  timestamp: string;
  // Safe metadata only; raw provider logs require redaction and local access control.
  message: string;
}

export interface AgentResult {
  sessionId: string | null;
  status: 'completed' | 'failed' | 'cancelled' | 'incomplete' | 'limit_reached';
  exitCode: number | null;
  requestedModel: string;
  actualModels: string[] | null;
  structuredOutput: unknown;
  logArtifactIds: string[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reportedCostUsd: number | null;
    source: 'provider' | 'unknown';
  };
}

export interface AgentAdapter {
  readonly key: ProviderKey;
  doctor(): Promise<DoctorResult>;
  listModels(): Promise<AvailableModel[]>;
  run(
    request: AgentRequest,
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal,
  ): Promise<AgentResult>;
}

export interface ApprovedCommand {
  id: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutSeconds: number;
  envRefs: string[];
  // Controller resolves references to specific owned resources.
  resourceIds: string[];
}

export interface ArtifactEntry {
  id: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  source: 'runner' | 'manual' | 'demo';
  scenarioId: string | null;
  surfaceKey: string | null;
  createdAt: string;
  sensitivity: 'synthetic' | 'review_required' | 'restricted';
}

export interface EvidenceManifest {
  schemaVersion: '1.0';
  projectId: string;
  changeSetId: string;
  issueKeys: string[];
  runId: string;
  snapshotId: string;
  snapshotDigest: string;
  generatedAt: string;
  artifacts: ArtifactEntry[];
}

export interface PublishRequest {
  destinationId: string;
  idempotencyKey: string;
  sourceRoot: string;
  manifest: EvidenceManifest;
  manifestSha256: string;
  // Publisher resolves its own credential refs; agents never receive them.
}

export interface PublishReceipt {
  destinationId: string;
  runId: string;
  snapshotId: string;
  manifestSha256: string;
  publishedAt: string;
  location: string;
}

export interface ArtifactPublisher {
  readonly type: string;
  validateDestination(destinationId: string): Promise<void>;
  publish(request: PublishRequest, signal: AbortSignal): Promise<PublishReceipt>;
  verify(receipt: PublishReceipt): Promise<boolean>;
}

/**
 * Additional semantic validations, beyond JSON Schema:
 * - IDs, SHAs, file locations and artifact hashes match the authoritative registry.
 * - Review covers every required repo and cannot change the workflow or commands.
 * - pass with P0/P1 findings or unresolved required coverage is not review success.
 * - Runner/manual/demo sources stay distinct. Manual evidence alone creates no PASS.
 * - A passed scenario requires expected assertions, not merely exitCode === 0.
 * - Blank suite, missing final event, timeout or absent artifacts cannot become PASS.
 * - A snapshot/test-plan change invalidates approvals for the new version.
 */
