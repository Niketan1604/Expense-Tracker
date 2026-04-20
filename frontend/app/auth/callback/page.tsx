"use client";
import { useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { fetchAuthSession, signInWithRedirect } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { userApi } from "@/lib/api";
import { useRouter } from 'next/navigation'

type AuthResult = "success" | "failure";

let resolveAuth: (result: AuthResult) => void;
const authComplete = new Promise<AuthResult>((resolve) => {
  resolveAuth = resolve;
});

Hub.listen("auth", ({ payload }) => {
  if (payload.event === "signedIn") resolveAuth("success");
  if (payload.event === "signInWithRedirect_failure") resolveAuth("failure");
});

export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);
  const [status, setStatus] = useState("Completing sign-in…");

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const run = async () => {
      try {
        await signInWithRedirect();
      } catch {
        // Expected — Amplify throws when it detects we're already in a callback
        // The token exchange still completes and Hub fires signedIn
      }

      let pollHandle: ReturnType<typeof setInterval>;
      let attempts = 0;
      const pollPromise = new Promise<AuthResult>((resolve) => {
        pollHandle = setInterval(async () => {
          attempts++;
          try {
            const session = await fetchAuthSession();
            if (session?.tokens?.idToken) {
              clearInterval(pollHandle);
              resolve("success");
            }
          } catch {
            /* not ready yet */
          }
          if (attempts >= 20) {
            clearInterval(pollHandle);
            resolve("failure");
          }
        }, 500);
      });

      const result = await Promise.race([authComplete, pollPromise]);
      clearInterval(pollHandle!);

      if (result === "success") {
        await bootstrapProfile();
        router.replace("/");
      } else {
        setStatus("Sign in failed. Redirecting…");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      }
    };

    run();
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center bg-mint-500"
          style={{ boxShadow: "0 8px 24px rgba(16,183,127,0.3)" }}
        >
          <Wallet className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        <div
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{
            borderColor: "var(--border)",
            borderTopColor: "var(--mint)",
          }}
        />
        <div>
          <p
            className="text-base font-semibold"
            style={{ color: "var(--text)" }}
          >
            Signing you in…
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {status}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// bootstrapProfile — called once after every OAuth sign-in.
//
// 1. Reads the real display name from the Cognito ID token claims.
//    For Google sign-in, Cognito maps the Google 'name' claim → token 'name'.
//    authUser.username is the internal Cognito username (google_XXXX) — never
//    use that as a display name.
//
// 2. GET /user/profile first:
//    - 404  → first login, PUT to create profile with name + default currency
//    - 200  → profile already exists, skip (don't overwrite user's edits)
// ---------------------------------------------------------------------------
async function bootstrapProfile() {
  try {
    // Pull the real name from the ID token payload
    const session = await fetchAuthSession();
    const claims = session.tokens?.idToken?.payload as
      | Record<string, string>
      | undefined;
    // 'name' is the standard OIDC claim — populated by Google via Cognito attribute mapping
    const name = claims?.["name"] || claims?.["email"]?.split("@")[0] || "User";
    const currency = "INR"; // sensible default; user can change in profile settings

    try {
      await userApi.getProfile();
      // Profile exists — user has logged in before, leave their data untouched
    } catch {
      // 404 or any error → profile doesn't exist yet, create it
      await userApi.updateProfile({ name, currency });
    }
  } catch {
    // Non-fatal — profile bootstrap failing should never block the user
    // They can set their name manually from the profile page
  }
}
