import type { D1Database, Fetcher } from '@cloudflare/workers-types';
import type { User } from '../shared/types';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENV?: string;
  DEV_AUTH_EMAIL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export interface Variables {
  user: User;
}
