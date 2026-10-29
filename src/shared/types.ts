export type UserRole = 'owner' | 'admin' | 'viewer';

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  is_active: number;
  created_at: number;
}

export interface ApiError {
  error: {
    code:
      | 'VALIDATION'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'FORBIDDEN'
      | 'UNAUTHORIZED'
      | 'LIMIT'
      | 'INTERNAL_ERROR';
    message: string;
    details?: unknown;
  };
}
