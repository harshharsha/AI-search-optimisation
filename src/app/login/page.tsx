"use client";

import { SubmitButton } from "@/src/components/submit-button";
import Link from "next/link";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const configured = Boolean(process.env.APP_PASSWORD);
  const production = process.env.NODE_ENV === "production";

  return (
    <main className="page login">
      <section className="hero">
        <h1 className="page-title">Sign in</h1>
      </section>

      {!configured ? (
        <>
          <p className="notice" role="status">
            {production
              ? "APP_PASSWORD is not set. Add it to .env and restart the server."
              : "Login is off in development because APP_PASSWORD is not set. Add it to .env to protect the app."}
          </p>
          {!production && (
            <p>
              <Link href="/" className="btn">
                Continue to the app
              </Link>
            </p>
          )}
        </>
      ) : (
        <>
          {error && (
            <p className="error" role="alert">
              Wrong password.
            </p>
          )}
          <form action={login} className="form">
            <input type="hidden" name="next" value={next ?? "/"} />
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </div>
            <div className="form-actions">
              <SubmitButton pendingText="Checking...">Sign in</SubmitButton>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
