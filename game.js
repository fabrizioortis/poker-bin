"use strict";

const $ = (id) => document.getElementById(id);
const suits = [
  { code: "R", name: "rosso", className: "red" },
  { code: "G", name: "verde", className: "green" },
  { code: "B", name: "blu", className: "blue" }
];
const bits = (value) => value.toString(2).padStart(4, "0");
let mode = "draw";
let state;
let soundEnabled = false;
let audio;

function playSound(kind) {
  if (!soundEnabled) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const notes = kind === "win" ? [523, 659, 784, 1047] : kind === "lose" ? [330, 247] : kind === "deal" ? [440, 554] : [660];
    notes.forEach((frequency, index) => {
      const start = audio.currentTime + index * 0.09;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.19);
    });
  } catch {
    // Audio is optional when the browser does not support Web Audio.
  }
}

function makeDeck() {
  const deck = suits.flatMap((suit) => Array.from({ length: 16 }, (_, value) => ({ suit, value })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function evaluateFive(cards) {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const distinct = [...counts.keys()].sort((a, b) => a - b);
  let length = 1, bestLength = 1, straightHigh = distinct[0];
  for (let i = 1; i < distinct.length; i++) {
    length = distinct[i] === distinct[i - 1] + 1 ? length + 1 : 1;
    if (length >= bestLength) {
      bestLength = length;
      straightHigh = distinct[i];
    }
  }
  const ands = [], ors = [], xors = new Map();
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      ands.push(cards[i].value & cards[j].value);
      ors.push(cards[i].value | cards[j].value);
      const xor = cards[i].value ^ cards[j].value;
      xors.set(xor, (xors.get(xor) || 0) + 1);
    }
  }
  const and = Math.max(...ands), or = Math.min(...ors);
  const uniqueXors = [...xors].filter(([, count]) => count === 1).map(([value]) => value);
  const groups = (count) => [...counts].filter(([, n]) => n >= count).map(([value]) => value);
  const candidates = [];
  if (cards.every((card) => card.suit.code === cards[0].suit.code)) candidates.push({ score: [9, ...values], label: "Colore" });
  if (bestLength >= 3) candidates.push({ score: [8, bestLength, straightHigh, ...values], label: `Serie di ${bestLength} · fino a ${bits(straightHigh)}` });
  candidates.push({ score: [7, and, ...values], label: `AND massimo · ${bits(and)}` });
  candidates.push({ score: [6, -or, ...values], label: `OR minimo · ${bits(or)}` });
  if (uniqueXors.length) {
    const xor = Math.max(...uniqueXors);
    candidates.push({ score: [5, xor, ...values], label: `XOR unico · ${bits(xor)}` });
  }
  if (groups(5).length) candidates.push({ score: [4, ...values], label: "Bit puro" });
  if (groups(3).length) candidates.push({ score: [3, groups(3)[0], ...values], label: "Terzetto" });
  if (values[0] >= 8) candidates.push({ score: [2, ...values], label: "Bit alto" });
  if (groups(2).length) candidates.push({ score: [1, groups(2)[0], ...values], label: "Coppia" });
  return candidates.reduce((best, candidate) => compareScores(candidate.score, best.score) > 0 ? candidate : best);
}

function bestHand(cards) {
  let best = null;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const result = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(result.score, best.score) > 0) best = result;
          }
  return best;
}

function newGame() {
  state = { playerChips: 100, botChips: 100, handNumber: 0 };
  newHand();
}

function newHand() {
  if (!state.playerChips || !state.botChips) {
    newGame();
    return;
  }
  Object.assign(state, {
    deck: makeDeck(), player: [], bot: [], board: [], selected: new Set(),
    pot: 0, toCall: 0, phase: "bet", street: 0, revealed: false,
    handNumber: state.handNumber + 1, result: "", resultDetail: ""
  });
  const ante = Math.min(5, state.playerChips, state.botChips);
  state.playerChips -= ante;
  state.botChips -= ante;
  state.pot = ante * 2;
  const count = mode === "draw" ? 5 : 2;
  for (let i = 0; i < count; i++) {
    state.player.push(state.deck.pop());
    state.bot.push(state.deck.pop());
  }
  startBetting();
  playSound("deal");
  render();
}

