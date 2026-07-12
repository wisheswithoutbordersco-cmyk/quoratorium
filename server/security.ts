/**
 * Q Workspace — Sandboxed Execution Security
 * 
 * Provides container isolation rules, filesystem restrictions, network egress rules,
 * CPU/memory quotas, execution timeouts, and protection against malicious scripts
 * and prompt injection exploits.
 */

import { logger } from "./observability";

// ─── Security Configuration ──────────────────────────────────────────────────

export interface SecurityPolicy {
  execution: ExecutionPolicy;
  network: NetworkPolicy;
  filesystem: FilesystemPolicy;
  resources: ResourcePolicy;
  injection: InjectionPolicy;
}

export interface ExecutionPolicy {
  maxExecutionTimeMs: number;
  maxConcurrentExecutions: number;
  allowedLanguages: string[];
  blockedCommands: string[];
  blockedModules: string[];
  sandboxMode: "strict" | "permissive" | "custom";
}

export interface NetworkPolicy {
  egressAllowed: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
  blockedPorts: number[];
  maxRequestsPerMinute: number;
  maxPayloadSizeBytes: number;
  allowedProtocols: string[];
}

export interface FilesystemPolicy {
  readAllowed: boolean;
  writeAllowed: boolean;
  allowedPaths: string[];
  blockedPaths: string[];
  maxFileSizeBytes: number;
  maxTotalStorageBytes: number;
  allowedExtensions: string[];
  blockedExtensions: string[];
}

export interface ResourcePolicy {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxOutputSizeBytes: number;
  maxStdoutLines: number;
  maxProcesses: number;
  maxOpenFiles: number;
}

export interface InjectionPolicy {
  enabled: boolean;
  maxPromptLength: number;
  blockedPatterns: RegExp[];
  suspiciousPatterns: RegExp[];
  maxCodeLength: number;
  sanitizeOutput: boolean;
  blockSystemPromptLeaks: boolean;
}

