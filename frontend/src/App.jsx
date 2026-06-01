import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api.js";

// ── storage helpers (sessionStorage = per-tab, so multiple tabs work) ─────────
const save = (k, v) => sessionStorage.setItem(k, JSON.stringify(v));
const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } };

// ── polling ───────────────────────────────────────────────────────────────────
function usePoll(code, playerId, interval = 2000) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const active = useRef(true);

  useEffect(() => {
    if (!code) return;
    active.current = true;
    let timer;
    const poll = async () => {
      try {
        const s = await api.getState(code, playerId);
        if (active.current) setState(s);
      } catch (e) { if (active.current) setErr(e.message); }
      if (active.current) timer = setTimeout(poll, interval);
    };
    poll();
    return () => { active.current = false; clearTimeout(timer); };
  }, [code, playerId, interval]);

  return [state, err, setState];
}

// ── main app ──────────────────────────────────────────────────────────────────
function fadeAudio(el, targetVol, ms = 800) {
  if (!el) return;
  const start = el.volume;
  const diff = targetVol - start;
  const steps = 20;
  let i = 0;
  const tid = setInterval(() => {
    i++;
    el.volume = Math.max(0, Math.min(1, start + diff * (i / steps)));
    if (i >= steps) clearInterval(tid);
  }, ms / steps);
}

export default function App() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const ping = () => fetch("/api/health").catch(() => {});
    ping();
    const id = setInterval(ping, 9 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const [oracleOpen, setOracleOpen] = useState(false);
  const audioRef = useRef(null);
  const oracleAudioRef = useRef(null);

  useEffect(() => {
    if (entered && audioRef.current) {
      audioRef.current.play().catch(console.error);
    }
  }, [entered]);

  useEffect(() => {
    const main = audioRef.current;
    const oracle = oracleAudioRef.current;
    if (!main || !oracle || !entered) return;
    if (oracleOpen) {
      fadeAudio(main, 0);
      oracle.currentTime = 0;
      oracle.play().catch(console.error);
      fadeAudio(oracle, 1);
    } else {
      fadeAudio(oracle, 0);
      setTimeout(() => { if (oracle) oracle.pause(); }, 850);
      fadeAudio(main, 1);
    }
  }, [oracleOpen, entered]);

  // fade out main music when night begins
  useEffect(() => {
    if (screen === "role_reveal") {
      fadeAudio(audioRef.current, 0, 2000);
      setTimeout(() => { if (audioRef.current) audioRef.current.pause(); }, 2100);
    }
  }, [screen]);

  const [session, setSession] = useState(() => load("moonrise_session") || {});
  const { code, playerId, playerName } = session;

  const [gameState, , setGameState] = usePoll(code, playerId);
  const [screen, setScreen] = useState("welcome");
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [oracleResult, setOracleResult] = useState(null);
  const [prevPhase, setPrevPhase] = useState(null);

  const updateSession = (updates) => {
    const next = { ...session, ...updates };
    setSession(next);
    save("moonrise_session", next);
  };

  // drive screen from game state
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.phase;

    if (phase !== prevPhase) {
      setPrevPhase(phase);
      setOracleResult(null); // clear oracle overlay on phase change

      if (phase === "lobby") setScreen("lobby");
      else if (phase === "night") {
        if (!roleRevealed) { setScreen("role_reveal"); }
        else setScreen("night");
      }
      else if (phase === "night_results") setScreen("night_results");
      else if (phase === "hunter_shot") setScreen("hunter_shot");
      else if (phase === "day") setScreen("day");
      else if (phase === "game_over") setScreen("game_over");
    }
  }, [gameState?.phase, roleRevealed, prevPhase]);

  // first time going to night — show role reveal
  useEffect(() => {
    if (gameState?.phase === "night" && screen === "role_reveal" && roleRevealed) {
      setScreen("night");
    }
  }, [roleRevealed, gameState?.phase, screen]);

  const handleRoleRevealed = () => {
    setRoleRevealed(true);
    setScreen("night");
  };

  const handleJoined = ({ code, playerId, playerName }) => {
    updateSession({ code, playerId, playerName });
    setScreen("lobby");
  };


  const handleOracle = (result) => { setOracleResult(result); setOracleOpen(true); };
  const handleOracleClose = () => { setOracleResult(null); setOracleOpen(false); };

  const me = gameState?.players?.find(p => p.id === playerId);
  const isHost = me?.is_host;

  let content;
  if (!entered) {
    content = <IntroSplash onEnter={() => setEntered(true)} />;
  } else if (!code || !playerId) {
    content = <Welcome onJoined={handleJoined} />;
  } else if (!gameState) {
    content = <div className="screen"><p className="subtitle">Connecting to game {code}…</p></div>;
  } else if (oracleResult) {
    content = <OracleResultOverlay result={oracleResult} onClose={handleOracleClose} />;
  } else {
    switch (screen) {
      case "lobby":      content = <Lobby gameState={gameState} playerId={playerId} isHost={isHost} onStarted={setGameState} />; break;
      case "role_reveal": content = <RoleReveal gameState={gameState} onContinue={handleRoleRevealed} />; break;
      case "night":      content = <NightPhase gameState={gameState} playerId={playerId} isHost={isHost} onAdvanced={setGameState} />; break;
      case "night_results": content = <NightResults gameState={gameState} isHost={isHost} onAdvanced={setGameState} playerId={playerId} />; break;
      case "hunter_shot": content = <HunterShot gameState={gameState} playerId={playerId} onAdvanced={setGameState} />; break;
      case "day":        content = <DayPhase gameState={gameState} playerId={playerId} isHost={isHost} onAdvanced={setGameState} onOracle={handleOracle} onOracleOpen={() => setOracleOpen(true)} onOracleClose={() => setOracleOpen(false)} />; break;
      case "game_over":  content = <GameOver gameState={gameState} playerId={playerId} onReset={() => { sessionStorage.clear(); window.location.reload(); }} />; break;
      default:           content = <div className="screen"><p className="subtitle">Loading…</p></div>;
    }
  }

  return (
    <>
      <audio ref={audioRef} src="/werewolf.mp4" loop preload="auto" />
      <audio ref={oracleAudioRef} src="/oracle.mp4" loop preload="auto" volume="0" />
      {content}
    </>
  );
}

