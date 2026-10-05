export type ControlPlaneClientOptions = {
  baseUrl: string;
  adminToken: string;
  fetchImpl?: typeof fetch | undefined;
};
export type CreateOrganizationResponse = {
  organization: {
    tenant_id: string;
    status: string;
  };
  job: {
    id: string;
    status: string;
  };
};
export type JobResponse = {
  id: string;
  status: string;
  error: string | null;
  result: Record<string, unknown> | null;
};
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
export function readControlPlaneClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ControlPlaneClientOptions {
  const baseUrl = env["BACKED_CONTROL_PLANE_URL"]?.trim();
  const adminToken = env["CONTROL_PLANE_ADMIN_TOKEN"]?.trim();
  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new Error("BACKED_CONTROL_PLANE_URL is required for remote control plane commands.");
  }
  if (adminToken === undefined || adminToken.length === 0) {
    throw new Error("CONTROL_PLANE_ADMIN_TOKEN is required for remote control plane commands.");
  }
  return { baseUrl, adminToken };
}
export async function createOrganizationRemote(
  client: ControlPlaneClientOptions,
  input: {
    tenantId: string;
    shared?: string[] | undefined;
    workosOrganizationId?: string | undefined;
  },
): Promise<CreateOrganizationResponse> {
  const fetchFn = client.fetchImpl ?? fetch;
  const response = await fetchFn(`${normalizeBaseUrl(client.baseUrl)}/v1/organizations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${client.adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tenantId: input.tenantId,
      ...(input.shared !== undefined ? { shared: input.shared } : {}),
      ...(input.workosOrganizationId !== undefined
        ? { workosOrganizationId: input.workosOrganizationId }
        : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`create organization failed (${String(response.status)}): ${body}`);
  }
  return (await response.json()) as CreateOrganizationResponse;
}
export async function getJobRemote(
  client: ControlPlaneClientOptions,
  jobId: string,
): Promise<JobResponse> {
  const fetchFn = client.fetchImpl ?? fetch;
  const response = await fetchFn(`${normalizeBaseUrl(client.baseUrl)}/v1/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${client.adminToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`get job failed (${String(response.status)}): ${body}`);
  }
  return (await response.json()) as JobResponse;
}
export async function waitForJobRemote(
  client: ControlPlaneClientOptions,
  jobId: string,
  options?: {
    timeoutMs?: number | undefined;
    pollMs?: number | undefined;
  },
): Promise<JobResponse> {
  const timeoutMs = options?.timeoutMs ?? 600000;
  const pollMs = options?.pollMs ?? 3000;
  const started = Date.now();
  for (;;) {
    const job = await getJobRemote(client, jobId);
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Job ${jobId} timed out after ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
export async function listOrganizationsRemote(client: ControlPlaneClientOptions): Promise<
  Array<{
    tenant_id: string;
    status: string;
    catalog: string;
  }>
> {
  const fetchFn = client.fetchImpl ?? fetch;
  const response = await fetchFn(`${normalizeBaseUrl(client.baseUrl)}/v1/organizations`, {
    headers: { Authorization: `Bearer ${client.adminToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`list organizations failed (${String(response.status)}): ${body}`);
  }
  const payload = (await response.json()) as {
    organizations: Array<{
      tenant_id: string;
      status: string;
      catalog: string;
    }>;
  };
  return payload.organizations;
}
