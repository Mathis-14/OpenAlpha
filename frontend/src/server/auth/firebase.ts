import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

function getFirebaseProjectId(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? null;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = header.slice(7).trim();
  return token || null;
}

export async function getFirebaseUserIdFromRequest(
  request: Request,
): Promise<string | null> {
  const token = getBearerToken(request);
  const projectId = getFirebaseProjectId();

  if (!token || !projectId) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    if (typeof payload.user_id === "string" && payload.user_id.trim()) {
      return payload.user_id;
    }

    if (typeof payload.sub === "string" && payload.sub.trim()) {
      return payload.sub;
    }

    return null;
  } catch {
    return null;
  }
}
