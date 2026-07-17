/**
 * Hashes a code_verifier the same way a spec-compliant client does,
 * so we can compare it against the code_challenge stored earlier.
 *
 * Used in: /token endpoint, right before issuing an access token.
 */
export declare function verifyPkce(codeVerifier: string, storedCodeChallenge: string): Promise<boolean>;
