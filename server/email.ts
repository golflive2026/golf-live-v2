import { type Game, getCourse } from "@shared/schema";
import { storage } from "./storage";

function getConfig() {
  // Read env vars at call time, not module load time (Render may set them after import)
  return {
    apiKey: process.env.RESEND_API_KEY,
    appUrl: process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || "http://localhost:5000",
    fromEmail: process.env.EMAIL_FROM || "Golf Live <onboarding@resend.dev>",
  };
}

export async function sendGameStartNotifications(game: Game): Promise<void> {
  const { apiKey, appUrl, fromEmail } = getConfig();

  if (!apiKey) {
    console.log("[EMAIL] RESEND_API_KEY not set — skipping notifications");
    return;
  }

  console.log(`[EMAIL] Sending notifications for game ${game.id} "${game.name}"...`);
  console.log(`[EMAIL] Config: from=${fromEmail}, appUrl=${appUrl}, keyLength=${apiKey.length}`);

  const players = await storage.getPlayersByGame(game.id);
  const course = getCourse(game.courseId);
  const gameLink = `${appUrl}/#/game/${game.id}`;

  let sent = 0, skipped = 0, failed = 0;

  for (const player of players) {
    if (!player.rosterId) {
      console.log(`[EMAIL] Skip ${player.name}: no rosterId`);
      skipped++; continue;
    }

    const rosterPlayer = await storage.getRosterPlayer(player.rosterId);
    if (!rosterPlayer) {
      console.log(`[EMAIL] Skip ${player.name}: roster player ${player.rosterId} not found`);
      skipped++; continue;
    }
    if (!rosterPlayer.email) {
      console.log(`[EMAIL] Skip ${player.name}: no email set`);
      skipped++; continue;
    }
    if (!rosterPlayer.notificationsEnabled) {
      console.log(`[EMAIL] Skip ${player.name}: notifications disabled`);
      skipped++; continue;
    }

    console.log(`[EMAIL] Sending to ${player.name} <${rosterPlayer.email}>...`);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail,
          to: rosterPlayer.email,
          subject: `Game Started: ${game.name}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
              <h2 style="color:#1a5c2e;margin-bottom:4px">${game.name}</h2>
              <p style="color:#666;margin-top:0">${course.name} &middot; ${game.date}</p>
              <p>Hey ${player.name}, the game is starting! Tap below to join:</p>
              <a href="${gameLink}" style="display:inline-block;background:#1a5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
                Open Game
              </a>
              <p style="color:#999;font-size:12px;margin-top:24px">
                Game code: <strong>${game.code}</strong><br>
                You're receiving this because you enabled notifications in Golf Live.
                <a href="${appUrl}/#/roster">Manage preferences</a>
              </p>
            </div>
          `,
        }),
      });

      const responseText = await res.text();
      if (res.ok) {
        sent++;
        console.log(`[EMAIL] OK for ${rosterPlayer.email}: ${responseText}`);
      } else {
        failed++;
        console.error(`[EMAIL] FAILED for ${rosterPlayer.email}: ${res.status} ${responseText}`);
      }
    } catch (e) {
      failed++;
      console.error(`[EMAIL] ERROR for ${rosterPlayer.email}:`, e);
    }
  }

  console.log(`[EMAIL] Game ${game.id} complete: ${sent} sent, ${skipped} skipped, ${failed} failed`);
}

// Test endpoint helper — send a test email to verify config
export async function sendTestEmail(toEmail: string): Promise<{ ok: boolean; message: string }> {
  const { apiKey, fromEmail } = getConfig();

  if (!apiKey) return { ok: false, message: "RESEND_API_KEY not set in environment" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        subject: "Golf Live — Test Notification",
        html: "<h2>It works!</h2><p>Email notifications are configured correctly.</p>",
      }),
    });
    const text = await res.text();
    if (res.ok) return { ok: true, message: `Sent to ${toEmail}: ${text}` };
    return { ok: false, message: `Resend API error ${res.status}: ${text}` };
  } catch (e: any) {
    return { ok: false, message: `Network error: ${e.message}` };
  }
}
