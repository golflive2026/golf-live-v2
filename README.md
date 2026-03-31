# Golf Live Scoring — St. Sofia Golf Club

Real-time golf scoring web app for up to 20 players with automatic bet calculations.

**Features:**
- Live scorecard entry from any phone (iPhone / Android)
- Real-time leaderboard with handicap-adjusted net scores
- Automatic bet calculations: Match Play, Birdies, Eagles, Longest Drive, Closest to Pin
- Final settlement showing who owes whom

---

## How to Deploy (Choose One)

### Option A: Railway (Recommended — Easiest)

**Time: ~5 minutes. Cost: Free.**

1. Go to [github.com](https://github.com) and create an account (if you don't have one)
2. Create a new repository and upload all these files (drag & drop the folder)
3. Go to [railway.app](https://railway.app) and sign in with your GitHub account
4. Click **"New Project"** → **"Deploy from GitHub repo"**
5. Select your golf-live repository
6. Railway auto-detects the Dockerfile and starts building
7. Once deployed, click **"Settings"** → **"Networking"** → **"Generate Domain"**
8. You get a URL like `golf-live-production.up.railway.app` — share this with your group!

**That's it.** The app runs 24/7 on Railway's free tier.

### Option B: Render.com

**Time: ~5 minutes. Cost: Free.**

1. Push the code to a GitHub repository (same as above)
2. Go to [render.com](https://render.com) and sign in with GitHub
3. Click **"New"** → **"Web Service"**
4. Select your golf-live repository
5. Render auto-detects the `render.yaml` config
6. Set these settings:
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
7. Click **"Create Web Service"**
8. After ~3 minutes, your app is live at `golf-live-xxxx.onrender.com`

**Note:** Render free tier sleeps after 15 min of inactivity. First load after sleep takes ~30 seconds. Fine for game day — just open the link 1 minute before you start.

---

## How to Use During a Round

1. **Before tee-off:** One person opens the app and taps **"Create New Game"**
2. **Add all players** with names and handicaps
3. **Set bet amounts** (defaults: €5/€5/€15 for match play, €3 birdie, €30 eagle, etc.)
4. **Start Game** — you get a **6-character code**
5. **Share the code** in your WhatsApp/Viber group
6. Everyone opens the same link on their phone and taps **"Join Game"** → enters the code
7. Each player selects their name and enters scores hole by hole
8. **Leaderboard updates live** for everyone
9. After the round, check the **Bets** and **Settlement** tabs to see who pays whom

---

## Course Data (Pre-loaded)

St. Sofia Golf Club, Ravno Pole — Par 71 (Front 36, Back 35)

| Hole | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|------|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|----|----|-----|
| Par  | 5 | 4 | 4 | 3 | 4 | 3 | 4 | 4 | 5 | 4  | 4  | 3  | 4  | 4  | 3  | 5  | 4  | 4  |
| HCP  | 9 |15 | 5 |11 | 1 |17 | 7 | 3 |13 | 10 | 4  | 16 | 2  | 18 | 14 | 6  | 8  | 12 |

---

## Tech Stack

- **Frontend:** React + Tailwind CSS + shadcn/ui
- **Backend:** Express.js + SQLite (via Drizzle ORM)
- **Sync:** Polling every 4 seconds for live updates
