import {
  createDatabricksJobsClient,
  type DatabricksProviderConfig,
} from "@trybacked/provider-databricks";
export async function grantDocsRefreshJobRunIfPresent(
  config: DatabricksProviderConfig,
  catalog: string,
  platformPrincipal: string,
): Promise<void> {
  const jobs = createDatabricksJobsClient(config);
  const jobName = `${catalog}-docs-refresh`;
  const jobId = await jobs.findJobIdByName(jobName);
  if (jobId === null) {
    return;
  }
  const url = `https://${config.host}/api/2.0/permissions/jobs/${String(jobId)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      access_control_list: [
        {
          service_principal_name: platformPrincipal,
          permission_level: "CAN_MANAGE_RUN",
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to grant CAN_MANAGE_RUN on job ${jobName}: ${String(response.status)} ${body.slice(0, 200)}`,
    );
  }
}
