import { type Game, getCourse } from "@shared/schema";
import { storage } from "./storage";

// Brevo (formerly Sendinblue) — free 300 emails/day, no domain verification needed
// Setup: sign up at brevo.com, get API key, verify sender email (click link in inbox)
// Env vars: BREVO_API_KEY, BREVO_SENDER_EMAIL (the verified sender email)

function getConfig() {
  return {
    apiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL || "golflive2026@gmail.com",
    senderName: process.env.BREVO_SENDER_NAME || "Golf Live",
    appUrl: process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || "http://localhost:5000",
  };
}

async function sendViaBrevo(to: string, subject: string, html: string): Promise<{ ok: boolean; message: string }> {
  const { apiKey, senderEmail, senderName } = getConfig();
  if (!apiKey) return { ok: false, message: "BREVO_API_KEY not set" };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  const text = await res.text();
  if (res.ok) return { ok: true, message: text };
  return { ok: false, message: `Brevo ${res.status}: ${text}` };
}

function getAppUrl() {
  return getConfig().appUrl;
}

export async function sendGameStartNotifications(game: Game): Promise<void> {
  const { apiKey } = getConfig();
  if (!apiKey) {
    console.log("[EMAIL] BREVO_API_KEY not set — skipping notifications");
    return;
  }

  const appUrl = getAppUrl();
  console.log(`[EMAIL] Sending notifications for game ${game.id} "${game.name}"...`);

  const players = await storage.getPlayersByGame(game.id);
  const course = getCourse(game.courseId);
  const gameLink = `${appUrl}/#/game/${game.id}`;

  let sent = 0, skipped = 0, failed = 0;

  for (const player of players) {
    if (!player.rosterId) { console.log(`[EMAIL] Skip ${player.name}: no rosterId`); skipped++; continue; }
    const rp = await storage.getRosterPlayer(player.rosterId);
    if (!rp) { console.log(`[EMAIL] Skip ${player.name}: roster not found`); skipped++; continue; }
    if (!rp.email) { console.log(`[EMAIL] Skip ${player.name}: no email`); skipped++; continue; }
    if (!rp.notificationsEnabled) { console.log(`[EMAIL] Skip ${player.name}: notifications off`); skipped++; continue; }

    console.log(`[EMAIL] Sending to ${player.name} <${rp.email}>...`);

    const result = await sendViaBrevo(
      rp.email,
      `Game Started: ${game.name}`,
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
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
      </div>`,
    );

    if (result.ok) { sent++; console.log(`[EMAIL] OK: ${player.name} → ${rp.email}`); }
    else { failed++; console.error(`[EMAIL] FAILED: ${player.name} → ${rp.email}: ${result.message}`); }
  }

  console.log(`[EMAIL] Game ${game.id} done: ${sent} sent, ${skipped} skipped, ${failed} failed`);
}

export async function sendTestEmail(toEmail: string): Promise<{ ok: boolean; message: string }> {
  return sendViaBrevo(toEmail, "Golf Live — Test Notification", "<h2>It works!</h2><p>Email notifications are configured correctly.</p>");
}
