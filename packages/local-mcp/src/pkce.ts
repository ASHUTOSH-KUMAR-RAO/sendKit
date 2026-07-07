
// =============================================================================
// PKCE (Proof Key for Code Exchange) — RFC 7636
// =============================================================================
// WHY PKCE EXISTS:
// In a normal OAuth flow, a malicious app could intercept the
// "authorization code" (step 4 in our flow) while it's being redirected back
// to the client, and then exchange THAT code for an access token itself —
// impersonating the real client.
//
// PKCE fixes this by requiring the client to prove it's the SAME app that
// started the flow, using a secret only it knows.
//
// -----------------------------------------------------------------------
// HOW IT WORKS (matches our numbered flow from the explanation):
//
// 1. Client generates a random secret string: `code_verifier`
//    (kept secret, never sent until the final step)
//
// 2. Client hashes it: `code_challenge = base64url(sha256(code_verifier))`
//    and sends ONLY this hash to /authorize (step 1 of our flow)
//
// 3. Server stores `code_challenge` alongside the authorization code
//    it generates (step 4 of our flow)
//
// 4. When the client calls /token (step 5), it sends the ORIGINAL
//    `code_verifier` (not the hash)
//
// 5. Server hashes the received `code_verifier` the same way, and checks:
//        sha256(code_verifier) === stored code_challenge ?
//    If yes -> proves this is the same client that started the flow ->
//    issue the access token (step 6).
//    If no  -> reject. Someone is trying to steal the authorization code.
// =============================================================================

/**
 * Hashes a code_verifier the same way a spec-compliant client does,
 * so we can compare it against the code_challenge stored earlier.
 *
 * Used in: /token endpoint, right before issuing an access token.
 */
export async function verifyPkce(
  codeVerifier: string,
  storedCodeChallenge: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);

  // SHA-256 hash of the verifier (Web Crypto API — built into Bun/Node)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert the hash to base64url (PKCE spec requires base64url, not
  // regular base64 — no +, /, or = padding characters)
  const hashArray = new Uint8Array(hashBuffer);
  let binary = "";
  for (const byte of hashArray) {
    binary += String.fromCharCode(byte);
  }
  const computedChallenge = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return computedChallenge === storedCodeChallenge;
}
