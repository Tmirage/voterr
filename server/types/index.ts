import type { Request } from 'express';
import type { Session, SessionData } from 'express-session';

export function getBody<T>(req: Request): T {
  return req.body as T;
}

declare module 'express-session' {
  interface SessionData {
    userId?: number | undefined;
    isAdmin?: boolean | undefined;
    isAppAdmin?: boolean | undefined;
    csrfToken?: string | undefined;
    setupPlexPinId?: number | undefined;
    setupPlexCode?: string | undefined;
    setupPlexToken?: string | undefined;
    setupPlexUser?:
      | {
          id: string;
          username: string;
          email: string;
          thumb: string;
        }
      | undefined;
    guestInviteToken?: string | undefined;
    guestName?: string | undefined;
    isLocalInvite?: boolean | undefined;
    localInviteMovieNightId?: number | undefined;
    isLocal?: boolean | undefined;
    plexPinId?: number | undefined;
    plexCode?: string | undefined;
  }
}

export interface AuthenticatedRequest extends Request {
  session: Session & SessionData;
}
