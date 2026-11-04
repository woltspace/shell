const CHUNK_MS = 5000;
const WAIT_SECONDS = 180;
// Tallest a card's preview gets, as a share of its width: 4:3, so about two cards fit on a phone screen.
const MEDIA_RATIO = 0.75;
const WAVE_BARS = 38;
const PULL_HEIGHT = 56;
const $ = (id) => document.getElementById(id);
const SVG = "http://www.w3.org/2000/svg";

// The lodge's pixel beaver.
// The lodge's creature sprites (woltspace public/static/sprites.js). Shell draws its keeper as one of these.
const SPRITES = {
  beaver: {
    map: [
      "..AAA........AAA.....",
      ".ABBBA......ABBBA....",
      ".ABAAAAAAAAAAAABA....",
      ".ABABBBBBBBBBAABA....",
      "..ABBBBBBBBBBBAA.....",
      "..ABABBBBAEBBBAA.....",
      "..ABABBBBAEBBBAA.....",
      ".ABBAAAABAEBBBBA.....",
      ".ABACAACCCFABBBA.....",
      ".ABACCACCCFABBBA.AAA.",
      ".ABBAAAAAAEBBBAAADDDA",
      "..ABBCAFABBBBAA.AADDA",
      "...ABAAAABBBBBBAADADA",
      "..ABBBBBBBBBBBBAADDAA",
      ".ABBABCCCAEBBBBBAADDA",
      ".ABBACCCABBBBABBADADA",
      ".AGGACCCAGGGGABBADADA",
      "..AAACCCAAAAABBBADDA.",
      "..ABCCCCCCFABBBBAAAA.",
      ".AAABCCCCAAAABBBAA...",
      "ABBBACCCABBBBBBAA....",
      "AAAAAAAAAAAAAAAA.....",
    ],
    colors: { A: "#3f190e", B: "#af6127", C: "#fce6b0", D: "#773c1f", E: "#050003", F: "#fffee7", G: "#dd7a2d" },
  },
  otter: {
    map: [
      ".....AAAAAAAA......",
      "..AAACCCCCCCCAAA...",
      ".ACCCCCCCCCCCCCCA..",
      ".ACACCCCCCCCCCACA..",
      "..ACCBACCCCBACCA...",
      "..ACCAACDDCAACCA...",
      "AAACBBBBAABBBBCAAA.",
      "..ABEBABAABABEBA...",
      ".AAABBBABBABBBAAA..",
      "...AABBBBBBBBAA....",
      "...ACCCCCCCCCCA....",
      "..ACCCCBBBBCCCCA...",
      "..ACCABBBBBBACCA...",
      "..ACCCABBBBACCCA...",
      "..AACCABBBBACCAA.AA",
      "..ACAABBBBBBAACAACA",
      ".ACCCBBBBBBBBCCCACA",
      ".ACAAABBBBBBAAACAA.",
      ".ACCCCABBBBACCCCA..",
      "..ACCCAAAAAACCCA...",
      "...AAA......AAA....",
    ],
    colors: { A: "#402110", B: "#f2d79d", C: "#9f5332", D: "#ff6970", E: "#c47b4a" },
  },
  raccoon: {
    map: [
      "...BB........BBB.........",
      "...BFGG.....GFFB.........",
      "...BABB.....BAAB.........",
      "...BCAABBBBBACCB.........",
      "...BAAAAAAAAAAAB.........",
      "...BCCCCAAACCCCB.........",
      "...BCBCCAAACCCCB.........",
      ".BBCCBBCBCCCBCBCB........",
      ".BBACBBCAAACBCCAB........",
      ".BBCAAADHHHDAAACB...BBB..",
      ".BBCAAADHHHDAAACB...BBB..",
      "...BCAADDDDDAEEB...BCCCB.",
      "....BCCCCEEECBB....BAAACB",
      "...BAAAAAAAAAAAB...BCCCBB",
      "...BAAAAAAAAAAAB...BCCCCB",
      ".BBAAAAAAAAAAAAAB..BAAAAB",
      ".BBAABBAAAAABAAAB..BCCCCB",
      ".BBAAAABAAABAAAABBBAACCCB",
      ".GGFAAABAAABAAAAGBBAABBCG",
      "BAABAAABAAABAAABABBCAAAB.",
      "BAAABBBBAAABBBBAABBCCBB..",
      "BCCAAAAAAAAAAAAACBBBB....",
      ".BBBBGGAAAAAGBBBB........",
      ".BBCCBBAAAAABCCCB........",
      "...BBBBBBBBBBBBB.........",
    ],
    colors: { A: "#7f8894", B: "#282c33", C: "#40454b", D: "#f0ecf0", E: "#545c65", F: "#a0abbd", G: "#050029", H: "#efa09f" },
  },
};

let state = { recordings: [], todos: [], chat: [], board: [], wolt_label: document.querySelector(".brand").textContent.trim(), telegram_url: "" };
let tab = "listen";
let drawn = {};
const expanded = new Set();
let boardNodes = new Map();
let session = null;
let clock = null;
let wakeLock = null;
let openRecordingId = "";
let recordingView = "notes";
let toastTimer = null;
let meter = null;

