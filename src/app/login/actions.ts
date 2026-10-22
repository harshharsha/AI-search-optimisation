"use server";

import {
  COOKIE_NAME,
  createSession,
  safeEqual,
  SESSION_MS,
} from "@/src/lib/auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

const safeNext = (n: string) =>
  n.startsWith("/") && !n.startsWith("//") ? n : "/";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));
  const expected = process.env.APP_PASSWORD;

  if (!expected || !safeEqual(password, expected)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    redirect(
      `/login?error=1${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`,
    );
  }

  const jar = await cookies();
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  jar.set(COOKIE_NAME, await createSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
  redirect(next);
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  redirect("/login");
}
