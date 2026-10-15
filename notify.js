(window.AQ_BUILD = window.AQ_BUILD || {}).notify = "aq-5"; // version stamp: index.html checks that every file is from the same version
/* =====================================================================
   DUE-DATE REMINDERS.
   - Uses the browser's Notification API. They appear while Aquestoria is open in a tab/window (or installed as an app).
   - Closed-browser reminders (push / email) need a server and are NOT included in this version.
   - If the browser blocks notifications, reminders show inside the app instead.
   Settings live in state.notify = { enabled, morning, dayBefore, hourBefore }.
   ===================================================================== */
const Notify = (() => {
  const SENT_KEY = "questiva-notified"; // which reminders were already sent (kept per device, not in the cloud save)
  let timer = null;
  const $ = (id) => document.getElementById(id);
  const cfg = () =>
    state.notify ||
    (state.notify = {
      enabled: false,
      morning: true,
      dayBefore: true,
      hourBefore: true,
    });
  const sentMap = () => {
    try {
      return JSON.parse(store.get(SENT_KEY)) || {};
    } catch (e) {
      return {};
    }
  };
  function markSent(keys) {
    const m = sentMap(),
      cutoff = Date.now() - 14 * 864e5;
    Object.keys(m).forEach((k) => {
      if (m[k] < cutoff) delete m[k];
    });
    keys.forEach((k) => (m[k] = Date.now()));
    store.set(SENT_KEY, JSON.stringify(m));
  }
  async function show(title, body, tag) {
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      toast(`🔔 ${title}: ${body}`);
      return;
    } // in-app fallback
    try {
      const reg =
        "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistration()
          : null;
      if (reg) {
        await reg.showNotification(title, { body, tag });
        return;
      }
    } catch (e) {
      /* fall through */
    }
    try {
      new Notification(title, { body, tag });
    } catch (e) {
      toast(`🔔 ${title}: ${body}`);
    }
  }
  // Looks at your quests and sends any reminder that is due and wasn't sent yet. Runs every minute while the app is open.
  function check() {
    const c = cfg();
    if (!c.enabled || !state) return;
    const now = new Date(),
      t = toISO(now),
      tomorrow = toISO(addDays(now, 1)),
      sent = sentMap(),
      todo = state.quests.filter(isTodo);
    const key = (q, kind) => `${q.id}|${q.due}|${kind}`;
    const group = (list, kind, title) => {
      list = list.filter((q) => !sent[key(q, kind)]);
      if (!list.length) return;
      markSent(list.map((q) => key(q, kind)));
      show(
        `${title} (${list.length})`,
        list
          .slice(0, 4)
          .map((q) => q.name)
          .join(", ") + (list.length > 4 ? ` +${list.length - 4} more` : ""),
        `${kind}-${t}`,
      );
    };
    if (c.morning && now.getHours() >= 8)
      group(
        todo.filter((q) => q.due === t),
        "morning",
        "⚔️ Quests due today",
      );
    if (c.dayBefore && now.getHours() >= 18)
      group(
        todo.filter((q) => q.due === tomorrow),
        "dayBefore",
        "📜 Quests due tomorrow",
      );
    if (c.hourBefore) {
      todo
        .filter((q) => q.time && q.due === t && !sent[key(q, "hour")])
        .forEach((q) => {
          const mins = (new Date(`${t}T${q.time}:00`) - now) / 60000;
          if (mins > 0 && mins <= 60) {
            markSent([key(q, "hour")]);
            show(
              `⏰ Due in ${Math.ceil(mins)} min`,
              `${q.name} · ${courseLabel(q)}`,
              key(q, "hour"),
            );
          }
        });
    }
  }
  function start() {
    stop();
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol))
      navigator.serviceWorker.register("sw.js").catch(() => {});
    check();
    timer = setInterval(check, 60000);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
  }
  async function setEnabled(on) {
    if (
      on &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      try {
        await Notification.requestPermission();
      } catch (e) {
        /* ignore */
      }
    }
    cfg().enabled = on;
    saveState();
    syncUI();
    if (on) check();
  }
  function syncUI() {
    const c = cfg();
    $("nt-enabled").checked = c.enabled;
    ["morning", "dayBefore", "hourBefore"].forEach((k) => {
      $("nt-" + k).checked = c[k];
      $("nt-" + k).disabled = !c.enabled;
    });
    $("nt-test").disabled = !c.enabled;
    const p =
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission;
    $("nt-help").textContent =
      p === "granted"
        ? "Browser notifications are on. They appear while Aquestoria is open in a tab or window."
        : p === "denied"
          ? "Notifications are blocked for this site in your browser settings, so Aquestoria will show reminders inside the app instead."
          : p === "unsupported"
            ? "This browser can't show notifications, so Aquestoria will show reminders inside the app instead."
            : "Turn reminders on and allow notifications when your browser asks.";
  }
  window.addEventListener("DOMContentLoaded", () => {
    $("nt-enabled").addEventListener("change", (e) =>
      setEnabled(e.target.checked),
    );
    ["morning", "dayBefore", "hourBefore"].forEach((k) =>
      $("nt-" + k).addEventListener("change", (e) => {
        cfg()[k] = e.target.checked;
        saveState();
      }),
    );
    $("nt-test").addEventListener("click", () =>
      show("🔔 Aquestoria test", "Reminders are working!", "test"),
    );
  });
  return { start, stop, check, syncUI };
})();
