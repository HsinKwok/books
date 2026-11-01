/**
 * 页码计算：前台列表、后台列表、后台讨论分页共用。
 */

export type Paging = {
  /** 实际生效的页码（超出范围会被夹到首/末页） */
  page: number;
  /** 总页数，至少 1 */
  pages: number;
  /** 传给 SQL 的 OFFSET */
  offset: number;
  /** 实际生效的每页条数 */
  perPage: number;
};

/** 夹取页码并算出总页数与偏移量 */
export function clampPage(rawPage: unknown, total: number, perPage: number): Paging {
  const size = Math.max(1, Math.trunc(perPage));
  const pages = Math.max(1, Math.ceil(total / size));
  const n = Math.trunc(Number(rawPage));
  const page = Math.min(Math.max(1, Number.isFinite(n) ? n : 1), pages);
  return { page, pages, offset: (page - 1) * size, perPage: size };
}
