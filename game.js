"use strict";

const $ = (id) => document.getElementById(id);
const suits = [
  { code: "R", name: "rosso", className: "red", symbol: "◆" },
  { code: "G", name: "verde", className: "green", symbol: "●" },
  { code: "B", name: "blu", className: "blue", symbol: "▲" },
  { code: "O", name: "oro", className: "gold", symbol: "✦" }
];
const bits = (value) => value.toString(2).padStart(4, "0");
const robotFigures = new Map([[13, "ORBIT"], [14, "NOVA"], [15, "CORE"]]);
const tips = [
  "Una coppia è buona, ma i valori più alti fanno da spareggio.",
  "Due coppie battono una coppia singola.",
  "Conserva una coppia: nel Draw può diventare un tris al cambio.",
  "Una serie richiede almeno tre valori distinti consecutivi.",
  "Il full unisce un tris e una coppia.",
  "Nel Draw puoi cambiare fino a tre carte, oppure tenerle tutte.",
  "In Hold'em la miglior mano può usare anche solo le carte comuni.",
  "Il valore 1111 è alto, ma non sempre è la carta giusta da tenere.",
  "La scala reale richiede cinque valori consecutivi dello stesso seme.",
  "Un check non costa fiches: usalo quando nessuno ha rilanciato.",
  "Conta le carte comuni prima di decidere quanto vale la tua mano.",
  "Un colore richiede cinque carte dello stesso seme.",
  "Un rilancio è un rischio: valuta prima le fiches che restano.",
  "Le carte dal valore vicino aiutano a costruire una serie.",
  "Il piatto si divide in caso di pareggio: anche la CPU può avere la stessa mano.",
  "Non confondere il valore binario con la forza della combinazione."
];
let mode = "draw";
let state;
let lastTipIndex = -1;
let soundEnabled = false;
let audio;
let renderedCounters = null;
let runoutToken = 0;

async function playSound(kind) {
  if (!soundEnabled) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== "running") await audio.resume();
    if (!soundEnabled || audio.state !== "running") return;
    const melodies = {
      enable: { notes: [523, 659, 784, 1047], type: "triangle", spacing: 0.075, duration: 0.2, volume: 0.1 },
      win: { notes: [523, 659, 784, 1047], type: "triangle", spacing: 0.1, duration: 0.25, volume: 0.11 },
      sweep: { notes: [523, 659, 784, 1047, 1318], type: "triangle", spacing: 0.085, duration: 0.28, volume: 0.12 },
      busted: { notes: [330, 247, 185], type: "sawtooth", spacing: 0.12, duration: 0.28, volume: 0.08 },
      fold: { notes: [587, 740, 880, 1175], type: "triangle", spacing: 0.085, duration: 0.22, volume: 0.095 },
      chips: { notes: [784, 988, 1175], type: "sine", spacing: 0.065, duration: 0.13, volume: 0.065 },
      lose: { notes: [330, 247], type: "sine", spacing: 0.11, duration: 0.24, volume: 0.075 },
      deal: { notes: [440, 554], type: "sine", spacing: 0.09, duration: 0.18, volume: 0.06 },
      click: { notes: [660], type: "sine", spacing: 0, duration: 0.12, volume: 0.045 }
    };
    const melody = melodies[kind] || melodies.click;
    melody.notes.forEach((frequency, index) => {
      const start = audio.currentTime + index * melody.spacing;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = melody.type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(melody.volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + melody.duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + melody.duration + 0.01);
    });
  } catch {
    // Audio is optional when the browser does not support Web Audio.
  }
}

