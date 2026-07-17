export declare function createAuthorizationCode(params: {
    userId: string;
    codeChallenge: string;
    redirectUri: string;
}): string;
export declare function consumeAuthorizationCode(code: string): {
    userId: string;
    codeChallenge: string;
    redirectUri: string;
} | null;
export declare function createAccessToken(userId: string): {
    token: string;
    expiresIn: number;
};
export declare function validateAccessToken(token: string): {
    userId: string;
} | null;
