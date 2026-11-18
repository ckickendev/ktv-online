import { UserRole } from '@ktv/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        displayName?: string | null;
        avatar?: string | null;
        bio?: string | null;
        role: UserRole;
        familyId?: string;
      };
      cookies?: Record<string, string>;
    }
  }
}

export {};
