"use client";

import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

export default function AccountControls({ enabled }: { enabled: boolean }) {
  const signedOut = (
    <>
      <Link
        href={enabled ? "/sign-in" : "/app"}
        className="rounded-full px-2 py-2 text-xs font-medium text-slate-200 transition hover:text-white sm:px-4 sm:text-sm"
      >
        Log in
      </Link>
      <Link
        href={enabled ? "/sign-up" : "/app"}
        className="whitespace-nowrap rounded-full bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-300 sm:px-4 sm:text-sm"
      >
        Start free
      </Link>
    </>
  );

  if (!enabled) return signedOut;
  return (
    <>
      <Show when="signed-out">{signedOut}</Show>
      <Show when="signed-in">
        <Link href="/app" className="whitespace-nowrap rounded-full px-2 py-2 text-xs font-medium text-slate-200 hover:text-white sm:px-4 sm:text-sm">
          Your library
        </Link>
        <UserButton />
      </Show>
    </>
  );
}