async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Is the lodge reachable?");
  return payload;
}

function showError(error) {
  $("error").textContent = error ? error.message : "";
  $("error").hidden = !error;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sprite() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "sprite");
  svg.setAttribute("viewBox", spriteBox());
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", "#sprite");
  svg.append(use);
  return svg;
}

function creature() {
  return SPRITES[document.documentElement.dataset.creature] || SPRITES.beaver;
}

// A square around the creature, whatever its size, so every sprite sits in the same spot.
function spriteBox() {
  const { map } = creature();
  const side = Math.max(map.length, ...map.map((row) => row.length));
  return `0 0 ${side} ${side}`;
}

function drawSprite() {
  const { map, colors } = creature();
  const symbol = $("sprite");
  symbol.setAttribute("viewBox", spriteBox());
  document.querySelectorAll("svg.sprite").forEach((svg) => svg.setAttribute("viewBox", spriteBox()));
  map.forEach((row, y) => [...row].forEach((cell, x) => {
    if (!colors[cell]) return;
    const pixel = document.createElementNS(SVG, "rect");
    pixel.setAttribute("x", x);
    pixel.setAttribute("y", y);
    pixel.setAttribute("width", 1.02);
    pixel.setAttribute("height", 1.02);
    pixel.setAttribute("fill", colors[cell]);
    symbol.append(pixel);
  }));
}

function actionButton(label, className, onClick) {
  const button = el("button", className, label);
  button.type = "button";
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    button.disabled = true;
    try {
      await onClick();
      showError(null);
    } catch (error) {
      showError(error);
    }
    button.disabled = false;
    await refresh().catch(showError);
  });
  return button;
}

