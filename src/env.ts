import type { Context } from 'hono';

export type Role = 'owner' | 'editor' | 'author' | 'reader';

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
};

export type Env = {
  DB: D1Database;
  /** 可选：配置了 R2 才启用封面上传，否则只能用外链 */
  COVERS?: R2Bucket;
};

export type Variables = {
  user: SessionUser | null;
};

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
