/** 书籍查询条件：列表 / 分页 / 后台筛选共用 */
export type BookFilter = {
  includeDrafts?: boolean;
  ownerId?: number;
  /** 按分类过滤，交给 SQL 做，避免整库书籍读进内存再筛 */
  category?: string;
  /** 按作者过滤 */
  author?: string;
  /** 关键词：书名 / 作者 / 链接，后台筛选用 */
  q?: string;
  /** 只看某个状态，后台筛选用；传了就不再按「只看已发布」处理 */
  status?: string;
};

/** books 的 WHERE 子句：列表、分页计数、按需取书共用 */
export function bookFilter(opts: BookFilter) {
  const conds: string[] = [];
  const binds: (string | number)[] = [];
  if (!opts.includeDrafts) conds.push("status = 'published'");
  if (opts.ownerId) {
    conds.push('owner_id = ?');
    binds.push(opts.ownerId);
  }
  if (opts.category) {
    conds.push('category = ?');
    binds.push(opts.category);
  }
  if (opts.author) {
    conds.push('author = ?');
    binds.push(opts.author);
  }
  if (opts.status) {
    conds.push('status = ?');
    binds.push(opts.status);
  }
  if (opts.q) {
    // 后台找书：书名、作者、链接任意命中即可
    conds.push('(title LIKE ? OR author LIKE ? OR slug LIKE ?)');
    const like = `%${opts.q}%`;
    binds.push(like, like, like);
  }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', binds };
}
