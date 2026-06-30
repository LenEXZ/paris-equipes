import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set } from "firebase/database";

const DB_KEY = "paris-equipes-v1";
const ADMIN_CODE = "1234";

const DEFAULT_STATE = {
  nameRed: "Équipe Rouge",
  nameBlue: "Équipe Bleue",
  players: {},
  bets: [],
  winner: null,
  history: [],
  nextPlayerId: 1,
  nextBetId: 1,
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function App() {
  const [state, setState] = useState(null);
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [betInput, setBetInput] = useState("");
  const [betSide, setBetSide] = useState("red");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState("");
  const [adminError, setAdminError] = useState("");
  const [giveAmount, setGiveAmount] = useState("");
  const [giveTargetId, setGiveTargetId] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    const dbRef = ref(db, DB_KEY);
    const unsub = onValue(dbRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        setState(val);
      } else {
        setState(DEFAULT_STATE);
        set(ref(db, DB_KEY), DEFAULT_STATE);
      }
    });
    return () => unsub();
  }, []);

  async function saveState(newState) {
    try {
      await set(ref(db, DB_KEY), newState);
      setError(null);
    } catch (e) {
      setError("Erreur réseau, réessaie.");
    }
  }

  function logEvent(state_, text) {
    const history = [{ id: uid(), text }, ...(state_.history || [])].slice(0, 30);
    return { ...state_, history };
  }

  function addPlayer() {
    const name = newPlayerName.trim();
    if (!name || !state) return;
    const id = "p" + state.nextPlayerId;
    const next = {
      ...state,
      players: { ...(state.players || {}), [id]: { name, balance: 1000 } },
      nextPlayerId: state.nextPlayerId + 1,
    };
    saveState(logEvent(next, `${name} a rejoint avec 1000 points.`));
    setNewPlayerName("");
    setActivePlayerId(id);
  }

  function giveBalance() {
    const amt = parseInt(giveAmount, 10);
    if (!amt || amt <= 0 || !giveTargetId || !state.players[giveTargetId]) return;
    const player = state.players[giveTargetId];
    const next = {
      ...state,
      players: { ...state.players, [giveTargetId]: { ...player, balance: player.balance + amt } },
    };
    saveState(logEvent(next, `Admin a redonné ${amt} points à ${player.name}.`));
    setGiveAmount("");
  }

  function placeBet() {
    const amt = parseInt(betInput, 10);
    if (!activePlayerId || !state.players[activePlayerId]) return;
    if (!amt || amt <= 0 || state.winner) return;
    const player = state.players[activePlayerId];
    if (amt > player.balance) {
      setError(`${player.name} n'a que ${player.balance} points.`);
      return;
    }
    const betId = "b" + state.nextBetId;
    const next = {
      ...state,
      players: { ...state.players, [activePlayerId]: { ...player, balance: player.balance - amt } },
      bets: [...(state.bets || []), { id: betId, playerId: activePlayerId, side: betSide, amount: amt }],
      nextBetId: state.nextBetId + 1,
    };
    saveState(logEvent(next, `${player.name} a misé ${amt} pts sur ${betSide === "red" ? state.nameRed : state.nameBlue}.`));
    setBetInput("");
  }

  function declareWinner(side) {
    const bets = state.bets || [];
    if (bets.length === 0) return;
    const winBets = bets.filter((b) => b.side === side);
    const loseBets = bets.filter((b) => b.side !== side);
    const winPool = winBets.reduce((s, b) => s + b.amount, 0);
    const losePool = loseBets.reduce((s, b) => s + b.amount, 0);
    const players = { ...state.players };
    let logLines = [];

    if (winPool === 0) {
      logLines.push("Personne n'avait misé sur le gagnant — pas de redistribution.");
    } else {
      winBets.forEach((b) => {
        const share = b.amount / winPool;
        const winnings = Math.round(losePool * share);
        const payout = b.amount + winnings;
        const p = players[b.playerId];
        if (p) {
          players[b.playerId] = { ...p, balance: p.balance + payout };
          logLines.push(`${p.name} récupère ${payout} pts (mise ${b.amount} + gain ${winnings}).`);
        }
      });
    }

    let next = { ...state, players, winner: side };
    const teamName = side === "red" ? state.nameRed : state.nameBlue;
    logLines.unshift(`🏆 ${teamName} gagne ! Pot total : ${winPool + losePool} pts.`);
    logLines.forEach((line) => { next = logEvent(next, line); });
    saveState(next);
  }

  function newRound() {
    saveState(logEvent({ ...state, bets: [], winner: null }, "Nouvelle manche lancée."));
  }

  function resetEverything() {
    saveState(DEFAULT_STATE);
    setActivePlayerId(null);
  }

  function updateName(side, value) {
    saveState({ ...state, [side === "red" ? "nameRed" : "nameBlue"]: value });
  }

  if (!state) {
    return (
      <div style={{ ...styles.body, alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#9aa1b0" }}>Connexion à Firebase…</p>
      </div>
    );
  }

  const players = Object.entries(state.players || {}).map(([id, p]) => ({ id, ...p }));
  const ranking = [...players].sort((a, b) => b.balance - a.balance);
  const bets = state.bets || [];
  const totalRed = bets.filter((b) => b.side === "red").reduce((s, b) => s + b.amount, 0);
  const totalBlue = bets.filter((b) => b.side === "blue").reduce((s, b) => s + b.amount, 0);
  const total = totalRed + totalBlue;
  const pctRed = total > 0 ? Math.round((totalRed / total) * 100) : 50;
  const pctBlue = 100 - pctRed;
  const activePlayer = activePlayerId ? state.players[activePlayerId] : null;

  return (
    <div style={styles.body}>
      <div style={styles.wrap}>
        <h1 style={styles.h1}>⚔️ PARIS D'ÉQUIPE</h1>
        <p style={styles.sub}>Classement en direct — chacun part avec 1000 points</p>

        {error && <div style={styles.errorBanner} onClick={() => setError(null)}>{error}</div>}

        <div style={styles.panel}>
          <div style={styles.panelTitle}>Qui es-tu ?</div>
          <div style={styles.playerPicker}>
            {players.map((p) => (
              <button key={p.id} onClick={() => setActivePlayerId(p.id)}
                style={{ ...styles.playerChip, ...(activePlayerId === p.id ? styles.playerChipActive : {}) }}>
                {p.name} <span style={{ opacity: 0.6 }}>· {p.balance}</span>
              </button>
            ))}
          </div>
          <div style={styles.betRow}>
            <input style={styles.betInput} placeholder="Nouveau joueur (prénom)"
              value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)}
              maxLength={16} onKeyDown={(e) => e.key === "Enter" && addPlayer()} />
            <button style={styles.neutralBtn} onClick={addPlayer}>+ Ajouter</button>
          </div>
        </div>

        {state.winner && (
          <div style={{ ...styles.winnerBanner, ...(state.winner === "red" ? styles.winnerRed : styles.winnerBlue) }}>
            🏆 {state.winner === "red" ? state.nameRed : state.nameBlue} a gagné cette manche !
          </div>
        )}

        <div style={styles.gaugeWrap}>
          <div style={styles.gauge}>
            <div style={{ ...styles.seg, width: pctRed + "%", background: "linear-gradient(180deg,#d94545,#a82f2f)" }}>
              {total > 0 ? pctRed + "%" : ""}
            </div>
            <div style={{ ...styles.seg, width: pctBlue + "%", background: "linear-gradient(180deg,#3b6fd9,#2850a8)" }}>
              {total > 0 ? pctBlue + "%" : ""}
            </div>
          </div>
          <div style={styles.totalsRow}>
            <span>{totalRed} pts</span>
            <span>Pot total : {total} pts</span>
            <span>{totalBlue} pts</span>
          </div>
        </div>

        <div style={styles.teamNamesRow}>
          <input style={{ ...styles.teamNameInputSmall, borderBottomColor: "#d94545" }}
            value={state.nameRed} onChange={(e) => updateName("red", e.target.value)} maxLength={20} />
          <input style={{ ...styles.teamNameInputSmall, borderBottomColor: "#3b6fd9" }}
            value={state.nameBlue} onChange={(e) => updateName("blue", e.target.value)} maxLength={20} />
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>
            {activePlayer ? `Pari de ${activePlayer.name} (solde : ${activePlayer.balance} pts)` : "Choisis ton nom ci-dessus pour parier"}
          </div>
          <div style={styles.sideToggle}>
            <button onClick={() => setBetSide("red")}
              style={{ ...styles.sideBtn, background: betSide === "red" ? "#d94545" : "#11131a", borderColor: "#d94545" }}>
              {state.nameRed}
            </button>
            <button onClick={() => setBetSide("blue")}
              style={{ ...styles.sideBtn, background: betSide === "blue" ? "#3b6fd9" : "#11131a", borderColor: "#3b6fd9" }}>
              {state.nameBlue}
            </button>
          </div>
          <div style={styles.betRow}>
            <input type="number" min="1" placeholder="Points à miser" value={betInput}
              onChange={(e) => setBetInput(e.target.value)} style={styles.betInput}
              disabled={!activePlayer || !!state.winner} />
            <button style={{ ...styles.betBtn, opacity: !activePlayer || state.winner ? 0.5 : 1 }}
              onClick={placeBet} disabled={!activePlayer || !!state.winner}>Parier</button>
          </div>
          {state.winner && <div style={{ fontSize: 12, color: "#9aa1b0", marginTop: 8 }}>Manche terminée — lance une nouvelle manche pour reparier.</div>}
        </div>

        {bets.length > 0 && (
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Paris de cette manche</div>
            <div style={styles.betsList}>
              {[...bets].reverse().map((b) => {
                const p = state.players[b.playerId];
                return (
                  <div key={b.id} style={styles.betRowLine}>
                    <span>{p ? p.name : "?"}</span>
                    <span style={{ color: b.side === "red" ? "#d94545" : "#3b6fd9" }}>
                      {b.side === "red" ? state.nameRed : state.nameBlue}
                    </span>
                    <span>{b.amount} pts</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={styles.panel}>
          <div style={styles.panelTitle}>🏆 Classement</div>
          {ranking.length === 0
            ? <div style={{ color: "#9aa1b0", fontSize: 13 }}>Aucun joueur encore.</div>
            : <div style={styles.rankList}>
                {ranking.map((p, i) => (
                  <div key={p.id} style={styles.rankRow}>
                    <span style={styles.rankPos}>#{i + 1}</span>
                    <span style={styles.rankName}>{p.name}</span>
                    <span style={{ ...styles.rankBalance, color: p.balance === 0 ? "#d94545" : p.balance >= 1000 ? "#4ade80" : "#eef0f4" }}>
                      {p.balance} pts
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>

        <div style={styles.adminPanel}>
          {!isAdmin ? (
            <div style={styles.betRow}>
              <input style={styles.betInput} type="password" placeholder="Code admin"
                value={adminCodeInput}
                onChange={(e) => { setAdminCodeInput(e.target.value); setAdminError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { if (adminCodeInput === ADMIN_CODE) { setIsAdmin(true); } else { setAdminError("Code incorrect."); } } }} />
              <button style={styles.neutralBtn} onClick={() => { if (adminCodeInput === ADMIN_CODE) { setIsAdmin(true); } else { setAdminError("Code incorrect."); } }}>
                Déverrouiller admin
              </button>
            </div>
          ) : (
            <div>
              <div style={styles.panelTitle}>🔓 Mode admin</div>
              <div style={styles.controls}>
                <button style={styles.ctrlBtn} onClick={() => declareWinner("red")} disabled={!!state.winner}>
                  🏆 {state.nameRed} gagne
                </button>
                <button style={styles.ctrlBtn} onClick={() => declareWinner("blue")} disabled={!!state.winner}>
                  🏆 {state.nameBlue} gagne
                </button>
                <button style={styles.ctrlBtn} onClick={newRound} disabled={!state.winner}>
                  ↻ Nouvelle manche
                </button>
              </div>
              <div style={styles.betRow}>
                <select style={{ ...styles.betInput, cursor: "pointer" }} value={giveTargetId} onChange={(e) => setGiveTargetId(e.target.value)}>
                  <option value="">Choisir un joueur…</option>
                  {players.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.balance} pts)</option>)}
                </select>
                <input type="number" min="1" placeholder="Montant" value={giveAmount}
                  onChange={(e) => setGiveAmount(e.target.value)} style={{ ...styles.betInput, maxWidth: 100 }} />
                <button style={styles.neutralBtn} onClick={giveBalance}>Donner</button>
              </div>
              <button style={{ ...styles.neutralBtn, marginTop: 10, width: "100%" }} onClick={resetEverything}>
                ⚠️ Tout réinitialiser
              </button>
            </div>
          )}
          {adminError && <div style={{ color: "#d94545", fontSize: 12, marginTop: 6 }}>{adminError}</div>}
        </div>

        {(state.history || []).length > 0 && (
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Historique</div>
            <div style={styles.historyList}>
              {state.history.map((h) => <div key={h.id} style={styles.historyLine}>{h.text}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  body: { minHeight: "100vh", background: "radial-gradient(circle at 50% 0%,#1c2030 0%,#15171c 60%)", color: "#eef0f4", fontFamily: "'Segoe UI',system-ui,sans-serif", display: "flex", justifyContent: "center", padding: "28px 16px 40px" },
  wrap: { width: "100%", maxWidth: 640 },
  h1: { textAlign: "center", fontSize: 22, letterSpacing: 1, margin: "0 0 4px", fontWeight: 700 },
  sub: { textAlign: "center", color: "#9aa1b0", fontSize: 13, margin: "0 0 18px" },
  errorBanner: { background: "rgba(217,69,69,0.15)", color: "#d94545", border: "1px solid #a82f2f", borderRadius: 8, padding: "8px 12px", fontSize: 12, textAlign: "center", marginBottom: 12, cursor: "pointer" },
  panel: { background: "#1d2027", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 0 0 1px #2a2e38 inset" },
  panelTitle: { fontSize: 13, fontWeight: 700, color: "#9aa1b0", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  playerPicker: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  playerChip: { background: "#11131a", border: "1px solid #2a2e38", color: "#eef0f4", borderRadius: 999, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  playerChipActive: { borderColor: "#e0b04a", background: "#2a2410" },
  betRow: { display: "flex", gap: 6 },
  betInput: { flex: 1, minWidth: 0, background: "#11131a", border: "1px solid #2a2e38", borderRadius: 8, color: "#eef0f4", padding: "8px 10px", fontSize: 13, outline: "none" },
  neutralBtn: { border: "1px solid #2a2e38", borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer", color: "#eef0f4", background: "#11131a", whiteSpace: "nowrap" },
  winnerBanner: { textAlign: "center", fontWeight: 800, fontSize: 15, padding: 10, borderRadius: 10, marginBottom: 14 },
  winnerRed: { background: "rgba(217,69,69,0.15)", color: "#d94545", border: "1px solid #a82f2f" },
  winnerBlue: { background: "rgba(59,111,217,0.15)", color: "#3b6fd9", border: "1px solid #2850a8" },
  gaugeWrap: { background: "#1d2027", borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: "0 0 0 1px #2a2e38 inset" },
  gauge: { height: 38, borderRadius: 999, overflow: "hidden", display: "flex", background: "#2a2e38", boxShadow: "0 2px 10px rgba(0,0,0,0.4) inset" },
  seg: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, transition: "width 0.5s cubic-bezier(.4,0,.2,1)", whiteSpace: "nowrap", overflow: "hidden", color: "white" },
  totalsRow: { display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "#9aa1b0" },
  teamNamesRow: { display: "flex", gap: 14, marginBottom: 14 },
  teamNameInputSmall: { flex: 1, background: "transparent", border: "none", borderBottom: "2px solid", color: "#eef0f4", fontSize: 14, fontWeight: 700, padding: "4px 2px 6px", textAlign: "center", outline: "none" },
  sideToggle: { display: "flex", gap: 8, marginBottom: 10 },
  sideBtn: { flex: 1, padding: 10, borderRadius: 8, border: "1px solid", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  betBtn: { border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "white", background: "#e0b04a" },
  betsList: { fontSize: 12, color: "#eef0f4", maxHeight: 130, overflowY: "auto" },
  betRowLine: { display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: "1px solid #22252e" },
  rankList: { display: "flex", flexDirection: "column", gap: 4 },
  rankRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 4px", borderBottom: "1px solid #22252e", fontSize: 13 },
  rankPos: { color: "#9aa1b0", width: 28 },
  rankName: { flex: 1, fontWeight: 600 },
  rankBalance: { fontWeight: 800 },
  controls: { display: "flex", gap: 10, marginBottom: 14 },
  ctrlBtn: { flex: 1, padding: 10, borderRadius: 10, border: "1px solid #2a2e38", background: "#1d2027", color: "#eef0f4", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  adminPanel: { background: "#181a20", borderRadius: 14, padding: 16, marginBottom: 14, border: "1px dashed #3a3e48" },
  historyList: { fontSize: 12, color: "#9aa1b0", maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 },
  historyLine: { padding: "3px 0", borderBottom: "1px solid #22252e" },
};
