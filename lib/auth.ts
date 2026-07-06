import { auth } from "@clerk/nextjs/server";

// Auth switches on when Clerk keys are configured; without them the app runs
// in open mode (no sign-in, everything public) so local dev and preview
// deploys work with zero setup.
export const authEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

/** Clerk user id of the signed-in user, or null (signed out / open mode). */
export async function currentUserId(): Promise<string | null> {
  if (!authEnabled) return null;
  const { userId } = await auth();
  return userId;
}
