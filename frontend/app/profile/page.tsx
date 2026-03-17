"use client";
import { useState, useEffect } from "react";
import { Save, User, CheckCircle2, LogOut, Sun, Moon } from "lucide-react";
import { useProfile } from "@/hooks/useApi";
import { userApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/ThemeProvider";
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "JPY"];

export default function ProfilePage() {
  const { data: profile, loading, refetch } = useProfile();
  const { user: authUser, signOut } = useAuth();
  const { isDark, toggle } = useTheme();

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Track original values to detect changes
  const [originalName, setOriginalName] = useState("");
  const [originalCurrency, setOriginalCurrency] = useState("INR");

  const hasChanges = name !== originalName || currency !== originalCurrency;

  useEffect(() => {
    if (profile) {
      const n = profile.name || "";
      const c = profile.currency || "INR";
      setName(n);
      setOriginalName(n);
      setCurrency(c);
      setOriginalCurrency(c);
    } else if (!loading && authUser) {
      const n = "";
      setName(n);
      setOriginalName(n);
    }
  }, [profile, loading, authUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await userApi.updateProfile({ name, currency });
      setOriginalName(name);
      setOriginalCurrency(currency);
      setSuccess(true);
      refetch();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    // AppShell handles redirect for email/password users; Cognito handles OAuth
  };

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton h-10 w-40 rounded-xl mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="skeleton h-56 rounded-2xl" />
          <div className="md:col-span-2 skeleton h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="page animate-fadeUp pb-24 lg:pb-8">
      <h1 className="page-title mb-1">Account Settings</h1>
      <p className="page-subtitle mb-8">Manage your profile and preferences</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile card */}
        <div className="card p-7 rounded-2xl flex flex-col items-center text-center">
          <div
            className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
            style={{
              background: "var(--mint-dim)",
              border: "3px solid var(--border)",
            }}
          >
            <User
              className="w-9 h-9"
              style={{ color: "var(--mint)" }}
              strokeWidth={1.5}
            />
          </div>
          <p
            className="text-lg font-black"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
          >
            {profile?.name || name || "—"}
          </p>
          <p className="text-sm mt-1 mb-3" style={{ color: "var(--muted)" }}>
            {profile?.email || "—"}
          </p>
          <span className="badge badge-credit gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
          <div
            className="w-full mt-6 pt-5"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--muted)" }}>Currency</span>
              <span className="font-semibold" style={{ color: "var(--text)" }}>
                {profile?.currency || currency}
              </span>
            </div>
          </div>

          {/* Theme toggle — visible on all screen sizes */}
          <div
            className="w-full mt-4 pt-4"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <button
              onClick={toggle}
              className="flex w-full items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--mint-dim)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--surface-2)")
              }
            >
              <span style={{ color: "var(--muted)" }}>Appearance</span>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {isDark ? "Dark" : "Light"}
                </span>
                {isDark ? (
                  <Sun className="w-4 h-4" style={{ color: "var(--mint)" }} />
                ) : (
                  <Moon className="w-4 h-4" style={{ color: "var(--muted)" }} />
                )}
              </div>
            </button>
          </div>

          {/* Sign out — visible on mobile only (lg:hidden), desktop has sidebar */}
          <div className="w-full mt-2 lg:hidden">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "var(--red-dim)", color: "var(--red)" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="md:col-span-2 card p-7 rounded-2xl">
          <h3
            className="font-black text-base mb-6"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
          >
            Personal Information
          </h3>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div className="alert-error">{error}</div>}
            {success && (
              <div className="alert-success flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Profile updated
                successfully.
              </div>
            )}

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-widest mb-1.5"
                style={{ color: "var(--muted)" }}
              >
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="fm-input rounded-xl"
                placeholder="Your name"
              />
            </div>

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-widest mb-1.5"
                style={{ color: "var(--muted)" }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={profile?.email ?? ""}
                disabled
                className="fm-input rounded-xl opacity-50 cursor-not-allowed"
              />
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                Email cannot be changed here.
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-widest mb-1.5"
                style={{ color: "var(--muted)" }}
              >
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="fm-input rounded-xl"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Save button only appears when there are unsaved changes */}
            {hasChanges && (
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary rounded-xl"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
