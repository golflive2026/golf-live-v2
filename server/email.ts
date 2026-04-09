import { type Game, getCourse } from "@shared/schema";
import { storage } from "./storage";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || "http://localhost:5000";
const FROM_EMAIL = process.env.EMAIL_FROM || "Golf Live <onboarding@resend.dev>";

export async function sendGameStartNotifications(game: Game): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log("[EMAIL] RESEND_API_KEY not set — skipping notifications");
    return;
  }

  const players = await storage.getPlayersByGame(game.id);
  const course = getCourse(game.courseId);
  const gameLink = `${APP_URL}/#/game/${game.id}`;

  let sent = 0, skipped = 0, failed = 0;

  for (const player of players) {
    if (!player.rosterId) { skipped++; continue; }

    const rosterPlayer = await storage.getRosterPlayer(player.rosterId);
    if (!rosterPlayer?.email || !rosterPlayer.notificationsEnabled) { skipped++; continue; }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL,
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
                <a href="${APP_URL}/#/roster">Manage preferences</a>
              </p>
            </div>
          `,
        }),
      });

      if (res.ok) { sent++; }
      else { failed++; console.error(`[EMAIL] Failed for ${rosterPlayer.email}:`, await res.text()); }
    } catch (e) { failed++; console.error(`[EMAIL] Error for ${rosterPlayer.email}:`, e); }
  }

  console.log(`[EMAIL] Game ${game.id} "${game.name}": ${sent} sent, ${skipped} skipped, ${failed} failed`);
}
