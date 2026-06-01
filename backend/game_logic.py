import random, string
from dataclasses import dataclass, field
from typing import Optional


ROLE_EMOJI = {
    "werewolf": "🐺",
    "villager": "🏘️",
    "seer": "👁️",
    "doctor": "💉",
    "jester": "🃏",
    "hunter": "🏹",
}

ROLE_FLAVOR = {
    "werewolf": "You hunger in the dark. Kill without mercy.",
    "villager": "You have only your wits. Use them.",
    "seer": "The truth is visible to you. Guard that knowledge.",
    "doctor": "Life and death pass through your hands.",
    "jester": "Chaos is your weapon. Get caught.",
    "hunter": "You fall for no one. Take someone with you.",
}


def assign_roles(n: int) -> list[str]:
    if n < 4:
        raise ValueError("Need at least 4 players")
    wolves = max(1, n // 4)
    roles = ["werewolf"] * wolves + ["seer"]
    if n >= 5:
        roles.append("doctor")
    if n >= 6:
        roles.append("jester")
    if n >= 7:
        roles.append("hunter")
    while len(roles) < n:
        roles.append("villager")
    random.shuffle(roles)
    return roles


def make_code() -> str:
    return "".join(random.choices(string.ascii_uppercase, k=4))


@dataclass
class Player:
    id: str
    name: str
    role: str = ""
    alive: bool = True
    is_host: bool = False
    night_action_done: bool = False


@dataclass
class OracleReading:
    subject_name: str
    signals: list
    hint: str
    round: int
    mocked: bool = True


@dataclass
class Game:
    code: str
    phase: str = "lobby"
    round: int = 0
    players: list = field(default_factory=list)
    wolf_votes: dict = field(default_factory=dict)
    doctor_save: Optional[str] = None
    seer_result: Optional[dict] = None
    night_eliminated: Optional[str] = None
    day_votes: dict = field(default_factory=dict)
    day_eliminated: Optional[str] = None
    oracle_readings: list = field(default_factory=list)
    winner: Optional[str] = None
    hunter_pending: Optional[str] = None

    def player_by_id(self, pid: str) -> Optional[Player]:
        return next((p for p in self.players if p.id == pid), None)

    def alive_players(self) -> list:
        return [p for p in self.players if p.alive]

    def wolves(self) -> list:
        return [p for p in self.players if p.role == "werewolf"]

    def alive_wolves(self) -> list:
        return [p for p in self.players if p.role == "werewolf" and p.alive]

    def start_game(self):
        roles = assign_roles(len(self.players))
        for p, role in zip(self.players, roles):
            p.role = role
        self.phase = "night"
        self.round = 1
        self._reset_night()

    def _reset_night(self):
        self.wolf_votes = {}
        self.doctor_save = None
        self.seer_result = None
        self.night_eliminated = None
        self.day_votes = {}
        self.day_eliminated = None
        for p in self.players:
            p.night_action_done = False

    def resolve_night(self) -> str:
        tally = {}
        for target_id in self.wolf_votes.values():
            tally[target_id] = tally.get(target_id, 0) + 1
        kill_target = max(tally, key=tally.get) if tally else None

        if kill_target and kill_target != self.doctor_save:
            victim = self.player_by_id(kill_target)
            if victim:
                victim.alive = False
                self.night_eliminated = kill_target
                if victim.role == "hunter":
                    self.hunter_pending = kill_target
        else:
            self.night_eliminated = None

        self.phase = "night_results"
        return self.night_eliminated

    def advance_to_day(self):
        if self.hunter_pending:
            self.phase = "hunter_shot"
        else:
            self.phase = "day"
            self._check_win()

    def resolve_hunter_shot(self, target_id: str):
        target = self.player_by_id(target_id)
        if target and target.alive:
            target.alive = False
        self.hunter_pending = None
        self.phase = "day"
        self._check_win()

    def cast_vote(self, voter_id: str, target_id: str):
        self.day_votes[voter_id] = target_id

    def resolve_day_vote(self) -> Optional[str]:
        tally: dict[str, int] = {}
        for target_id in self.day_votes.values():
            tally[target_id] = tally.get(target_id, 0) + 1
        if not tally:
            return None

        max_votes = max(tally.values())
        candidates = [pid for pid, v in tally.items() if v == max_votes]
        eliminated_id = random.choice(candidates)

        eliminated = self.player_by_id(eliminated_id)
        if eliminated:
            eliminated.alive = False
            self.day_eliminated = eliminated_id

            if eliminated.role == "jester":
                self.winner = "jester"
                self.phase = "game_over"
                return eliminated_id

            if eliminated.role == "hunter":
                self.hunter_pending = eliminated_id
                self._check_win()
                if self.phase != "game_over":
                    self.phase = "hunter_shot"
                return eliminated_id

        self._check_win()
        if self.phase != "game_over":
            self.round += 1
            self._reset_night()
            self.phase = "night"

        return eliminated_id

    def _check_win(self):
        alive_wolves = len(self.alive_wolves())
        alive_non_wolves = len([p for p in self.alive_players() if p.role != "werewolf"])

        if alive_wolves == 0:
            self.winner = "village"
            self.phase = "game_over"
        elif alive_wolves >= alive_non_wolves:
            self.winner = "wolves"
            self.phase = "game_over"

    def public_state(self, requesting_player_id: Optional[str] = None) -> dict:
        me = self.player_by_id(requesting_player_id) if requesting_player_id else None

        wolf_allies = []
        if me and me.role == "werewolf":
            wolf_allies = [p.name for p in self.wolves() if p.id != requesting_player_id]

        players_out = []
        for p in self.players:
            role_visible = p.role if (self.phase == "game_over" or not p.alive or p.id == requesting_player_id) else None
            players_out.append({
                "id": p.id,
                "name": p.name,
                "alive": p.alive,
                "is_host": p.is_host,
                "role": role_visible,
                "night_action_done": p.night_action_done,
            })

        seer_hint = None
        if me and me.role == "seer" and self.seer_result:
            seer_hint = self.seer_result

        oracle_out = [
            {
                "subject_name": r.subject_name,
                "signals": r.signals,
                "hint": r.hint,
                "round": r.round,
                "mocked": r.mocked,
            }
            for r in self.oracle_readings
        ]

        vote_tally = {}
        for target_id in self.day_votes.values():
            target = self.player_by_id(target_id)
            if target:
                vote_tally[target.name] = vote_tally.get(target.name, 0) + 1

        night_eliminated_name = None
        if self.night_eliminated:
            p = self.player_by_id(self.night_eliminated)
            night_eliminated_name = p.name if p else None

        day_eliminated_name = None
        if self.day_eliminated:
            p = self.player_by_id(self.day_eliminated)
            day_eliminated_name = p.name if p else None

        hunter_name = None
        if self.hunter_pending:
            p = self.player_by_id(self.hunter_pending)
            hunter_name = p.name if p else None

        my_vote_name = None
        if requesting_player_id and requesting_player_id in self.day_votes:
            voted_id = self.day_votes[requesting_player_id]
            vp = self.player_by_id(voted_id)
            my_vote_name = vp.name if vp else None

        return {
            "code": self.code,
            "phase": self.phase,
            "round": self.round,
            "players": players_out,
            "my_role": me.role if me else None,
            "my_role_emoji": ROLE_EMOJI.get(me.role, "") if me else "",
            "my_role_flavor": ROLE_FLAVOR.get(me.role, "") if me else "",
            "wolf_allies": wolf_allies,
            "night_eliminated": night_eliminated_name,
            "day_eliminated": day_eliminated_name,
            "seer_result": seer_hint,
            "oracle_readings": oracle_out,
            "vote_tally": vote_tally,
            "my_vote": my_vote_name,
            "hunter_pending": hunter_name,
            "winner": self.winner,
            "player_count": len(self.players),
        }
