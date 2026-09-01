import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { authEnabled } from "@/lib/auth";
import { Wordmark } from "@/components/SiteChrome";

export const metadata = { title: "Log in — Flipbook Dynamite" };

export default function SignInPage() {
  // Open mode has no accounts — drop straight into the app.
  if (!authEnabled) redirect("/app");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 px-6 py-16">
      <Wordmark />
      <SignIn fallbackRedirectUrl="/app" signUpUrl="/sign-up" />
    </div>
  );
}