function animateCounter(element, animationName) {
  element.classList.remove("pot-increase", "pot-collect", "chip-gain", "chip-spend");
  void element.offsetWidth;
  element.classList.add(animationName);
  element.addEventListener("animationend", () => element.classList.remove(animationName), { once: true });
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
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const fours = groups.filter(([, count]) => count === 4).map(([value]) => value);
  const triples = groups.filter(([, count]) => count === 3).map(([value]) => value);
  const pairs = groups.filter(([, count]) => count === 2).map(([value]) => value);
  const flush = cards.every((card) => card.suit.code === cards[0].suit.code);
  let length = 1, bestLength = 1, straightHigh = distinct[0];
  for (let i = 1; i < distinct.length; i++) {
    length = distinct[i] === distinct[i - 1] + 1 ? length + 1 : 1;
    if (length > bestLength || (length === bestLength && distinct[i] > straightHigh)) {
      bestLength = length;
      straightHigh = distinct[i];
    }
  }
  const fourValues = new Set(fours);
  const tripleValues = new Set(triples);
  const pairValues = new Set(pairs);
  const kickers = values.filter((value) => !fourValues.has(value) && !tripleValues.has(value) && !pairValues.has(value));
  if (flush && bestLength === 5) return { score: [10, straightHigh, ...values], label: `Scala reale · fino a ${bits(straightHigh)}` };
  if (fours.length) return { score: [9, fours[0], ...kickers], label: "Poker" };
  if (triples.length && pairs.length) return { score: [8, triples[0], pairs[0]], label: "Full" };
  if (flush) return { score: [7, ...values], label: "Colore" };
  if (bestLength >= 3) return { score: [6, bestLength, straightHigh, ...values], label: `Serie di ${bestLength} · fino a ${bits(straightHigh)}` };
  if (triples.length) return { score: [5, triples[0], ...kickers], label: "Tris" };
  if (pairs.length >= 2) return { score: [4, pairs[0], pairs[1], kickers[0]], label: "Doppia coppia" };
  if (pairs.length) return { score: [3, pairs[0], ...kickers], label: "Coppia" };
  return { score: [2, ...values], label: `Carta alta · ${bits(values[0])}` };
}

