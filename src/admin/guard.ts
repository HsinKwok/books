import type { AdminContext } from './shared';
import { batchIds, isCrossSite, readJson } from './shared';

/**
 * 批量接口统一守卫：跨站校验 + JSON 解析 + id 列表规整。
 * 返回 Response 表示已经被拒绝，调用方直接 return。
 */
export async function readBatch(
  c: AdminContext,
  key: 'ids' | 'idxs' = 'ids',
): Promise<{ body: Record<string, unknown>; ids: number[] } | Response> {
  if (isCrossSite(c)) return c.json({ ok: false, error: 'cross-site' }, 403);
  const body = await readJson(c);
  if (!body) return c.json({ ok: false, error: 'bad-json' }, 400);
  const ids = batchIds(body[key]);
  if (!ids.length) return c.json({ ok: false, error: 'empty' }, 400);
  return { body, ids };
}
