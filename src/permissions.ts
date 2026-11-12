import type { AppContext, Role, SessionUser } from './env';
import { currentPath } from './auth';

export type Cap =
  | 'admin.access'
  | 'book.create'
  | 'book.edit.any'
  | 'book.publish'
  | 'book.import'
  | 'discussion.review'
  | 'category.manage'
  | 'user.manage'
  | 'settings.site'
  | 'ops.view';

export const ROLE_LABELS: Record<Role, string> = {
  owner: '站长',
  editor: '编辑',
  author: '作者',
  reader: '读者',
};

export const ROLES: Role[] = ['owner', 'editor', 'author', 'reader'];

const CAPS: Record<Role, Cap[]> = {
  owner: [
    'admin.access',
    'book.create',
    'book.edit.any',
    'book.publish',
    'book.import',
    'discussion.review',
    'category.manage',
    'user.manage',
    'settings.site',
    'ops.view',
  ],
  editor: [
    'admin.access',
    'book.create',
    'book.edit.any',
    'book.publish',
    'book.import',
    'discussion.review',
    'category.manage',
  ],
  author: ['admin.access', 'book.create'],
  reader: [],
};

export function can(user: SessionUser | null, cap: Cap) {
  return !!user && CAPS[user.role].includes(cap);
}

export function isStaff(user: SessionUser | null | undefined) {
  return !!user && user.role !== 'reader';
}

/** 编辑/站长可改任意书；作者只能改自己名下的书 */
export function canEditBook(user: SessionUser | null, book: { ownerId: number | null }) {
  if (!user) return false;
  if (can(user, 'book.edit.any')) return true;
  return user.role === 'author' && book.ownerId === user.id;
}

type Ctx = AppContext;

/** 后台统一入口：未登录去登录页，读者 403 */
export function requireStaff() {
  return async (c: Ctx, next: () => Promise<void>) => {
    const user = c.get('user');
    if (!user) {
      return c.redirect(`/login?next=${encodeURIComponent(currentPath(c))}`);
    }
    if (!isStaff(user)) return c.text('403 · 需要后台权限', 403);
    await next();
  };
}

export function requireCap(cap: Cap) {
  return async (c: Ctx, next: () => Promise<void>) => {
    const user = c.get('user');
    if (!user) {
      return c.redirect(`/login?next=${encodeURIComponent(currentPath(c))}`);
    }
    if (!can(user, cap)) return c.text('403 · 没有这项权限', 403);
    await next();
  };
}