// ── Intro splash ──────────────────────────────────────────────────────────────
function IntroSplash({ onEnter }) {
  return (
    <div className="screen" style={{ cursor: "pointer", userSelect: "none" }} onClick={onEnter}>
      <h1 style={{ fontSize: "clamp(3rem,12vw,7rem)" }}>🌕</h1>
      <h1>MOONRISE</h1>
      <p className="subtitle" style={{ marginTop: "2rem", letterSpacing: "0.3em" }}>
        Click anywhere to enter
      </p>
    </div>
  );
}

// ── Welcome ───────────────────────────────────────────────────────────────────
function Welcome({ onJoined }) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState("choose");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!name.trim()) return setErr("Enter your name");
    setLoading(true); setErr("");
    try {
      const { code, player_id } = await api.createGame(name);
      onJoined({ code, playerId: player_id, playerName: name });
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const join = async () => {
    if (!name.trim()) return setErr("Enter your name");
    if (!joinCode.trim()) return setErr("Enter game code");
    setLoading(true); setErr("");
    try {
      const { player_id } = await api.joinGame(joinCode.toUpperCase(), name);
      onJoined({ code: joinCode.toUpperCase(), playerId: player_id, playerName: name });
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  if (mode === "choose") return (
    <div className="screen fade-in">
      <h1>🌕 MOONRISE</h1>
      <p className="subtitle">Werewolf · Zoom Edition</p>
      <div className="gap-lg" />
      <div className="card">
        <div className="two-col">
          <button className="btn-primary" onClick={() => setMode("create")}>Create Game</button>
          <button className="btn-ghost" onClick={() => setMode("join")}>Join Game</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="screen fade-in">
      <h1>🌕 MOONRISE</h1>
      <p className="subtitle">{mode === "create" ? "Start a new game" : "Enter the code"}</p>
      <div className="gap-lg" />
      <div className="card">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={16}
          autoFocus
        />
        {mode === "join" && (
          <>
            <div className="gap-sm" />
            <input
              type="text"
              placeholder="Game code (e.g. WOLF)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
            />
          </>
        )}
        {err && <p className="error-msg">{err}</p>}
        <div className="gap" />
        <button className="btn-primary" onClick={mode === "create" ? create : join} disabled={loading}>
          {loading ? "…" : mode === "create" ? "Create Game" : "Join Game"}
        </button>
        <div className="gap-sm" />
        <button className="btn-ghost btn-small" onClick={() => setMode("choose")}>← Back</button>
      </div>
    </div>
  );
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
const ROLE_GUIDE = [
  {
    role: "werewolf", emoji: "🐺", color: "var(--red)",
    what: "Each night, vote with your pack to kill a villager.",
    how: "Blend in during the day. Accuse others, seem helpful, never hesitate. Win when wolves equal or outnumber the village.",
  },
  {
    role: "villager", emoji: "🏘️", color: "var(--moon)",
    what: "No special ability. Your only weapon is your voice.",
    how: "Watch for inconsistencies. Who deflects questions? Who votes too fast? Identify and eliminate the wolves.",
  },
  {
    role: "seer", emoji: "👁️", color: "var(--purple)",
    what: "Each night, learn one player's true role.",
    how: "Guard this knowledge — the wolves will hunt you if you reveal yourself too early. Time your reveal for maximum impact.",
  },
  {
    role: "doctor", emoji: "💉", color: "var(--green)",
    what: "Each night, protect one player from being killed.",
    how: "Think like the wolves: who would they most want dead? Protect that person. You may protect yourself once.",
  },
  {
    role: "jester", emoji: "🃏", color: "var(--orange)",
    what: "Win by getting yourself voted out during the day.",
    how: "Act suspicious. Change your story. Make the village desperate to eliminate you. You win alone — and it's glorious.",
  },
  {
    role: "hunter", emoji: "🏹", color: "var(--moon)",
    what: "When eliminated, you take one player with you.",
    how: "You are a deterrent while alive. When your moment comes, choose your final shot wisely.",
  },
];

function Lobby({ gameState, playerId, isHost, onStarted }) {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const start = async () => {
    setLoading(true); setErr("");
    try {
      const s = await api.startGame(gameState.code, playerId);
      onStarted(s);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const n = gameState.players?.length || 0;

  return (
    <div className="screen fade-in">
      <h3>Game Code</h3>
      <div className="code-display">{gameState.code}</div>
      <p className="subtitle">Share this with friends on Zoom</p>
      <div className="gap-lg" />
      <div className="card">
        <h3>{n} player{n !== 1 ? "s" : ""} joined</h3>
        <ul className="player-list">
          {gameState.players?.map(p => (
            <li key={p.id}>
              {p.name}
              {p.id === playerId && " (you)"}
              {p.is_host && <span className="host-badge">HOST</span>}
            </li>
          ))}
        </ul>
        {isHost && (
          <>
            <div className="gap" />
            {err && <p className="error-msg">{err}</p>}
            <button className="btn-primary" onClick={start} disabled={loading || n < 4}>
              {n < 4 ? `Need ${4 - n} more` : loading ? "Starting…" : "Start Game"}
            </button>
          </>
        )}
        {!isHost && <p className="subtitle" style={{ marginTop: "1.5rem" }}>Waiting for host to start…</p>}
      </div>

      <div className="gap-lg" />
      <button className="btn-ghost btn-small" onClick={() => setShowGuide(g => !g)}>
        {showGuide ? "Hide Roles ↑" : "How to Play · Roles ↓"}
      </button>

      {showGuide && (
        <div className="role-guide fade-in">
          {ROLE_GUIDE.map(r => (
            <div key={r.role} className="role-guide-row">
              <div className="role-guide-header">
                <span className="role-guide-emoji">{r.emoji}</span>
                <span className="role-guide-name" style={{ color: r.color }}>{r.role.toUpperCase()}</span>
              </div>
              <p className="role-guide-what">{r.what}</p>
              <p className="role-guide-how">{r.how}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Role Reveal ───────────────────────────────────────────────────────────────
const ROLE_TIPS = {
  werewolf: "During the day, act like a concerned villager. Accuse someone credible early — it deflects suspicion. Coordinate kills with your pack on Zoom. Never vote against a fellow wolf unless you must.",
  villager: "You have no special power, only instincts. Watch for players who deflect questions or accuse too eagerly without reason. Your vote matters — use it well.",
  seer: "You hold the most dangerous secret in the game. Stay quiet until your knowledge can change the vote. Once you reveal yourself, the wolves will come for you.",
  doctor: "Think about who the wolves most want dead — probably the seer or the most vocal accuser. Protect them. You can protect yourself, but only once.",
  jester: "Be erratic. Say things that make no sense. Get caught in a lie on purpose. Make the village so suspicious of you that they can't wait to vote you out. That's how you win.",
  hunter: "Stay alert. If you die by wolf or by vote, you take someone with you — make it count. Whisper your suspicions to yourself so you're ready when the moment comes.",
};

function RoleReveal({ gameState, onContinue }) {
  const role = gameState.my_role;
  const emoji = gameState.my_role_emoji;
  const flavor = gameState.my_role_flavor;
  const allies = gameState.wolf_allies || [];
  const tip = ROLE_TIPS[role];

  return (
    <div className="screen fade-in">
      <p className="phase-banner">Round {gameState.round} · Night Falls</p>
      <div className={`role-card ${role}`}>
        <span className="role-emoji">{emoji}</span>
        <div className="role-name">{role?.toUpperCase()}</div>
        <p className="role-flavor">"{flavor}"</p>
        {allies.length > 0 && (
          <p className="wolf-allies">Your pack: {allies.join(", ")} 🐺</p>
        )}
      </div>
      {tip && (
        <div className="role-tip fade-in">
          <p className="role-tip-label">How to play this role</p>
          <p className="role-tip-text">{tip}</p>
        </div>
      )}
      <div className="gap-lg" />
      <button className="btn-moon" onClick={onContinue}>I Know My Role →</button>
    </div>
  );
}

// ── Night Phase ───────────────────────────────────────────────────────────────
function NightPhase({ gameState, playerId, isHost, onAdvanced }) {
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const role = gameState.my_role;
  const me = gameState.players?.find(p => p.id === playerId);

  const targets = (gameState.players || []).filter(p => {
    if (!p.alive) return false;
    if (role === "werewolf") return p.id !== playerId && !gameState.wolf_allies?.includes(p.name) && p.role !== "werewolf";
    if (role === "seer" || role === "doctor") return p.id !== playerId;
    return false;
  });

  const submitAction = async () => {
    if (!selected) return;
    setLoading(true); setErr("");
    try {
      if (role === "werewolf") await api.wolfVote(gameState.code, playerId, selected);
      else if (role === "doctor") await api.doctorSave(gameState.code, playerId, selected);
      else if (role === "seer") await api.seerDivine(gameState.code, playerId, selected);
      setDone(true);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const resolveNight = async () => {
    setLoading(true);
    try { const s = await api.advanceNight(gameState.code, playerId); onAdvanced(s); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const actionLabels = {
    werewolf: { title: "Who do you kill?", btn: "Confirm Kill" },
    seer: { title: "Whose soul do you read?", btn: "Divine" },
    doctor: { title: "Who do you save?", btn: "Save Them" },
  };
  const labels = actionLabels[role];

  const seerResult = done && role === "seer" && gameState.seer_result;
  const alliesDone = isHost && (gameState.players || []).filter(p => p.alive && ["werewolf","seer","doctor"].includes(p.role)).every(p => p.night_action_done);

  return (
    <div className="screen fade-in">
      <p className="phase-banner">Round {gameState.round} · Night Phase 🌑</p>

      {role === "werewolf" && !done && (
        <>
          <h2>🐺 Hunt</h2>
          <p className="subtitle">{labels.title}</p>
          <div className="target-grid">
            {targets.map(p => (
              <button key={p.id} className={`target-btn ${selected === p.id ? "selected" : ""}`} onClick={() => setSelected(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          {err && <p className="error-msg">{err}</p>}
          <div className="gap" />
          <button className="btn-primary" onClick={submitAction} disabled={!selected || loading}>{loading ? "…" : labels.btn}</button>
        </>
      )}

      {role === "seer" && !done && (
        <>
          <h2>👁️ Divine</h2>
          <p className="subtitle">{labels.title}</p>
          <div className="target-grid">
            {targets.map(p => (
              <button key={p.id} className={`target-btn ${selected === p.id ? "selected" : ""}`} onClick={() => setSelected(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          {err && <p className="error-msg">{err}</p>}
          <div className="gap" />
          <button className="btn-primary" onClick={submitAction} disabled={!selected || loading}>{loading ? "…" : labels.btn}</button>
        </>
      )}

      {role === "seer" && done && gameState.seer_result && (
        <div className="card fade-in">
          <h3>The spirits reveal…</h3>
          <div className={`seer-reveal ${gameState.seer_result.is_wolf ? "wolf" : "innocent"}`}>
            {gameState.seer_result.target_name} is {gameState.seer_result.is_wolf ? "A WOLF 🐺" : "INNOCENT ✓"}
          </div>
          <p className="subtitle" style={{ marginTop: "1rem" }}>Guard this knowledge.</p>
        </div>
      )}

      {role === "doctor" && !done && (
        <>
          <h2>💉 Heal</h2>
          <p className="subtitle">{labels.title}</p>
          <div className="target-grid">
            {targets.map(p => (
              <button key={p.id} className={`target-btn ${selected === p.id ? "selected" : ""}`} onClick={() => setSelected(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          {err && <p className="error-msg">{err}</p>}
          <div className="gap" />
          <button className="btn-primary" onClick={submitAction} disabled={!selected || loading}>{loading ? "…" : labels.btn}</button>
        </>
      )}

      {(role === "villager" || role === "jester" || role === "hunter") && (
        <div className="card">
          <span style={{ fontSize: "3rem" }}>{gameState.my_role_emoji}</span>
          <div className="gap-sm" />
          <h3>The night is long.</h3>
          <p style={{ marginTop: "0.5rem" }}>Others move in the dark. Wait for dawn.</p>
        </div>
      )}

      {(done && role !== "seer") && (
        <div className="card fade-in">
          <p>✓ Action submitted. Waiting for others…</p>
        </div>
      )}

      {isHost && (
        <div style={{ marginTop: "2rem" }}>
          {err && <p className="error-msg">{err}</p>}
          <button className="btn-ghost" onClick={resolveNight} disabled={loading}>
            {loading ? "…" : "⏭ Resolve Night (Host)"}
          </button>
          {alliesDone && <p className="subtitle" style={{ marginTop: "0.5rem" }}>All actions done ✓</p>}
        </div>
      )}
    </div>
  );
}

// ── Night Results ─────────────────────────────────────────────────────────────
function NightResults({ gameState, isHost, onAdvanced, playerId }) {
  const [loading, setLoading] = useState(false);
  const killed = gameState.night_eliminated;

  const advance = async () => {
    setLoading(true);
    try { const s = await api.advanceToDay(gameState.code, playerId); onAdvanced(s); }
    catch (e) {} finally { setLoading(false); }
  };

  return (
    <div className="screen fade-in">
      <p className="phase-banner">Round {gameState.round} · Dawn Breaks 🌅</p>
      {killed ? (
        <>
          <h1 style={{ color: "var(--red)" }}>💀</h1>
          <div className="gap" />
          <p className="announcement bad">The village woke to find {killed} had fallen in the night.</p>
          <div className="gap" />
          <DeadReveal gameState={gameState} name={killed} />
        </>
      ) : (
        <>
          <h1>🌕</h1>
          <div className="gap" />
          <p className="announcement good">The village woke safe. No blood was spilled.</p>
        </>
      )}
      <div className="gap-lg" />
      {isHost && (
        <button className="btn-moon" onClick={advance} disabled={loading}>
          {loading ? "…" : "Proceed to Day Phase →"}
        </button>
      )}
      {!isHost && <p className="subtitle">Waiting for host to continue…</p>}
    </div>
  );
}

function DeadReveal({ gameState, name }) {
  const p = gameState.players?.find(p => p.name === name);
  if (!p || !p.role) return null;
  const roleEmoji = { werewolf: "🐺", villager: "🏘️", seer: "👁️", doctor: "💉", jester: "🃏", hunter: "🏹" };
  return (
    <p className="announcement neutral">
      {name} was a {p.role?.toUpperCase()} {roleEmoji[p.role]}
    </p>
  );
}

// ── Hunter Shot ───────────────────────────────────────────────────────────────
function HunterShot({ gameState, playerId, onAdvanced }) {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const isHunter = gameState.players?.find(p => p.id === playerId)?.name === gameState.hunter_pending;

  const targets = (gameState.players || []).filter(p => p.alive && p.id !== playerId);

  const shoot = async () => {
    if (!selected) return;
    setLoading(true);
    try { const s = await api.hunterShot(gameState.code, playerId, selected); onAdvanced(s); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="screen fade-in">
      <p className="phase-banner">The Hunter Falls</p>
      <h2 style={{ color: "var(--orange)" }}>🏹 {gameState.hunter_pending} is dying…</h2>
      <div className="gap" />
      <p className="announcement neutral">But a hunter never dies alone.</p>

      {isHunter ? (
        <>
          <div className="gap-lg" />
          <p className="subtitle">Choose your final target</p>
          <div className="target-grid">
            {targets.map(p => (
              <button key={p.id} className={`target-btn ${selected === p.id ? "selected" : ""}`} onClick={() => setSelected(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          {err && <p className="error-msg">{err}</p>}
          <div className="gap" />
          <button className="btn-primary" onClick={shoot} disabled={!selected || loading}>
            {loading ? "…" : "Fire 🏹"}
          </button>
        </>
      ) : (
        <p className="subtitle" style={{ marginTop: "1.5rem" }}>Waiting for the hunter to take their shot…</p>
      )}
    </div>
  );
}

// ── Day Phase ─────────────────────────────────────────────────────────────────
function DayPhase({ gameState, playerId, isHost, onAdvanced, onOracle, onOracleOpen, onOracleClose }) {
  const [selectedVote, setSelectedVote] = useState(null);
  const [voteDone, setVoteDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showOracle, setShowOracle] = useState(false);

  const me = gameState.players?.find(p => p.id === playerId);
  const amAlive = me?.alive;

  const aliveTargets = (gameState.players || []).filter(p => p.alive && p.id !== playerId);

  const castVote = async () => {
    if (!selectedVote) return;
    setLoading(true); setErr("");
    try {
      await api.dayVote(gameState.code, playerId, selectedVote);
      setVoteDone(true);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const resolveVote = async () => {
    setLoading(true); setErr("");
    try { const s = await api.resolveVote(gameState.code, playerId); onAdvanced(s); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const votersCount = Object.keys(gameState.vote_tally || {}).reduce((a, k) => a + gameState.vote_tally[k], 0);
  const totalAlive = (gameState.players || []).filter(p => p.alive).length;

  return (
    <div className="screen fade-in">
      <p className="round-badge">Round {gameState.round}</p>
      <h2>☀️ Day Phase</h2>
      <p className="subtitle">Discuss on Zoom. Then vote.</p>

      {/* Player list */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3>The Village</h3>
        <ul className="player-list">
          {(gameState.players || []).map(p => (
            <li key={p.id} className={!p.alive ? "dead" : ""}>
              {!p.alive ? "💀 " : ""}{p.name}
              {p.id === playerId && " (you)"}
              {p.is_host && <span className="host-badge">HOST</span>}
              {!p.alive && p.role && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>— {p.role}</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* Oracle */}
      <div className="oracle-section">
        <h3>🔮 The Oracle</h3>
        <p style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
          Record a short clip of anyone speaking. The oracle reads behavioral signals and offers cryptic guidance.
        </p>
        <div className="gap" />
        <button className="btn-purple" onClick={() => { setShowOracle(true); onOracleOpen?.(); }}>
          Consult the Oracle
        </button>

        {/* Past readings */}
        {gameState.oracle_readings?.length > 0 && (
          <div className="oracle-readings-log">
            {[...gameState.oracle_readings].reverse().slice(0, 3).map((r, i) => (
              <div key={i} className="reading-entry fade-in">
                <div className="reading-subject">Oracle read: {r.subject_name}</div>
                <div className="reading-hint">"{r.hint}"</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voting */}
      {amAlive && (
        <div className="card" style={{ marginTop: "2rem" }}>
          <h3>🗳️ Cast Your Vote</h3>
          <p style={{ marginTop: "0.5rem" }}>Who should be tried by the village?</p>
          {!voteDone ? (
            <>
              <div className="target-grid">
                {aliveTargets.map(p => (
                  <button key={p.id} className={`target-btn ${selectedVote === p.id ? "selected" : ""}`} onClick={() => setSelectedVote(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
              {err && <p className="error-msg">{err}</p>}
              <div className="gap" />
              <button className="btn-primary" onClick={castVote} disabled={!selectedVote || loading}>
                {loading ? "…" : "Vote"}
              </button>
            </>
          ) : (
            <p style={{ marginTop: "1rem", color: "var(--green)", fontWeight: "700" }}>
              ✓ Vote cast. Waiting for others…
            </p>
          )}

          {/* Tally */}
          {Object.keys(gameState.vote_tally || {}).length > 0 && (
            <div className="vote-tally" style={{ marginTop: "1rem" }}>
              <h3>{votersCount}/{totalAlive} voted</h3>
              {Object.entries(gameState.vote_tally).sort((a,b) => b[1]-a[1]).map(([name, count]) => (
                <div key={name} className="tally-row">
                  <span>{name}</span>
                  <span className="tally-count">{"●".repeat(count)} {count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isHost && (
        <div style={{ marginTop: "2rem" }}>
          {err && <p className="error-msg">{err}</p>}
          <button className="btn-ghost" onClick={resolveVote} disabled={loading}>
            {loading ? "…" : "⏭ Resolve Vote (Host)"}
          </button>
        </div>
      )}

      {showOracle && (
        <OracleRecorder
          gameState={gameState}
          playerId={playerId}
          onResult={(r) => { setShowOracle(false); onOracle(r); }}
          onClose={() => { setShowOracle(false); onOracleClose?.(); }}
        />
      )}
    </div>
  );
}

// ── Oracle Recorder ───────────────────────────────────────────────────────────
function OracleRecorder({ gameState, playerId, onResult, onClose }) {
  const [step, setStep] = useState("pick"); // pick → countdown → recording → preview → submitting
  const [subject, setSubject] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(15);
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [err, setErr] = useState("");
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const videoPreviewRef = useRef(null);

  const alivePlayers = (gameState.players || []).filter(p => p.alive);

  const startCountdown = async () => {
    if (!subject) return setErr("Pick a subject");
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setStep("countdown");
      let c = 3;
      setCountdown(c);
      const interval = setInterval(() => {
        c--;
        setCountdown(c);
        if (c <= 0) {
          clearInterval(interval);
          startRecording(stream);
        }
      }, 1000);
    } catch (e) {
      setErr("Camera access denied. Try anyway with a mock reading.");
      setStep("submitting");
      submitMock();
    }
  };

  const startRecording = (stream) => {
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm" });
    mediaRef.current = mr;
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setStep("preview");
    };
    mr.start();
    setStep("recording");
    let t = 15;
    setTimeLeft(t);
    const interval = setInterval(() => {
      t--;
      setTimeLeft(t);
      if (t <= 0) { clearInterval(interval); mr.stop(); }
    }, 1000);
  };

  const stopEarly = () => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  };

  const submitVideo = async () => {
    setStep("submitting");
    try {
      const result = await api.oracle(gameState.code, playerId, subject, videoBlob);
      onResult(result);
    } catch (e) { setErr(e.message || "Oracle failed"); setStep("preview"); }
  };

  const submitMock = async () => {
    try {
      const result = await api.oracle(gameState.code, playerId, subject || "Unknown", new Blob([], { type: "video/webm" }));
      onResult(result);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => {
    if (videoUrl && videoPreviewRef.current) {
      videoPreviewRef.current.src = videoUrl;
    }
  }, [videoUrl]);

  return (
    <div className="oracle-modal">
      {step === "pick" && (
        <>
          <p className="oracle-eye">🔮</p>
          <h2>Consult the Oracle</h2>
          <p className="subtitle">Who does the oracle read?</p>
          <div className="gap" />
          <div className="target-grid" style={{ maxWidth: 340 }}>
            {alivePlayers.map(p => (
              <button key={p.id} className={`target-btn ${subject === p.name ? "selected" : ""}`} onClick={() => setSubject(p.name)}>
                {p.name}
              </button>
            ))}
          </div>
          {err && <p className="error-msg">{err}</p>}
          <div className="gap" />
          <button className="btn-purple" onClick={startCountdown} disabled={!subject}>Record 15s clip</button>
          <div className="gap-sm" />
          <button className="btn-ghost btn-small" onClick={onClose}>Cancel</button>
        </>
      )}

      {step === "countdown" && (
        <>
          <p className="subtitle">Get ready…</p>
          <div className="timer-ring">{countdown}</div>
        </>
      )}

      {step === "recording" && (
        <>
          <p className="oracle-eye" style={{ animation: "none", fontSize: "3rem" }}>⏺</p>
          <div className="timer-ring" style={{ color: "var(--red)" }}>{timeLeft}</div>
          <p className="subtitle">Recording {subject}…</p>
          <button className="btn-ghost" onClick={stopEarly}>Stop early</button>
        </>
      )}

      {step === "preview" && (
        <>
          <p className="oracle-eye" style={{ fontSize: "2rem", animation: "none" }}>👁️</p>
          <h3>Preview</h3>
          <video ref={videoPreviewRef} controls autoPlay className="preview" />
          {err && <p className="error-msg">{err}</p>}
          <div className="gap" />
          <button className="btn-purple" onClick={submitVideo}>Submit to Oracle</button>
          <div className="gap-sm" />
          <button className="btn-ghost btn-small" onClick={onClose}>Discard</button>
        </>
      )}

      {step === "submitting" && (
        <>
          <p className="oracle-eye">🔮</p>
          <h3>The Oracle Stirs…</h3>
          <p className="subtitle">Reading behavioral signals…</p>
        </>
      )}
    </div>
  );
}

// ── Oracle Result Overlay ─────────────────────────────────────────────────────
function OracleResultOverlay({ result, onClose }) {
  const top = [...(result.signals || [])].sort((a, b) => b.probability - a.probability).slice(0, 3);

  return (
    <div className="oracle-modal fade-in" onClick={onClose}>
      <p className="oracle-eye">🔮</p>
      <h3 style={{ color: "var(--text-muted)", letterSpacing: "0.3em" }}>THE ORACLE SPEAKS</h3>
      <p style={{ color: "var(--moon)", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.2em", marginTop: "0.5rem" }}>
        Regarding: {result.subject_name}
      </p>
      <div className="oracle-signals">
        {top.map((s, i) => (
          <span key={i} className="signal-tag">{s.type} {Math.round(s.probability * 100)}%</span>
        ))}
      </div>
      <p className="oracle-hint">"{result.hint}"</p>
      {result.mocked && <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>oracle · simulation mode</p>}
      <div className="gap-lg" />
      <p className="subtitle" style={{ fontSize: "0.75rem" }}>Tap anywhere to close</p>
    </div>
  );
}

// ── Game Over ─────────────────────────────────────────────────────────────────
function GameOver({ gameState, playerId, onReset }) {
  const winner = gameState.winner;
  const me = gameState.players?.find(p => p.id === playerId);
  const myRole = me?.role;

  const wolves = (gameState.players || []).filter(p => p.role === "werewolf");
  const jester = (gameState.players || []).find(p => p.role === "jester");

  const winConfig = {
    village: { emoji: "🏘️", title: "VILLAGE WINS", color: "var(--green)", msg: "The werewolves have been purged. Peace returns to the valley." },
    wolves: { emoji: "🐺", title: "WOLVES WIN", color: "var(--red)", msg: "The pack consumes the village in the night. The hunt is over." },
    jester: { emoji: "🃏", title: "THE FOOL WINS", color: "var(--orange)", msg: "You voted out the jester. The fool laughs last." },
  };
  const cfg = winConfig[winner] || winConfig.village;

  const isWinner = (winner === "village" && myRole !== "werewolf") ||
    (winner === "wolves" && myRole === "werewolf") ||
    (winner === "jester" && myRole === "jester");

  return (
    <div className="screen fade-in">
      <p style={{ fontSize: "6rem" }}>{cfg.emoji}</p>
      <h1 style={{ color: cfg.color }}>{cfg.title}</h1>
      <p style={{ marginTop: "1rem", maxWidth: 400 }}>{cfg.msg}</p>

      <div className="gap-lg" />
      <div className="card">
        <h3>{isWinner ? "You won 🎉" : "You lost"}</h3>
        <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>You were: <strong>{myRole?.toUpperCase()}</strong></p>
        <div style={{ marginTop: "1.5rem" }}>
          <h3>The Wolves Were</h3>
          {wolves.map(p => <p key={p.id} style={{ fontWeight: "700", marginTop: "0.25rem" }}>{p.name}</p>)}
          {jester && <><h3 style={{ marginTop: "1rem" }}>The Jester Was</h3><p style={{ fontWeight: "700", marginTop: "0.25rem" }}>{jester.name}</p></>}
        </div>
      </div>

      <div className="gap-lg" />
      <button className="btn-moon" onClick={onReset}>Play Again</button>
    </div>
  );
}
