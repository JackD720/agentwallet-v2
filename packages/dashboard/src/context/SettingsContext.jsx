// src/context/SettingsContext.jsx
// Replaces all localStorage usage across the app.
// Reads from Supabase on mount, writes to Supabase on save,
// with localStorage as a fast local cache (same device speed).

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const SettingsContext = createContext(null);

const DEFAULT_SUPPLIERS = [
  { id: 1, name: "Hershey's", email: "orders@hersheys.com", product: "Chocolate chips", price: "4.20", notes: "" },
  { id: 2, name: "ePac", email: "orders@epacflexibles.com", product: "Packaging bags", price: "0.45", notes: "" },
  { id: 3, name: "Boston Baking", email: "production@bostonbaking.com", product: "Co-packing", price: "2.10", notes: "" },
];

const DEFAULT_SETTINGS = {
  your_name: "",
  company_name: "",
  email_connected: false,
  email_address: "",
  slack_connected: false,
  slack_webhook: "",
  sheets_connected: false,
  sheets_url: "",
  sku_col: "A",
  qty_col: "B",
  kaizntree_connected: false,
  kaizntree_key: "",
  max_per_txn: "10000",
  max_monthly: "25000",
  approval_threshold: "5000",
  auto_approve: true,
  suppliers: DEFAULT_SUPPLIERS,
  recipes: [],
  last_po_cases: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// Migrate legacy localStorage keys into a flat settings object
function migrateFromLegacyLocalStorage() {
  return {
    your_name: localStorage.getItem("bytem_yourName") || "",
    company_name: localStorage.getItem("bytem_companyName") || "",
    email_connected: lsGet("bytem_emailConnected", false),
    email_address: localStorage.getItem("bytem_emailAddress") || "",
    slack_connected: lsGet("bytem_slackConnected", false),
    slack_webhook: localStorage.getItem("bytem_slackWebhook") || "",
    sheets_connected: lsGet("bytem_sheetsConnected", false),
    sheets_url: localStorage.getItem("bytem_sheetsUrl") || "",
    sku_col: localStorage.getItem("bytem_skuCol") || "A",
    qty_col: localStorage.getItem("bytem_qtyCol") || "B",
    kaizntree_connected: lsGet("bytem_kaizntreeConnected", false),
    kaizntree_key: localStorage.getItem("bytem_kaizntreeKey") || "",
    max_per_txn: localStorage.getItem("bytem_maxPerTxn") || "10000",
    max_monthly: localStorage.getItem("bytem_maxMonthly") || "25000",
    approval_threshold: localStorage.getItem("bytem_approvalThreshold") || "5000",
    auto_approve: lsGet("bytem_autoApprove", true),
    suppliers: lsGet("bytem_suppliers", DEFAULT_SUPPLIERS),
    recipes: lsGet("bytem_recipes", []),
    last_po_cases: lsGet("bytem_lastPoCases", null),
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SettingsProvider({ children }) {
  // The user's email is the session key — stored in localStorage
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("bytem_user_email") || null);
  const [settings, setSettings] = useState(null);   // null = loading
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  // ------------------------------------------------------------------
  // Load settings from Supabase when we have an email
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!userEmail) return;

    async function load() {
      try {
        const res = await fetch(`/api/settings-get?email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        if (data.exists && data.settings) {
          // Supabase row found — use it
          const loaded = { ...DEFAULT_SETTINGS, ...data.settings };
          setSettings(loaded);
          // Update local cache
          lsSet("bytem_settings_cache", loaded);
        } else {
          // New user: try to migrate legacy localStorage data, else use defaults
          const legacy = migrateFromLegacyLocalStorage();
          const hasLegacyData = legacy.your_name || legacy.sheets_url || legacy.suppliers?.length > 3;
          const initial = hasLegacyData ? { ...DEFAULT_SETTINGS, ...legacy } : DEFAULT_SETTINGS;
          setSettings(initial);
          // Immediately persist to Supabase so the row exists
          await saveToSupabase(userEmail, initial);
        }
      } catch (err) {
        console.error("Failed to load settings from Supabase:", err);
        setLoadError(err.message);
        // Fall back to local cache or defaults
        const cached = lsGet("bytem_settings_cache", null);
        setSettings(cached || DEFAULT_SETTINGS);
      }
    }

    load();
  }, [userEmail]);

  // ------------------------------------------------------------------
  // Save helpers
  // ------------------------------------------------------------------

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
      console.error("Failed to save settings to Supabase:", err);
      return false;
    }
  }

  // Save a partial patch of settings
  const saveSettings = useCallback(
    async (patch) => {
      const merged = { ...settings, ...patch };
      setSettings(merged);                          // optimistic update
      lsSet("bytem_settings_cache", merged);        // local cache

      if (userEmail) {
        setSaving(true);
        await saveToSupabase(userEmail, merged);
        setSaving(false);
      }

      return merged;
    },
    [settings, userEmail]
  );

  // ------------------------------------------------------------------
  // Register a new user (called from Onboarding)
  // ------------------------------------------------------------------
  async function registerUser(email, initialSettings = {}) {
    localStorage.setItem("bytem_user_email", email);
    setUserEmail(email);

    const initial = { ...DEFAULT_SETTINGS, ...initialSettings };
    setSettings(initial);
    lsSet("bytem_settings_cache", initial);

    await saveToSupabase(email, initial);
  }

  // ------------------------------------------------------------------
  // Sign out (clear session, keep Supabase data)
  // ------------------------------------------------------------------
  function signOut() {
    localStorage.removeItem("bytem_user_email");
    localStorage.removeItem("bytem_settings_cache");
    setUserEmail(null);
    setSettings(null);
  }

  const value = {
    // Core state
    settings,
    saveSettings,
    loading: settings === null && userEmail !== null,
    loadError,
    saving,

    // Auth
    userEmail,
    registerUser,
    signOut,

    // Convenience getters (avoids optional chaining everywhere)
    get yourName() { return settings?.your_name || ""; },
    get companyName() { return settings?.company_name || ""; },
    get sheetsUrl() { return settings?.sheets_url || ""; },
    get suppliers() { return settings?.suppliers || DEFAULT_SUPPLIERS; },
    get recipes() { return settings?.recipes || []; },
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
