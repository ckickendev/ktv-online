import { UserRole } from '@ktv/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: UserRole;
      };
      cookies?: Record<string, string>;
    }
  }
}

export {};
