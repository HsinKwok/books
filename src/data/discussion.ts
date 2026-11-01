export type Discussion = {
  name: string;
  date: string;
  body: string;
  likes: number;
};

const discussions: Record<string, Discussion[]> = {
  'fog-harbor:1': [
    {
      name: '阿川',
      date: '10月27日',
      body: '第一段那句「雾像一锅没煮开的水」，在地铁上读了两遍。写得真稳。',
      likes: 12,
    },
    {
      name: '晚风',
      date: '10月27日',
      body: '钟停在四点零七分，这个细节一出来我就知道后面要出事。作者很会埋。',
      likes: 8,
    },
    {
      name: '林间',
      date: '10月28日',
      body: '排版太舒服了，宋体、行距、两侧留白都刚刚好，一口气读完三章。',
      likes: 5,
    },
  ],
  'fog-harbor:2': [
    {
      name: '老周',
      date: '10月27日',
      body: '「钟不是坏了，是不想走」——这句话单独拎出来就能当一篇小说的题眼。',
      likes: 21,
    },
    {
      name: '阿川',
      date: '10月28日',
      body: '守钟人的设定比钟楼本身更有意思，期待后面解释他为什么每天走一圈。',
      likes: 6,
    },
  ],
  'long-night:1': [
    {
      name: '早睡失败',
      date: '10月22日',
      body: '用「每一道题换一小时的灯」来写燃料，这个换算比硬科幻解释更有说服力。',
      likes: 9,
    },
    {
      name: '南岸',
      date: '10月23日',
      body: '唯一不交答案的人在自己算出题的人是谁，这个开头我喜欢。',
      likes: 4,
    },
  ],
};

export function getDiscussions(slug: string, idx: number): Discussion[] {
  return discussions[`${slug}:${idx}`] ?? [];
}

export function countDiscussions(slug: string): number {
  return Object.entries(discussions)
    .filter(([key]) => key.startsWith(`${slug}:`))
    .reduce((sum, [, items]) => sum + items.length, 0);
}
