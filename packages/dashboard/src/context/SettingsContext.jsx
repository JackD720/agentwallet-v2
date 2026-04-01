// src/context/SettingsContext.jsx
// v2.5 changes:
// - DEFAULT_SUPPLIERS = [] (no hardcoded Hershey's etc for new users)
// - Added ingredient_col, price_col, inventory_col, header_row fields

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const SettingsContext = createContext(null);

// No default suppliers — new users start fresh and add their own
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
  suppliers: [],   // ← empty, not hardcoded defaults
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
    ingredient_col: "B",
    price_col: "C",
    inventory_col: "F",
    header_row: "4",
    kaizntree_connected: lsGet("bytem_kaizntreeConnected", false),
    kaizntree_key: localStorage.getItem("bytem_kaizntreeKey") || "",
    max_per_txn: localStorage.getItem("bytem_maxPerTxn") || "10000",
    max_monthly: localStorage.getItem("bytem_maxMonthly") || "25000",
    approval_threshold: localStorage.getItem("bytem_approvalThreshold") || "5000",
    auto_approve: lsGet("bytem_autoApprove", true),
    // Only migrate legacy suppliers if they were user-customized (more than 3 or different)
    suppliers: lsGet("bytem_suppliers", []),
    recipes: lsGet("bytem_recipes", []),
    last_po_cases: lsGet("bytem_lastPoCases", null),
  };
}

export function SettingsProvider({ children }) {
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("bytem_user_email") || null);
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userEmail) return;

    async function load() {
      try {
        const res = await fetch(`/api/settings-get?email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (data.exists && data.settings) {
          const loaded = { ...DEFAULT_SETTINGS, ...data.settings };
          setSettings(loaded);
          lsSet("bytem_settings_cache", loaded);
        } else {
          const legacy = migrateFromLegacyLocalStorage();
          const hasLegacyData = legacy.your_name || legacy.sheets_url;
          const initial = hasLegacyData ? { ...DEFAULT_SETTINGS, ...legacy } : DEFAULT_SETTINGS;
          setSettings(initial);
          await saveToSupabase(userEmail, initial);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
        setLoadError(err.message);
        const cached = lsGet("bytem_settings_cache", null);
        setSettings(cached || DEFAULT_SETTINGS);
      }
    }

    load();
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

  async function registerUser(email, initialSettings = {}) {
    localStorage.setItem("bytem_user_email", email);
    setUserEmail(email);
    const initial = { ...DEFAULT_SETTINGS, ...initialSettings };
    setSettings(initial);
    lsSet("bytem_settings_cache", initial);
    await saveToSupabase(email, initial);
  }

  // Force a fresh load from Supabase (used after OAuth redirects)
  async function refreshSettings() {
    if (!userEmail) return;
    try {
      const res = await fetch(`/api/settings-get?email=${encodeURIComponent(userEmail)}`);
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
    registerUser,
    signOut,
    refreshSettings,
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