function dueLabel(due) {
  return due ? new Date(`${due}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

function timeLabel(seconds) {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dayLabel(seconds) {
  const date = new Date(seconds * 1000);
  const days = Math.round((new Date().setHours(12, 0, 0, 0) - new Date(date).setHours(12, 0, 0, 0)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function small(...parts) {
  return el("small", "", parts.filter(Boolean).join(" · "));
}

function showToast(text) {
  const toast = $("toast");
  toast.replaceChildren(sprite(), el("span", "", text));
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

// Something is being built: that's all the screen needs to say.
const LORE = [
  "Gnawing on it…", "Hauling some logs…", "Patching the dam…", "Packing the mud…", "Stacking branches…",
  "Checking the blueprints…", "Sharpening teeth…", "Slapping the tail…", "Fetching more twigs…", "Smoothing it over…",
];
let live = { working: false };
let feedLength = 0;
let lore = 0;
let workTicks = 0;

function nextLore() {
  lore = (lore + 1) % LORE.length;
  for (const line of document.querySelectorAll(".steps")) {
    line.textContent = LORE[lore];
    line.classList.remove("new");
    void line.offsetWidth;
    line.classList.add("new");
  }
}

function stepsNode() {
  return el("div", "steps", LORE[lore]);
}

// While the wolt is visibly working, keep waiting past the usual limit, but an old unanswered message isn't what she's on.
function stillWaiting(since) {
  const age = Date.now() / 1000 - since;
  return age < WAIT_SECONDS || (live.working && age < 900);
}

function isWaiting(recording) {
  return recording.asked_at && !recording.answered_at && stillWaiting(recording.asked_at);
}

function statusText(recording) {
  const label = state.wolt_label;
  if (recording.status === "recording") return "Listening…";
  if (recording.status === "waiting" || recording.status === "transcribing") return "Turning this into text…";
  if (recording.status === "needs_setup") return "Saved. It will be transcribed once speech is set up.";
  if (recording.status === "failed") return "Couldn't transcribe this. The recording is safe.";
  if (!recording.text) return "No speech heard. Is the microphone on?";
  if (isWaiting(recording)) return `${label} is on it…`;
  return "";
}

function isBad(recording) {
  return recording.status === "failed" || (recording.status === "done" && !recording.text);
}

function telegramLink(onlyIf) {
  if (!onlyIf) return null;
  if (!state.telegram_url) return el("span", "go", `${state.wolt_label} messaged you on Telegram`);
  const link = el("a", "go", "Continue in Telegram");
  link.href = state.telegram_url;
  link.target = "_blank";
  link.rel = "noopener";
  link.addEventListener("click", (event) => event.stopPropagation());
  return link;
}

function icon(name) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `#${name}`);
  svg.append(use);
  return svg;
}

// Home reads like a short thread: what you said, then the wolt's answer joined to it.
function post(avatar, name, when, body, { linked = false, className = "" } = {}) {
  const row = el("div", `tw ${linked ? "linked" : ""} ${className}`);
  const rail = el("div", "rail");
  rail.append(avatar);
  const words = el("div", "tw-body");
  const head = el("div", "tw-head");
  head.append(el("b", "", name), el("time", "", when));
  words.append(head, ...body.filter(Boolean));
  row.append(rail, words);
  return row;
}

function clamped(text) {
  const more = el("button", "more", "Show more");
  more.type = "button";
  more.hidden = true;
  return [el("div", "text clamp", text), more];
}

function fromYou(text, voice, when, linked) {
  const avatar = el("div", "av");
  avatar.append(icon(voice ? "i-mic" : "i-chat"));
  return post(avatar, "You", when, clamped(text), { linked });
}

// Voice notes: one player. Replies that arrive while one plays wait their turn.
const speaker = new Audio();
const voiceQueue = [];
let waitingVoice = "";

function playVoice(url) {
  speaker.src = url;
  speaker.dataset.url = url;
  return speaker.play();
}

function playNext() {
  const url = voiceQueue.shift();
  if (url) playVoice(url).catch(() => block(url));
}

function block(url) {
  waitingVoice = url;
  paintVoiceButtons();
}

function paintVoiceButtons() {
  for (const note of document.querySelectorAll(".note-player")) {
    const current = speaker.dataset.url === note.dataset.url;
    note.classList.toggle("playing", current && !speaker.paused);
    note.classList.toggle("ready", waitingVoice === note.dataset.url);
    const done = current && speaker.duration ? speaker.currentTime / speaker.duration : 0;
    const bars = note.querySelectorAll("i");
    bars.forEach((bar, index) => bar.classList.toggle("past", index / bars.length < done));
  }
}

for (const event of ["play", "pause", "timeupdate"]) speaker.addEventListener(event, paintVoiceButtons);
speaker.addEventListener("ended", () => {
  speaker.dataset.url = "";
  paintVoiceButtons();
  playNext();
});

function notePlayer(url, seed) {
  const note = el("button", "note-player");
  note.type = "button";
  note.dataset.url = url;
  note.setAttribute("aria-label", "Play voice note");
  note.append(el("span", "note-icon"));
  const bars = el("span", "note-bars");
  for (let index = 0; index < 28; index += 1) {
    const bar = el("i");
    bar.style.height = `${25 + ((seed.charCodeAt(index % seed.length) * (index + 3)) % 75)}%`;
    bars.append(bar);
  }
  note.append(bars);
  note.addEventListener("click", (event) => {
    event.stopPropagation();
    waitingVoice = "";
    if (!speaker.paused && speaker.dataset.url === url) speaker.pause();
    else if (speaker.dataset.url === url) speaker.play().catch(() => {});
    else playVoice(url).catch(() => {});
  });
  return note;
}

function heardVoices() {
  try {
    return JSON.parse(sessionStorage.getItem("heard"));
  } catch (error) {
    return null;
  }
}

function sayNewVoices() {
  const voiced = state.chat.filter((message) => message.from === "wolt" && message.voice).map((message) => message.id);
  const heard = heardVoices();
  const fresh = heard ? voiced.filter((id) => !heard.includes(id)) : [];
  try {
    sessionStorage.setItem("heard", JSON.stringify(voiced));
  } catch (error) {
    return;
  }
  if (!fresh.length || session) return;
  voiceQueue.push(...fresh.map((id) => `/voice/${id}.mp3`));
  if (speaker.paused || speaker.ended) playNext();
}

// A browser that blocked it plays it on the next tap anywhere.
document.addEventListener("pointerdown", (event) => {
  if (!waitingVoice || event.target.closest(".note-player, #record")) return;
  const url = waitingVoice;
  waitingVoice = "";
  playVoice(url).catch(() => {});
});

function fromWolt(body, when, className = "") {
  return post(sprite(), state.wolt_label, when, body, { className });
}

// A short recording is someone talking to the wolt, so show what they said. A long one goes by its name.
function recordingHeading(recording) {
  if (!recording.text) return "Voice note";
  return recording.seconds > 0 && recording.seconds < 60 ? recording.text : recording.title;
}

function renderItem(recording, item) {
  const row = el("div", "row");
  const words = el("div", "words");
  words.append(el("div", "", item.text));
  if (item.person || item.due) words.append(small(item.person, dueLabel(item.due)));
  row.append(words);
  const base = `/api/recordings/${recording.id}/items/${item.id}`;
  if (item.todo_id) {
    row.append(el("span", "kept", "Added"));
  } else {
    row.append(
      actionButton("Add", "chip", () => api("POST", `${base}/add`)),
      actionButton("✕", "remove", () => api("DELETE", base)),
    );
  }
  return row;
}

function renderIdea(recording, idea) {
  const row = el("div", "row");
  row.append(el("div", "words", idea.text));
  const base = `/api/recordings/${recording.id}/ideas/${idea.id}`;
  row.append(
    actionButton("Try it", "chip", () => api("POST", `${base}/build`)),
    actionButton("✕", "remove", () => api("DELETE", base)),
  );
  return row;
}

function recordingNotes(recording) {
  const body = [];
  const status = statusText(recording);
  if (status) body.push(el("p", isBad(recording) ? "note bad" : "note", status));
  if (recording.interrupted) body.push(el("p", "note bad", "The phone stopped listening early. This is what was saved."));
  if (recording.reply) {
    body.push(el("p", "said", recording.reply));
    const link = telegramLink(recording.telegram);
    if (link) body.push(link);
  }
  if (recording.items.length) {
    body.push(el("h3", "", "For you"), ...recording.items.map((item) => renderItem(recording, item)));
  }
  if (recording.ideas.length) {
    body.push(el("h3", "", `${state.wolt_label} could build`), ...recording.ideas.map((idea) => renderIdea(recording, idea)));
  }
  if (recording.notes) body.push(el("h3", "", "Your notes"), el("p", "said", recording.notes));
  const actions = el("div", "actions");
  const waiting = status.endsWith("reading this…");
  if (recording.status === "done" && recording.text && !waiting && !recording.answered_at) {
    actions.append(actionButton(`Ask ${state.wolt_label}`, "chip", () => api("POST", `/api/recordings/${recording.id}/ask`)));
  }
  if (recording.status === "failed" || recording.status === "needs_setup") {
    actions.append(actionButton("Try again", "chip", () => api("POST", `/api/recordings/${recording.id}/retry`)));
  }
  if (actions.children.length) body.push(actions);
  return body;
}

function paintRecording(recording) {
  const page = el("div", "rec");
  const date = new Date(recording.created_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const minutes = recording.seconds >= 60 ? `${Math.round(recording.seconds / 60)} min` : "";
  page.append(el("h2", "", recording.title), el("p", "sub", [`${date}, ${timeLabel(recording.created_at)}`, minutes].filter(Boolean).join(" · ")));
  const seg = el("div", "seg");
  for (const [view, label] of [["notes", `${state.wolt_label}'s notes`], ["transcript", "Transcript"]]) {
    const button = el("button", view === recordingView ? "on" : "", label);
    button.type = "button";
    button.addEventListener("click", () => {
      recordingView = view;
      paintRecording(recording);
    });
    seg.append(button);
  }
  page.append(seg);
  if (recordingView === "notes") page.append(...recordingNotes(recording));
  else page.append(el("p", "said", recording.text || "No text yet."));
  if (recording.status !== "recording") {
    page.append(actionButton("Delete this recording", "danger", async () => {
      if (window.confirm("Delete this recording and its text?")) {
        await api("DELETE", `/api/recordings/${recording.id}`);
        closeOverlay();
      }
    }));
  }
  $("card-body").replaceChildren(page);
}

function renderTodo(todo) {
  const row = el("li", "todo");
  const box = el("input");
  box.type = "checkbox";
  box.checked = todo.done;
  box.setAttribute("aria-label", todo.done ? `Mark not done: ${todo.text}` : `Mark done: ${todo.text}`);
  box.addEventListener("change", async () => {
    try {
      await api("PATCH", `/api/todos/${todo.id}`, { done: box.checked });
      if (box.checked) showToast("Nice. One down.");
      showError(null);
    } catch (error) {
      showError(error);
    }
    await refresh().catch(showError);
  });
  const body = el("div", "body");
  const words = el("div", "words");
  words.append(el("div", "", todo.text));
  if (todo.person || todo.due || todo.source) {
    const today = new Date().toLocaleDateString("en-CA");
    const note = small(todo.due === today ? "Today" : dueLabel(todo.due), todo.person, todo.source);
    if (todo.due && todo.due <= today && !todo.done) note.className = "soon";
    words.append(note);
  }
  const remove = actionButton("✕", "remove", () => api("DELETE", `/api/todos/${todo.id}`));
  remove.setAttribute("aria-label", `Delete: ${todo.text}`);
  body.append(words, remove);
  row.append(box, body);
  return row;
}

function byDue(a, b) {
  return (a.due || "9999").localeCompare(b.due || "9999") || a.created_at - b.created_at;
}

// "Show more" only appears on text that really runs past the clamp, which takes the laid-out page to measure.
function syncMore(entry) {
  const open = entry.classList.contains("open");
  entry.classList.remove("open");
  for (const more of entry.querySelectorAll(".more")) {
    const text = more.previousElementSibling;
    more.hidden = text.scrollHeight <= text.clientHeight + 1;
    more.textContent = open ? "Show less" : "Show more";
  }
  entry.classList.toggle("open", open);
}

function bubble(side, body, when) {
  const row = el("li", `msg ${side}`);
  if (side === "them") row.append(sprite());
  const box = el("div", "bubble");
  box.append(...body.filter(Boolean));
  if (when) box.append(el("time", "", when));
  row.append(box);
  return row;
}

function recordingBubble(recording) {
  const open = recording.items.filter((item) => !item.todo_id).length + recording.ideas.length;
  const status = recording.status === "done" && recording.text ? "" : statusText(recording);
  const row = bubble("me", [
    recording.status === "recording" ? null : notePlayer(`/said/${recording.id}`, recording.id),
    recording.text ? el("div", "said words", recording.text) : el("div", "said quiet", status),
    open ? el("a", "go", `${open === 1 ? "One thing" : `${open} things`} to look at`) : null,
  ], timeLabel(recording.created_at));
  row.classList.toggle("bad", isBad(recording));
  row.addEventListener("click", () => openRecording(recording.id));
  return row;
}

function messageBubble(message) {
  if (message.from === "wolt") {
    return bubble("them", [
      message.voice ? notePlayer(`/voice/${message.id}.mp3`, message.id) : null,
      el("div", message.voice ? "said words" : "said", message.text),
      telegramLink(message.telegram),
    ], timeLabel(message.at));
  }
  return bubble("me", [el("div", "said", message.text)], timeLabel(message.at));
}

// A reply waits for its voice note, so both appear together. The limit is in case the server restarted partway.
function beingSpoken(message) {
  return message.speaking && Date.now() / 1000 - message.at < 120;
}

function timeline() {
  const recordings = state.recordings
    .filter((recording) => !session || recording.id !== session.id)
    .map((recording) => ({ at: recording.created_at, from: "owner", paint: () => recordingBubble(recording) }));
  const messages = state.chat.filter((message) => !beingSpoken(message)).map((message) => ({ at: message.at, from: message.from, paint: () => messageBubble(message) }));
  return [...recordings, ...messages].sort((a, b) => a.at - b.at);
}

function renderFeed() {
  const scroller = document.querySelector("main");
  const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  const items = timeline();
  const nodes = [];
  let day = "";
  for (const item of items) {
    const label = dayLabel(item.at);
    if (label !== day) nodes.push(el("li", "day", label));
    day = label;
    nodes.push(item.paint());
  }
  const last = items[items.length - 1];
  if (live.working || state.chat.some(beingSpoken) || (last && last.from === "owner" && Date.now() / 1000 - last.at < WAIT_SECONDS)) {
    const cooking = bubble("them", [stepsNode()]);
    cooking.classList.add("cooking");
    nodes.push(cooking);
  }
  $("feed").replaceChildren(...nodes);
  paintVoiceButtons();
  if (!items.length) {
    const label = state.wolt_label;
    const welcome = el("li", "empty welcome");
    welcome.append(sprite(), el("p", "", `What do you keep losing track of? Tap the mic and tell ${label}. This app will change while you watch.`));
    $("feed").append(welcome);
  }
  const grew = items.length !== feedLength;
  feedLength = items.length;
  if (tab === "listen" && (atBottom || grew)) scroller.scrollTop = scroller.scrollHeight;
}

function cardFrame(card, inFeed) {
  // The wolt writes these pages freely, so they run sandboxed: scripts work, but they can't touch the app or its data.
  const reporter = inFeed
    ? `<script>(function(){function s(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h)parent.postMessage({cardHeight:h},"*")}addEventListener("load",s);new ResizeObserver(s).observe(document.documentElement)})()<\/script>`
    : "";
  const frame = el("iframe");
  frame.title = card.title || "Card";
  frame.setAttribute("sandbox", "allow-scripts");
  if (inFeed) frame.setAttribute("scrolling", "no");
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{color-scheme:light dark}body{margin:0;font:16px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif}img,video,canvas,svg{max-width:100%}</style>${card.html}${reporter}`;
  return frame;
}

// Opened things sit on the browser's history, so the iPhone's edge swipe and a desktop Back button close them.
function showOverlay(title, backLabel) {
  $("card-title").textContent = title;
  $("card-back").textContent = `‹ ${backLabel}`;
  $("card-view").hidden = false;
  document.body.classList.add("reading");
  history.pushState({ overlay: true }, "");
}

function hideOverlay() {
  openRecordingId = "";
  $("card-view").hidden = true;
  $("card-body").replaceChildren();
  document.body.classList.remove("reading");
}

function closeOverlay() {
  if (history.state && history.state.overlay) history.back();
  else hideOverlay();
}

function openCard(card) {
  const body = [];
  if (card.image) body.push(Object.assign(el("img", "photo"), { src: card.image, alt: card.title }));
  if (card.text) body.push(el("p", "post-text", card.text));
  if (card.html) body.push(cardFrame(card, false));
  $("card-body").replaceChildren(...body);
  showOverlay(card.title, "Feed");
}

function openRecording(id) {
  const recording = state.recordings.find((candidate) => candidate.id === id);
  if (!recording) return;
  openRecordingId = id;
  recordingView = "notes";
  drawn.recording = "";
  paintRecording(recording);
  showOverlay("", "Home");
}

// The Feed is hero cards you scroll past: a live widget or picture, a title and a line or two.
// Widgets work in place and keep their own touches; tapping anything else on the card opens all of it.
function renderCard(card) {
  const post = el("li", "post");
  post.tabIndex = 0;
  post.setAttribute("role", "button");
  if (card.image) post.append(Object.assign(el("img", "photo"), { src: card.image, alt: card.title, loading: "lazy" }));
  if (card.html) {
    const holder = el("div", "frame");
    holder.append(cardFrame(card, true));
    post.append(holder);
  }
  const caption = el("div", "caption");
  if (card.title) caption.append(el("h2", "post-title", card.title));
  if (card.text) caption.append(el("p", "post-text clamp", card.text));
  const who = el("div", "who");
  who.append(sprite(), el("span", "", state.wolt_label), el("time", "", new Date(card.created_at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })));
  if (card.html) who.append(el("span", "go", "Open"));
  caption.append(who);
  post.append(caption);
  post.addEventListener("click", () => openCard(card));
  post.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openCard(card);
  });
  return post;
}

function renderBoard() {
  // Moving or rebuilding an iframe reloads it, so leave untouched cards in place and widgets keep their state.
  const label = state.wolt_label;
  const cards = [...state.board].sort((a, b) => b.created_at - a.created_at);
  $("board-empty").textContent = `Your feed is empty. Ask ${label} to make you something.`;
  $("board-empty").hidden = cards.length > 0;
  const next = new Map();
  for (const [id, entry] of boardNodes) {
    if (!cards.some((card) => card.id === id)) entry.node.remove();
  }
  cards.forEach((card, index) => {
    const key = JSON.stringify(card);
    let entry = boardNodes.get(card.id);
    if (!entry || entry.key !== key) {
      const node = renderCard(card);
      if (entry) entry.node.replaceWith(node);
      entry = { key, node };
    }
    next.set(card.id, entry);
    const list = $("board");
    if (list.children[index] !== entry.node) list.insertBefore(entry.node, list.children[index] || null);
  });
  boardNodes = next;
}

window.addEventListener("message", (event) => {
  const height = event.data && event.data.cardHeight;
  if (typeof height !== "number") return;
  for (const frame of document.querySelectorAll("#board iframe")) {
    if (frame.contentWindow === event.source) {
      frame.style.height = `${height}px`;
      frame.parentElement.classList.toggle("clipped", height > frame.clientWidth * MEDIA_RATIO);
      break;
    }
  }
});

function draw(name, value, paint) {
  // Rebuilding a list loses scroll, open transcripts and text selections, so only do it when something changed.
  const key = JSON.stringify(value);
  if (drawn[name] === key) return;
  drawn[name] = key;
  paint();
}

function render() {
  const open = state.todos.filter((todo) => !todo.done).sort(byDue);
  const done = state.todos.filter((todo) => todo.done);
  $("todo-count").textContent = open.length;
  $("todo-count").hidden = !open.length;
  const now = Math.floor(Date.now() / 1000 / 15);
  draw("feed", [state.recordings, state.chat, state.telegram_url, now], renderFeed);
  draw("todos", state.todos, () => {
    $("todos").replaceChildren(...open.map(renderTodo));
    if (!open.length) $("todos").append(el("p", "empty", `Nothing to do. Add one below, or tell ${state.wolt_label}.`));
    $("done").replaceChildren(...done.map(renderTodo));
    $("done-heading").hidden = !done.length;
  });
  draw("board", state.board, renderBoard);
  if (openRecordingId) {
    const recording = state.recordings.find((candidate) => candidate.id === openRecordingId);
    if (recording) draw("recording", [recording, state.telegram_url], () => paintRecording(recording));
  }
  syncComposer();
}

function paintWork(now) {
  if (now.working && live.working && ++workTicks % 3 === 0) nextLore();
  if (!now.working) workTicks = 0;
  const changed = now.working !== live.working;
  live = now;
  if (changed) renderFeed();
  document.querySelector('#tabs [data-tab="listen"]').classList.toggle("busy", now.working);
}

async function refresh() {
  const next = await api("GET", "/api/state");
  state = next;
  document.querySelector('#tabs [data-tab="board"]').hidden = !next.board.length;
  $("setup").textContent = next.speech_message;
  $("setup").hidden = next.speech_ready;
  sayNewVoices();
  if (String(window.getSelection())) return;
  render();
  paintVoiceButtons();
}

function syncComposer() {
  const input = $("write-text");
  const hasText = Boolean(input.value.trim());
  input.placeholder = tab === "todos" ? "Add a to-do" : "Or type";
  input.setAttribute("aria-label", input.placeholder);
  $("record-icon").firstElementChild.setAttribute("href", hasText ? "#i-send" : "#i-mic");
  $("record").setAttribute("aria-label", hasText ? "Send" : "Start listening");
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
  document.documentElement.style.setProperty("--dock", `${$("dock").offsetHeight}px`);
}

function showTab(name) {
  tab = name;
  for (const button of document.querySelectorAll("#tabs button")) button.classList.toggle("on", button.dataset.tab === name);
  for (const section of ["listen", "todos", "ask", "board"]) $(`tab-${section}`).hidden = section !== name;
  document.body.dataset.tab = name;
  document.querySelector("main").scrollTop = 0;
  syncComposer();
  if (name === "listen") document.querySelector("main").scrollTop = document.querySelector("main").scrollHeight;
}

async function holdScreen() {
  try {
    if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen");
  } catch (error) {
    wakeLock = null;
  }
  if (session) {
    $("record-hint").textContent = wakeLock
      ? `Talk to ${state.wolt_label}, or put the phone down. The screen will stay on.`
      : `Talk to ${state.wolt_label}, or put the phone down. Keep the screen on.`;
  }
}

function releaseScreen() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

function buildWave() {
  const bars = Array.from({ length: WAVE_BARS }, () => el("i"));
  bars.forEach((bar, index) => { bar.style.animationDelay = `${-(index * 0.13) % 1.4}s`; });
  $("wave").replaceChildren(...bars);
}

// The bars are only decoration. If the phone won't let us read the level, they pulse and the recording carries on.
function startMeter(stream) {
  const bars = [...$("wave").children];
  try {
    const AudioKind = window.AudioContext || window.webkitAudioContext;
    const context = new AudioKind();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    context.resume().catch(() => {});
    const samples = new Uint8Array(analyser.fftSize);
    const levels = new Array(WAVE_BARS).fill(0.06);
    meter = { context, frame: 0, last: 0 };
    const step = (now) => {
      meter.frame = requestAnimationFrame(step);
      if (now - meter.last < 70) return;
      meter.last = now;
      analyser.getByteTimeDomainData(samples);
      const peak = samples.reduce((most, sample) => Math.max(most, Math.abs(sample - 128)), 0) / 128;
      levels.push(Math.max(0.06, Math.min(1, peak * 2.4)));
      levels.shift();
      bars.forEach((bar, index) => { bar.style.transform = `scaleY(${levels[index]})`; });
    };
    meter.frame = requestAnimationFrame(step);
    $("wave").classList.remove("quiet");
  } catch (error) {
    meter = null;
    $("wave").classList.add("quiet");
  }
}

function stopMeter() {
  if (!meter) return;
  cancelAnimationFrame(meter.frame);
  meter.context.close().catch(() => {});
  meter = null;
}

function showIdle() {
  clearInterval(clock);
  clock = null;
  stopMeter();
  $("listening").hidden = true;
  $("notes").value = "";
}

// One upload loop per recording, in order. Pieces stay queued through a dropped connection.
async function pump(current) {
  if (current.pumping) return;
  current.pumping = true;
  while (current.pending.length) {
    const piece = current.pending[0];
    try {
      const response = await fetch(`/api/recordings/${current.id}/chunks?seq=${current.sent}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: piece,
      });
      if (response.status === 409 || response.status === 404) {
        current.lost = true;
        current.pending.length = 0;
        break;
      }
      if (!response.ok) throw new Error(`upload ${response.status}`);
      current.pending.shift();
      current.sent += 1;
      current.failures = 0;
    } catch (error) {
      current.failures += 1;
      if (current.failures === 3) showError(new Error("Connection lost. Still listening, and it will catch up when it's back."));
      await new Promise((done) => setTimeout(done, Math.min(1000 * current.failures, 5000)));
    }
  }
  current.pumping = false;
  if ($("error").textContent.startsWith("Connection lost")) showError(null);
}

