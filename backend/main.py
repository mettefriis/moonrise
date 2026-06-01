import asyncio, uuid
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from game_logic import Game, Player, OracleReading, make_code
from oracle import analyze_video

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

games: dict[str, Game] = {}
_lock = asyncio.Lock()


@app.get("/health")
async def health():
    return {"ok": True}


# ── helpers ──────────────────────────────────────────────────────────────────

def get_game(code: str) -> Game:
    g = games.get(code.upper())
    if not g:
        raise HTTPException(404, "Game not found")
    return g


def get_player(game: Game, player_id: str) -> Player:
    p = game.player_by_id(player_id)
    if not p:
        raise HTTPException(403, "Player not in game")
    return p


# ── schemas ───────────────────────────────────────────────────────────────────

class JoinBody(BaseModel):
    name: str

class ActionBody(BaseModel):
    player_id: str
    target_id: str

class VoteBody(BaseModel):
    player_id: str
    target_id: str


# ── routes ────────────────────────────────────────────────────────────────────

@app.post("/api/games")
async def create_game(body: JoinBody):
    async with _lock:
        code = make_code()
        while code in games:
            code = make_code()
        game = Game(code=code)
        host_id = str(uuid.uuid4())
        game.players.append(Player(id=host_id, name=body.name.strip(), is_host=True))
        games[code] = game
    return {"code": code, "player_id": host_id}


@app.post("/api/games/{code}/join")
async def join_game(code: str, body: JoinBody):
    async with _lock:
        game = get_game(code)
        if game.phase != "lobby":
            raise HTTPException(400, "Game already started")
        name = body.name.strip()
        if any(p.name.lower() == name.lower() for p in game.players):
            raise HTTPException(400, "Name taken")
        player_id = str(uuid.uuid4())
        game.players.append(Player(id=player_id, name=name))
    return {"player_id": player_id}


@app.get("/api/games/{code}/state")
async def get_state(code: str, player_id: Optional[str] = Query(None)):
    game = get_game(code)
    return game.public_state(player_id)


@app.post("/api/games/{code}/start")
async def start_game(code: str, player_id: str = Query(...)):
    async with _lock:
        game = get_game(code)
        host = get_player(game, player_id)
        if not host.is_host:
            raise HTTPException(403, "Only host can start")
        if len(game.players) < 4:
            raise HTTPException(400, "Need at least 4 players")
        game.start_game()
    return game.public_state(player_id)


@app.post("/api/games/{code}/wolf-vote")
async def wolf_vote(code: str, body: ActionBody):
    async with _lock:
        game = get_game(code)
        player = get_player(game, body.player_id)
        if player.role != "werewolf":
            raise HTTPException(403, "Not a wolf")
        target = get_player(game, body.target_id)
        if not target.alive:
            raise HTTPException(400, "Target is dead")
        game.wolf_votes[body.player_id] = body.target_id
        player.night_action_done = True
    return {"ok": True}


@app.post("/api/games/{code}/doctor-save")
async def doctor_save(code: str, body: ActionBody):
    async with _lock:
        game = get_game(code)
        player = get_player(game, body.player_id)
        if player.role != "doctor":
            raise HTTPException(403, "Not the doctor")
        game.doctor_save = body.target_id
        player.night_action_done = True
    return {"ok": True}


@app.post("/api/games/{code}/seer-divine")
async def seer_divine(code: str, body: ActionBody):
    async with _lock:
        game = get_game(code)
        player = get_player(game, body.player_id)
        if player.role != "seer":
            raise HTTPException(403, "Not the seer")
        target = get_player(game, body.target_id)
        game.seer_result = {
            "target_id": body.target_id,
            "target_name": target.name,
            "is_wolf": target.role == "werewolf",
        }
        player.night_action_done = True
    return {"ok": True}


@app.post("/api/games/{code}/day-vote")
async def day_vote(code: str, body: VoteBody):
    async with _lock:
        game = get_game(code)
        voter = get_player(game, body.player_id)
        if not voter.alive:
            raise HTTPException(400, "Dead players cannot vote")
        if game.phase != "day":
            raise HTTPException(400, "Not day phase")
        target = get_player(game, body.target_id)
        if not target.alive:
            raise HTTPException(400, "Target is dead")
        game.cast_vote(body.player_id, body.target_id)
    return {"ok": True}


@app.post("/api/games/{code}/advance-night")
async def advance_night(code: str, player_id: str = Query(...)):
    async with _lock:
        game = get_game(code)
        host = get_player(game, player_id)
        if not host.is_host:
            raise HTTPException(403, "Only host can advance")
        if game.phase != "night":
            raise HTTPException(400, "Not night phase")
        game.resolve_night()
    return game.public_state(player_id)


@app.post("/api/games/{code}/advance-to-day")
async def advance_to_day(code: str, player_id: str = Query(...)):
    async with _lock:
        game = get_game(code)
        host = get_player(game, player_id)
        if not host.is_host:
            raise HTTPException(403, "Only host can advance")
        if game.phase != "night_results":
            raise HTTPException(400, "Not in night results phase")
        game.advance_to_day()
    return game.public_state(player_id)


@app.post("/api/games/{code}/resolve-vote")
async def resolve_vote(code: str, player_id: str = Query(...)):
    async with _lock:
        game = get_game(code)
        host = get_player(game, player_id)
        if not host.is_host:
            raise HTTPException(403, "Only host can resolve")
        if game.phase != "day":
            raise HTTPException(400, "Not day phase")
        eliminated_id = game.resolve_day_vote()
    return {**game.public_state(player_id), "just_eliminated_id": eliminated_id}


@app.post("/api/games/{code}/hunter-shot")
async def hunter_shot(code: str, body: ActionBody):
    async with _lock:
        game = get_game(code)
        hunter = get_player(game, body.player_id)
        if game.hunter_pending != body.player_id:
            raise HTTPException(403, "Not the hunter's moment")
        target = get_player(game, body.target_id)
        if not target.alive:
            raise HTTPException(400, "Target already dead")
        game.resolve_hunter_shot(body.target_id)
    return game.public_state(body.player_id)


@app.post("/api/games/{code}/oracle")
async def oracle(
    code: str,
    player_id: str = Query(...),
    subject_name: str = Query(...),
    video: UploadFile = File(...),
):
    game = get_game(code)
    get_player(game, player_id)
    if game.phase != "day":
        raise HTTPException(400, "Oracle only speaks during day phase")

    video_bytes = await video.read()
    result = await analyze_video(video_bytes, video.filename or "recording.webm", subject_name)

    reading = OracleReading(
        subject_name=subject_name,
        signals=result["signals"],
        hint=result["hint"],
        round=game.round,
        mocked=result.get("mocked", True),
    )

    async with _lock:
        game.oracle_readings.append(reading)

    return {
        "subject_name": subject_name,
        "signals": result["signals"],
        "hint": result["hint"],
        "mocked": result.get("mocked", True),
    }
