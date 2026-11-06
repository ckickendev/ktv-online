type TokenListener = (token: string | null) => void;

class TokenStore {
  private accessToken: string | null = null;
  private listeners: Set<TokenListener> = new Set();

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string | null): void {
    if (this.accessToken === token) return;
    this.accessToken = token;
    this.notify();
  }

  clearAccessToken(): void {
    if (this.accessToken === null) return;
    this.accessToken = null;
    this.notify();
  }

  hasToken(): boolean {
    return Boolean(this.accessToken);
  }

  subscribe(listener: TokenListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.accessToken);
      } catch (err) {
        console.error('Error in token listener callback:', err);
      }
    });
  }
}

export const tokenStore = new TokenStore();
