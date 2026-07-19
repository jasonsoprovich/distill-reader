import { and, desc, eq } from "drizzle-orm";
import { apiCredential, type db as DbInstance } from "@distill/db";
import type { CredentialProviderKind } from "@distill/shared";
import { decryptSecret } from "./crypto.js";
import type { ResolvedCredential } from "./summary/types.js";

type Db = typeof DbInstance;

// `api_credential` has no uniqueness constraint on (user_id, provider) — a
// user may hold multiple labeled keys for the same provider. v1 resolves
// the most recently added one; a later phase can let a request/setting
// target a specific credential id if that ambiguity becomes a problem.
export async function resolveCredential(
  db: Db,
  userId: string,
  provider: CredentialProviderKind,
): Promise<ResolvedCredential | null> {
  const [row] = await db
    .select()
    .from(apiCredential)
    .where(and(eq(apiCredential.userId, userId), eq(apiCredential.provider, provider)))
    .orderBy(desc(apiCredential.createdAt))
    .limit(1);
  if (!row) return null;

  return {
    apiKey: row.secretEncrypted ? decryptSecret(row.secretEncrypted) : null,
    baseUrl: row.baseUrl,
    viaRelay: row.viaRelay,
  };
}
