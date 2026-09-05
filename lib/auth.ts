import { configuration } from "./config";
import { AppError } from "./errors";

// Missing keys never enable a shared production library. The explicit demo
// switch works only without cloud storage, outside production and Vercel.
export const authEnabled = configuration().authEnabled;

/** Clerk user id of the signed-in user, or null (signed out / open mode). */
export async function currentUserId(): Promise<string | null> {
  if (configuration().localDemo) return "local-demo";
  if (!authEnabled) return null;
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return userId;
}

export function requireConfiguration() {
  if (!configuration().ready) throw new AppError(503, "Flipbook Dynamite is being set up. Please try again later.");
}

export async function requireUserId(): Promise<string> {
  requireConfiguration();
  if (configuration().localDemo) return "local-demo";
  const userId = await currentUserId();
  if (!userId) throw new AppError(401, "Sign in to manage your flipbooks");
  return userId;
}
