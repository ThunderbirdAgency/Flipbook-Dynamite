/** Server configuration. Missing credentials must never enable public writes. */
export function configuration(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const authEnabled = Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY);
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const storageEnabled = Boolean(supabaseUrl && env.SUPABASE_SERVICE_ROLE_KEY);
  const localDemo = env.FLIPBOOK_LOCAL_DEMO === "true" &&
    env.NODE_ENV !== "production" && !env.VERCEL && !supabaseUrl &&
    !env.CLERK_SECRET_KEY && !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const issues: string[] = [];
  if (!localDemo) {
    if ((env.CRON_SECRET || "").length < 32) issues.push("CRON_SECRET must contain at least 32 characters");
    if ((env.FLIPBOOK_SECRET || "").length < 32) issues.push("FLIPBOOK_SECRET must contain at least 32 characters");
    if (!authEnabled) issues.push("Clerk sign-in is not configured");
    if (!storageEnabled) issues.push("Supabase server storage is not configured");
    try {
      if (new URL(env.NEXT_PUBLIC_APP_URL || "").protocol !== "https:") throw new Error();
    } catch { issues.push("NEXT_PUBLIC_APP_URL must be an HTTPS URL"); }
  }
  return { authEnabled, storageEnabled, supabaseUrl, localDemo, issues, ready: issues.length === 0 };
}
