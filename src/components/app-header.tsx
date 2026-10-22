"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "../app/login/actions";

/** App-level header. Hidden on report and login pages, so a shared report shows no app navigation. */
export default function AppHeader({ showLogout }: { showLogout: boolean }) {
  const pathname = usePathname();
  if (
    pathname === "/login" ||
    pathname.startsWith("/r/") ||
    pathname.endsWith("/report")
  )
    return null;

  return (
    <header className="topbar">
      <Link href="/" className="wordmark">
        AISOA
      </Link>
      {showLogout && (
        <form action={logout}>
          <button type="submit" className="btn btn-small">
            Log out
          </button>
        </form>
      )}
    </header>
  );
}