async function finishSession(current) {
  while (current.pumping || current.pending.length) {
    pump(current);
    await new Promise((done) => setTimeout(done, 200));
  }
  if (current.lost) return;
  await api("POST", `/api/recordings/${current.id}/finish`, {
    seconds: Math.round((Date.now() - current.startedAt) / 1000),
    interrupted: current.interrupted,
    notes: $("notes").value,
  });
}

async function startListening() {
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    throw new Error("This browser can't record here.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const record = await api("POST", "/api/recordings", { type: recorder.mimeType || "audio/webm" });
  const current = {
    id: record.id, recorder, stream, startedAt: Date.now(), pending: [], sent: 0, failures: 0,
    pumping: false, lost: false, interrupted: false,
  };
  session = current;
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) {
      current.pending.push(event.data);
      pump(current);
    }
  });
  recorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((track) => track.stop());
    releaseScreen();
    session = null;
    drawn = {};
    try {
      await finishSession(current);
      showError(current.interrupted ? new Error("The phone stopped listening. What it heard is saved below.") : null);
    } catch (error) {
      showError(error);
    }
    showIdle();
    await refresh().catch(showError);
  });
  for (const track of stream.getAudioTracks()) {
    // The system took the mic: a phone call, or a lock on some iOS versions. Keep what's saved.
    track.addEventListener("ended", () => {
      if (recorder.state !== "inactive") {
        current.interrupted = true;
        recorder.stop();
      }
    });
  }
  recorder.addEventListener("error", () => {
    current.interrupted = true;
    if (recorder.state !== "inactive") recorder.stop();
  });
  recorder.start(CHUNK_MS);
  $("listening").hidden = false;
  $("record-hint").textContent = `Talk to ${state.wolt_label}, or put the phone down.`;
  startMeter(stream);
  const tick = () => {
    const seconds = Math.floor((Date.now() - current.startedAt) / 1000);
    $("clock").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  tick();
  clock = setInterval(tick, 500);
  await holdScreen();
}

