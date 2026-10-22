(window.AQ_BUILD = window.AQ_BUILD || {}).account = "aq-6"; // version stamp: index.html checks that every file is from the same version
/* =====================================================================
   ACCOUNT: sign up / log in, cloud save, 168-hour free trial, paywall.   (setup steps: SETUP.md)
   - Needs the Supabase keys in config.js. Without them Aquestoria stays in local mode and this file does almost nothing.
   - The trial and the payment flag live in the DATABASE (backend/setup.sql). This file only reads them and shows screens.
     Even if someone edits this file, the database refuses to save data once the trial is over and nothing is paid.
   - Your planner data is the same `state` object used everywhere else, saved as one JSON row per user.
   ===================================================================== */
const Account = (() => {
  const cfg = window.QUESTIVA_CONFIG || {};
  const cloud = !!(
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey &&
    window.supabase &&
    window.supabase.createClient
  );
  const $ = (id) => document.getElementById(id);
  const price = cfg.price || "$6.99";
  let deleting = false,
    sb = null,
    user = null,
    profile = null,
    dirty = false,
    saveTimer = null,
    retryTimer = null,
    lastStamp = null,
    tick = null,
    poll = null,
    mode = "signup";

  // ---------- trial helpers ----------
  // The trial is 168 hours of ACTUAL USE. The server counts it (record_usage in backend/setup.sql); we only show it.
  const secondsLeft = () =>
    profile
      ? Math.max(
          0,
          (profile.trial_seconds ?? 604800) - (profile.used_seconds ?? 0),
        )
      : 0;
  const hasAccess = () =>
    !!profile &&
    (profile.paid ||
      (secondsLeft() > 0 && new Date(profile.trial_ends_at) > new Date()));
  const leftMs = () => secondsLeft() * 1000;
  function fmtLeft(ms) {
    const m = Math.max(0, Math.floor(ms / 60000));
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  }

  // ---------- screens ----------
  const setLocked = () => {
    // nothing behind a full-screen gate can be clicked or tabbed to
    const on = !$("auth-screen").hidden || !$("paywall").hidden;
    [
      document.querySelector(".topbar"),
      document.querySelector("main"),
      $("trial-banner"),
    ].forEach((e) => {
      e.inert = on;
    });
  };
  function setMode(m) {
    mode = m;
    document
      .querySelectorAll("[data-auth-tab]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.authTab === m)),
      );
    $("auth-submit").textContent =
      m === "signup"
        ? "Create account"
        : m === "login"
          ? "Log in"
          : "Set new password";
    $("auth-pass").autocomplete =
      m === "login" ? "current-password" : "new-password";
    $("auth-email-wrap").hidden = m === "reset";
    $("auth-email").required = m !== "reset";
    $("auth-forgot").hidden = m !== "login";
    $("auth-pass-label").textContent =
      m === "reset"
        ? "New password (8+ characters)"
        : "Password (8+ characters)";
    msg("");
  }
  function showAuth(m) {
    setMode(m || mode);
    $("auth-screen").hidden = false;
    document.body.classList.remove("gating");
    setLocked();
    ($("auth-email-wrap").hidden ? $("auth-pass") : $("auth-email")).focus();
  }
  function hideAuth() {
    $("auth-screen").hidden = true;
    setLocked();
  }
  function msg(text, ok) {
    const m = $("auth-msg");
    m.textContent = text;
    m.classList.toggle("ok", !!ok);
  }
  const friendly = (err) => {
    const t = (err && err.message) || String(err);
    if (/invalid login/i.test(t)) return "That email and password don't match.";
    if (/already registered|already been registered/i.test(t))
      return "That email already has an account. Try logging in.";
    if (/failed to fetch|network/i.test(t))
      return "Can't reach the server. Check your connection and try again.";
    if (/rate limit|too many/i.test(t))
      return "Too many tries. Please wait a minute and try again.";
    return t;
  };
  function setSync(text) {
    $("acct-sync").textContent = text;
  }

  // ---------- profile (trial + paid flag, read-only for the user) ----------
  async function refreshProfile() {
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    profile = data;
    store.set("questiva-profile-" + user.id, JSON.stringify(data)); // cached so the trial can still be shown offline
    renderStatus();
    evaluateLock();
  }
  function evaluateLock() {
    if (!user || !profile) return;
    const locked = !hasAccess();
    if (locked && $("paywall").hidden)
      document.querySelectorAll("dialog[open]").forEach((d) => d.close()); // when the paywall first appears, close windows that would sit on top of it
    $("paywall").hidden = !locked;
    setLocked();
    if (!locked && dirty) queueSave(); // just paid: send anything that couldn't be saved
  }
  function renderStatus() {
    const btn = $("acct-btn");
    if (!user || !profile) {
      btn.textContent = cloud ? "⚙ Account" : "⚙ Settings";
      $("trial-banner").hidden = true;
      return;
    }
    const left = leftMs();
    btn.textContent = profile.paid
      ? "👑 Unlocked"
      : hasAccess()
        ? `⏳ ${fmtLeft(left)} left`
        : "🔒 Trial used up";
    btn.classList.toggle("warn", !profile.paid && left < 864e5);
    $("acct-email").textContent = user.email;
    $("acct-status").textContent = profile.paid
      ? "Unlocked forever. Thank you for supporting Aquestoria! 👑"
      : hasAccess()
        ? `Free trial: ${fmtLeft(left)} of use left (168 hours total). Only time you're actively using Aquestoria counts. Free hours also expire on ${new Date(profile.trial_ends_at).toLocaleDateString()}. After that, a one-time ${price} unlocks it forever.`
        : `Your free hours are used up. Unlock forever for a one-time ${price}.`;
    $("acct-upgrade").hidden = !!profile.paid;
    const showBanner = !profile.paid && hasAccess() && left < 24 * 36e5; // last 24 hours of use
    $("trial-banner").hidden = !showBanner;
    if (showBanner)
      $("tb-text").textContent = `Free trial: ${fmtLeft(left)} of use left.`;
  }

  // ---------- cloud save ----------
  const applyCloudState = (row) => {
    const st = normalizeState(row.data);
    if (!st) return false;
    state = st;
    syncClasses();
    store.set(STORAGE_KEY, JSON.stringify(state)); // local cache only: don't re-upload what we just downloaded
    lastStamp = row.updated_at;
    renderAll();
    return true;
  };
  async function loadCloudState() {
    try {
      const { data, error } = await sb
        .from("user_data")
        .select("data,updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (data && applyCloudState(data)) {
        setSync("Loaded from your account ✓");
        return;
      }
      // first login on this account: bring over data from this browser (once) or start with the sample quests
      const legacy = store.get("questbook-v1"),
        migrated = store.get("questiva-legacy-migrated");
      let st = null;
      if (legacy && !migrated) {
        try {
          st = normalizeState(JSON.parse(legacy));
        } catch (e) {
          /* ignore */
        }
        store.set("questiva-legacy-migrated", "1");
      }
      state = st || defaultState();
      syncClasses();
      renderAll();
      store.set(STORAGE_KEY, JSON.stringify(state));
      queueSave(true);
    } catch (e) {
      // offline: use this device's cached copy of this account
      const cached = (() => {
        try {
          return normalizeState(JSON.parse(store.get(STORAGE_KEY)));
        } catch (x) {
          return null;
        }
      })();
      state = cached || defaultState();
      syncClasses();
      renderAll();
      setSync("Offline: showing the copy saved on this device");
      toast("Offline: showing the copy saved on this device.");
    }
  }
  function queueSave(now) {
    if (deleting) return;
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, now ? 0 : 800);
  }
  async function flush() {
    if (!user || !dirty || deleting) return;
    clearTimeout(saveTimer);
    if (profile && !hasAccess()) {
      evaluateLock();
      setSync("Not saved: free trial ended");
      return;
    }
    const stamp = new Date().toISOString();
    setSync("Saving…");
    let error = null;
    try {
      ({ error } = await sb
        .from("user_data")
        .upsert(
          { user_id: user.id, data: state, updated_at: stamp },
          { onConflict: "user_id" },
        ));
    } catch (e) {
      error = e;
    }
    if (!error) {
      dirty = false;
      lastStamp = stamp;
      setSync(
        "Saved to your account ✓ " +
          new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
      );
      return;
    }
    if (
      error.code === "42501" ||
      /row-level security/i.test(error.message || "")
    ) {
      // the database says the trial is over
      if (profile && !profile.paid)
        profile.trial_ends_at = new Date(0).toISOString();
      renderStatus();
      evaluateLock();
      setSync("Not saved: free trial ended");
      return;
    }
    setSync("Offline: will retry");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, 15000);
  }
  async function pullIfNewer() {
    // another device may have saved: pick up its changes when you come back to this tab
    if (!user || dirty || !hasAccess()) return;
    try {
      const { data } = await sb
        .from("user_data")
        .select("data,updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data && data.updated_at !== lastStamp) {
        applyCloudState(data);
        setSync("Updated from another device ✓");
      }
    } catch (e) {
      /* offline: ignore */
    }
  }

  // ---------- usage meter ("actual use") ----------
  // About once a minute, if the tab is visible AND you touched the keyboard/mouse/screen in the last 2 minutes,
  // we tell the server "still using it". The server credits the time. Idle or hidden tabs send nothing.
  let lastActivity = Date.now(),
    sessionActive = false,
    hb = null;
  ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"].forEach(
    (ev) =>
      window.addEventListener(
        ev,
        () => {
          lastActivity = Date.now();
        },
        { passive: true },
      ),
  );
  async function heartbeat() {
    const active = !document.hidden && Date.now() - lastActivity < 120000;
    if (!active || !user || !profile || profile.paid || !hasAccess()) {
      sessionActive = false;
      return;
    }
    const fresh = !sessionActive;
    sessionActive = true; // first beat after starting/resuming credits nothing
    try {
      const { data, error } = await sb.rpc("record_usage", { fresh });
      if (error) return; // offline: nothing is counted
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        profile.used_seconds = row.used_seconds;
        profile.trial_seconds = row.trial_seconds;
        profile.paid = row.paid;
        store.set("questiva-profile-" + user.id, JSON.stringify(profile));
        renderStatus();
        evaluateLock();
      }
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- sign in / out ----------
  async function signedIn(u) {
    user = u;
    STORAGE_KEY = "questbook-v1-u-" + u.id; // each account gets its own cache on this device
    try {
      await refreshProfile();
    } catch (e) {
      try {
        profile = JSON.parse(store.get("questiva-profile-" + u.id));
      } catch (x) {
        profile = null;
      }
    }
    await loadCloudState();
    hideAuth();
    renderStatus();
    evaluateLock();
    document.body.classList.remove("gating");
    clearInterval(tick);
    tick = setInterval(() => {
      renderStatus();
      evaluateLock();
    }, 30000);
    clearInterval(hb);
    sessionActive = false;
    hb = setInterval(heartbeat, 60000);
    heartbeat();
    Notify.start();
  }
  function signedOut() {
    clearInterval(tick);
    clearInterval(poll);
    clearInterval(hb);
    clearTimeout(saveTimer);
    Notify.stop();
    sessionActive = false;
    user = null;
    profile = null;
    dirty = false;
    STORAGE_KEY = "questbook-v1";
    state = defaultState();
    syncClasses();
    renderAll();
    renderStatus();
    if ($("account-dialog").open) $("account-dialog").close();
    $("paywall").hidden = true;
    $("auth-pass").value = "";
    showAuth("login");
  }
  async function logout() {
    try {
      await flush();
    } catch (e) {
      /* ignore */
    }
    await sb.auth.signOut();
  }

  // ---------- payment ----------
  function openCheckout() {
    if (!cfg.stripePaymentLink) {
      toast("Payments aren't set up yet (see SETUP.md).");
      return;
    }
    const sep = cfg.stripePaymentLink.includes("?") ? "&" : "?";
    // client_reference_id tells the Stripe webhook which account just paid
    window.open(
      `${cfg.stripePaymentLink}${sep}client_reference_id=${encodeURIComponent(user.id)}&prefilled_email=${encodeURIComponent(user.email || "")}`,
      "_blank",
      "noopener",
    );
    clearInterval(poll);
    let n = 0;
    poll = setInterval(async () => {
      // check every 5 seconds for up to 5 minutes whether the payment went through
      n++;
      try {
        await refreshProfile();
      } catch (e) {
        /* ignore */
      }
      if ((profile && profile.paid) || n > 60) {
        clearInterval(poll);
        if (profile && profile.paid)
          toast("🎉 Aquestoria is unlocked forever. Thank you!");
      }
    }, 5000);
  }
  // ---------- delete account ----------
  function openDelete() {
    $("delete-input").value = "";
    $("delete-yes").disabled = true;
    $("delete-err").textContent = "";
    if ($("account-dialog").open) $("account-dialog").close();
    $("delete-dialog").showModal();
    $("delete-input").focus();
  }
  async function deleteAccount(e) {
    e.preventDefault();
    if ($("delete-input").value !== "DELETE" || !user) return; // only the exact word DELETE goes through
    $("delete-yes").disabled = true;
    $("delete-err").textContent = "";
    const id = user.id;
    deleting = true;
    clearTimeout(saveTimer);
    clearTimeout(retryTimer); // stop any pending save so nothing re-creates the data
    try {
      const { error } = await sb.rpc("delete_my_account"); // the database deletes the login, profile and saved planner
      if (error) throw error;
    } catch (err) {
      deleting = false;
      $("delete-err").textContent =
        "Couldn't delete the account: " +
        friendly(err) +
        " Nothing was deleted. Try again, or contact support.";
      $("delete-yes").disabled = $("delete-input").value !== "DELETE";
      return;
    }
    [
      "questbook-v1-u-" + id,
      "questiva-profile-" + id,
      "questiva-notified",
    ].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (x) {
        /* ignore */
      }
    }); // wipe this browser's copy too
    $("delete-dialog").close();
    try {
      await sb.auth.signOut({ scope: "local" });
    } catch (x) {
      /* the account is gone anyway */
    }
    if (user) signedOut();
    deleting = false;
    $("auth-email").value = "";
    $("auth-pass").value = ""; // don't leave the deleted account's details in the form
    msg("Your account and all its data were deleted.", true);
  }
  function exportData() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    a.download = "aquestoria-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function checkAgain(out) {
    try {
      await refreshProfile();
      if (out)
        out.textContent = profile.paid
          ? ""
          : hasAccess()
            ? ""
            : "No payment found yet. It can take a few seconds after paying, so try again in a moment.";
    } catch (e) {
      if (out) out.textContent = "Couldn't check right now. Are you online?";
    }
  }

  // ---------- start ----------
  function init() {
    $("acct-btn").addEventListener("click", () => {
      $("acct-cloud").hidden = !cloud || !user;
      renderStatus();
      Notify.syncUI();
      $("account-dialog").showModal();
    });
    $("acct-close").addEventListener("click", () =>
      $("account-dialog").close(),
    );
    $("acct-export").addEventListener("click", exportData);
    if (!cloud) {
      // local mode: no accounts, reminders still work
      $("acct-cloud").hidden = true;
      $("acct-logout").hidden = true;
      renderStatus();
      Notify.start();
      return;
    }
    document.body.classList.add("gating");
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    window.onStateSaved = () => {
      if (user) queueSave();
    };
    document
      .querySelectorAll(".price-txt")
      .forEach((e) => (e.textContent = price));
    document
      .querySelectorAll("[data-auth-tab]")
      .forEach((b) =>
        b.addEventListener("click", () => setMode(b.dataset.authTab)),
      );
    $("auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("auth-submit").disabled = true;
      msg("");
      const email = $("auth-email").value.trim(),
        password = $("auth-pass").value;
      try {
        if (mode === "reset") {
          const { error } = await sb.auth.updateUser({ password });
          if (error) throw error;
          msg("");
          setMode("login");
          hideAuth();
          toast("Password updated.");
        } else if (mode === "signup") {
          const { data, error } = await sb.auth.signUp({ email, password });
          if (error) throw error;
          if (!data.session) {
            setMode("login");
            msg(
              "Almost there! Check your email to confirm your account, then log in here.",
              true,
            );
          }
        } else {
          const { error } = await sb.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
        }
      } catch (err) {
        msg(friendly(err));
      }
      $("auth-submit").disabled = false;
    });
    $("auth-forgot").addEventListener("click", async () => {
      const email = $("auth-email").value.trim();
      if (!email) {
        msg("Type your email above first, then click Forgot password.");
        return;
      }
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.href.split("#")[0],
      });
      msg(
        error
          ? friendly(error)
          : "If that email has an account, a reset link is on its way.",
        !error,
      );
    });
    ["acct-upgrade", "pw-pay", "tb-unlock"].forEach((id) =>
      $(id).addEventListener("click", openCheckout),
    );
    $("acct-refresh").addEventListener("click", () => checkAgain());
    $("pw-check").addEventListener("click", () => checkAgain($("pw-msg")));
    $("pw-export").addEventListener("click", exportData);
    if ($("delete-form")) {
      // (guard: an old index.html without the delete window won't break the app)
      ["acct-delete", "pw-delete"].forEach((id) =>
        $(id).addEventListener("click", openDelete),
      );
      $("delete-form").addEventListener("submit", deleteAccount);
      $("delete-input").addEventListener("input", () => {
        $("delete-yes").disabled = $("delete-input").value !== "DELETE";
      });
      $("delete-cancel").addEventListener("click", () =>
        $("delete-dialog").close(),
      );
      $("delete-export").addEventListener("click", exportData);
    }
    ["pw-logout", "acct-logout"].forEach((id) =>
      $(id).addEventListener("click", logout),
    );
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        sessionActive = false;
        flush();
      } else {
        lastActivity = Date.now();
        renderStatus();
        evaluateLock();
        pullIfNewer();
        heartbeat();
      }
    });
    window.addEventListener("online", flush);
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        showAuth("reset");
        return;
      }
      if (event === "SIGNED_OUT") {
        if (user) signedOut();
        return;
      }
      if (session && (!user || user.id !== session.user.id))
        setTimeout(() => signedIn(session.user), 0); // setTimeout: don't call Supabase from inside its own callback
    });
    sb.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          if (!user) signedIn(data.session.user);
        } else showAuth("signup");
      })
      .catch(() => showAuth("login"));
  }
  window.addEventListener("DOMContentLoaded", init);
  return {
    hasAccess,
    flush,
    _heartbeat: heartbeat,
    _goIdle: () => {
      lastActivity = 0;
    },
  }; // underscore ones are for tests only
})();
