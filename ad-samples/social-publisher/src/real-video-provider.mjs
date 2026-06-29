import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";

const execFileAsync = promisify(execFile);

async function fileReady(path = "", minimumBytes = 120_000) {
  try {
    const info = await stat(path);
    return info.size >= minimumBytes;
  } catch {
    return false;
  }
}

function splitArgs(value = "") {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyPlaceholders(items = [], replacements = {}) {
  return items.map((item) =>
    Object.entries(replacements).reduce((next, [key, value]) => next.replaceAll(`{${key}}`, value), item),
  );
}

async function downloadVideo(url = "", outputPath = "") {
  if (!url) return false;
  const response = await fetch(url, {
    headers: {
      "user-agent": "BYL-Marketing-Agent/real-video-provider",
      accept: "video/mp4,video/*,*/*",
    },
    signal: AbortSignal.timeout(Number(process.env.BYL_REAL_VIDEO_TIMEOUT_MS || 120000)),
  });
  if (!response.ok) throw new Error(`real_video_download_failed:${response.status}:${await response.text()}`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return fileReady(outputPath);
}

async function runProviderCommand({ requestPath, outputPath }) {
  const command = process.env.BYL_REAL_VIDEO_PROVIDER_COMMAND || "";
  if (!command) return { ok: false, reason: "real_video_provider_command_missing" };
  const args = applyPlaceholders(splitArgs(process.env.BYL_REAL_VIDEO_PROVIDER_ARGS || "{request} {output}"), {
    request: requestPath,
    output: outputPath,
  });
  await execFileAsync(command, args, {
    cwd: resolve(dirname(requestPath), "../../.."),
    env: process.env,
    maxBuffer: 1024 * 1024 * 16,
  });
  return (await fileReady(outputPath))
    ? { ok: true, outputPath, source: "command" }
    : { ok: false, reason: "real_video_provider_command_no_output" };
}

async function runProviderWebhook({ request, requestPath, outputPath }) {
  const url = process.env.BYL_REAL_VIDEO_PROVIDER_WEBHOOK_URL || "";
  if (!url) return { ok: false, reason: "real_video_provider_webhook_missing" };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: process.env.BYL_REAL_VIDEO_PROVIDER_TOKEN
        ? `Bearer ${process.env.BYL_REAL_VIDEO_PROVIDER_TOKEN}`
        : "",
    },
    body: JSON.stringify({ ...request, requestPath, expectedOutputPath: outputPath }),
    signal: AbortSignal.timeout(Number(process.env.BYL_REAL_VIDEO_TIMEOUT_MS || 120000)),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.raw || `real_video_webhook_failed:${response.status}`);
  }
  if (data.videoPath && (await fileReady(data.videoPath))) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await readFile(data.videoPath));
    return { ok: true, outputPath, source: "webhook_path", providerResponse: data };
  }
  if (data.videoUrl && (await downloadVideo(data.videoUrl, outputPath))) {
    return { ok: true, outputPath, source: "webhook_url", providerResponse: data };
  }
  return {
    ok: false,
    reason: data.jobId ? "real_video_provider_job_pending" : "real_video_provider_no_video",
    providerResponse: data,
  };
}

export async function requestRealVideo({
  request,
  requestPath,
  rawOutputPath,
} = {}) {
  await mkdir(dirname(requestPath), { recursive: true });
  await mkdir(dirname(rawOutputPath), { recursive: true });
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);

  if (await fileReady(rawOutputPath)) {
    return { ok: true, outputPath: rawOutputPath, source: "existing_provider_output", requestPath };
  }

  const commandResult = await runProviderCommand({ requestPath, outputPath: rawOutputPath });
  if (commandResult.ok) return { ...commandResult, requestPath };

  const webhookResult = await runProviderWebhook({ request, requestPath, outputPath: rawOutputPath });
  if (webhookResult.ok) return { ...webhookResult, requestPath };

  return {
    ok: false,
    requestPath,
    outputPath: rawOutputPath,
    reason: webhookResult.reason || commandResult.reason || "real_video_provider_not_configured",
    providerResponse: webhookResult.providerResponse || null,
  };
}
