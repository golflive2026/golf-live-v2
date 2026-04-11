import { exportAllData } from "./storage";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.BREVO_API_KEY?.split("").reverse().join(""); // fallback won't work, just placeholder
const GITHUB_REPO = "golflive2026/golf-live-v2";
const BACKUP_BRANCH = "backups";
const MAX_BACKUPS = 7;

async function githubApi(path: string, method: string = "GET", body?: any): Promise<any> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set");
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    method,
    headers: {
      "Authorization": `token ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "golf-live-backup",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

async function ensureBackupBranch(): Promise<string> {
  try {
    const ref = await githubApi(`/git/ref/heads/${BACKUP_BRANCH}`);
    return ref.object.sha;
  } catch {
    // Branch doesn't exist — create from main
    const mainRef = await githubApi(`/git/ref/heads/main`);
    await githubApi(`/git/refs`, "POST", {
      ref: `refs/heads/${BACKUP_BRANCH}`,
      sha: mainRef.object.sha,
    });
    return mainRef.object.sha;
  }
}

export async function runAutoBackup(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("[BACKUP] GITHUB_TOKEN not set — skipping auto-backup");
    return;
  }

  try {
    console.log("[BACKUP] Starting daily backup...");

    // Export all data
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const date = new Date().toISOString().split("T")[0];
    const filename = `backup-${date}.json`;
    const content = Buffer.from(json).toString("base64");

    // Ensure backup branch exists
    await ensureBackupBranch();

    // Check if today's backup already exists
    try {
      await githubApi(`/contents/${filename}?ref=${BACKUP_BRANCH}`);
      console.log(`[BACKUP] Today's backup already exists (${filename})`);
      return;
    } catch {
      // File doesn't exist — proceed
    }

    // Get current tree SHA for backup branch
    const branchRef = await githubApi(`/git/ref/heads/${BACKUP_BRANCH}`);
    const commitSha = branchRef.object.sha;
    const commit = await githubApi(`/git/commits/${commitSha}`);
    const treeSha = commit.tree.sha;

    // Create blob
    const blob = await githubApi(`/git/blobs`, "POST", { content: json, encoding: "utf-8" });

    // Create new tree with the backup file
    const newTree = await githubApi(`/git/trees`, "POST", {
      base_tree: treeSha,
      tree: [{ path: filename, mode: "100644", type: "blob", sha: blob.sha }],
    });

    // Create commit
    const newCommit = await githubApi(`/git/commits`, "POST", {
      message: `Auto backup ${date} — ${data.games?.length || 0} games, ${data.scores?.length || 0} scores, ${data.roster?.length || 0} roster`,
      tree: newTree.sha,
      parents: [commitSha],
    });

    // Update branch ref
    await githubApi(`/git/refs/heads/${BACKUP_BRANCH}`, "PATCH", { sha: newCommit.sha });

    console.log(`[BACKUP] Saved ${filename} (${(json.length / 1024).toFixed(1)}KB)`);

    // Cleanup old backups (keep last MAX_BACKUPS)
    try {
      const tree = await githubApi(`/git/trees/${newCommit.tree.sha}`);
      const backupFiles = tree.tree
        .filter((f: any) => f.path.startsWith("backup-") && f.path.endsWith(".json"))
        .sort((a: any, b: any) => b.path.localeCompare(a.path));

      if (backupFiles.length > MAX_BACKUPS) {
        const toDelete = backupFiles.slice(MAX_BACKUPS);
        for (const f of toDelete) {
          const file = await githubApi(`/contents/${f.path}?ref=${BACKUP_BRANCH}`);
          await githubApi(`/contents/${f.path}`, "DELETE", {
            message: `Remove old backup ${f.path}`,
            sha: file.sha,
            branch: BACKUP_BRANCH,
          });
        }
        console.log(`[BACKUP] Cleaned ${toDelete.length} old backups`);
      }
    } catch (e) {
      console.log("[BACKUP] Cleanup skipped:", e);
    }

  } catch (e: any) {
    console.error("[BACKUP] Failed:", e.message);
  }
}

// Track last backup date to run once per day
let lastBackupDate = "";

export function checkAndRunBackup(): void {
  const today = new Date().toISOString().split("T")[0];
  if (today === lastBackupDate) return;
  lastBackupDate = today;
  runAutoBackup().catch(e => console.error("[BACKUP] Error:", e));
}