function startBetting() {
  state.phase = "bet";
  state.toCall = 0;
  const max = Math.min(5, state.botChips, state.playerChips);
  if (max && Math.random() < 0.4) {
    state.toCall = max;
    state.botChips -= max;
    state.pot += max;
  }
}

function advance() {
  state.toCall = 0;
  if (mode === "draw") {
    if (state.street === 0) {
      state.phase = "draw";
      state.street = 1;
    } else {
      showdown();
    }
  } else if (state.street < 3) {
    const count = state.street === 0 ? 3 : 1;
    for (let i = 0; i < count; i++) state.board.push(state.deck.pop());
    state.street++;
    startBetting();
    playSound("deal");
  } else {
    showdown();
  }
  render();
}

function showdown() {
  state.phase = "end";
  state.revealed = true;
  const player = bestHand([...state.player, ...state.board]);
  const bot = bestHand([...state.bot, ...state.board]);
  const comparison = compareScores(player.score, bot.score);
  if (comparison > 0) {
    state.playerChips += state.pot;
    state.result = "Hai vinto la mano! ✨";
  } else if (comparison < 0) {
    state.botChips += state.pot;
    state.result = "La CPU vince la mano.";
  } else {
    state.playerChips += Math.floor(state.pot / 2);
    state.botChips += Math.ceil(state.pot / 2);
    state.result = "Pareggio! Piatto diviso.";
  }
  state.resultDetail = `Tu: ${player.label} · CPU: ${bot.label}`;
  state.pot = 0;
  playSound(comparison >= 0 ? "win" : "lose");
}

function cardElement(card, options = {}) {
  const element = document.createElement(options.selectable ? "button" : "div");
  if (options.selectable) element.type = "button";
  if (options.back) {
    element.className = "card back";
    element.textContent = "✳";
    element.setAttribute("aria-label", "Carta coperta");
  } else if (!card) {
    element.className = "card empty";
    element.setAttribute("aria-label", "Carta comune non ancora scoperta");
  } else {
    element.className = `card ${card.suit.className}${options.selectable ? " selectable" : ""}${options.selected ? " selected" : ""}`;
    element.setAttribute("aria-label", `${bits(card.value)}, ${card.suit.name}${options.selectable ? ", seleziona per cambiare" : ""}`);
    if (options.selectable) element.setAttribute("aria-pressed", String(options.selected));
    const value = document.createElement("div");
    value.className = "card-value";
    value.textContent = bits(card.value);
    const suit = document.createElement("div");
    suit.className = "card-suit";
    suit.textContent = card.suit.code;
    const symbol = document.createElement("div");
    symbol.className = "card-symbol";
    symbol.textContent = card.suit.code === "R" ? "◆" : card.suit.code === "G" ? "●" : "▲";
    symbol.setAttribute("aria-hidden", "true");
    element.append(value, suit, symbol);
  }
  return element;
}