function describeHand(result) {
  if (!result) return "Punto provvisorio: si basa sulle carte visibili e può cambiare quando se ne scoprono altre.";
  const [category, first = 0, second = 0] = result.score;
  const binaryOrder = "I valori sono numeri binari senza segno: 1111 (15) è il più alto, 0000 (0) il più basso.";
  let description;
  if (category === 10) description = `Scala reale: cinque valori consecutivi dello stesso seme; il più alto è ${bits(first)}.`;
  else if (category === 9) description = `Poker: quattro carte di valore ${bits(first)}; se pari, decide il kicker.`;
  else if (category === 8) description = `Full: un tris di ${bits(first)} e una coppia di ${bits(second)}.`;
  else if (category === 7) description = "Colore: cinque carte dello stesso seme; si confrontano i valori dal più alto.";
  else if (category === 6) description = `Serie di ${first}: ${first} valori consecutivi, dal più basso al più alto ${bits(second)}. Prima conta la lunghezza, poi il valore massimo.`;
  else if (category === 5) description = `Tris di ${bits(first)}; se pari, decidono le altre carte in ordine decrescente.`;
  else if (category === 4) description = `Doppia coppia: ${bits(first)} e ${bits(second)}; poi decide il kicker.`;
  else if (category === 3) description = `Coppia di ${bits(first)}; se pari, decidono le altre carte in ordine decrescente.`;
  else description = `Carta alta ${bits(first)}; si confrontano le cinque carte dal valore più alto.`;
  return `${description} ${binaryOrder}`;
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

function tieBreakLabel(category, index) {
  if (category === 10) return index === 1 ? "valore della scala reale" : "carta successiva";
  if (category === 9) return index === 1 ? "valore del poker" : "kicker";
  if (category === 8) return index === 1 ? "valore del tris" : "valore della coppia";
  if (category === 7) return index === 1 ? "carta più alta del colore" : "carta successiva";
  if (category === 6) return index === 1 ? "lunghezza della serie" : index === 2 ? "valore massimo della serie" : "carta successiva";
  if (category === 5) return index === 1 ? "valore del tris" : "kicker";
  if (category === 4) return index === 1 ? "coppia più alta" : index === 2 ? "coppia più bassa" : "kicker";
  if (category === 3) return index === 1 ? "valore della coppia" : "kicker";
  return index === 1 ? "carta più alta" : `carta successiva (${index})`;
}

function explainHandComparison(player, bot, comparison) {
  if (!comparison) return "Spareggi identici: il piatto si divide.";
  const winner = comparison > 0 ? player : bot;
  const loser = comparison > 0 ? bot : player;
  const winnerName = comparison > 0 ? "Tu" : "CPU";
  if (player.score[0] !== bot.score[0]) {
    return `${winnerName}: ${winner.label.split(" · ")[0]} batte ${loser.label.split(" · ")[0]}.`;
  }
  const category = winner.score[0];
  for (let index = 1; index < Math.max(winner.score.length, loser.score.length); index++) {
    const winningValue = winner.score[index] ?? 0;
    const losingValue = loser.score[index] ?? 0;
    if (winningValue === losingValue) continue;
    const format = (value) => category === 6 && index === 1 ? String(value) : bits(value);
    return `${winnerName}: spareggio ${tieBreakLabel(category, index)} · ${format(winningValue)} > ${format(losingValue)}.`;
  }
  return "Spareggi identici: il piatto si divide.";
}

function estimateHandStrength(cards) {
  if (cards.length >= 5) {
    const [category, value = 0] = bestHand(cards).score;
    if (category === 10) return 0.995;
    if (category === 9) return 0.97;
    if (category === 8) return 0.93;
    if (category === 7) return 0.84;
    if (category === 6) return 0.62 + (value - 3) * 0.035 + (bestHand(cards).score[2] / 15) * 0.08;
    if (category === 5) return 0.53 + value / 15 * 0.12;
    if (category === 4) return 0.43 + value / 15 * 0.08;
    if (category === 3) return 0.3 + value / 15 * 0.12;
    return 0.18 + value / 15 * 0.12;
  }
  if (cards.length < 2) return 0.2;
  const [first, second] = cards.slice(0, 2).map((card) => card.value);
  const sharedBits = (first & second).toString(2).replace(/0/g, "").length;
  return Math.min(0.72, 0.2 + sharedBits * 0.07 + (first === second ? 0.18 : 0) + Math.max(first, second) / 15 * 0.05);
}

function botFoldsToRaise(amount) {
  if (state.botBluff && Math.random() < 0.65) return true;
  const strength = estimateHandStrength([...state.bot, ...state.board]);
  const potAfterCall = Math.max(1, state.pot + state.toCall + amount * 2);
  const potOdds = amount / potAfterCall;
  const callThreshold = 0.22 + potOdds * 0.42;
  if (strength >= callThreshold) return false;
  return Math.random() < Math.min(0.5, 0.08 + (callThreshold - strength) * 0.55);
}

function botRaiseAmount() {
  if (state.botRaised) return 0;
  const maxRaise = Math.min(state.botChips, state.playerChips);
  if (maxRaise < 1) return 0;
  const strength = estimateHandStrength([...state.bot, ...state.board]);
  if (state.botChips <= state.playerChips && strength >= 0.78 && Math.random() < 0.08) return state.botChips;
  const raiseChance = strength >= 0.82 ? 0.34 : strength >= 0.68 ? 0.24 : strength >= 0.52 ? 0.13 : 0.04;
  if (Math.random() >= raiseChance) return 0;
  return Math.min(maxRaise, Math.max(1, Math.min(5, Math.round(state.pot * 0.3))));
}

function newGame() {
  runoutToken++;
  state = { playerChips: 100, botChips: 100, handNumber: 0 };
  const availableTips = tips.map((_, index) => index).filter((index) => index !== lastTipIndex);
  lastTipIndex = availableTips[Math.floor(Math.random() * availableTips.length)];
  $("tip-text").textContent = tips[lastTipIndex];
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
    handNumber: state.handNumber + 1, result: "", resultDetail: "",
    outcome: "", dealAnimation: true, botBluff: false, botRaised: false,
    royalFlush: false, royalWinner: ""
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
  playSound("chips");
  render();
}

function startBetting() {
  state.phase = "bet";
  state.toCall = 0;
  state.botBluff = false;
  state.botRaised = false;
  const max = Math.min(5, state.botChips, state.playerChips);
  if (!max) return;
  const strength = estimateHandStrength([...state.bot, ...state.board]);
  const allInChance = strength >= 0.82 ? 0.08 : strength >= 0.68 ? 0.035 : 0.008;
  if (state.botChips <= state.playerChips && Math.random() < allInChance) {
    state.toCall = state.botChips;
    state.pot += state.toCall;
    state.botChips = 0;
    return;
  }
  const bluff = strength < 0.46 && Math.random() < 0.18;
  const betChance = strength >= 0.74 ? 0.7 : strength >= 0.5 ? 0.38 : 0.04;
  if (bluff || Math.random() < betChance) {
    state.toCall = max;
    state.botChips -= max;
    state.pot += max;
    state.botBluff = strength < 0.46;
  }
}

function runoutHoldem() {
  const token = ++runoutToken;
  state.phase = "runout";
  state.toCall = 0;
  render();

  const revealNext = () => {
    if (token !== runoutToken || state.phase !== "runout") return;
    if (state.board.length >= 5) {
      setTimeout(() => {
        if (token !== runoutToken || state.phase !== "runout") return;
        showdown();
        render();
      }, 750);
      return;
    }
    const count = state.board.length === 0 ? 3 : 1;
    for (let index = 0; index < count; index++) state.board.push(state.deck.pop());
    state.street = state.board.length === 3 ? 1 : state.board.length === 4 ? 2 : 3;
    state.dealAnimation = true;
    playSound("deal");
    render();
    if (state.board.length < 5) setTimeout(revealNext, 850);
    else {
      setTimeout(() => {
        if (token !== runoutToken || state.phase !== "runout") return;
        showdown();
        render();
      }, 850);
    }
  };

  setTimeout(revealNext, 450);
}

function advance(chipsAdded = false) {
  state.toCall = 0;
  let dealtCommunity = false;
  if (mode === "draw") {
    if (state.street === 0) {
      state.phase = "draw";
      state.street = 1;
    } else {
      showdown();
    }
  } else if (!state.playerChips || !state.botChips) {
    runoutHoldem();
    return;
  } else if (state.street < 3) {
    const count = state.street === 0 ? 3 : 1;
    state.dealAnimation = true;
    dealtCommunity = true;
    for (let i = 0; i < count; i++) state.board.push(state.deck.pop());
    state.street++;
    startBetting();
  } else {
    showdown();
  }
  if (state.phase !== "end") {
    if (state.toCall || chipsAdded) playSound("chips");
    else if (dealtCommunity) playSound("deal");
    else playSound("click");
  }
  render();
}

function showdown() {
  state.phase = "end";
  state.revealed = true;
  const player = bestHand([...state.player, ...state.board]);
  const bot = bestHand([...state.bot, ...state.board]);
  const comparison = compareScores(player.score, bot.score);
  state.royalFlush = player.score[0] === 10 || bot.score[0] === 10;
  state.royalWinner = comparison === 0 ? "tie" : comparison > 0 ? "player" : "bot";
  state.resultReason = explainHandComparison(player, bot, comparison);
  if (comparison > 0) {
    state.outcome = "win";
    state.playerChips += state.pot;
    state.result = player.score[0] === 10 ? "Scala reale! Hai vinto la mano ✨" : "Hai vinto la mano! ✨";
  } else if (comparison < 0) {
    state.outcome = "loss";
    state.botChips += state.pot;
    state.result = bot.score[0] === 10 ? "La CPU ha una Scala reale!" : "La CPU vince la mano.";
  } else {
    state.outcome = "tie";
    state.playerChips += Math.floor(state.pot / 2);
    state.botChips += Math.ceil(state.pot / 2);
    state.result = state.royalFlush ? "Doppia Scala reale! Piatto diviso." : "Pareggio! Piatto diviso.";
  }
  state.resultDetail = `Tu: ${player.label} · CPU: ${bot.label}${state.botBluff ? " · bluff CPU" : ""}`;
  state.pot = 0;
  if (!state.playerChips) {
    state.outcome = "busted";
    state.result = "Hai perso la partita.";
  } else if (!state.botChips) {
    state.outcome = "sweep";
    state.result = "Hai vinto la partita!";
  }
  playSound(state.outcome === "busted" ? "busted" : state.outcome === "sweep" ? "sweep" : comparison >= 0 ? "win" : "lose");
}

function robotFigure(value) {
  const createPart = (tag, className, text = "") => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  };
  const figure = createPart("div", `card-figure card-figure--${value}`);
  figure.setAttribute("aria-hidden", "true");
  const halo = createPart("span", "robot-halo");
  const antenna = createPart("span", "robot-antenna");
  const head = createPart("span", "robot-head");
  const visor = createPart("span", "robot-visor");
  visor.append(createPart("i", "robot-eye"), createPart("i", "robot-eye"));
  head.append(visor, createPart("span", "robot-mouth"));
  const body = createPart("span", "robot-body");
  body.append(createPart("i", "robot-emblem", bits(value).slice(-2)));
  figure.append(halo, antenna, head, body, createPart("span", "robot-caption", robotFigures.get(value)));
  return figure;
}

