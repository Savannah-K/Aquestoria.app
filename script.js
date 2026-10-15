(window.AQ_BUILD = window.AQ_BUILD || {}).script = "aq-5"; // version stamp: index.html checks that every file is from the same version
/* =====================================================================
   QUESTBOOK – all app logic. Sections:
   1. SHOP ITEMS (edit names/prices/emoji here)   4. QUEST ACTIONS
   2. STATE + localStorage                        5. SHOP ACTIONS
   3. HELPERS                                     6. RENDERING + EVENTS
   ===================================================================== */

/* ---------- 1. SHOP ITEMS ----------
   To add a character or theme: add one line. `art` is an emoji placeholder
   (swap for an image later). A theme `id` must match a body[data-theme="id"]
   block in style.css. */
const CHARACTERS = [
  { id: "cat", name: "Black Cat", art: "🐈", img: "", price: 150 },
  { id: "fox", name: "Forest Fox", art: "🦊", img: "", price: 250 },
  { id: "bunny", name: "Bunny Mage", art: "🐰", img: "", price: 300 },
  { id: "dragon", name: "Baby Dragon", art: "🐉", img: "", price: 500 },
];
const THEMES = [
  { id: "forest", name: "Enchanted Forest", art: "🌿", img: "", price: 200 },
  { id: "castle", name: "Moonlit Castle", art: "🌙", img: "", price: 350 },
  { id: "mushroom", name: "Mushroom Village", art: "🍄", img: "", price: 400 },
  { id: "library", name: "Magical Library", art: "📚", img: "", price: 500 },
];
/* ART HOOKS: give any character/theme an `img` (path to your drawing, e.g. "assets/characters/cat.png").
   While `img` is "", the emoji in `art` is shown. Nothing else needs to change. Theme BACKGROUND art is set in
   style.css (see the "--bg-art" note in the themes section). */
/* FREE color themes: always available, no purchase. Colors live in style.css (body[data-theme="..."] blocks);
   `swatch` is just the 4 preview dots in the Shop. Add one: new entry here + new block in style.css. */
const FREE_THEMES = [
  {
    id: "default",
    name: "Aquestoria Green",
    art: "🌲",
    img: "",
    free: true,
    swatch: ["#173325", "#e0bd62", "#f6ecd2", "#2f5d46"],
  },
  {
    id: "parchment",
    name: "Warm Parchment",
    art: "🌸",
    img: "",
    free: true,
    swatch: ["#FAFAF6", "#E08E79", "#A3B18A", "#2C3531"],
  },
  {
    id: "pastel",
    name: "Ethereal Pastels",
    art: "☁️",
    img: "",
    free: true,
    swatch: ["#F0F4F8", "#B39DDB", "#A5D6A7", "#37474F"],
  },
  {
    id: "goth",
    name: "Whimsy Goth (dark)",
    art: "🌙",
    img: "",
    free: true,
    swatch: ["#121016", "#80DEEA", "#FFB74D", "#F5F5F5"],
  },
];
const DEFAULT_MASCOT = { art: "🥚", img: "" }; // shown when no character is equipped (also used in empty states)
const artHTML = (item) => {
  item = item || DEFAULT_MASCOT;
  return item.img
    ? `<img class="art-img" src="${item.img}" alt="">`
    : `<span class="art-emoji">${item.art}</span>`;
};
const CURRENCY = "Gold";
// Saving to the browser can be blocked (private windows, some editor previews). That must never freeze the app.
let storageWorks = true,
  storageWarned = false;
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      storageWorks = false;
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      storageWorks = false;
    }
  },
};
let STORAGE_KEY = "questbook-v1"; // account.js switches this to a per-user key after login

/* ---------- 2. STATE + localStorage ----------
   Everything the user owns lives in ONE object, saved as JSON.
   Shape (easy to move to a database later):
   { gold, quests:[{id,name,course,due,reward,description,completed,rewardPaid,demo}],
     owned:{characters:[ids], themes:[ids]}, equipped:{character:id|null, theme:id|null} } */
let state; // filled in by loadState() at the very bottom, after all helpers exist

function defaultState() {
  const d = (n) => {
    const x = new Date();
    x.setDate(x.getDate() + n);
    return toISO(x);
  };
  const q = (id, name, course, due, reward, description) => ({
    id,
    name,
    course,
    due,
    reward,
    description,
    completed: false,
    rewardPaid: false,
    demo: true,
  });
  return {
    gold: 0,
    quests: [
      {
        ...q(
          "demo1",
          "Cost Analysis Worksheet",
          "Business 101",
          d(3),
          50,
          "Sample quest – delete me any time!",
        ),
        time: "14:00",
      },
      q(
        "demo2",
        "Chapter 4 Reading",
        "Business 101",
        d(7),
        30,
        "Sample quest.",
      ),
      q(
        "demo3",
        "Marketing Pitch Draft",
        "Marketing",
        d(-2),
        80,
        "Sample overdue quest.",
      ),
    ],
    notify: {
      enabled: false,
      morning: true,
      dayBefore: true,
      hourBefore: true,
    }, // due-date reminders (see notify.js)
    boardRange: "2w", // Quest Board window: "1w" | "2w" | "all"
    blocks: [], // time blocks planned in the Day view: {id,title,date,start,end}
    classes: ["Business 101", "Marketing"], // class names; quests store the class name in quest.course
    owned: { characters: [], themes: [] },
    equipped: { character: null, theme: null },
  };
}
// Fixes up a saved state object (older saves, cloud copies). Returns null if it doesn't look like a Aquestoria save.
function normalizeState(saved) {
  if (!saved || !Array.isArray(saved.quests)) return null;
  if (!Array.isArray(saved.blocks)) saved.blocks = [];
  if (!saved.boardRange) saved.boardRange = "2w";
  if (!saved.notify)
    saved.notify = {
      enabled: false,
      morning: true,
      dayBefore: true,
      hourBefore: true,
    };
  if (!Array.isArray(saved.classes))
    saved.classes = [...new Set(saved.quests.map((q) => q.course))]; // older saves
  return saved;
}
function loadState() {
  try {
    return normalizeState(JSON.parse(store.get(STORAGE_KEY))) || defaultState();
  } catch (e) {
    return defaultState();
  } // corrupted data: fresh start
}
// Make sure every quest's class exists in the class list (and uses its exact spelling).
function syncClasses() {
  state.quests.forEach((q) => {
    q.course = addClass(q.course);
  });
}
function saveState() {
  store.set(STORAGE_KEY, JSON.stringify(state));
  if (typeof window.onStateSaved === "function") window.onStateSaved(); // account.js uses this to save to the cloud
  if (!storageWorks && !storageWarned) {
    storageWarned = true;
    toast(
      "⚠️ This browser is blocking saving, so your changes will be lost when you refresh. Open Aquestoria in Chrome or Edge instead.",
    );
  }
}

/* ---------- 3. HELPERS ---------- */
const $ = (id) => document.getElementById(id);
const toISO = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => toISO(new Date());
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const prettyDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
// Quests imported from a syllabus/.ics whose due date was ALREADY past on the day they were imported are "archived":
// they stay on the calendar for reference, but never show in to-do lists, the Quest Board or the overdue count.
const isPastImport = (q) =>
  !!q.importedOn && q.due < q.importedOn && !q.completed;
