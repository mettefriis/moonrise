# MOONRISE 🌕 — Werewolf + Oracle

Werewolf party game for Zoom with an Interhuman AI oracle.

## Setup

### 1. API key

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and paste your INTERHUMAN_API_KEY
```

The oracle works in mock mode without a key — realistic fake signals.

### 2. Start backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Start frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — share the game code on Zoom.

## How to play

1. Host creates game → shares 4-letter code on Zoom
2. Players join on their own device
3. Roles auto-assign on start
4. **Night**: Wolves vote to kill, Doctor saves, Seer divines — host resolves
5. **Day**: Discuss on Zoom, consult the oracle, vote to eliminate
6. Oracle: record a 15s clip of anyone speaking → cryptic behavioral hints broadcast to all

## Roles (scales with player count)

| Players | Wolves | Seer | Doctor | Jester | Hunter |
|---------|--------|------|--------|--------|--------|
| 4       | 1      | ✓    |        |        |        |
| 5       | 1      | ✓    | ✓      |        |        |
| 6       | 1      | ✓    | ✓      | ✓      |        |
| 7+      | 2      | ✓    | ✓      | ✓      | ✓      |
| 10+     | 3      | ✓    | ✓      | ✓      | ✓      |

**Jester** — wins by getting voted out by the village  
**Hunter** — shoots someone when eliminated (night or day)

## Oracle

The oracle analyzes behavioral signals (Hesitation, Stress, Confidence, Skepticism, etc.) and responds only in cryptic hints — never direct accusations. Any player can consult it during Day phase, results appear on everyone's screen.

Real API: set `INTERHUMAN_API_KEY` in `backend/.env`  
Mock mode: realistic fake signals, no key needed