async function sendComposer() {
  const input = $("write-text");
  const text = input.value.trim();
  if (!text) return;
  const button = $("record");
  button.disabled = true;
  try {
    if (tab === "todos") await api("POST", "/api/todos", { text });
    else await api("POST", "/api/chat", { text });
    // Only clear once it's really delivered: a message that failed stays in the box to send again.
    input.value = "";
    showError(null);
  } catch (error) {
    showError(error);
  }
  button.disabled = false;
  syncComposer();
  await refresh().catch(showError);
}

$("record").addEventListener("click", async () => {
  if ($("write-text").value.trim()) {
    await sendComposer();
    return;
  }
  if (session) return;
  try {
    await startListening();
    showError(null);
  } catch (error) {
    showError(error.name === "NotAllowedError" ? new Error(`${state.wolt_label} needs the microphone. Allow it in your browser's settings.`) : error);
  }
});

$("stop").addEventListener("click", () => {
  if (session && session.recorder.state !== "inactive") session.recorder.stop();
  $("stop").disabled = true;
  setTimeout(() => { $("stop").disabled = false; }, 800);
});

$("file").addEventListener("change", async () => {
  const file = $("file").files[0];
  if (!file) return;
  try {
    const record = await api("POST", "/api/recordings", { type: file.type, name: file.name });
    const response = await fetch(`/api/recordings/${record.id}/chunks?seq=0`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file,
    });
    if (!response.ok) throw new Error("Couldn't upload that file.");
    await api("POST", `/api/recordings/${record.id}/finish`, {});
    showError(null);
  } catch (error) {
    showError(error);
  }
  $("file").value = "";
  await refresh().catch(showError);
});

