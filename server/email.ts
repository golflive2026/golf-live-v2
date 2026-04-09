import nodemailer from "nodemailer";
import { type Game, getCourse } from "@shared/schema";
import { storage } from "./storage";

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function getAppUrl() {
  return process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || "http://localhost:5000";
}

export async function sendGameStartNotifications(game: Game): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[EMAIL] GMAIL_USER or GMAIL_APP_PASSWORD not set — skipping notifications");
    return;
  }

  const gmailUser = process.env.GMAIL_USER!;
  const appUrl = getAppUrl();
  console.log(`[EMAIL] Sending notifications for game ${game.id} "${game.name}" from ${gmailUser}`);

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

    try {
      await transporter.sendMail({
        from: `"Golf Live" <${gmailUser}>`,
        to: rp.email,
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
      });
      sent++;
      console.log(`[EMAIL] OK: ${player.name} → ${rp.email}`);
    } catch (e: any) {
      failed++;
      console.error(`[EMAIL] FAILED: ${player.name} → ${rp.email}:`, e.message);
    }
  }

  console.log(`[EMAIL] Game ${game.id} done: ${sent} sent, ${skipped} skipped, ${failed} failed`);
}

export async function sendTestEmail(toEmail: string): Promise<{ ok: boolean; message: string }> {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, message: "GMAIL_USER or GMAIL_APP_PASSWORD not set in environment" };

  try {
    const info = await transporter.sendMail({
      from: `"Golf Live" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: "Golf Live — Test Notification",
      html: "<h2>It works!</h2><p>Email notifications are configured correctly.</p>",
    });
    return { ok: true, message: `Sent to ${toEmail}, messageId: ${info.messageId}` };
  } catch (e: any) {
    return { ok: false, message: `Gmail error: ${e.message}` };
  }
}
