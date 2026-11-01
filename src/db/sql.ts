/**
 * SQL 小工具：占位符与分块查询。
 * D1 单条语句最多 100 个绑定参数，IN (...) 和 batch 都要按块切。
 */

/** 生成 n 个逗号分隔的占位符，例如 3 -> "?, ?, ?" */
export function placeholders(n: number): string {
  return new Array(n).fill('?').join(', ');
}

/** 按 size 切块依次执行，把结果摊平；items 为空时返回空数组 */
export async function eachChunk<T, R>(
  items: T[],
  size: number,
  run: (chunk: T[]) => Promise<R[]>,
): Promise<R[]> {
  const out: R[] = [];
  const step = Math.max(1, Math.trunc(size));
  for (let i = 0; i < items.length; i += step) {
    out.push(...(await run(items.slice(i, i + step))));
  }
  return out;
}

/** 批量接口默认分块大小：留一个参数余量给其他条件 */
export const CHUNK_SIZE = 99;

/** 按 size 切成若干块；拼 db.batch 语句数组时用这个同步版本 */
export function chunk<T>(items: T[], size = CHUNK_SIZE): T[][] {
  const step = Math.max(1, Math.trunc(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}
