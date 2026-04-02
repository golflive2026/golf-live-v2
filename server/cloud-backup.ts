/**
 * Cloud Backup via GitHub Repository
 *
 * Stores database backup as a file on a `data-backup` branch in the same repo.
 * This branch does NOT trigger Render redeploys (only main does).
 *
 * Uses the same GitHub token that pushes code — no extra permissions needed.
 *
 * Env var: GITHUB_BACKUP_TOKEN — GitHub PAT (same one used for git push)
 */

const REPO = process.env.GITHUB_REPO || "golflive2026/golf-live-v2";
const BRANCH = "data-backup";
const FILE_PATH = "backup.json";

let lastPushHash: string | null = null;
let fileShaCache: string | null = null;

function getToken(): string | null {
  return process.env.GITHUB_BACKUP_TOKEN || null;
}

async function githubApi(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  if (!token) throw new Error("No GITHUB_BACKUP_TOKEN");

  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

/** Ensure the data-backup branch exists */
async function ensureBranch(): Promise<void> {
  try {
    await githubApi(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
    return; // Branch exists
  } catch {
    // Branch doesn't exist — create from main
  }

  try {
    const main = await githubApi(`/repos/${REPO}/git/ref/heads/main`);
    await githubApi(`/repos/${REPO}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${BRANCH}`,
        sha: main.object.sha,
      }),
    });
    console.log(`[CLOUD-BACKUP] Created branch: ${BRANCH}`);
  } catch (e: any) {
    console.error(`[CLOUD-BACKUP] Failed to create branch: ${e.message}`);
    throw e;
  }
}

/** Get the SHA of the existing backup file (needed for updates) */
async function getFileSha(): Promise<string | null> {
  if (fileShaCache) return fileShaCache;
  try {
    const file = await githubApi(`/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`);
    fileShaCache = file.sha;
    return file.sha;
  } catch {
    return null;
  }
}

/** Push backup data to GitHub repo */
export async function pushToCloud(data: any): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const content = JSON.stringify(data);

    // Skip if nothing changed
    const hash = simpleHash(content);
    if (hash === lastPushHash) return true;

    await ensureBranch();
    const sha = await getFileSha();

    const body: any = {
      message: `backup ${new Date().toISOString().slice(0, 19)}`,
      content: Buffer.from(content).toString("base64"),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const result = await githubApi(`/repos/${REPO}/contents/${FILE_PATH}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    // Cache the new SHA for next update
    fileShaCache = result.content?.sha || null;
    lastPushHash = hash;

    const kb = (content.length / 1024).toFixed(1);
    console.log(`[CLOUD-BACKUP] Pushed ${kb} KB to ${REPO}@${BRANCH}`);
    return true;
  } catch (e: any) {
    console.error(`[CLOUD-BACKUP] Push failed: ${e.message}`);
    return false;
  }
}

/** Fetch backup data from GitHub repo */
export async function pullFromCloud(): Promise<any | null> {
  const token = getToken();
  if (!token) {
    console.log("[CLOUD-BACKUP] No GITHUB_BACKUP_TOKEN — skipping cloud restore");
    return null;
  }

  try {
    const file = await githubApi(`/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`);
    if (!file || !file.content) {
      console.log("[CLOUD-BACKUP] No backup file found on data-backup branch");
      return null;
    }

    fileShaCache = file.sha;
    const content = Buffer.from(file.content, "base64").toString("utf-8");
    const data = JSON.parse(content);
    const kb = (content.length / 1024).toFixed(1);
    console.log(`[CLOUD-BACKUP] Fetched ${kb} KB backup from ${REPO}@${BRANCH}`);
    return data;
  } catch (e: any) {
    console.error(`[CLOUD-BACKUP] Pull failed: ${e.message}`);
    return null;
  }
}

/** Check if cloud backup is configured */
export function isCloudBackupEnabled(): boolean {
  return !!getToken();
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}
