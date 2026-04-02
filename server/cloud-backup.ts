/**
 * Cloud Backup via GitHub Gist
 *
 * Persists database backup to a secret GitHub Gist so data survives
 * even when Render's filesystem is wiped on redeploy.
 *
 * Env vars:
 *   GITHUB_BACKUP_TOKEN — GitHub PAT with "gist" scope
 *
 * The Gist ID is auto-discovered by searching for a gist named "golf-live-backup".
 * If none exists, one is created automatically on first backup.
 */

const GIST_FILENAME = "golf-live-backup.json";
const GIST_DESCRIPTION = "Golf Live V2 — automatic database backup (do not delete)";

let gistId: string | null = null;
let lastBackupHash: string | null = null;

function getToken(): string | null {
  return process.env.GITHUB_BACKUP_TOKEN || null;
}

async function githubApi(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  if (!token) throw new Error("No GITHUB_BACKUP_TOKEN set");

  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

/** Find existing backup gist or return null */
async function findGist(): Promise<string | null> {
  if (gistId) return gistId;

  try {
    // Search user's gists for our backup
    const gists = await githubApi("/gists?per_page=100");
    for (const g of gists) {
      if (g.description === GIST_DESCRIPTION || (g.files && g.files[GIST_FILENAME])) {
        gistId = g.id;
        console.log(`[CLOUD-BACKUP] Found existing backup gist: ${gistId}`);
        return gistId;
      }
    }
  } catch (e: any) {
    console.error(`[CLOUD-BACKUP] Failed to search gists: ${e.message}`);
  }

  return null;
}

/** Create a new secret gist for backup */
async function createGist(content: string): Promise<string> {
  const gist = await githubApi("/gists", {
    method: "POST",
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [GIST_FILENAME]: { content },
      },
    }),
  });

  gistId = gist.id;
  console.log(`[CLOUD-BACKUP] Created new backup gist: ${gistId}`);
  return gistId!;
}

/** Push backup data to GitHub Gist */
export async function pushToCloud(data: any): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const content = JSON.stringify(data);

    // Simple hash to avoid pushing identical data
    const hash = simpleHash(content);
    if (hash === lastBackupHash) return true;

    let id = await findGist();

    if (id) {
      // Update existing gist
      await githubApi(`/gists/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          files: {
            [GIST_FILENAME]: { content },
          },
        }),
      });
    } else {
      // Create new gist
      id = await createGist(content);
    }

    lastBackupHash = hash;
    console.log(`[CLOUD-BACKUP] Backup pushed to gist ${id} (${(content.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (e: any) {
    console.error(`[CLOUD-BACKUP] Push failed: ${e.message}`);
    return false;
  }
}

/** Fetch backup data from GitHub Gist */
export async function pullFromCloud(): Promise<any | null> {
  const token = getToken();
  if (!token) {
    console.log("[CLOUD-BACKUP] No GITHUB_BACKUP_TOKEN set — skipping cloud restore");
    return null;
  }

  try {
    const id = await findGist();
    if (!id) {
      console.log("[CLOUD-BACKUP] No backup gist found");
      return null;
    }

    const gist = await githubApi(`/gists/${id}`);
    const file = gist.files?.[GIST_FILENAME];
    if (!file || !file.content) {
      console.log("[CLOUD-BACKUP] Gist found but no backup content");
      return null;
    }

    const data = JSON.parse(file.content);
    console.log(`[CLOUD-BACKUP] Fetched backup from gist ${id} (${(file.content.length / 1024).toFixed(1)} KB)`);
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
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}
