import { z } from 'zod';
import type { Env } from '../config/env.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export const GOOGLE_STATE_COOKIE = 'vl_gs';
export const GOOGLE_STATE_TTL_MS = 10 * 60_000;

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleAuth {
  configured: boolean;
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleProfile>;
}

const tokenSchema = z.object({ access_token: z.string().min(1) });

const profileSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

export function createGoogleAuth(env: Env): GoogleAuth {
  const configured = Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI,
  );

  const requireConfig = () => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI)
      throw new Error('Google OAuth is not configured');
    return {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    };
  };

  return {
    configured,
    authorizationUrl(state) {
      const { clientId, redirectUri } = requireConfig();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
        access_type: 'online',
      });
      return `${AUTH_URL}?${params.toString()}`;
    },
    async exchangeCode(code) {
      const { clientId, clientSecret, redirectUri } = requireConfig();
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status})`);
      const token = tokenSchema.parse(await tokenRes.json());

      const infoRes = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!infoRes.ok) throw new Error(`Google profile fetch failed (${infoRes.status})`);
      const info = profileSchema.parse(await infoRes.json());
      return {
        sub: info.sub,
        email: info.email.toLowerCase(),
        emailVerified: info.email_verified === true,
        name: info.name?.slice(0, 80) || info.email.split('@')[0] || 'Google user',
      };
    },
  };
}