// ─── Default Security Policy ─────────────────────────────────────────────────

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  execution: {
    maxExecutionTimeMs: 30_000,
    maxConcurrentExecutions: 3,
    allowedLanguages: ["javascript", "typescript", "python", "html", "css", "json"],
    blockedCommands: [
      "rm -rf /", "rm -rf /*", "mkfs", "dd if=/dev/zero",
      ":(){ :|:& };:", "shutdown", "reboot", "halt",
      "chmod 777 /", "chown -R", "passwd", "useradd",
      "curl | sh", "wget | sh", "curl | bash", "wget | bash",
    ],
    blockedModules: [
      "child_process", "cluster", "dgram", "dns",
      "net", "tls", "vm", "worker_threads",
    ],
    sandboxMode: "strict",
  },
  network: {
    egressAllowed: true,
    allowedDomains: [
      "api.openai.com", "api.anthropic.com", "api.perplexity.ai",
      "api.cloudflare.com", "api.github.com",
      "registry.npmjs.org", "pypi.org",
      "cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com",
    ],
    blockedDomains: [
      "localhost", "127.0.0.1", "0.0.0.0",
      "169.254.169.254", // AWS metadata
      "metadata.google.internal", // GCP metadata
      "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", // Private ranges
    ],
    blockedPorts: [22, 23, 25, 445, 3306, 5432, 6379, 27017],
    maxRequestsPerMinute: 60,
    maxPayloadSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedProtocols: ["https", "http"],
  },
  filesystem: {
    readAllowed: true,
    writeAllowed: true,
    allowedPaths: ["/tmp/sandbox", "/tmp/workspace"],
    blockedPaths: [
      "/etc/passwd", "/etc/shadow", "/etc/hosts",
      "/proc", "/sys", "/dev", "/boot",
      "/root", "/home", "/var/log",
      "~/.ssh", "~/.aws", "~/.config",
    ],
    maxFileSizeBytes: 50 * 1024 * 1024, // 50MB
    maxTotalStorageBytes: 500 * 1024 * 1024, // 500MB
    allowedExtensions: [
      ".js", ".ts", ".py", ".html", ".css", ".json", ".md",
      ".txt", ".csv", ".xml", ".yaml", ".yml", ".toml",
      ".jsx", ".tsx", ".vue", ".svelte",
    ],
    blockedExtensions: [
      ".exe", ".dll", ".so", ".dylib", ".bin",
      ".sh", ".bash", ".zsh", ".bat", ".cmd", ".ps1",
      ".php", ".rb", ".pl", ".cgi",
    ],
  },
  resources: {
    maxMemoryMB: 256,
    maxCpuPercent: 50,
    maxOutputSizeBytes: 1 * 1024 * 1024, // 1MB
    maxStdoutLines: 5000,
    maxProcesses: 5,
    maxOpenFiles: 100,
  },
  injection: {
    enabled: true,
    maxPromptLength: 50000,
    blockedPatterns: [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /disregard\s+(all\s+)?prior\s+(instructions|context)/i,
      /you\s+are\s+now\s+(a|an)\s+/i,
      /system\s*prompt\s*[:=]/i,
      /reveal\s+(your|the)\s+(system|original)\s+prompt/i,
      /output\s+(your|the)\s+initial\s+instructions/i,
      /pretend\s+(you\s+are|to\s+be)\s+/i,
      /jailbreak/i,
      /DAN\s+mode/i,
      /developer\s+mode\s+(enabled|on|activated)/i,
    ],
    suspiciousPatterns: [
      /\beval\s*\(/,
      /\bexec\s*\(/,
      /Function\s*\(/,
      /import\s*\(\s*['"`]/,
      /require\s*\(\s*['"`]child_process/,
      /process\.env/,
      /__proto__/,
      /constructor\s*\[/,
      /prototype\s*\./,
      /Object\.defineProperty/,
      /Reflect\./,
      /Proxy\s*\(/,
    ],
    maxCodeLength: 100000,
    sanitizeOutput: true,
    blockSystemPromptLeaks: true,
  },
};

// ─── Security Validator ──────────────────────────────────────────────────────

export interface SecurityViolation {
  type: "execution" | "network" | "filesystem" | "resource" | "injection";
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  detail?: string;
  blocked: boolean;
  timestamp: number;
}

const violations: SecurityViolation[] = [];
const MAX_VIOLATIONS = 1000;

function addViolation(violation: SecurityViolation): void {
  if (violations.length >= MAX_VIOLATIONS) violations.shift();
  violations.push(violation);
  
  logger.warn(`Security violation: ${violation.message}`, {
    service: "security",
    metadata: { type: violation.type, severity: violation.severity, blocked: violation.blocked },
  });
}

// ─── Code Validation ─────────────────────────────────────────────────────────

export function validateCode(
  code: string,
  language: string,
  policy: SecurityPolicy = DEFAULT_SECURITY_POLICY
): { safe: boolean; violations: SecurityViolation[] } {
  const found: SecurityViolation[] = [];

  // Check language allowed
  if (!policy.execution.allowedLanguages.includes(language)) {
    found.push({
      type: "execution",
      severity: "high",
      message: `Language '${language}' is not allowed`,
      blocked: true,
      timestamp: Date.now(),
    });
  }

  // Check code length
  if (code.length > policy.injection.maxCodeLength) {
    found.push({
      type: "resource",
      severity: "medium",
      message: `Code exceeds maximum length (${code.length} > ${policy.injection.maxCodeLength})`,
      blocked: true,
      timestamp: Date.now(),
    });
  }

  // Check blocked commands
  for (const cmd of policy.execution.blockedCommands) {
    if (code.includes(cmd)) {
      found.push({
        type: "execution",
        severity: "critical",
        message: `Blocked command detected: ${cmd}`,
        detail: `Code contains dangerous command: "${cmd}"`,
        blocked: true,
        timestamp: Date.now(),
      });
    }
  }

  // Check blocked modules (for JS/TS)
  if (["javascript", "typescript"].includes(language)) {
    for (const mod of policy.execution.blockedModules) {
      const importPattern = new RegExp(`(?:require|import)\\s*\\(?\\s*['"\`]${mod}`, "g");
      if (importPattern.test(code)) {
        found.push({
          type: "execution",
          severity: "high",
          message: `Blocked module import: ${mod}`,
          detail: `Code attempts to import restricted module: "${mod}"`,
          blocked: true,
          timestamp: Date.now(),
        });
      }
    }
  }

  // Check suspicious patterns
  for (const pattern of policy.injection.suspiciousPatterns) {
    if (pattern.test(code)) {
      found.push({
        type: "injection",
        severity: "medium",
        message: `Suspicious pattern detected: ${pattern.source}`,
        blocked: false, // Warning only
        timestamp: Date.now(),
      });
    }
  }

  // Check filesystem access patterns
  for (const blockedPath of policy.filesystem.blockedPaths) {
    if (code.includes(blockedPath)) {
      found.push({
        type: "filesystem",
        severity: "high",
        message: `Attempted access to restricted path: ${blockedPath}`,
        blocked: true,
        timestamp: Date.now(),
      });
    }
  }

  // Check for blocked extensions in file operations
  const fileOpPattern = /(?:writeFile|readFile|open|createWriteStream)\s*\(\s*['"`]([^'"`]+)/g;
  let match;
  while ((match = fileOpPattern.exec(code)) !== null) {
    const filePath = match[1];
    for (const ext of policy.filesystem.blockedExtensions) {
      if (filePath.endsWith(ext)) {
        found.push({
          type: "filesystem",
          severity: "high",
          message: `Blocked file extension: ${ext}`,
          detail: `Code attempts to access file with restricted extension: "${filePath}"`,
          blocked: true,
          timestamp: Date.now(),
        });
      }
    }
  }

  found.forEach(v => addViolation(v));
  const hasBlocking = found.some(v => v.blocked);

  return { safe: !hasBlocking, violations: found };
}

// ─── Prompt Injection Detection ──────────────────────────────────────────────

export interface InjectionCheckResult {
  safe: boolean;
  score: number; // 0-100, higher = more suspicious
  detections: Array<{
    pattern: string;
    severity: "critical" | "high" | "medium" | "low";
    match: string;
  }>;
}

export function checkPromptInjection(
  input: string,
  policy: SecurityPolicy = DEFAULT_SECURITY_POLICY
): InjectionCheckResult {
  if (!policy.injection.enabled) {
    return { safe: true, score: 0, detections: [] };
  }

  const detections: InjectionCheckResult["detections"] = [];
  let score = 0;

  // Check length
  if (input.length > policy.injection.maxPromptLength) {
    detections.push({
      pattern: "max_length_exceeded",
      severity: "medium",
      match: `Input length: ${input.length}`,
    });
    score += 20;
  }

  // Check blocked patterns (critical)
  for (const pattern of policy.injection.blockedPatterns) {
    const match = input.match(pattern);
    if (match) {
      detections.push({
        pattern: pattern.source,
        severity: "critical",
        match: match[0],
      });
      score += 40;
    }
  }

  // Check suspicious patterns
  for (const pattern of policy.injection.suspiciousPatterns) {
    const match = input.match(pattern);
    if (match) {
      detections.push({
        pattern: pattern.source,
        severity: "medium",
        match: match[0],
      });
      score += 15;
    }
  }

  // Heuristic checks
  // Excessive special characters
  const specialCharRatio = (input.match(/[{}[\]<>|\\`~^]/g) || []).length / Math.max(input.length, 1);
  if (specialCharRatio > 0.15) {
    detections.push({
      pattern: "high_special_char_ratio",
      severity: "low",
      match: `Ratio: ${(specialCharRatio * 100).toFixed(1)}%`,
    });
    score += 10;
  }

  // Multiple role indicators
  const roleIndicators = (input.match(/\b(system|assistant|user|human|ai)\s*[:>]/gi) || []).length;
  if (roleIndicators > 2) {
    detections.push({
      pattern: "multiple_role_indicators",
      severity: "high",
      match: `Found ${roleIndicators} role indicators`,
    });
    score += 25;
  }

  // Base64 encoded content (potential obfuscation)
  const base64Pattern = /[A-Za-z0-9+/]{40,}={0,2}/;
  if (base64Pattern.test(input)) {
    detections.push({
      pattern: "base64_content",
      severity: "low",
      match: "Possible base64 encoded content",
    });
    score += 5;
  }

  score = Math.min(100, score);
  const safe = score < 40 && !detections.some(d => d.severity === "critical");

  if (!safe) {
    addViolation({
      type: "injection",
      severity: score >= 70 ? "critical" : score >= 40 ? "high" : "medium",
      message: `Prompt injection detected (score: ${score})`,
      detail: detections.map(d => d.match).join("; "),
      blocked: score >= 70,
      timestamp: Date.now(),
    });
  }

  return { safe, score, detections };
}

// ─── Network Egress Validation ───────────────────────────────────────────────

export function validateNetworkRequest(
  url: string,
  policy: SecurityPolicy = DEFAULT_SECURITY_POLICY
): { allowed: boolean; reason?: string } {
  if (!policy.network.egressAllowed) {
    return { allowed: false, reason: "Network egress is disabled" };
  }

  let hostname: string;
  let port: number | undefined;
  let protocol: string;

  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    port = parsed.port ? parseInt(parsed.port) : undefined;
    protocol = parsed.protocol.replace(":", "");
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }

  // Check protocol
  if (!policy.network.allowedProtocols.includes(protocol)) {
    addViolation({
      type: "network",
      severity: "high",
      message: `Blocked protocol: ${protocol}`,
      blocked: true,
      timestamp: Date.now(),
    });
    return { allowed: false, reason: `Protocol '${protocol}' is not allowed` };
  }

  // Check blocked domains
  for (const blocked of policy.network.blockedDomains) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      addViolation({
        type: "network",
        severity: "critical",
        message: `Blocked domain access: ${hostname}`,
        blocked: true,
        timestamp: Date.now(),
      });
      return { allowed: false, reason: `Domain '${hostname}' is blocked` };
    }
  }

  // Check blocked ports
  if (port && policy.network.blockedPorts.includes(port)) {
    addViolation({
      type: "network",
      severity: "high",
      message: `Blocked port access: ${port}`,
      blocked: true,
      timestamp: Date.now(),
    });
    return { allowed: false, reason: `Port ${port} is blocked` };
  }

  // In strict mode, only allow listed domains
  if (policy.execution.sandboxMode === "strict") {
    const isAllowed = policy.network.allowedDomains.some(
      d => hostname === d || hostname.endsWith(`.${d}`)
    );
    if (!isAllowed) {
      return { allowed: false, reason: `Domain '${hostname}' is not in allowlist (strict mode)` };
    }
  }

  return { allowed: true };
}

// ─── Output Sanitization ─────────────────────────────────────────────────────

export function sanitizeOutput(
  output: string,
  policy: SecurityPolicy = DEFAULT_SECURITY_POLICY
): string {
  if (!policy.injection.sanitizeOutput) return output;

  let sanitized = output;

  // Remove potential system prompt leaks
  if (policy.injection.blockSystemPromptLeaks) {
    sanitized = sanitized.replace(/system\s*prompt\s*[:=]\s*[^\n]+/gi, "[REDACTED]");
    sanitized = sanitized.replace(/\[INST\][\s\S]*?\[\/INST\]/g, "[REDACTED]");
    sanitized = sanitized.replace(/<\|im_start\|>system[\s\S]*?<\|im_end\|>/g, "[REDACTED]");
  }

  // Truncate if too long
  if (sanitized.length > policy.resources.maxOutputSizeBytes) {
    sanitized = sanitized.slice(0, policy.resources.maxOutputSizeBytes) + "\n[OUTPUT TRUNCATED]";
  }

  return sanitized;
}

// ─── Resource Quota Enforcement ──────────────────────────────────────────────

interface ExecutionContext {
  id: string;
  startTime: number;
  memoryUsageMB: number;
  cpuPercent: number;
  outputSize: number;
  stdoutLines: number;
}

const activeExecutions: Map<string, ExecutionContext> = new Map();

export function startExecution(executionId: string): { allowed: boolean; reason?: string } {
  const policy = DEFAULT_SECURITY_POLICY;

  if (activeExecutions.size >= policy.execution.maxConcurrentExecutions) {
    addViolation({
      type: "resource",
      severity: "medium",
      message: `Max concurrent executions reached (${policy.execution.maxConcurrentExecutions})`,
      blocked: true,
      timestamp: Date.now(),
    });
    return { allowed: false, reason: `Max concurrent executions (${policy.execution.maxConcurrentExecutions}) reached` };
  }

  activeExecutions.set(executionId, {
    id: executionId,
    startTime: Date.now(),
    memoryUsageMB: 0,
    cpuPercent: 0,
    outputSize: 0,
    stdoutLines: 0,
  });

  return { allowed: true };
}

export function checkExecutionLimits(executionId: string, update?: Partial<ExecutionContext>): { allowed: boolean; violations: string[] } {
  const ctx = activeExecutions.get(executionId);
  if (!ctx) return { allowed: false, violations: ["Execution not found"] };

  const policy = DEFAULT_SECURITY_POLICY;
  const violationMessages: string[] = [];

  if (update) {
    if (update.memoryUsageMB !== undefined) ctx.memoryUsageMB = update.memoryUsageMB;
    if (update.cpuPercent !== undefined) ctx.cpuPercent = update.cpuPercent;
    if (update.outputSize !== undefined) ctx.outputSize = update.outputSize;
    if (update.stdoutLines !== undefined) ctx.stdoutLines = update.stdoutLines;
  }

  // Check timeout
  const elapsed = Date.now() - ctx.startTime;
  if (elapsed > policy.execution.maxExecutionTimeMs) {
    violationMessages.push(`Execution timeout: ${elapsed}ms > ${policy.execution.maxExecutionTimeMs}ms`);
  }

  // Check memory
  if (ctx.memoryUsageMB > policy.resources.maxMemoryMB) {
    violationMessages.push(`Memory limit exceeded: ${ctx.memoryUsageMB}MB > ${policy.resources.maxMemoryMB}MB`);
  }

  // Check CPU
  if (ctx.cpuPercent > policy.resources.maxCpuPercent) {
    violationMessages.push(`CPU limit exceeded: ${ctx.cpuPercent}% > ${policy.resources.maxCpuPercent}%`);
  }

  // Check output size
  if (ctx.outputSize > policy.resources.maxOutputSizeBytes) {
    violationMessages.push(`Output size limit exceeded: ${ctx.outputSize} > ${policy.resources.maxOutputSizeBytes}`);
  }

  // Check stdout lines
  if (ctx.stdoutLines > policy.resources.maxStdoutLines) {
    violationMessages.push(`Stdout lines limit exceeded: ${ctx.stdoutLines} > ${policy.resources.maxStdoutLines}`);
  }

  if (violationMessages.length > 0) {
    for (const msg of violationMessages) {
      addViolation({
        type: "resource",
        severity: "high",
        message: msg,
        blocked: true,
        timestamp: Date.now(),
      });
    }
  }

  return { allowed: violationMessages.length === 0, violations: violationMessages };
}

export function endExecution(executionId: string): void {
  activeExecutions.delete(executionId);
}

// ─── Security Dashboard Data ─────────────────────────────────────────────────

export interface SecuritySummary {
  totalViolations: number;
  criticalViolations: number;
  highViolations: number;
  mediumViolations: number;
  lowViolations: number;
  blockedAttempts: number;
  recentViolations: SecurityViolation[];
  violationsByType: Record<string, number>;
  activeExecutions: number;
  policy: SecurityPolicy;
  injectionAttempts: number;
  networkBlocks: number;
}

export function getSecuritySummary(): SecuritySummary {
  const criticalViolations = violations.filter(v => v.severity === "critical").length;
  const highViolations = violations.filter(v => v.severity === "high").length;
  const mediumViolations = violations.filter(v => v.severity === "medium").length;
  const lowViolations = violations.filter(v => v.severity === "low").length;

  const violationsByType: Record<string, number> = {};
  for (const v of violations) {
    violationsByType[v.type] = (violationsByType[v.type] || 0) + 1;
  }

  return {
    totalViolations: violations.length,
    criticalViolations,
    highViolations,
    mediumViolations,
    lowViolations,
    blockedAttempts: violations.filter(v => v.blocked).length,
    recentViolations: violations.slice(-20).reverse(),
    violationsByType,
    activeExecutions: activeExecutions.size,
    policy: DEFAULT_SECURITY_POLICY,
    injectionAttempts: violations.filter(v => v.type === "injection").length,
    networkBlocks: violations.filter(v => v.type === "network").length,
  };
}

export function getViolations(options?: { type?: string; severity?: string; since?: number; limit?: number }): SecurityViolation[] {
  let result = [...violations];
  if (options?.type) result = result.filter(v => v.type === options.type);
  if (options?.severity) result = result.filter(v => v.severity === options.severity);
  if (options?.since) result = result.filter(v => v.timestamp >= options.since!);
  result.reverse();
  return result.slice(0, options?.limit || 50);
}
