export type CapabilityRisk = "low" | "medium" | "high" | "critical";
export type ConfirmationRule =
  | "none"
  | "review_then_confirm"
  | "always_confirm"
  | "disabled";
export type CapabilityStatus = "enabled" | "planned" | "disabled";

export interface ActionCapability {
  id: string;
  system: string;
  name: string;
  description: string;
  permission: "read" | "propose" | "write" | "admin";
  risk: CapabilityRisk;
  confirmation: ConfirmationRule;
  auditEventType: string;
  status: CapabilityStatus;
}

/**
 * Toríu's active capability catalog. This is product policy used by the API and
 * UI, not a planning document. A capability must be explicitly enabled before
 * a tool may be registered for it.
 */
export const ACTION_CATALOG: readonly ActionCapability[] = [
  {
    id: "github.repository.read",
    system: "GitHub",
    name: "Repository explorer",
    description:
      "List repositories, inspect repository structure, read files, search code, and review commit history.",
    permission: "read",
    risk: "low",
    confirmation: "none",
    auditEventType: "github_read",
    status: "enabled",
  },
  {
    id: "github.change.proposal",
    system: "GitHub",
    name: "Change proposal",
    description:
      "Prepare a reviewable code-change proposal without changing a repository.",
    permission: "propose",
    risk: "medium",
    confirmation: "review_then_confirm",
    auditEventType: "github_change_proposed",
    status: "enabled",
  },
  {
    id: "github.branch_pull_request",
    system: "GitHub",
    name: "Branch and pull request",
    description:
      "After an approved proposal, create a dedicated branch, commit the approved files, and open a pull request for human review.",
    permission: "write",
    risk: "high",
    confirmation: "always_confirm",
    auditEventType: "github_pull_request_opened",
    status: "enabled",
  },
  {
    id: "github.merge",
    system: "GitHub",
    name: "Merge pull request",
    description:
      "Never available to Toríu. Repository owners review and merge pull requests themselves.",
    permission: "admin",
    risk: "critical",
    confirmation: "disabled",
    auditEventType: "github_merge_blocked",
    status: "disabled",
  },
  {
    id: "recyclatorium.product_plan.propose",
    system: "Recyclatorium",
    name: "Printable product plan",
    description:
      "Inspect owner-supplied visual assets and produce a reviewable printable-product plan without exporting or publishing it.",
    permission: "propose",
    risk: "medium",
    confirmation: "review_then_confirm",
    auditEventType: "recyclatorium_plan_proposed",
    status: "enabled",
  },
] as const;

export function getActionCatalog(system?: string): ActionCapability[] {
  return ACTION_CATALOG.filter(capability =>
    system ? capability.system.toLowerCase() === system.toLowerCase() : true
  ).map(capability => ({ ...capability }));
}

export function getCapability(id: string): ActionCapability | undefined {
  return ACTION_CATALOG.find(capability => capability.id === id);
}

export function isCapabilityEnabled(id: string): boolean {
  return getCapability(id)?.status === "enabled";
}
