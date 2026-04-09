import { type Game, getCourse } from "@shared/schema";
import { storage } from "./storage";

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

// notifyMode: "all" = all roster with notifications on, "players" = game players only, "none" = skip
export async function sendGameStartNotifications(game: Game, notifyMode: string = "all"): Promise<void> {
  if (notifyMode === "none") { console.log("[EMAIL] Notifications disabled for this game"); return; }

  const { apiKey, appUrl } = getConfig();
  if (!apiKey) { console.log("[EMAIL] BREVO_API_KEY not set — skipping"); return; }

  console.log(`[EMAIL] Sending for game ${game.id} "${game.name}" (mode: ${notifyMode})...`);

  const gamePlayers = await storage.getPlayersByGame(game.id);
  const course = getCourse(game.courseId);
  const gameLink = `${appUrl}/#/game/${game.id}`;
  const playerNames = gamePlayers.map(p => p.name).join(", ");
  const playerCount = gamePlayers.length;

  // Build recipient list
  const recipients: { name: string; email: string }[] = [];
  if (notifyMode === "all") {
    const allRoster = await storage.listRoster();
    for (const rp of allRoster) {
      if (rp.email && rp.notificationsEnabled) {
        recipients.push({ name: rp.name, email: rp.email });
      }
    }
  } else {
    for (const p of gamePlayers) {
      if (!p.rosterId) continue;
      const rp = await storage.getRosterPlayer(p.rosterId);
      if (rp?.email && rp.notificationsEnabled) {
        recipients.push({ name: p.name, email: rp.email });
      }
    }
  }

  if (recipients.length === 0) { console.log("[EMAIL] No recipients with notifications enabled"); return; }

  let sent = 0, failed = 0;
  for (const r of recipients) {
    const isInGame = gamePlayers.some(p => p.name === r.name);
    console.log(`[EMAIL] → ${r.name} <${r.email}> (${isInGame ? "playing" : "spectator"})...`);

    const result = await sendViaBrevo(
      r.email,
      `Game Started: ${game.name} — ${playerCount} players`,
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
        <h2 style="color:#1a5c2e;margin-bottom:4px">${game.name}</h2>
        <p style="color:#666;margin-top:0">${course.name} &middot; ${game.date}</p>
        <p>Hey ${r.name}, ${isInGame ? "the game is starting!" : "a game just started!"}</p>
        <div style="background:#f5f5f5;border-radius:8px;padding:12px;margin:12px 0">
          <p style="margin:0;font-size:14px"><strong>${playerCount} players:</strong></p>
          <p style="margin:4px 0 0;color:#666;font-size:13px">${playerNames}</p>
        </div>
        <a href="${gameLink}" style="display:inline-block;background:#1a5c2e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:12px 0">
          ${isInGame ? "Open Game" : "Watch Live"}
        </a>
        <p style="color:#999;font-size:12px;margin-top:24px">
          Game code: <strong>${game.code}</strong><br>
          You're receiving this because you enabled notifications in Golf Live.
          <a href="${appUrl}/#/roster">Manage preferences</a>
        </p>
      </div>`,
    );

    if (result.ok) { sent++; console.log(`[EMAIL] OK: ${r.name}`); }
    else { failed++; console.error(`[EMAIL] FAIL: ${r.name}: ${result.message}`); }
  }

  console.log(`[EMAIL] Game ${game.id} done: ${sent} sent, ${failed} failed (${recipients.length} total)`);
}

export async function sendTestEmail(toEmail: string): Promise<{ ok: boolean; message: string }> {
  return sendViaBrevo(toEmail, "Golf Live — Test Notification", "<h2>It works!</h2><p>Email notifications are configured correctly.</p>");
}
