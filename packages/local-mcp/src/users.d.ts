export type User = {
    id: string;
    username: string;
    telegramBotToken: string | null;
};
export declare function createUser(username: string, password: string): Promise<User>;
export declare function verifyUser(username: string, password: string): Promise<User | null>;
export declare function getUserById(id: string): User | null;
export declare function setTelegramBotToken(userId: string, botToken: string): void;