function cardElement(card, options = {}) {
  const element = document.createElement(options.selectable ? "button" : "div");
  if (options.selectable) element.type = "button";
  if (options.back) {
    element.className = `card back${options.deal ? " dealing" : ""}`;
    element.textContent = "✳";
    element.setAttribute("aria-label", "Carta coperta");
  } else if (!card) {
    element.className = "card empty";
    element.setAttribute("aria-label", "Carta comune non ancora scoperta");
  } else {
    element.className = `card ${card.suit.className}${options.selectable ? " selectable" : ""}${options.selected ? " selected" : ""}${options.deal ? " dealing" : ""}`;
    const figureLabel = robotFigures.has(card.value) ? `, figura robotica ${robotFigures.get(card.value)}` : "";
    element.setAttribute("aria-label", `${bits(card.value)}, ${card.suit.name}${figureLabel}${options.selectable ? ", seleziona per cambiare" : ""}`);
    if (options.selectable) element.setAttribute("aria-pressed", String(options.selected));
    const corner = (position) => {
      const wrapper = document.createElement("span");
      wrapper.className = `card-corner card-corner--${position}`;
      wrapper.setAttribute("aria-hidden", "true");
      const value = document.createElement("span");
      value.className = "card-value";
      value.textContent = bits(card.value);
      const suit = document.createElement("span");
      suit.className = "card-suit";
      suit.textContent = card.suit.symbol;
      wrapper.append(value, suit);
      return wrapper;
    };
    element.append(corner("top"), corner("bottom"));
    if (robotFigures.has(card.value)) {
      element.append(robotFigure(card.value));
    } else {
      const center = document.createElement("span");
      center.className = "card-center";
      const symbol = document.createElement("span");
      symbol.className = "card-symbol";
      symbol.textContent = card.suit.symbol;
      symbol.setAttribute("aria-hidden", "true");
      const pips = document.createElement("span");
      pips.className = "card-pips";
      for (let bit = 3; bit >= 0; bit--) {
        const pip = document.createElement("span");
        pip.className = `card-pip${card.value & (1 << bit) ? " card-pip--on" : ""}`;
        pip.textContent = card.suit.symbol;
        pips.append(pip);
      }
      center.append(symbol, pips);
      element.append(center);
    }
  }
  if (options.dealIndex !== undefined) element.style.setProperty("--card-index", options.dealIndex);
  if (options.deal) element.style.setProperty("--deal-index", options.dealIndex || 0);
  return element;
}

