export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
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
