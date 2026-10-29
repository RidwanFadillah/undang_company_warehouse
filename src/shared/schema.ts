import { z } from 'zod';

export const UserRoleSchema = z.enum(['owner', 'admin', 'viewer']);

export const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: UserRoleSchema,
  is_active: z.number().int().min(0).max(1),
  created_at: z.number().int(),
});

export const MeResponseSchema = z.object({
  user: z.object({
    id: z.number().int(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: UserRoleSchema,
  }),
});

export type UserRole = z.infer<typeof UserRoleSchema>;
export type User = z.infer<typeof UserSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