function updateDrawControls() {
  const selectedCount = state.selected.size;
  $("detail").textContent = `Seleziona fino a 3 carte · ${selectedCount}/3 selezionate. Puoi anche tenerle tutte.`;
  $("draw").firstChild.textContent = selectedCount
    ? `Cambia ${selectedCount} ${selectedCount === 1 ? "carta" : "carte"} `
    : "Tieni le carte ";
}

function setBetPreset(preset) {
  const maxRaise = Math.min(state.playerChips - state.toCall, state.botChips);
  if (maxRaise < 1) return;
  const amount = preset === "3x"
    ? Math.max(5, state.toCall) * 3
    : preset === "pot"
      ? state.pot + state.toCall
      : maxRaise;
  $("bet-amount").value = Math.min(maxRaise, Math.max(1, amount));
  $("bet-amount").focus();
  playSound("click");
}

function render() {
  const previousCounters = renderedCounters;
  $("hand-number").textContent = `#${String(state.handNumber).padStart(3, "0")}`;
  $("player-chips").textContent = state.playerChips;
  $("bot-chips").textContent = state.botChips;
  $("pot").textContent = state.pot;
  if (previousCounters) {
    if (state.pot !== previousCounters.pot) {
      animateCounter($("pot").closest(".pot"), state.pot > previousCounters.pot ? "pot-increase" : "pot-collect");
    }
    if (state.playerChips !== previousCounters.playerChips) {
      animateCounter($("player-chips"), state.playerChips > previousCounters.playerChips ? "chip-gain" : "chip-spend");
    }
    if (state.botChips !== previousCounters.botChips) {
      animateCounter($("bot-chips"), state.botChips > previousCounters.botChips ? "chip-gain" : "chip-spend");
    }
  }
  renderedCounters = { pot: state.pot, playerChips: state.playerChips, botChips: state.botChips };
  const visibleCards = [...state.player, ...state.board];
  const playerHand = mode === "draw"
    ? evaluateFive(state.player)
    : visibleCards.length >= 5
      ? bestHand(visibleCards)
      : null;
  $("hand-strength").textContent = playerHand?.label || `In costruzione · ${visibleCards.length}/5 carte`;
  const playerExplanation = describeHand(playerHand);
  $("player-point-tooltip").textContent = playerExplanation;
  $("player-point-help").title = playerExplanation;
  $("player-point-help").setAttribute("aria-label", `Spiega il tuo punto: ${playerExplanation}`);
  $("table").classList.toggle("table--win", state.outcome === "win");
  $("table").classList.toggle("table--loss", state.outcome === "loss");
  $("table").classList.toggle("table--tie", state.outcome === "tie");
  $("table").classList.toggle("table--holdem", mode === "holdem");
  $("table").classList.toggle("table--busted", state.phase === "end" && !state.playerChips);
  $("table").classList.toggle("table--sweep", state.phase === "end" && !state.botChips && state.playerChips > 0);
  const royalShowdown = state.phase === "end" && state.royalFlush;
  $("table").classList.toggle("table--royal-flush", royalShowdown);
  $("table").classList.toggle("table--royal-player", royalShowdown && state.royalWinner === "player");
  $("table").classList.toggle("table--royal-bot", royalShowdown && state.royalWinner === "bot");
  $("table").classList.toggle("table--royal-tie", royalShowdown && state.royalWinner === "tie");
  $("message").classList.toggle("result-busted", state.phase === "end" && !state.playerChips);
  $("message").classList.toggle("result-sweep", state.phase === "end" && !state.botChips && state.playerChips > 0);
  $("message").classList.toggle("royal-showdown", royalShowdown);
  const phases = mode === "draw" ? ["PRIMA PUNTATA", "SECONDA PUNTATA"] : ["PRE-FLOP", "FLOP", "TURN", "RIVER"];
  const runoutStage = state.board.length === 0 ? 0 : state.board.length === 3 ? 1 : state.board.length === 4 ? 2 : 3;
  $("phase-label").textContent = state.phase === "end"
    ? (state.revealed ? "SHOWDOWN" : "MANO CONCLUSA")
    : state.phase === "draw"
      ? "CAMBIO CARTE"
      : state.phase === "runout"
        ? `${phases[runoutStage]} · ALL-IN`
        : phases[state.street];
  $("bot-cards").replaceChildren(...state.bot.map((card, index) => cardElement(card, { back: !state.revealed, deal: state.dealAnimation, dealIndex: index })));
  $("bot-hand-indicator").hidden = !state.revealed;
  const botHand = state.revealed ? bestHand([...state.bot, ...state.board]) : null;
  if (botHand) $("bot-hand-strength").textContent = botHand.label;
  const botExplanation = describeHand(botHand);
  $("bot-point-tooltip").textContent = botExplanation;
  $("bot-point-help").title = botExplanation;
  $("bot-point-help").setAttribute("aria-label", `Spiega il punto della CPU: ${botExplanation}`);
  $("player-cards").replaceChildren(...state.player.map((card, index) => {
    const element = cardElement(card, { selectable: state.phase === "draw", selected: state.selected.has(index), deal: state.dealAnimation, dealIndex: index });
    if (state.phase === "draw") element.addEventListener("click", () => {
      if (state.selected.has(index)) state.selected.delete(index);
      else if (state.selected.size < 3) state.selected.add(index);
      const selected = state.selected.has(index);
      element.classList.toggle("selected", selected);
      element.setAttribute("aria-pressed", String(selected));
      playSound("click");
      updateDrawControls();
    });
    return element;
  }));
  $("community-wrap").hidden = mode !== "holdem";
  $("draw-hint").hidden = mode === "holdem";
  if (mode === "holdem") $("community-cards").replaceChildren(...Array.from({ length: 5 }, (_, i) => cardElement(state.board[i], { deal: state.dealAnimation && Boolean(state.board[i]), dealIndex: i })));
  state.dealAnimation = false;
  $("bet-actions").hidden = state.phase !== "bet";
  $("draw-actions").hidden = state.phase !== "draw";
  $("end-actions").hidden = state.phase !== "end";
  $("showdown-reason").hidden = state.phase !== "end" || !state.revealed;
  $("action-kicker").textContent = state.phase === "end" ? "RISULTATO" : "TOCCA A TE";
  if (state.phase === "bet") {
    $("message").textContent = state.toCall
      ? state.botChips === 0
        ? `La CPU va ALL-IN con ${state.toCall} fiches.`
        : `${state.botRaised ? "La CPU rilancia" : "La CPU punta"} ${state.toCall} fiches.`
      : "La CPU fa check.";
    $("detail").textContent = state.toCall ? "Vedi, rilancia o passa la mano." : "Fai check oppure punta per continuare.";
    $("call").textContent = state.toCall ? `Vedi ${state.toCall}` : "Check";
    $("raise").firstChild.textContent = state.toCall ? "Rilancia " : "Punta ";
    const maxRaise = Math.min(state.playerChips - state.toCall, state.botChips);
    $("bet-amount").max = Math.max(0, maxRaise);
    $("raise").disabled = maxRaise < 1;
    $("bet-amount").disabled = maxRaise < 1;
    $("bet-presets").querySelectorAll("button").forEach((button) => { button.disabled = maxRaise < 1; });
  } else if (state.phase === "draw") {
    $("message").textContent = "Vuoi cambiare carte?";
    updateDrawControls();
  } else if (state.phase === "runout") {
    $("message").textContent = [
      "Tutti all-in: si gira il flop.",
      "Flop scoperto: si gira il turn.",
      "Turn scoperto: si gira il river.",
      "River scoperto: showdown in arrivo."
    ][runoutStage];
    $("detail").textContent = "La mano prosegue automaticamente.";
  } else {
    $("message").textContent = state.result;
    $("detail").textContent = state.resultDetail;
    $("showdown-reason").textContent = state.resultReason || "";
    $("next").firstChild.textContent = !state.playerChips || !state.botChips ? "Nuova partita " : "Nuova mano ";
  }
}