function render() {
  $("hand-number").textContent = `#${String(state.handNumber).padStart(3, "0")}`;
  $("player-chips").textContent = state.playerChips;
  $("bot-chips").textContent = state.botChips;
  $("pot").textContent = state.pot;
  const phases = mode === "draw" ? ["PRIMA PUNTATA", "SECONDA PUNTATA"] : ["PRE-FLOP", "FLOP", "TURN", "RIVER"];
  $("phase-label").textContent = state.phase === "end" ? (state.revealed ? "SHOWDOWN" : "MANO CONCLUSA") : state.phase === "draw" ? "CAMBIO CARTE" : phases[state.street];
  $("bot-cards").replaceChildren(...state.bot.map((card) => cardElement(card, { back: !state.revealed })));
  $("player-cards").replaceChildren(...state.player.map((card, index) => {
    const element = cardElement(card, { selectable: state.phase === "draw", selected: state.selected.has(index) });
    if (state.phase === "draw") element.addEventListener("click", () => {
      if (state.selected.has(index)) state.selected.delete(index);
      else if (state.selected.size < 3) state.selected.add(index);
      playSound("click");
      render();
      $("player-cards").children[index].focus();
    });
    return element;
  }));
  $("community-wrap").hidden = mode !== "holdem";
  $("draw-hint").hidden = mode === "holdem";
  if (mode === "holdem") $("community-cards").replaceChildren(...Array.from({ length: 5 }, (_, i) => cardElement(state.board[i])));
  $("bet-actions").hidden = state.phase !== "bet";
  $("draw-actions").hidden = state.phase !== "draw";
  $("end-actions").hidden = state.phase !== "end";
  $("action-kicker").textContent = state.phase === "end" ? "RISULTATO" : "TOCCA A TE";
  if (state.phase === "bet") {
    $("message").textContent = state.toCall ? `La CPU punta ${state.toCall} fiches.` : "La CPU fa check.";
    $("detail").textContent = state.toCall ? "Vedi, rilancia o passa la mano." : "Fai check oppure punta per continuare.";
    $("call").textContent = state.toCall ? `Vedi ${state.toCall}` : "Check";
    $("raise").firstChild.textContent = state.toCall ? "Rilancia " : "Punta ";
    const maxRaise = Math.min(state.playerChips - state.toCall, state.botChips);
    $("bet-amount").max = Math.max(0, maxRaise);
    $("raise").disabled = maxRaise < 1;
    $("bet-amount").disabled = maxRaise < 1;
  } else if (state.phase === "draw") {
    $("message").textContent = "Vuoi cambiare carte?";
    $("detail").textContent = `Seleziona fino a 3 carte · ${state.selected.size}/3 selezionate. Puoi anche tenerle tutte.`;
    $("draw").firstChild.textContent = state.selected.size ? `Cambia ${state.selected.size} carte ` : "Tieni le carte ";
  } else {
    $("message").textContent = state.result;
    $("detail").textContent = state.resultDetail;
    $("next").firstChild.textContent = !state.playerChips || !state.botChips ? "Nuova partita " : "Nuova mano ";
  }
}

$("call").addEventListener("click", () => {
  state.playerChips -= state.toCall;
  state.pot += state.toCall;
  playSound("click");
  advance();
});
$("raise").addEventListener("click", () => {
  const amount = Number($("bet-amount").value);
  const max = Math.min(state.playerChips - state.toCall, state.botChips);
  if (!Number.isInteger(amount) || amount < 1 || amount > max) {
    $("detail").textContent = `Inserisci un importo intero tra 1 e ${max} fiches.`;
    $("bet-amount").focus();
    return;
  }
  state.playerChips -= state.toCall + amount;
  state.botChips -= amount;
  state.pot += state.toCall + amount * 2;
  playSound("click");
  advance();
});
$("fold").addEventListener("click", () => {
  state.botChips += state.pot;
  state.pot = 0;
  state.phase = "end";
  state.result = "Hai passato la mano.";
  state.resultDetail = "La CPU vince il piatto senza mostrare le carte.";
  playSound("lose");
  render();
});
$("draw").addEventListener("click", () => {
  state.selected.forEach((index) => { state.player[index] = state.deck.pop(); });
  const botCount = Math.floor(Math.random() * 4);
  for (let i = 0; i < botCount; i++) state.bot[i] = state.deck.pop();
  state.selected.clear();
  startBetting();
  playSound("deal");
  render();
});
$("next").addEventListener("click", newHand);
document.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.mode === mode) return;
  mode = button.dataset.mode;
  document.querySelectorAll(".mode").forEach((item) => {
    item.classList.toggle("active", item.dataset.mode === mode);
    item.setAttribute("aria-pressed", String(item.dataset.mode === mode));
  });
  newGame();
}));
$("sound").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  $("sound").setAttribute("aria-pressed", String(soundEnabled));
  $("sound").querySelector("span").textContent = `Suono: ${soundEnabled ? "on" : "off"}`;
  playSound("click");
});
[$("rules-open"), $("rules-open-side")].forEach((button) => button.addEventListener("click", () => $("rules").showModal()));
$("rules-close").addEventListener("click", () => $("rules").close());

newGame();
