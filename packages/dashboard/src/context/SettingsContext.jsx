// src/context/SettingsContext.jsx
// Session 4 changes:
// - registerUser → split into setSession(email) (sets active user) and
//   completeOnboarding(patch) (writes user-entered fields without nuking row).
// - The first-time-load path no longer overwrites existing Supabase rows.
//   If a row exists, we just load it. If it doesn't, we INSERT a default row
//   so subsequent OAuth PATCHes have something to update.
// - Default Recipes / SKUs are now empty arrays — no BB-001 leak.

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  your_name: "",
  company_name: "",
  email_connected: false,
  email_address: "",
  slack_connected: false,
  slack_webhook: "",
  sheets_connected: false,
  sheets_url: "",
  ingredient_col: "B",
  price_col: "C",
  inventory_col: "F",
  header_row: "4",
  // legacy col fields kept for compat
  sku_col: "A",
  qty_col: "B",
  kaizntree_connected: false,
  kaizntree_key: "",
  max_per_txn: "10000",
  max_monthly: "25000",
  approval_threshold: "5000",
  auto_approve: true,
  suppliers: [],
  recipes: [],
  last_po_cases: null,
};

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// Treat the user as "onboarded" once they've supplied a name or company.
// This is what gates the dashboard-vs-onboarding view.
export function isOnboarded(settings) {
  if (!settings) return false;
  return Boolean(
    (settings.your_name && settings.your_name.trim()) ||
    (settings.company_name && settings.company_name.trim())
  );
}

export function SettingsProvider({ children }) {
  const [userEmail, setUserEmail] = useState(
    () => localStorage.getItem("bytem_user_email") || null
  );
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userEmail) {
      setSettings(null);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/settings-get?email=${encodeURIComponent(userEmail)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.error) throw new Error(data.error);

        if (data.exists && data.settings) {
          // Existing user — load their data unchanged.
          const loaded = { ...DEFAULT_SETTINGS, ...data.settings };
          setSettings(loaded);
          lsSet("bytem_settings_cache", loaded);
        } else {
          // Brand-new user — create a default row so OAuth PATCHes work later.
          const initial = { ...DEFAULT_SETTINGS };
          setSettings(initial);
          lsSet("bytem_settings_cache", initial);
          await saveToSupabase(userEmail, initial);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        if (cancelled) return;
        setLoadError(err.message);
        const cached = lsGet("bytem_settings_cache", null);
        setSettings(cached || DEFAULT_SETTINGS);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [userEmail]);

  async function saveToSupabase(email, settingsObj) {
    try {
      const res = await fetch("/api/settings-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, settings: settingsObj }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return true;
    } catch (err) {
      console.error("Failed to save to Supabase:", err);
      return false;
    }
  }

  const saveSettings = useCallback(async (patch) => {
    const merged = { ...settings, ...patch };
    setSettings(merged);
    lsSet("bytem_settings_cache", merged);
    if (userEmail) {
      setSaving(true);
      await saveToSupabase(userEmail, merged);
      setSaving(false);
    }
    return merged;
  }, [settings, userEmail]);

  // Set the active session. Loading happens in the useEffect above.
  // Does NOT touch Supabase for users who already exist — only the load
  // path inserts a default row when missing.
  function setSession(email) {
    const e = (email || "").trim().toLowerCase();
    if (!e) return;
    localStorage.setItem("bytem_user_email", e);
    setUserEmail(e);
  }

  // Called from the onboarding wizard's final step. Writes only the fields
  // the user filled in — never overwrites unrelated columns (gmail tokens,
  // etc.) that were set by other flows.
  async function completeOnboarding(patch) {
    if (!userEmail) throw new Error("No active session");
    return saveSettings(patch || {});
  }

  // Force a fresh load from Supabase (used after OAuth redirects).
  async function refreshSettings() {
    if (!userEmail) return;
    try {
      const res = await fetch(
        `/api/settings-get?email=${encodeURIComponent(userEmail)}`
      );
      const data = await res.json();
      if (data.exists && data.settings) {
        const loaded = { ...DEFAULT_SETTINGS, ...data.settings };
        setSettings(loaded);
        lsSet("bytem_settings_cache", loaded);
      }
    } catch (err) {
      console.error("refreshSettings failed:", err);
    }
  }

  function signOut() {
    localStorage.removeItem("bytem_user_email");
    localStorage.removeItem("bytem_settings_cache");
    setUserEmail(null);
    setSettings(null);
  }

  const value = {
    settings,
    saveSettings,
    loading: settings === null && userEmail !== null,
    loadError,
    saving,
    userEmail,
    setSession,
    completeOnboarding,
    signOut,
    refreshSettings,
    onboarded: isOnboarded(settings),
    get yourName() { return settings?.your_name || ""; },
    get companyName() { return settings?.company_name || ""; },
    get sheetsUrl() { return settings?.sheets_url || ""; },
    get suppliers() { return settings?.suppliers || []; },
    get recipes() { return settings?.recipes || []; },
    get colConfig() {
      return {
        ingredientCol: settings?.ingredient_col || "B",
        priceCol: settings?.price_col || "C",
        inventoryCol: settings?.inventory_col || "F",
        headerRow: settings?.header_row || "4",
      };
    },
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
