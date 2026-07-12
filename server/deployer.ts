/**
 * Cloudflare Pages Deployer
 * Deploys generated project files to Cloudflare Pages via Direct Upload API
 */

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`;

interface DeployResult {
  success: boolean;
  url?: string;
  projectName?: string;
  error?: string;
}

/**
 * Deploy files to Cloudflare Pages via Direct Upload
 */
export async function deployToCloudflare(
  projectName: string,
  files: Array<{ filepath: string; content: string }>
): Promise<DeployResult> {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    return { success: false, error: "Cloudflare credentials not configured" };
  }

  // Sanitize project name for Cloudflare (lowercase, alphanumeric + hyphens)
  const cfProjectName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 58);

  try {
    // Step 1: Ensure the Pages project exists
    await ensureProject(cfProjectName);

    // Step 2: Create a deployment using Direct Upload
    const formData = new FormData();

    // Add manifest
    const manifest: Record<string, string> = {};
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Normalize filepath — remove leading slashes, ensure it's relative
      const normalizedPath = file.filepath.replace(/^\/+/, "").replace(/^src\//, "");
      manifest[`/${normalizedPath}`] = `file${i}`;
      formData.append(`file${i}`, new Blob([file.content]), normalizedPath);
    }
    formData.append("manifest", JSON.stringify(manifest));

    const deployResponse = await fetch(
      `${CF_BASE}/pages/projects/${cfProjectName}/deployments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
        },
        body: formData,
      }
    );

    const deployData = await deployResponse.json() as any;

    if (!deployData.success) {
      console.error("[Cloudflare Deploy] Error:", JSON.stringify(deployData.errors));
      return {
        success: false,
        error: deployData.errors?.[0]?.message || "Deployment failed",
      };
    }

    const deploymentUrl = deployData.result?.url || `https://${cfProjectName}.pages.dev`;

    return {
      success: true,
      url: deploymentUrl,
      projectName: cfProjectName,
    };
  } catch (error: any) {
    console.error("[Cloudflare Deploy] Exception:", error?.message);
    return { success: false, error: error?.message || "Deployment failed" };
  }
}

/**
 * Ensure a Cloudflare Pages project exists, create if not
 */
async function ensureProject(projectName: string): Promise<void> {
  // Check if project exists
  const checkResponse = await fetch(
    `${CF_BASE}/pages/projects/${projectName}`,
    {
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    }
  );

  if (checkResponse.ok) {
    return; // Project exists
  }

  // Create the project
  const createResponse = await fetch(
    `${CF_BASE}/pages/projects`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        production_branch: "main",
      }),
    }
  );

  const createData = await createResponse.json() as any;
  if (!createData.success && !createData.errors?.[0]?.message?.includes("already exists")) {
    throw new Error(createData.errors?.[0]?.message || "Failed to create Pages project");
  }
}

/**
 * Check if Cloudflare credentials are configured
 */
export function isCloudflareConfigured(): boolean {
  return !!(CF_API_TOKEN && CF_ACCOUNT_ID);
}