$("write").addEventListener("submit", (event) => {
  event.preventDefault();
  sendComposer();
});

$("write-text").addEventListener("input", syncComposer);
$("write-text").addEventListener("keydown", (event) => {
  // On a computer Enter sends and Shift+Enter makes a new line. On a phone the return key makes a new line.
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && window.matchMedia("(hover: hover)").matches) {
    event.preventDefault();
    sendComposer();
  }
});

// The page itself never scrolls: only the list does. The shell takes the space the keyboard leaves,
// and if iOS nudges the page while focusing a text box, it goes straight back.
function fitViewport() {
  const view = window.visualViewport;
  if (view && view.scale > 1.01) return;
  if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  const root = document.documentElement.style;
  root.setProperty("--vh", `${view ? view.height : window.innerHeight}px`);
  root.setProperty("--vt", `${view ? view.offsetTop : 0}px`);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", fitViewport);
  window.visualViewport.addEventListener("scroll", fitViewport);
}
window.addEventListener("resize", () => {
  fitViewport();
});
window.addEventListener("scroll", fitViewport);
$("write-text").addEventListener("focus", () => {
  document.body.classList.add("typing");
  fitViewport();
});
$("write-text").addEventListener("blur", () => {
  document.body.classList.remove("typing");
});

// Pull down at the top of a list to reload the app, which also picks up anything the wolt just changed in it.
function enablePull() {
  const main = document.querySelector("main");
  const pull = $("pull");
  let start = null;
  let distance = 0;
  const show = (height) => {
    pull.style.height = `${height}px`;
    pull.style.setProperty("--pull", Math.min(1, height / PULL_HEIGHT));
  };
  main.addEventListener("touchstart", (event) => {
    start = main.scrollTop <= 0 && event.touches.length === 1 ? event.touches[0].clientY : null;
    distance = 0;
  }, { passive: true });
  main.addEventListener("touchmove", (event) => {
    if (start === null) return;
    distance = event.touches[0].clientY - start;
    if (distance <= 0 || main.scrollTop > 0) {
      show(0);
      return;
    }
    event.preventDefault();
    show(Math.min(distance / 2, PULL_HEIGHT * 1.3));
  }, { passive: false });
  const release = () => {
    if (start === null) return;
    start = null;
    if (distance / 2 < PULL_HEIGHT) {
      show(0);
      return;
    }
    show(PULL_HEIGHT);
    pull.classList.add("go");
    try {
      sessionStorage.setItem("draft", $("write-text").value);
    } catch (error) {
      // Only the typed draft is lost if storage is blocked.
    }
    location.reload();
  };
  main.addEventListener("touchend", release);
  main.addEventListener("touchcancel", () => {
    start = null;
    show(0);
  });
  try {
    $("write-text").value = sessionStorage.getItem("draft") || "";
    sessionStorage.removeItem("draft");
  } catch (error) {
    // Nothing to restore.
  }
}

$("card-back").addEventListener("click", closeOverlay);
window.addEventListener("popstate", () => {
  if (!$("card-view").hidden) hideOverlay();
});

for (const button of document.querySelectorAll("#tabs button")) {
  button.addEventListener("click", () => showTab(button.dataset.tab));
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    if (session && !wakeLock) holdScreen();
    refresh().catch(showError);
  }
});

fitViewport();
drawSprite();
buildWave();
enablePull();
showTab("listen");
refresh().catch(showError);
setInterval(() => {
  if (!document.hidden) refresh().catch(showError);
}, 3000);
setInterval(() => {
  if (document.hidden) return;
  api("GET", "/api/activity").then(paintWork).catch(() => {});
  // While something's cooking, don't let a finished reply sit for a whole refresh.
  if (live.working || state.chat.some(beingSpoken)) refresh().catch(() => {});
}, 1000);