const isTodo = (q) => !q.completed && !isPastImport(q);
const isOverdue = (q) => isTodo(q) && q.due < today();
const findQuest = (id) => state.quests.find((q) => q.id === id);
const byDue = (a, b) => a.due.localeCompare(b.due);
const findItem = (list, id) => list.find((i) => i.id === id);
// Returns the class name to use (re-uses an existing class, ignoring upper/lower case) and adds it if new.
function addClass(name) {
  name = (name || "").trim();
  if (!name) return "";
  const existing = state.classes.find(
    (c) => c.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing;
  state.classes.push(name);
  return name;
}
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ---------- 4. QUEST ACTIONS ---------- */
// Create a new quest, or update an existing one if the form has an id.
function saveQuestFromForm() {
  const id = $("q-id").value;
  const data = {
    name: $("q-name").value.trim(),
    course: addClass($("q-course").value),
    due: $("q-due").value,
    time: $("q-time").value,
    reward: Math.max(1, parseInt($("q-reward").value, 10) || 1),
    description: $("q-desc").value.trim(),
  };
  if (id) {
    Object.assign(findQuest(id), data); // edit: never touches completed/rewardPaid
  } else {
    state.quests.push({
      id: "q" + Date.now(),
      ...data,
      completed: false,
      rewardPaid: false,
      demo: false,
    });
  }
  saveState();
  renderAll();
}

// Complete a quest. GOLD IS ONLY PAID IF rewardPaid IS FALSE, and rewardPaid never
// goes back to false – so reopening/re-completing/editing can never pay twice.
function completeQuest(id) {
  const q = findQuest(id);
  if (!q || q.completed) return;
  q.completed = true;
  q.completedAt = today();
  if (!q.rewardPaid) {
    q.rewardPaid = true;
    state.gold += q.reward;
    toast(`✨ QUEST COMPLETE! 🪙 +${q.reward} ${CURRENCY}`);
  } else {
    toast("Quest completed again – reward was already collected.");
  }
  saveState();
  renderAll();
}
function reopenQuest(id) {
  findQuest(id).completed = false;
  saveState();
  renderAll();
}
function deleteQuest(id) {
  askConfirm("Delete this quest? (Gold you already earned is kept.)", () => {
    state.quests = state.quests.filter((q) => q.id !== id);
    saveState();
    renderAll();
  });
}
// A page-based "Are you sure?" box (the browser's confirm() is blocked in some embedded previews).
let confirmAction = null;
function askConfirm(message, onYes, opts = {}) {
  // opts.title / opts.yes customise the heading and the red button
  $("confirm-title").textContent = opts.title || "Are you sure?";
  $("confirm-yes").textContent = opts.yes || "Yes, do it";
  $("confirm-msg").textContent = message;
  confirmAction = onYes;
  $("confirm-dialog").showModal();
}
// ---- Time blocks (Day view): a title + date + start (+ optional end) ----
function openBlockForm(date, time) {
  $("b-title").value = "";
  $("b-date").value = date || today();
  $("b-start").value = time || "09:00";
  $("b-end").value = "";
  $("block-dialog").showModal();
}
function saveBlockFromForm() {
  const start = $("b-start").value,
    end = $("b-end").value;
  state.blocks.push({
    id: "b" + Date.now(),
    title: $("b-title").value.trim(),
    date: $("b-date").value,
    start,
    end: end > start ? end : "",
  });
  saveState();
  renderAll();
}
function openQuestForm(id, presetDue) {
  const q = id
    ? findQuest(id)
    : {
        name: "",
        course: "",
        due: presetDue || today(),
        reward: 50,
        description: "",
      };
  $("quest-form-title").textContent = id ? "Edit quest" : "New quest";
  $("q-id").value = id || "";
  $("q-name").value = q.name;
  setComboValue($("q-course"), q.course);
  $("q-due").value = q.due;
  $("q-time").value = q.time || "";
  $("q-reward").value = q.reward;
  $("q-desc").value = q.description;
  $("quest-dialog").showModal();
}

/* ---------- 5. SHOP ACTIONS ---------- */
// kind is "characters" or "themes". Buying checks: not owned yet AND enough gold.
function buyItem(kind, id) {
  const item = findItem(kind === "characters" ? CHARACTERS : THEMES, id);
  if (!item || state.owned[kind].includes(id)) return; // no double charging
  if (state.gold < item.price) {
    toast(`Not enough ${CURRENCY} yet.`);
    return;
  }
  state.gold -= item.price;
  state.owned[kind].push(id);
  saveState();
  renderAll();
  toast(`Purchased ${item.name}!`);
}
// Equip: only owned items can be equipped. Passing null un-equips (default look).
function equipItem(kind, id) {
  if (
    id &&
    !state.owned[kind].includes(id) &&
    !(kind === "themes" && FREE_THEMES.some((t) => t.id === id))
  )
    return; // free themes need no purchase
  state.equipped[kind === "characters" ? "character" : "theme"] = id;
  saveState();
  renderAll();
}

/* ---------- 6. RENDERING ---------- */
let currentView = "dashboard";
let calView = "today"; // "month" | "week" | "day"
let calDate = new Date(); // the date every calendar view is centered on

function questCard(q) {
  const cls = q.completed
    ? "done"
    : isOverdue(q)
      ? "overdue"
      : isPastImport(q)
        ? "archived"
        : "";
  return `<article class="card quest ${cls}">
    <div class="course">⚔️ ${esc(courseLabel(q))} ${q.demo ? '<span class="badge">sample</span>' : ""}</div>
    <h3>${esc(q.name)}</h3>
    <div>Due: ${prettyDate(q.due)}${q.time ? " · " + fmtTime(q.time) : ""} ${isOverdue(q) ? "⚠️ Overdue" : ""}</div>
    ${isPastImport(q) ? '<div class="past-note">Past date when imported · calendar only</div>' : ""}
    <div title="Complete this quest to earn Gold, then spend it in the Shop">Reward: 🪙 ${q.reward} ${CURRENCY}</div>
    ${q.description ? `<p>${esc(q.description)}</p>` : ""}
    <div class="row">
      ${
        q.completed
          ? `<button data-act="reopen" data-id="${q.id}">Reopen</button>`
          : `<button class="primary" data-act="complete" data-id="${q.id}">Complete Quest</button>`
      }
      <button data-act="edit" data-id="${q.id}">Edit</button>
      <button class="danger" data-act="delete" data-id="${q.id}">Delete</button>
    </div></article>`;
}
const cards = (list, empty) =>
  list.length
    ? `<div class="grid">${list.map(questCard).join("")}</div>`
    : empty;
const courseLabel = (q) => q.course || "No Class"; // quests whose class was deleted show "No Class"
const fmtTime = (t) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const fmtHour = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
const head = (title, sub) => `<h2>${title}</h2><p class="sub">${sub}</p>`;
// Friendly empty state: your equipped character (or an egg) + what to do next.
const emptyState = (title, text, buttons = "") =>
  `<div class="empty"><div class="big" aria-hidden="true">${artHTML(equippedChar())}</div><h3>${title}</h3><p>${text}</p>${buttons ? `<div class="row" style="justify-content:center">${buttons}</div>` : ""}</div>`;
const equippedChar = () => findItem(CHARACTERS, state.equipped.character);
const equippedTheme = () =>
  findItem([...FREE_THEMES, ...THEMES], state.equipped.theme);

function renderDashboard() {
  const t = today(),
    pending = state.quests.filter(isTodo);
  const overdue = pending.filter((q) => q.due < t).sort(byDue),
    dueToday = pending.filter((q) => q.due === t);
  const upcoming = pending
    .filter((q) => q.due > t)
    .sort(byDue)
    .slice(0, 3);
  const done = state.quests.filter((q) => q.completed),
    total = state.quests.filter((q) => !isPastImport(q)).length; // archived imports do not count
  const pct = total ? Math.round((done.length / total) * 100) : 0;
  const c = equippedChar();
  const addBtns = `<button class="primary" data-act="new">+ Add a quest</button><button data-view="import">Import a syllabus</button>`;
  $("view-dashboard").innerHTML = `
    <div class="hero-line"><div class="big" aria-hidden="true">${artHTML(c)}</div><div>
      <h2>${c ? c.name + " is cheering you on!" : "Welcome, adventurer!"}</h2>
      <p class="sub">Your day at a glance. Complete schoolwork → earn Gold → customize your world.</p></div></div>
    <div class="stats">
      <div class="card stat" title="Earn Gold by completing quests. Spend it in the Shop on characters and themes."><span>🪙 ${state.gold}</span>Gold<small>Earned by finishing quests</small><button class="mini" data-view="shop">Spend in Shop</button></div>
      <div class="card stat"><span>⚔️ ${dueToday.length}</span>Due today</div>
      <div class="card stat ${overdue.length ? "bad" : ""}"><span>⚠️ ${overdue.length}</span>Overdue</div>
      <div class="card stat"><span>✅ ${done.length}/${total}</span>Completed<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div></div>
    </div>
    <div class="section-head"><h2>Needs attention</h2></div>
    ${cards([...overdue, ...dueToday], emptyState("All clear!", "Nothing is overdue or due today. Plan ahead, or spend some Gold in the Shop.", addBtns))}
    <div class="section-head"><h2>Coming up</h2><button data-view="calendar">Open calendar</button></div>
    ${cards(upcoming, emptyState("No upcoming quests", "Add an assignment or import a syllabus to fill your quest board.", addBtns))}
    <div class="section-head"><h2>Recently completed</h2></div>
    ${cards(done.slice(-3).reverse(), emptyState("No victories yet", "Complete a quest to earn your first Gold!"))}`;
}
function renderBoard() {
  // The board only shows upcoming quests inside the chosen window so overdue and completed ones stay easy to see.
  const days = { "1w": 7, "2w": 14, all: Infinity }[state.boardRange] || 14;
  const lim =
      days === Infinity ? "9999-12-31" : toISO(addDays(new Date(), days - 1)),
    since =
      days === Infinity ? "0000-00-00" : toISO(addDays(new Date(), -days));
  const todo = state.quests.filter(isTodo);
  const active = todo.filter((q) => !isOverdue(q) && q.due <= lim).sort(byDue);
  const later = todo.filter((q) => !isOverdue(q) && q.due > lim).length;
  const overdue = state.quests.filter(isOverdue).sort(byDue);
  const doneAll = state.quests.filter((q) => q.completed);
  const done = doneAll
    .filter((q) => (q.completedAt || q.due) >= since)
    .sort((a, b) =>
      (b.completedAt || b.due).localeCompare(a.completedAt || a.due),
    );
  const addBtns = `<button class="primary" data-act="new">+ Add a quest</button><button data-view="import">Import a syllabus</button>`;
  const range = [
    ["1w", "Next 7 days"],
    ["2w", "Next 14 days"],
    ["all", "All"],
  ]
    .map(
      ([v, l]) =>
        `<button type="button" data-act="board-range" data-id="${v}" aria-pressed="${state.boardRange === v}">${l}</button>`,
    )
    .join("");
  const note = (n, what) =>
    n
      ? `<p class="board-note">${n} ${what} hidden by the range above.</p>`
      : "";
  $("view-board").innerHTML = `
    <div class="section-head"><div><h2>Quest Board</h2><p class="sub">Every assignment as a quest card.</p></div><button class="primary" data-act="new">+ New quest</button></div>
    <div class="board-range"><span>Showing quests due:</span><div class="seg" role="group" aria-label="Quest board range">${range}</div></div>
    <h2>⚔️ Active quests</h2>${cards(active, emptyState("The board is quiet…", later ? `Nothing due in this window. ${later} later quest${later > 1 ? "s are" : " is"} hidden: try "All".` : "No active quests. Add an assignment or import a syllabus to begin your adventure.", addBtns))}${active.length ? note(later, "later quest" + (later > 1 ? "s" : "")) : ""}
    <h2>⚠️ Overdue quests</h2>${cards(overdue, emptyState("No overdue quests", "The dragon sleeps. Keep it that way!"))}
    <h2>📜 Completed quests</h2>${cards(done, emptyState("No completed quests yet", "Finish a quest to earn Gold for the Shop."))}${done.length ? note(doneAll.length - done.length, "older completed quest" + (doneAll.length - done.length > 1 ? "s" : "")) : ""}`;
}
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const weekStart = (d) => addDays(d, -d.getDay()); // weeks start on Sunday
const byTime = (a, b) => (a.time || "99").localeCompare(b.time || "99");
const chipHTML = (q, tall) =>
  `<button class="chip ${q.completed ? "done" : isOverdue(q) ? "overdue" : isPastImport(q) ? "archived" : ""}" data-act="detail" data-id="${q.id}" title="${esc(courseLabel(q))}: ${esc(q.name)}">${tall && q.time ? fmtTime(q.time) + " " : ""}${esc(q.name)}${tall ? `<small> · ${esc(courseLabel(q))}</small>` : ""}</button>`;
// One day box used by the month and week views. The date number opens that day's Day view.
function dayCell(date, tall) {
  const iso = toISO(date);
  const chips = state.quests
    .filter((q) => q.due === iso)
    .sort(byTime)
    .map((q) => chipHTML(q, tall))
    .join("");
  return `<div class="day ${tall ? "tall" : ""} ${iso === today() ? "today" : ""}"><button class="daynum" data-act="goday" data-date="${iso}" aria-label="Open day view for ${iso}">${tall ? DAY_NAMES[date.getDay()] + " " : ""}${date.getDate()}</button>${chips}</div>`;
}
// TODAY: a quick "what do I need to worry about right now?" overview. Plain lists, no scheduling.
function renderToday() {
  const iso = today(),
    pending = state.quests.filter(isTodo);
  const dueToday = pending.filter((q) => q.due === iso).sort(byTime),
    overdue = pending.filter((q) => q.due < iso).sort(byDue);
  const upcoming = pending
    .filter((q) => q.due > iso)
    .sort(byDue)
    .slice(0, 3);
  const timed = [
    ...state.blocks
      .filter((b) => b.date === iso)
      .map((b) => ({
        t: b.start,
        html: `🕒 <b>${fmtTime(b.start)}</b> ${esc(b.title)}`,
      })),
    ...state.quests
      .filter((q) => q.due === iso && q.time)
      .map((q) => ({
        t: q.time,
        html: `⚔️ <b>${fmtTime(q.time)}</b> ${esc(q.name)} <small>due</small>`,
      })),
  ].sort((a, b) => a.t.localeCompare(b.t));
  const todo = (
    q,
  ) => `<div class="todo ${isOverdue(q) ? "overdue" : ""}"><button class="check" data-act="complete" data-id="${q.id}" aria-label="Complete ${esc(q.name)}" title="Complete quest (+${q.reward} Gold)">✔</button>
    <div><b>${esc(q.name)}</b><br><small>${esc(courseLabel(q))} · ${isOverdue(q) ? "was due " + prettyDate(q.due) : q.time ? "due " + fmtTime(q.time) : "due today"} · 🪙 ${q.reward}</small></div></div>`;
  const needs = [...overdue, ...dueToday];
  return `<div class="section-head"><h2>Today</h2><span>${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div>
    <div><span class="pill">⚔️ ${dueToday.length} due today</span><span class="pill ${overdue.length ? "bad" : ""}">⚠️ ${overdue.length} overdue</span><span class="pill">🕒 ${timed.length} timed</span></div>
    ${needs.length ? `<div class="card"><h3>Needs doing</h3>${needs.map(todo).join("")}</div>` : emptyState("Nothing due or overdue", "A quiet day, adventurer. Get ahead on a quest or plan your hours.")}
    ${timed.length ? `<div class="card"><h3>Today's timed items</h3>${timed.map((x) => `<div class="agenda-line">${x.html}</div>`).join("")}</div>` : ""}
    <div class="row"><button class="primary" data-act="goday" data-date="${iso}">Plan today in Day view →</button></div>
    ${upcoming.length ? `<div class="card"><h3>Coming up</h3>${upcoming.map((q) => `<div class="agenda-line"><b>${esc(q.name)}</b> <small>${esc(courseLabel(q))} · ${prettyDate(q.due)}</small></div>`).join("")}</div>` : ""}`;
}

// DAY: a planner for ONE date. Like Google Calendar, items sit on an hour grid and stretch over their duration.
//  - Your time blocks run start → end (no end = 1 hour). Quests with a due time are 30-minute markers at that time.
//  - Quests without a time go in "All Day". Click any empty hour to add a time block there.
//  - Items that overlap in time are placed side by side.
const HOUR_H = 56; // pixel height of one hour on the grid (change for a taller/shorter timeline)
const toMin = (t) =>
  parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3, 5), 10);
function layoutOverlaps(evs) {
  // gives each item a column (col) and the number of columns in its overlap group (cols)
  evs.sort((a, b) => a.start - b.start || b.end - a.end);
  let group = [],
    groupEnd = 0;
  const finish = () => {
    const ends = [];
    group.forEach((e) => {
      let c = ends.findIndex((end) => end <= e.start);
      if (c < 0) {
        c = ends.length;
        ends.push(0);
      }
      ends[c] = e.end;
      e.col = c;
    });
    group.forEach((e) => (e.cols = ends.length));
  };
  evs.forEach((e) => {
    if (group.length && e.start >= groupEnd) {
      finish();
      group = [];
      groupEnd = 0;
    }
    group.push(e);
    groupEnd = Math.max(groupEnd, e.end);
  });
  if (group.length) finish();
}
function renderTimeline(iso) {
  const quests = state.quests.filter((q) => q.due === iso);
  const allDay = quests.filter((q) => !q.time);
  const evs = [
    ...state.blocks
      .filter((b) => b.date === iso)
      .map((b) => ({
        kind: "block",
        b,
        start: toMin(b.start),
        end: b.end ? toMin(b.end) : toMin(b.start) + 60,
      })),
    ...quests
      .filter((q) => q.time)
      .map((q) => ({
        kind: "quest",
        q,
        start: toMin(q.time),
        end: toMin(q.time) + 30,
      })),
  ];
  const from = Math.min(8, ...evs.map((e) => Math.floor(e.start / 60))),
    to = Math.min(24, Math.max(18, ...evs.map((e) => Math.ceil(e.end / 60))));
  layoutOverlaps(evs);
  const px = (min) => ((min - from * 60) / 60) * HOUR_H;
  let grid = "";
  for (let h = from; h < to; h++) {
    grid += `<button class="tl-hour" style="top:${px(h * 60)}px;height:${HOUR_H}px" data-act="new-block" data-date="${iso}" data-time="${String(h).padStart(2, "0")}:00" aria-label="Add a time block at ${fmtHour(h)}"></button>
      <div class="tl-label" style="top:${px(h * 60)}px">${fmtHour(h)}</div>`;
  }
  evs.forEach((e) => {
    const end = Math.min(e.end, to * 60),
      pos = `top:${px(e.start)}px;height:${Math.max(26, px(end) - px(e.start) - 2)}px;left:${(e.col / e.cols) * 100}%;width:calc(${100 / e.cols}% - 4px)`;
    if (e.kind === "quest") {
      const q = e.q;
      grid += `<button class="tl-ev quest ${q.completed ? "done" : isOverdue(q) ? "overdue" : isPastImport(q) ? "archived" : ""}" style="${pos}" data-act="detail" data-id="${q.id}"><b>⚔️ ${esc(q.name)}</b><br><small>Due ${fmtTime(q.time)} · ${esc(courseLabel(q))}</small></button>`;
    } else {
      const b = e.b;
      grid += `<div class="tl-ev block" style="${pos}"><b>🕒 ${esc(b.title)}</b><br><small>${fmtTime(b.start)}${b.end ? " – " + fmtTime(b.end) : ""}</small><button class="mini" data-act="block-del" data-id="${b.id}" aria-label="Delete ${esc(b.title)}">✕</button></div>`;
    }
  });
  if (iso === today()) {
    // red "now" line on today's timeline
    const now = new Date(),
      nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin >= from * 60 && nowMin < to * 60)
      grid += `<div class="tl-now" style="top:${px(nowMin)}px"></div>`;
  }
  const allDayHTML = allDay.length
    ? allDay
        .map(
          (q) =>
            `<button class="allday-item ${q.completed ? "done" : isOverdue(q) ? "overdue" : isPastImport(q) ? "archived" : ""}" data-act="detail" data-id="${q.id}">⚔️ <b>${esc(q.name)}</b> <small>· ${esc(courseLabel(q))} — ${iso === today() ? "due today" : "due"}</small></button>`,
        )
        .join("")
    : "<small>Nothing all-day.</small>";
  return `<div class="card tl-wrap">
    <div class="tl-legend"><span>⚔️ <span class="swatch quest"></span> Quest due</span><span>🕒 <span class="swatch block"></span> Your time block</span><small>Click an empty hour to add a block.</small></div>
    <div class="tl-allday"><div class="hl">ALL DAY</div><div class="items">${allDayHTML}</div></div>
    <div class="tl" style="height:${(to - from) * HOUR_H}px">${grid}</div></div>`;
}

function renderCalendar() {
  const short = { month: "short", day: "numeric" },
    y = calDate.getFullYear(),
    m = calDate.getMonth(),
    iso = toISO(calDate);
  let nav = "",
    body = "";
  if (calView === "today") body = renderToday();
  else if (calView === "day") {
    nav = `<div class="section-head"><button data-act="prev" aria-label="Previous day">◀ Prev</button>
      <label class="daypick">Date <input type="date" id="day-pick" value="${iso}"></label><button data-act="next" aria-label="Next day">Next ▶</button></div>
      <h2 class="cal-title">${calDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
      <div class="row"><button class="primary" data-act="new" data-date="${iso}">+ Add quest</button><button data-act="new-block" data-date="${iso}" data-time="09:00">+ Add time block</button></div>`;
    body = renderTimeline(iso);
  } else {
    let title;
    if (calView === "week") {
      const start = weekStart(calDate);
      body =
        '<div class="cal week">' +
        Array.from({ length: 7 }, (_, i) =>
          dayCell(addDays(start, i), true),
        ).join("") +
        "</div>";
      title = `${start.toLocaleDateString(undefined, short)} – ${addDays(start, 6).toLocaleDateString(undefined, { ...short, year: "numeric" })}`;
    } else {
      const first = new Date(y, m, 1).getDay(),
        days = new Date(y, m + 1, 0).getDate();
      body =
        '<div class="cal">' +
        DAY_NAMES.map((d) => `<div class="dow">${d}</div>`).join("") +
        '<div class="day blank"></div>'.repeat(first);
      for (let d = 1; d <= days; d++) body += dayCell(new Date(y, m, d), false);
      body += "</div>";
      title = calDate.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    }
    nav = `<div class="section-head"><button data-act="prev" aria-label="Previous">◀ Prev</button><h2>${title}</h2><button data-act="next" aria-label="Next">Next ▶</button></div>`;
  }
  const labels = { today: "Today", day: "Day", week: "Week", month: "Month" };
  const tabs =
    Object.keys(labels)
      .map(
        (v) =>
          `<button class="${calView === v ? "primary" : ""}" data-act="calview" data-id="${v}" aria-pressed="${calView === v}">${labels[v]}</button>`,
      )
      .join("") +
    `<button class="danger" data-act="clear-calendar" style="margin-left:auto">Clear Calendar</button>`;
  $("view-calendar").innerHTML =
    head(
      "Calendar",
      "Your deadlines and plans: today, one day in detail, the week, or the month.",
    ) +
    `<div class="row" style="margin:0 0 .6rem">${tabs}</div>` +
    nav +
    body;
}
// Move the calendar one month / week / day depending on the current view.
function stepCalendar(dir) {
  calDate =
    calView === "month"
      ? new Date(calDate.getFullYear(), calDate.getMonth() + dir, 1)
      : addDays(calDate, dir * (calView === "week" ? 7 : 1));
  renderCalendar();
}
function shopCard(kind, item) {
  const owned = item.free || state.owned[kind].includes(item.id);
  const cur = state.equipped[kind === "characters" ? "character" : "theme"];
  const equipped = cur === item.id || (item.id === "default" && !cur);
  let button;
  if (equipped && item.free) button = `<button disabled>Equipped ✓</button>`;
  else if (equipped)
    button = `<button data-act="unequip" data-kind="${kind}">Equipped ✓ (remove)</button>`;
  else if (owned)
    button = `<button class="primary" data-act="equip" data-kind="${kind}" data-id="${item.id}">Equip</button>`;
  else
    button = `<button class="primary" data-act="buy" data-kind="${kind}" data-id="${item.id}" ${state.gold < item.price ? "disabled" : ""}>Buy – 🪙 ${item.price}</button>`;
  const dots = item.swatch
    ? `<div class="dots" aria-hidden="true">${item.swatch.map((c) => `<i style="background:${c}"></i>`).join("")}</div>`
    : "";
  return `<div class="card item"><div class="art">${artHTML(item)}</div><h3>${item.name}</h3>${dots}
    <div>${item.free ? "Free" : owned ? "Owned" : `🪙 ${item.price} ${CURRENCY}${state.gold < item.price ? " (can't afford yet)" : ""}`}</div>
    <div class="row">${button}</div></div>`;
}
function renderShop() {
  $("view-shop").innerHTML =
    head(
      "Shop",
      "Quests earn Gold. Spend it here on cute characters and calendar themes. They are cosmetic only.",
    ) +
    `<h2>Characters</h2><div class="grid">${CHARACTERS.map((i) => shopCard("characters", i)).join("")}</div>
    <h2>Free color themes</h2><p>Always free. Pick the look you like best.</p><div class="grid">${FREE_THEMES.map((i) => shopCard("themes", i)).join("")}</div>
    <h2>Calendar themes</h2><div class="grid">${THEMES.map((i) => shopCard("themes", i)).join("")}</div>`;
}
function renderProfile() {
  const list = (items, kind) =>
    state.owned[kind]
      .map((id) => {
        const i = findItem(items, id);
        return `${artHTML(i)} ${i.name}`;
      })
      .join(", ") || "None yet";
  const c = equippedChar(),
    t = equippedTheme();
  $("view-profile").innerHTML =
    head("Collection", "Your customization and everything you own.") +
    `<div class="card"><h3>Your collection</h3>
    <p>🪙 ${state.gold} ${CURRENCY}</p>
    <p>Quests completed: ${state.quests.filter((q) => q.completed).length}</p>
    <p>Equipped character: ${c ? artHTML(c) + " " + c.name : "None"}</p>
    <p>Equipped theme: ${t ? artHTML(t) + " " + t.name : "Aquestoria Green (default)"}</p>
    <p>Owned characters: ${list(CHARACTERS, "characters")}</p>
    <p>Owned themes: ${list(THEMES, "themes")}</p>
    <button class="danger" data-act="reset">Reset all progress</button></div>`;
}
function renderAll() {
  $("gold").textContent = state.gold;
  document.body.dataset.theme = state.equipped.theme || "default";
  renderDashboard();
  renderBoard();
  renderCalendar();
  renderShop();
  renderProfile();
  renderClasses();
  showView(currentView);
}
function showView(name) {
  currentView = name;
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === name));
}

/* ---------- 7. IMPORT (.ics calendar files + syllabus PDF/text) ----------
   Both importers only PRODUCE CANDIDATES (importRows). Nothing becomes a quest until
   the user reviews the list and clicks "Add selected quests". */
let importRows = []; // {include, name, course, due, reward, description}
const MONTH_NAMES = "jan feb mar apr may jun jul aug sep oct nov dec".split(
  " ",
);
// Bigger assignments get bigger default rewards (user can change in the review list).
function guessReward(title) {
  if (/exam|midterm|final/i.test(title)) return 150;
  if (/project|paper|essay|presentation|report/i.test(title)) return 100;
  if (/quiz|test/i.test(title)) return 75;
  return 50;
}

// .ics files are plain text: each event sits between BEGIN:VEVENT and END:VEVENT.
function parseICS(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, ""); // .ics wraps long lines; join them back
  const rows = [];
  unfolded
    .split("BEGIN:VEVENT")
    .slice(1)
    .forEach((block) => {
      const get = (key) => {
        const m = block.match(
          new RegExp("^" + key + "[^:\\r\\n]*:(.*)$", "mi"),
        );
        return m ? m[1].trim() : "";
      };
      const clean = (s) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
      const m = get("DTSTART").match(
        /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/,
      );
      if (!m) return;
      let due = `${m[1]}-${m[2]}-${m[3]}`,
        time = "";
      const pad = (n) => String(n).padStart(2, "0");
      if (m[7] === "Z") {
        // UTC time → your local day and time
        const local = new Date(
          Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]),
        );
        due = toISO(local);
        time = `${pad(local.getHours())}:${pad(local.getMinutes())}`;
      } else if (m[4] !== undefined) time = `${m[4]}:${m[5]}`;
      if (time === "00:00") time = ""; // midnight = "no specific time"
      const name =
        clean(get("SUMMARY"))
          .replace(/\s*[-–]?\s*due( date)?\s*$/i, "")
          .slice(0, 80) || "Untitled";
      rows.push({
        include: true,
        name,
        course: clean(get("CATEGORIES")),
        due,
        time,
        reward: guessReward(name),
        description: clean(get("DESCRIPTION")).slice(0, 200),
      });
    });
  return rows;
}

/* ---------- SYLLABUS PARSER (high precision) ----------
   A DATE IS NEVER AN ASSIGNMENT. Each line is split into cells (table columns), dates are pulled out separately, and every
   remaining piece of text must show its OWN evidence of being student work (see evidence()) before it becomes a candidate.
   Dates, headings like "Assignments", a short title or a syllabus section never count as evidence on their own.
   When unclear the text is ignored: a missed assignment is cheaper than a fake one. Candidates without a clear due date
   are kept (so "Read Chapter 5" isn't lost) but start un-ticked and flagged "needs date". */
const MONTH_RE =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_G = new RegExp(
  `\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–—]\\s*(?:${MONTH_RE}\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s+(\\d{4}))?|(?<![\\d/])(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?(?:\\s*[-–—]\\s*(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?)?(?![\\d/])`,
  "gi",
);
const DAY_RE =
  /\b(?:mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)\b\.?/gi;
const WEEK_RE = /\bweek\s*(?:of\b|#?\d+)/gi;
const REJECT_RE =
  /\b(no class|class (?:is )?cancel+ed|holiday|labor day|memorial day|thanksgiving|fall break|spring break|winter break|(?:reading|study|finals?|dead|exam) (?:week|day|period)|office hours|professor meeting|class meeting|course (?:overview|introduction)|syllabus (?:review|day)|welcome|orientation|guest (?:lecture|speaker)|catch[- ]?up|tb[ad]|n\/a|review (?:session|day|for)|(?:exam|test|quiz|midterm|final) review|no (?:school|lecture|meeting))\b/i;
const STRONG_RE =
  /\b(quiz(?:zes)?|exam|midterm|final (?:exam|project|paper|presentation|report|essay|draft|portfolio)|homework|hw|assignment|worksheet|problem sets?|pset|draft|proposal|bibliography|study guide|portfolio|lab report|discussion (?:post|board|response|question|forum)|deliverable|submission)\b/i;
const AMBIG_RE =
  /\b(project|paper|essay|presentation|report|lab|test|speech|practical|reflection|journal|case study|summary|memo|outline|final)\b/i; // also course topics ("Project Management"), so they need extra support
const READING_RE =
  /\bread(?:ing)?s?\b[^.]*\b(?:ch(?:apters?|\.)?\s*\d|pages?\s*\d|pp\.?\s*\d|sections?\b)|\bch(?:apters?|\.)?\s*\d+[^.]*\b(?:reading|read)\b/i;
const ACTION_RE = /\b(submit|turn in|hand in|upload|complete)\b/i;
const DUE_RE = /\b(due|deadline)\b/i;
const GENERIC_RE =
  /^(?:homework|assignments?|quizzes|quiz|exams?|tests?|projects?|papers?|essays?|reports?|labs?|readings?|presentations?|final|midterm|discussion|review|lecture|overview|introduction|chapter|notes|work)$/i;
const PROSE_RE =
  /\b(will|must|should|may|can|cannot|are|is|be|been|policy|policies|grading|graded|grade|grades|worth|points?|percent|late|attendance|expected?|please|students?|you|your|the|of|to|and|for|in|that|this|which|with|on)\b|%/i;
const HEADER_RE =
  /^(date|dates|week|day|topic|topics|lecture|lectures|subject|content|contents|reading|readings|assignment|assignments|due|due date|homework|notes|activity|activities|deliverables?|class|session|module|unit|chapter|assessment|assessments|graded work)$/i;
const EMPTY_CELL_RE = /^(?:[-–—_.\s]*|none|n\/?a|tba|tbd)$/i;
const DAY_IDX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const guessYear = (month, day) => {
  // no year written: pick the school year that makes the date reasonable
  const now = new Date(),
    y = now.getFullYear();
  return new Date(y, month, day) < new Date(now - 180 * 864e5) ? y + 1 : y;
};
// Finds every date in a piece of text. Ranges ("Oct 5–9") are flagged because they usually mark a week, not a due date.
function findDates(line) {
  const out = [];
  DATE_G.lastIndex = 0;
  let m;
  while ((m = DATE_G.exec(line))) {
    let text = m[0],
      month,
      day,
      year,
      endMonth,
      endDay;
    if (m[1]) {
      month = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
      day = +m[2];
      year = m[5];
      endMonth = m[3]
        ? MONTH_NAMES.indexOf(m[3].slice(0, 3).toLowerCase())
        : month;
      endDay = m[4] ? +m[4] : null;
    } else {
      month = +m[6] - 1;
      day = +m[7];
      year = m[8];
      endMonth = m[9] ? +m[9] - 1 : month;
      endDay = m[10] ? +m[10] : null;
    }
    if (month < 0 || month > 11 || day < 1 || day > 31) continue;
    let range = false;
    if (endDay !== null) {
      if (endMonth > month || (endMonth === month && endDay > day))
        range = true;
      else {
        text = text.replace(/\s*[-–—]\s*.*$/, "");
        endDay = null;
      }
    }
    const y = year
      ? +year < 100
        ? 2000 + +year
        : +year
      : guessYear(month, day);
    out.push({
      index: m.index,
      end: m.index + text.length,
      iso: toISO(new Date(y, month, day)),
      range,
      endISO: range ? toISO(new Date(y, endMonth, endDay)) : null,
    });
  }
  return out;
}
// Removes dates, weekdays, "Week 3"/"Week of", times and "due" words so only the possible assignment name is left.
function cleanName(line, dates) {
  let s = line;
  [...dates]
    .sort((a, b) => b.index - a.index)
    .forEach((d) => {
      s = s.slice(0, d.index) + " " + s.slice(d.end);
    });
  s = s
    .replace(DAY_RE, " ")
    .replace(WEEK_RE, " ")
    .replace(/\bdays?\s+\d+\s*[-–—]\s*\d+/gi, " ")
    .replace(
      /\b\d{1,2}(?::\d{2})?\s*(?:[-–—]\s*\d{1,2}(?::\d{2})?\s*)?(?:a\.?m\.?|p\.?m\.?)(?=\W|$)/gi,
      " ",
    )
    .replace(/\b(?:due(?:\s+date)?|deadline)\b[:\s]*/gi, " ")
    .replace(/\b(?:on|by|at|before)\b(?=[\s\-–—:,.)]*$)/gi, " ");
  s = s
    .replace(/^[\s\-–—:|,.;()•*]+/, "")
    .replace(/^(?:\d+[.)]\s+)/, "")
    .replace(/^(?:submit|turn in|hand in|upload|complete)\s+(?=\S)/i, "");
  s = s
    .replace(/[\s\-–—:|,.;(]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/* Is this text student work? 0 = no evidence (ignore), 1 = possible (start un-ticked), 2 = clear (start ticked).
   raw = the cell text before cleaning (still has "Submit", "Due"...), name = cleaned title. */
function evidence(raw, name, hasDate, assignCol) {
  const t = name.toLowerCase(),
    words = t.split(/\s+/).length;
  if (
    t.length < 3 ||
    !/[a-z]/.test(t) ||
    EMPTY_CELL_RE.test(t) ||
    REJECT_RE.test(t) ||
    REJECT_RE.test(raw)
  )
    return 0; // topics/holidays/admin
  if (words > 12) return 0; // a sentence, not a title
  const startsWithVerb =
    /^[^a-z]*(read|complete|submit|turn in|hand in|upload)\b/i.test(raw);
  if ((words > 6 || !hasDate) && !startsWithVerb && PROSE_RE.test(t)) return 0; // policy / explanation text
  if (
    GENERIC_RE.test(t) &&
    !(hasDate && /^(quiz|exam|midterm|final|test)$/.test(t))
  )
    return 0; // bare "Homework", "Lecture"...
  const verb = ACTION_RE.test(raw),
    due = DUE_RE.test(raw);
  if (STRONG_RE.test(t)) return 2; // Quiz 1, Problem Set 3, Research Paper Draft...
  if (AMBIG_RE.test(t) && (/\d/.test(t) || due || verb || assignCol)) return 2; // "Project 2" yes, "Project Management" no
  if (READING_RE.test(t)) return 1; // Read Chapter 5 (never pre-ticked)
  if (verb && words >= 2) return 1;
  if (due && hasDate) return 1; // explicit "due" + date, unusual name
  if (assignCol) return 1; // inside a table's "Assignment" column
  return 0; // a date, a day, a topic: NOT an assignment
}
const splitCells = (line) =>
  line
    .split(/\t| {2,}|\s\|\s|^\|\s*|\s*\|$/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean);
function dueFromWeekday(line, weekCtx) {
  // "Due Friday" + an earlier "Week of Oct 5" -> that week's Friday
  const m = line.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i);
  if (!m || !weekCtx) return "";
  const base = new Date(weekCtx + "T00:00:00");
  return toISO(
    addDays(base, (DAY_IDX[m[1].toLowerCase()] - base.getDay() + 7) % 7),
  );
}
function parseSyllabus(text) {
  const rows = text
    .split(/\r?\n/)
    .map(splitCells)
    .filter((c) => c.length);
  const found = new Map(),
    used = new Set();
  let cols = null,
    weekCtx = "";
  const add = (name, due, tier) => {
    if (due) found.delete(name.toLowerCase() + "|"); // a dated version replaces an earlier undated one
    found.set(name.toLowerCase() + "|" + due, {
      include: tier === 2 && !!due,
      unsure: tier < 2 || !due,
      name: name.slice(0, 80),
      course: "",
      due,
      reward: guessReward(name),
      description: "",
    });
  };
  rows.forEach((cells, i) => {
    if (used.has(i)) return;
    const line = cells.join(" ");
    if (
      cells.length >= 2 &&
      cells.every((c) => HEADER_RE.test(c.replace(/:/g, "")))
    ) {
      // table header row: remember which column is which
      cols = cells.map((c) =>
        /^due( date)?$|date|week|day/i.test(c)
          ? "date"
          : /assign|homework|deliverable|assessment|graded/i.test(c)
            ? "assign"
            : "topic",
      );
      return;
    }
    const colTypes = cols && cells.length === cols.length ? cols : null;
    const cellDates = cells.map(findDates),
      rowDates = cellDates.flat();
    const ranged = rowDates.some((d) => d.range),
      hasDue = DUE_RE.test(line),
      weekRow = new RegExp(WEEK_RE.source, "i").test(line);
    if (rowDates.length && (ranged || weekRow)) weekCtx = rowDates[0].iso; // remember this week for a later "due Friday"
    if (ranged && !hasDue && !ACTION_RE.test(line)) return; // "Oct 5–9" alone is a week marker
    let due = "",
      pick = rowDates[0];
    if (pick) {
      cells.forEach((c, k) => {
        const at = c.search(DUE_RE);
        if (at >= 0) {
          const after = cellDates[k].find((d) => d.index > at);
          if (after) pick = after;
        }
      });
      due = pick.range ? pick.endISO : pick.iso;
    } else if (hasDue) due = dueFromWeekday(line, weekCtx);
    let any = false;
    cells.forEach((cell, k) => {
      // every cell must prove itself
      const type = colTypes ? colTypes[k] : null;
      if (type === "topic" || type === "date") return; // topic / date columns are never assignments
      const name = cleanName(cell, cellDates[k]),
        tier = evidence(cell, name, !!due, type === "assign");
      const hasAction =
        ACTION_RE.test(cell) ||
        DUE_RE.test(cell) ||
        /^[^a-z]*read/i.test(cell) ||
        type === "assign";
      if (tier && (due || hasAction)) {
        add(name, due, tier);
        any = true;
      } // no date AND no action word (e.g. a grading-table row) = ignore
    });
    if (
      !any &&
      rowDates.length === 1 &&
      !ranged &&
      !weekRow &&
      cells.every((c, k) => cleanName(c, cellDates[k]).length < 3)
    ) {
      for (const j of hasDue ? [i - 1, i + 1] : [i + 1, i - 1]) {
        // a date on its own line: the title may be the neighbouring line
        if (j < 0 || j >= rows.length || used.has(j) || rows[j].length > 2)
          continue;
        const nline = rows[j].join(" ");
        if (findDates(nline).length || nline.length > 90) continue;
        const nm = cleanName(nline, []),
          tier = evidence(nline + (hasDue ? " " + line : ""), nm, true, false);
        if (tier === 2 || (tier === 1 && hasDue)) {
          add(nm, due, tier);
          used.add(j);
          break;
        }
      }
    }
  });
  return [...found.values()]
    .sort((a, b) => (a.due || "9").localeCompare(b.due || "9"))
    .slice(0, 60);
}

// Read a PDF and rebuild its rows: text on the same line is joined, and a wide horizontal gap becomes " | "
// (a table column break) so "9/21 | Research Methods | Quiz 1" is not flattened into one sentence.
async function readPDF(file) {
  if (!window.pdfjsLib)
    throw new Error(
      "PDF reader didn't load (are you online?). Paste the syllabus text instead.",
    );
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() })
    .promise;
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const items = content.items
      .filter((it) => it.str.trim() !== "")
      .map((it) => ({
        s: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        h: it.height || 10,
      }));
    items.sort((a, b) => b.y - a.y || a.x - b.x); // top of page first
    const lines = [];
    items.forEach((it) => {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= Math.max(2, it.h * 0.4))
        last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    });
    lines.forEach((ln) => {
      ln.items.sort((a, b) => a.x - b.x);
      let text = "",
        prevEnd = null;
      ln.items.forEach((it) => {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          text += gap > Math.max(14, it.h * 1.5) ? " | " : gap > 1 ? " " : "";
        }
        text += it.s;
        prevEnd = it.x + it.w;
      });
      out += text + "\n";
    });
    out += "\n";
  }
  return out;
}

function startImport(kind, text) {
  const cls = $("imp-class").dataset.committed || "";
  if (kind === "syllabus" && !cls) {
    toast("Choose or add a class first.");
    return;
  } // a syllabus always belongs to one class
  importRows = (kind === "ics" ? parseICS(text) : parseSyllabus(text))
    .map((r) => ({ ...r, course: r.course || cls }))
    .map((r) =>
      r.due && r.due < today() ? { ...r, include: false, past: true } : r,
    ); // dates before today start un-ticked
  renderImportReview();
  $("import-review").scrollIntoView({ behavior: "smooth" });
}
async function importFile(e, kind) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    startImport(
      kind,
      file.name.toLowerCase().endsWith(".pdf")
        ? await readPDF(file)
        : await file.text(),
    );
  } catch (err) {
    toast(err.message);
  }
  e.target.value = ""; // lets the same file be chosen again
}
const importBar = () => `<div class="row import-bar">
  <button data-act="imp-all">Accept all</button><button data-act="imp-none">Reject all</button>
  <span class="imp-count" aria-live="polite"></span>
  <button class="primary" data-act="import-add">Add accepted to calendar</button></div>`;
function updateImportCount() {
  const n = importRows.filter((r) => r.include).length;
  document
    .querySelectorAll(".imp-count")
    .forEach(
      (el) => (el.textContent = `${n} of ${importRows.length} accepted`),
    );
  document
    .querySelectorAll('[data-act="import-add"]')
    .forEach((b) => (b.disabled = n === 0));
}
function renderImportReview() {
  const box = $("import-review");
  if (!importRows.length) {
    box.innerHTML = emptyState(
      "No likely assignments found",
      "Aquestoria only picks out dates that sit next to real work (quizzes, papers, due dates…). Try the pasted-text box, or add quests by hand.",
    );
    return;
  }
  box.innerHTML = `<h2>Review ${importRows.length} possible assignment${importRows.length > 1 ? "s" : ""}</h2>
    <p>Accept the real ones, reject the rest, and fix names, classes, dates or rewards. Nothing is added until you click the button. Items marked "check" are less certain.</p>
    ${importBar()}
    ${importRows
      .map(
        (
          r,
          i,
        ) => `<div class="card import-card ${r.include ? "accepted" : "rejected"}">
      <div class="ic-top"><input class="ic-name" data-i="${i}" data-f="name" value="${esc(r.name)}" aria-label="Assignment name">
        ${!r.due ? '<span class="badge" title="No due date found, add one to accept">needs date</span>' : r.unsure ? '<span class="badge" title="Lower confidence, double-check this one">check</span>' : ""}
        <div class="seg" role="group" aria-label="Accept or reject ${esc(r.name)}">
          <button type="button" data-act="imp-set" data-i="${i}" data-v="0" aria-pressed="${!r.include}">Reject</button>
          <button type="button" data-act="imp-set" data-i="${i}" data-v="1" aria-pressed="${r.include}">Accept</button></div></div>
      <div class="ic-fields">
        <div class="fld"><span>Class</span>${comboHTML("imp-row-" + i, r.course, `data-ci="${i}" aria-label="Class"`)}</div>
        <label class="fld"><span>Due</span><input data-i="${i}" data-f="due" type="date" value="${r.due}"></label>
        <label class="fld"><span>Reward</span><input data-i="${i}" data-f="reward" type="number" min="1" value="${r.reward}" aria-label="Reward in Gold"></label>
      </div>${r.past ? '<small class="past-note">This date is before today. If you accept it, it goes on the calendar only (not on your to-do lists, and not counted as overdue).</small>' : ""}</div>`,
      )
      .join("")}
    ${importBar()}`;
  updateImportCount();
}
// ---- Classes: the list of class names used by the import screen and the quest form ----
// The syllabus upload stays locked until a class is chosen.
function renderClasses() {
  updateImportLock();
}
function updateImportLock() {
  const ok = !!$("imp-class").dataset.committed;
  ["imp-syl", "imp-text", "imp-find"].forEach((id) => ($(id).disabled = !ok));
  $("imp-hint").textContent = ok
    ? ""
    : "Choose or add a class first, then you can upload its syllabus.";
}

/* ---------- CLASS COMBOBOX: ONE control to search, pick, add and edit a class ----------
   Used for the quest form, the import page and every row of the import review. Markup comes from comboHTML().
   Click it to see your classes, type to filter, choose "+ Add ..." to create one, click ✎ to rename the selected class. */
const comboHTML = (id, value = "", attrs = "") =>
  `<div class="combo"><input id="${id}" class="combo-input" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" placeholder="Type or select a class…" value="${esc(value)}" data-committed="${esc(value)}" ${attrs}><button type="button" class="combo-edit" data-act="combo-edit" aria-label="Edit this class" title="Edit this class" ${value ? "" : "disabled"}>✎</button><ul class="combo-list" role="listbox" hidden></ul></div>`;
const mountCombos = () =>
  document.querySelectorAll("[data-combo-mount]").forEach((m) => {
    m.outerHTML = comboHTML(m.dataset.comboMount, "", m.dataset.attrs || "");
  });
function setComboValue(input, value) {
  // set the field quietly (no change event)
  input.value = value;
  input.dataset.committed = value;
  input.placeholder = "Type or select a class…";
  input.closest(".combo").querySelector(".combo-edit").disabled = !value;
}
function openCombo(input, filter) {
  const list = input.closest(".combo").querySelector(".combo-list"),
    q = (filter || "").trim().toLowerCase();
  const items = state.classes
    .filter((c) => !q || c.toLowerCase().includes(q))
    .map((c) => ({ label: c, value: c }));
  if (q && !state.classes.some((c) => c.toLowerCase() === q))
    items.push({
      label: `+ Add "${filter.trim()}" as a new class`,
      value: filter.trim(),
      add: true,
    });
  if (!q) items.push({ label: "+ Add new class", value: "", add: true });
  list.innerHTML = items
    .map(
      (it, k) =>
        `<li role="option" class="${it.add ? "add" : ""}${k === 0 ? " active" : ""}" data-value="${esc(it.value)}" data-add="${it.add ? 1 : 0}">${esc(it.label)}</li>`,
    )
    .join("");
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
}
function closeCombo(input) {
  input.closest(".combo").querySelector(".combo-list").hidden = true;
  input.setAttribute("aria-expanded", "false");
}
function commitCombo(input, value) {
  // choose a class: update the field, close the list, tell the page
  setComboValue(input, value);
  closeCombo(input);
  input.dispatchEvent(
    new CustomEvent("combo-change", {
      bubbles: true,
      detail: { input, value },
    }),
  );
}
function pickComboItem(li) {
  const input = li.closest(".combo").querySelector(".combo-input");
  if (li.dataset.add === "1") {
    if (!li.dataset.value) {
      input.value = "";
      input.placeholder = "Type the new class name…";
      input.focus();
      openCombo(input, "");
      return;
    }
    const name = addClass(li.dataset.value);
    saveState();
    commitCombo(input, name);
    toast(`Class "${name}" added.`);
    return;
  }
  commitCombo(input, li.dataset.value);
}
// ✎ opens a small dialog to rename the class that is selected in that field.
let editingClassInput = null;
function openClassEdit(input) {
  const old = (input.dataset.committed || "").trim();
  if (!state.classes.includes(old)) {
    toast("Pick a class first.");
    return;
  }
  editingClassInput = input;
  $("class-name").value = old;
  $("class-err").textContent = "";
  $("class-dialog").showModal();
  $("class-name").select();
}
// Renames a class everywhere: class list, every quest in it, and any import rows. Returns an error message or "".
function renameClassTo(old, name) {
  name = name.trim();
  if (!name) return "A class needs a name.";
  if (name === old) return "";
  if (
    state.classes.some(
      (c) => c !== old && c.toLowerCase() === name.toLowerCase(),
    )
  )
    return `You already have a class called "${name}".`;
  const idx = state.classes.indexOf(old);
  if (idx < 0) return "That class no longer exists.";
  state.classes[idx] = name;
  state.quests.forEach((q) => {
    if ((q.course || "").trim().toLowerCase() === old.toLowerCase())
      q.course = name;
  });
  importRows.forEach((r) => {
    if ((r.course || "").toLowerCase() === old.toLowerCase()) r.course = name;
  });
  saveState();
  return "";
}
// Deleting a class keeps every assignment: they just become "No Class". Matching is case-insensitive like renaming.
function deleteClass(name) {
  const key = name.trim().toLowerCase();
  state.classes = state.classes.filter((c) => c.toLowerCase() !== key);
  state.quests.forEach((q) => {
    if ((q.course || "").trim().toLowerCase() === key) q.course = "";
  });
  importRows.forEach((r) => {
    if ((r.course || "").trim().toLowerCase() === key) r.course = "";
  });
  document.querySelectorAll(".combo-input").forEach((i) => {
    if ((i.dataset.committed || "").toLowerCase() === key) setComboValue(i, "");
  });
  saveState();
  renderAll();
  if (importRows.length) renderImportReview();
  toast(`Deleted "${name}". Its assignments were kept as "No Class".`);
}
// ---- Clear Calendar: removes every quest, but only after the user types CLEAR (exactly, capitals) ----
function openClearDialog() {
  if (!state.quests.length) {
    toast("Your calendar is already empty.");
    return;
  }
  $("clear-input").value = "";
  $("clear-yes").disabled = true;
  $("clear-dialog").showModal();
  $("clear-input").focus();
}
function confirmClearCalendar(e) {
  e.preventDefault();
  if ($("clear-input").value !== "CLEAR") return; // never clear unless the typed text is exactly CLEAR
  state.quests = []; // classes, Gold, owned/equipped items and time blocks are NOT touched
  saveState();
  $("clear-dialog").close();
  renderAll();
  toast("Calendar cleared.");
}
function saveClassEdit(e) {
  e.preventDefault();
  const old = editingClassInput.dataset.committed,
    name = $("class-name").value.trim();
  const err = renameClassTo(old, name);
  if (err) {
    $("class-err").textContent = err;
    return;
  }
  $("class-dialog").close();
  editingClassInput = null;
  document.querySelectorAll(".combo-input").forEach((i) => {
    if (i.dataset.committed === old) setComboValue(i, name);
  }); // every selector showing it updates
  renderAll();
  if (importRows.length) renderImportReview();
  toast(`Renamed to "${name}".`);
}

// Turn the ticked review rows into real quests. Skips any quest with the same name + due date.
function addImportedQuests() {
  try {
    const chosen = importRows.filter((r) => r.include && r.name.trim());
    if (!chosen.length) {
      toast("Accept at least one assignment first.");
      return;
    }
    const missing = importRows
      .map((r, i) => (r.include && r.name.trim() && !r.due ? i : -1))
      .filter((i) => i >= 0);
    if (missing.length) {
      // an accepted item still has no due date: point at it instead of guessing
      document
        .querySelectorAll(".needs")
        .forEach((el) => el.classList.remove("needs"));
      missing.forEach((i) =>
        document
          .querySelector(`input[data-i="${i}"][data-f="due"]`)
          .classList.add("needs"),
      );
      const first = document.querySelector(
        `input[data-i="${missing[0]}"][data-f="due"]`,
      );
      first.scrollIntoView({ block: "center" });
      first.focus();
      toast(
        `${missing.length} accepted item${missing.length > 1 ? "s need" : " needs"} a due date.`,
      );
      return;
    }
    let added = 0,
      skipped = 0,
      firstDue = null;
    chosen.forEach((r) => {
      const name = r.name.trim();
      if (
        state.quests.some(
          (q) => q.name.toLowerCase() === name.toLowerCase() && q.due === r.due,
        )
      ) {
        skipped++;
        return;
      } // already there
      state.quests.push({
        id: "q" + Date.now() + "-" + added,
        name,
        course: addClass((r.course || "").trim()),
        due: r.due,
        reward: Math.max(1, r.reward || 1),
        time: r.time || "",
        importedOn: today(),
        description: r.description || "",
        completed: false,
        rewardPaid: false,
        demo: false,
      });
      added++;
      if (!firstDue || r.due < firstDue) firstDue = r.due;
    });
    if (!added) {
      toast(`Nothing new: all ${skipped} were already on your calendar.`);
      return;
    }
    importRows = [];
    $("import-review").innerHTML = "";
    saveState();
    calDate = new Date(firstDue + "T00:00:00");
    calView = "month"; // jump the calendar to the first imported date
    renderAll();
    showView("calendar");
    toast(
      `Added ${added} quest${added > 1 ? "s" : ""} to your calendar${skipped ? ` (${skipped} duplicate${skipped > 1 ? "s" : ""} skipped)` : ""}.`,
    );
  } catch (err) {
    console.error(err);
    toast("Couldn't add those quests: " + err.message);
  }
}

/* One click handler for the whole page: buttons carry data-act / data-id attributes. */
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.view) return showView(b.dataset.view);
  const { act, id, kind, date, time } = b.dataset;
  if (act === "new") openQuestForm(null, date);
  else if (act === "edit") openQuestForm(id);
  else if (act === "complete") completeQuest(id);
  else if (act === "reopen") reopenQuest(id);
  else if (act === "delete") deleteQuest(id);
  else if (act === "buy") buyItem(kind, id);
  else if (act === "equip") equipItem(kind, id);
  else if (act === "unequip") equipItem(kind, null);
  else if (act === "import-text") startImport("syllabus", $("imp-text").value);
  else if (act === "import-add") addImportedQuests();
  else if (act === "prev") stepCalendar(-1);
  else if (act === "next") stepCalendar(1);
  else if (act === "new-block") openBlockForm(date, time);
  else if (act === "block-del") {
    state.blocks = state.blocks.filter((x) => x.id !== id);
    saveState();
    renderAll();
  } else if (act === "calview") {
    calView = id;
    renderCalendar();
  } else if (act === "goday") {
    calDate = new Date(date + "T00:00:00");
    calView = "day";
    renderCalendar();
  } else if (act === "clear-calendar") openClearDialog();
  else if (act === "board-range") {
    state.boardRange = id;
    saveState();
    renderBoard();
  } else if (act === "combo-edit")
    openClassEdit(b.closest(".combo").querySelector(".combo-input"));
  else if (act === "imp-set") {
    const r = importRows[+b.dataset.i],
      card = b.closest(".import-card");
    r.include = b.dataset.v === "1";
    card.classList.toggle("accepted", r.include);
    card.classList.toggle("rejected", !r.include);
    card
      .querySelectorAll(".seg button")
      .forEach((x) =>
        x.setAttribute(
          "aria-pressed",
          String((x.dataset.v === "1") === r.include),
        ),
      );
    updateImportCount();
  } else if (act === "imp-all" || act === "imp-none") {
    importRows.forEach((r) => (r.include = act === "imp-all"));
    renderImportReview();
  } else if (act === "detail") {
    const q = findQuest(id);
    $("detail-body").innerHTML = questCard(q);
    $("detail-dialog").showModal();
  } else if (act === "reset") {
    askConfirm("Erase ALL quests, Gold and purchases?", () => {
      state = defaultState();
      saveState();
      renderAll();
    });
  }
  // buttons inside the detail popup should close it after acting
  if (["complete", "reopen", "delete", "edit"].includes(act))
    $("detail-dialog").close();
});
$("quest-form").addEventListener("submit", saveQuestFromForm);
$("q-cancel").addEventListener("click", () => $("quest-dialog").close());
$("detail-close").addEventListener("click", () => $("detail-dialog").close());
document.addEventListener("input", (e) => {
  // keep importRows in sync with the review fields
  const t = e.target;
  if (t.dataset.f === undefined) return;
  const row = importRows[t.dataset.i];
  row[t.dataset.f] =
    t.dataset.f === "include"
      ? t.checked
      : t.dataset.f === "reward"
        ? parseInt(t.value, 10) || 1
        : t.value;
  if (t.dataset.f === "include") updateImportCount();
});
mountCombos(); // build the class comboboxes before anything uses them
$("class-form").addEventListener("submit", saveClassEdit);
$("clear-form").addEventListener("submit", confirmClearCalendar);
$("clear-input").addEventListener("input", () => {
  $("clear-yes").disabled = $("clear-input").value !== "CLEAR";
});
$("clear-cancel").addEventListener("click", () => $("clear-dialog").close());
$("class-cancel").addEventListener("click", () => $("class-dialog").close());
$("class-delete").addEventListener("click", () => {
  const name = editingClassInput.dataset.committed;
  askConfirm(
    "This will remove this class from your class list. Existing assignments will be kept, but will no longer be assigned to this class.",
    () => {
      deleteClass(name);
      $("class-dialog").close();
      editingClassInput = null;
    },
    { title: `Delete ${name}?`, yes: "Delete Class" },
  );
});
document.addEventListener("combo-change", (e) => {
  const input = e.detail.input;
  if (input.id === "imp-class") updateImportLock();
  else if (input.dataset.ci !== undefined)
    importRows[+input.dataset.ci].course = e.detail.value; // class chosen on an import-review row
});
document.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("combo-input")) openCombo(e.target, "");
});
document.addEventListener("click", (e) => {
  if (
    e.target.classList.contains("combo-input") &&
    e.target.closest(".combo").querySelector(".combo-list").hidden
  )
    openCombo(e.target, "");
});
document.addEventListener("input", (e) => {
  if (e.target.classList.contains("combo-input"))
    openCombo(e.target, e.target.value);
});
document.addEventListener("mousedown", (e) => {
  const li = e.target.closest(".combo-list li");
  if (li) {
    e.preventDefault();
    pickComboItem(li);
  }
});
document.addEventListener("focusout", (e) => {
  // leaving the field: keep an exactly-typed class name, otherwise go back to the chosen class
  const input = e.target;
  if (!input.classList || !input.classList.contains("combo-input")) return;
  const typed = input.value.trim().toLowerCase(),
    match = state.classes.find((c) => c.toLowerCase() === typed);
  if (match && match !== input.dataset.committed) commitCombo(input, match);
  else {
    setComboValue(input, input.dataset.committed || "");
    closeCombo(input);
  }
});
document.addEventListener("keydown", (e) => {
  const input = e.target;
  if (!input.classList || !input.classList.contains("combo-input")) return;
  const list = input.closest(".combo").querySelector(".combo-list"),
    lis = [...list.querySelectorAll("li")];
  let k = lis.findIndex((li) => li.classList.contains("active"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (list.hidden) {
      openCombo(input, "");
      return;
    }
    k = (k + (e.key === "ArrowDown" ? 1 : -1) + lis.length) % lis.length;
    lis.forEach((li, n) => li.classList.toggle("active", n === k));
    lis[k].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (!list.hidden && lis[k]) pickComboItem(lis[k]);
  } else if (e.key === "Escape" && !list.hidden) {
    e.preventDefault();
    setComboValue(input, input.dataset.committed || "");
    closeCombo(input);
  }
});
$("block-form").addEventListener("submit", saveBlockFromForm);
$("b-cancel").addEventListener("click", () => $("block-dialog").close());
$("confirm-yes").addEventListener("click", () => {
  $("confirm-dialog").close();
  if (confirmAction) confirmAction();
  confirmAction = null;
});
$("confirm-no").addEventListener("click", () => $("confirm-dialog").close());
document.addEventListener("change", (e) => {
  // Day view date picker
  if (e.target.id === "day-pick" && e.target.value) {
    calDate = new Date(e.target.value + "T00:00:00");
    renderCalendar();
  }
});
$("imp-ics").addEventListener("change", (e) => importFile(e, "ics"));
$("imp-syl").addEventListener("change", (e) => importFile(e, "syllabus"));
state = loadState(); // load saved data (or sample data on first visit)
syncClasses();
renderAll();