$("call").addEventListener("click", () => {
  const chipsAdded = state.toCall > 0;
  state.playerChips -= state.toCall;
  state.pot += state.toCall;
  advance(chipsAdded);
});
$("raise").addEventListener("click", () => {
  const amount = Number($("bet-amount").value);
  const max = Math.min(state.playerChips - state.toCall, state.botChips);
  if (!Number.isInteger(amount) || amount < 1 || amount > max) {
    $("detail").textContent = `Inserisci un importo intero tra 1 e ${max} fiches.`;
    $("bet-amount").focus();
    return;
  }
  const botFolds = botFoldsToRaise(amount);
  const wasBluff = state.botBluff;
  state.playerChips -= state.toCall + amount;
  state.pot += state.toCall + amount;
  if (botFolds) {
    state.phase = "end";
    state.toCall = 0;
    state.outcome = "win";
    state.result = "La CPU lascia la mano! Hai vinto il piatto.";
    state.resultDetail = wasBluff ? "Il tuo rilancio ha fermato il bluff." : "La CPU non vede il tuo rilancio.";
    state.playerChips += state.pot;
    state.pot = 0;
    playSound("fold");
    render();
    return;
  }
  playSound("chips");
  state.botChips -= amount;
  state.pot += amount;
  const botRaise = botRaiseAmount();
  if (botRaise) {
    state.botChips -= botRaise;
    state.pot += botRaise;
    state.toCall = botRaise;
    state.botBluff = false;
    state.botRaised = true;
    render();
    return;
  }
  advance();
});
$("bet-presets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-bet-preset]");
  if (button) setBetPreset(button.dataset.betPreset);
});
$("fold").addEventListener("click", () => {
  state.botChips += state.pot;
  state.pot = 0;
  state.phase = "end";
  state.outcome = "loss";
  state.result = "Hai passato la mano.";
  state.resultDetail = "La CPU vince il piatto senza mostrare le carte.";
  playSound("lose");
  render();
});
$("draw").addEventListener("click", () => {
  state.selected.forEach((index) => { state.player[index] = state.deck.pop(); });
  const botCount = Math.floor(Math.random() * 4);
  for (let i = 0; i < botCount; i++) state.bot[i] = state.deck.pop();
  state.dealAnimation = true;
  state.selected.clear();
  if (!state.playerChips || !state.botChips) {
    showdown();
  } else {
    startBetting();
    playSound(state.toCall ? "chips" : "deal");
  }
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
  $("sound").querySelector("span").textContent = soundEnabled ? "Suono: on" : "Attiva suono";
  playSound(soundEnabled ? "enable" : "click");
});
function closePointTooltips() {
  document.querySelectorAll(".point-help").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    $(button.getAttribute("aria-controls")).hidden = true;
  });
}
document.querySelectorAll(".point-help").forEach((button) => button.addEventListener("click", () => {
  const tooltip = $(button.getAttribute("aria-controls"));
  const shouldOpen = button.getAttribute("aria-expanded") !== "true";
  closePointTooltips();
  button.setAttribute("aria-expanded", String(shouldOpen));
  tooltip.hidden = !shouldOpen;
  if (shouldOpen) tooltip.scrollIntoView({ block: "nearest" });
}));
document.addEventListener("pointerdown", (event) => {
  if (event.target instanceof Element && !event.target.closest(".hand-indicator")) closePointTooltips();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePointTooltips();
});
[$("rules-open"), $("rules-open-side")].forEach((button) => button.addEventListener("click", () => $("rules").showModal()));
$("rules-close").addEventListener("click", () => $("rules").close());

newGame();
