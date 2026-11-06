export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: string;
}

export interface AuthSessionResponse {
  user: {
    id: string;
    username: string;
    email: string;
    avatar?: string | null;
    role: string;
  };
  tokens: AuthTokens;
}

export type AuthResult =
  | { success: true; data: AuthSessionResponse }
  | { success: false; error: 'INVALID_CREDENTIALS' | 'ACCOUNT_INACTIVE' };

export type RefreshResult =
  | { success: true; tokens: AuthTokens & { refreshToken: string } }
  | { success: false; error: 'INVALID_TOKEN' | 'REPLAY_DETECTED' | 'ACCOUNT_INACTIVE' };
