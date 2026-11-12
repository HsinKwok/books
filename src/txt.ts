import { countWords, normalizeBody } from './db';

export type ParsedChapter = { title: string; body: string; words: number };
export type ParsedVolume = { title: string; intro: string; chapters: ParsedChapter[] };

/** auto：先按标题切，认不出标题再按字数切；headings：只按标题；size：只按字数 */
export type SplitMode = 'auto' | 'headings' | 'size';

export type SplitOptions = { mode?: SplitMode; chunkChars?: number };

export type SplitResult = {
  volumes: ParsedVolume[];
  chapters: ParsedChapter[];
  /** 给后台的提示，比如「没有识别到章节标题，已按每 3000 字切分」 */
  note?: string;
  error?: string;
};

const MAX_LENGTH = 5_000_000;

/** 标题行整体长度上限，正文里「第N章……」的长句子靠这个挡掉 */
const TITLE_LINE_MAX = 40;
/** 序号后面还能跟多少字的标题 */
const TITLE_TAIL_MAX = 24;
/** 卷标题通常比章标题更短 */
const VOLUME_TAIL_MAX = 16;
/** 序章 / 番外 这类固定标题后面最多跟几个字 */
const SPECIAL_TAIL_MAX = 12;
/** 带标点的候选标题最多允许比上一章大多少（容忍 TXT 里漏了几章） */
const SEQUENCE_GAP_MAX = 3;

/** 按字数切分时每节的默认 / 最小 / 最大字数 */
export const DEFAULT_CHUNK = 3000;
const CHUNK_MIN = 500;
const CHUNK_MAX = 20_000;

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
const NUM = '0-9０-９零〇一二三四五六七八九十百千万两';

/** 序号和标题之间的分隔符单独捕获，用来区分「第一章 中国风」和「第一章的内容」 */
const GAP = '[\\s:：、.·—-]*';

/** 「第一卷」「第 12 卷 风起」「卷一」；组 2 是分隔符，组 3 是标题 */
const VOLUME = new RegExp(
  `^(?:正文[\\s:：、.·—-]*)?(?:第\\s*)?([${NUM}]+)\\s*卷(${GAP})(.*)$`,
);

/** 「第一章」「第 12 节 风起」；组 3 是分隔符，组 4 是标题 */
const CHAPTER = new RegExp(
  `^(?:正文[\\s:：、.·—-]*)?第\\s*([${NUM}]+)\\s*([章节回篇])(${GAP})(.*)$`,
);

/** 「Chapter 3」；组 2 是分隔符，组 3 是标题 */
const CHAPTER_EN = new RegExp(`^Chapter\\s+(\\d+)(${GAP})(.*)$`, 'i');

/** 「12」「12.」「12、标题」这种纯数字标题 */
const NUMBERED = /^(\d{1,4})\s*(?:[.、:：]\s*(.*))?$/;

/** 「一、」「二、标题」这种中文序号标题 */
const CN_NUMBERED = new RegExp(`^([${NUM}]{1,6})\\s*[、.]\\s*(.*)$`);

/** 序章 / 楔子 / 番外 这类固定标题 */
const SPECIAL =
  /^(序章|序幕|序言|自序|楔子|引子|引言|前言|后记|尾声|终章|完本感言|作者的话|番外篇?|外传|序)(?:[\s:：、.·—-]+(.*))?$/;

/** 句号 / 分号只会出现在正文句子里，标题里基本不用，见到就按正文处理 */
const BODY_PUNCT = /[。；;]/;
/** 标题可以用问号 / 感叹号 / 省略号收尾，后面还可能跟着引号、括号 */
const TITLE_TAIL_PUNCT = /[？！!?…～~]+["'”’」』）)】》]*$/;
/** 标题中间不该出现的问号 / 感叹号：它们只能留在行尾 */
const INLINE_PUNCT = /[？！!?]/;
/** 直接以问号 / 感叹号收尾的行：既可能是标题，也可能是一句正文（「第二章 他为什么不告而别？」） */
const SENTENCE_TAIL = /[？！!?…～~]$/;

/**
 * 标点是否像标题：问号感叹号只许出现在行尾。
 * 不满足的行不会被直接丢弃，而是标成宽松候选，
 * 交给 parseHeadings 用序号是否接得上做最终判断，
 * 所以「第一百章 谁？是谁？」这种中段带标点的标题也不会漏。
 */
function punctFitsTitle(text: string) {
  const tail = TITLE_TAIL_PUNCT.exec(text);
  return !INLINE_PUNCT.test(tail ? text.slice(0, tail.index) : text);
}

/** loose：只有忽略标点才成立的候选，必须靠序号序列确认 */
type Marker = { kind: 'volume' | 'chapter'; no: number | null; title: string; loose: boolean };
type Block = { title: string; lines: string[] };
type VolumeBlock = { title: string; lines: string[]; chapters: Block[] };

/** 一条标题规则：正则里哪个分组是序号、哪个是标题，标题最多多长 */
type HeadingRule = {
  re: RegExp;
  kind: Marker['kind'];
  /** 标题所在分组 */
  tail: number;
  /** 标题字数上限 */
  max: number;
  /** 序号所在分组，不填表示这类标题没有序号（序章 / 番外） */
  no?: number;
  /** 分隔符所在分组，命中说明序号和标题之间确实断开了 */
  gap?: number;
  /** 没有分隔符分组时，是否按「有分隔」处理 */
  spaced?: boolean;
  /** 序号解析方式，默认按中文数字 */
  parse?: (raw: string) => number | null;
};

/** 中文数字 / 全角数字 / 阿拉伯数字统一转成整数，认不出返回 null */
function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  // 全角数字先转半角
  const normalized = text.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  if (/^\d+$/.test(normalized)) return Number(normalized);

  let total = 0;
  let section = 0;
  let digit = 0;
  let seen = false;

  for (const char of normalized) {
    const value = CN_DIGIT[char];
    if (value !== undefined) {
      digit = value;
      seen = true;
      continue;
    }
    const unit = CN_UNIT[char];
    if (unit === undefined) return null;
    seen = true;
    if (unit === 10000) {
      section = (section + digit) * unit;
      total += section;
      section = 0;
    } else {
      section += (digit || 1) * unit;
    }
    digit = 0;
  }

  return seen ? total + section + digit : null;
}

/**
 * 序号后面的部分像不像标题。
 * 正文里「第一章的内容」「第三卷第三章」这类引用，靠这里的规则排除掉。
 */
function titleLike(tailRaw: string | undefined, max: number, spaced = false) {
  const tail = (tailRaw ?? '').trim();
  if (tail.length > max) return false;
  if (!tail) return true;
  // 「第一章的内容他都记得」这类句子；序号和正文之间有空格的除外，
  // 否则「第五百八十七章 中国风歌曲」这种以「中」开头的标题会被误杀
  if (!spaced && /^[的中里内]/.test(tail)) return false;
  // 序号后面直接跟逗号，是正文在提章节（「第三章，他转身离开」）
  if (/^[，,、；;]/.test(tail)) return false;
  // 「第三卷第三章」，本质是正文在引用章节
  if (new RegExp(`^第\\s*[${NUM}]+\\s*[章卷回节篇]`).test(tail)) return false;
  return true;
}

/** 按顺序匹配，先命中的规则生效 */
const HEADING_RULES: HeadingRule[] = [
  { re: VOLUME, kind: 'volume', no: 1, gap: 2, tail: 3, max: VOLUME_TAIL_MAX, parse: parseNumber },
  { re: CHAPTER, kind: 'chapter', no: 1, gap: 3, tail: 4, max: TITLE_TAIL_MAX, parse: parseNumber },
  { re: CHAPTER_EN, kind: 'chapter', no: 1, gap: 2, tail: 3, max: TITLE_TAIL_MAX, parse: Number },
  // 「12 标题」「一、标题」这种本身就以分隔符断句，标题可以以任意字开头
  { re: NUMBERED, kind: 'chapter', no: 1, tail: 2, max: VOLUME_TAIL_MAX, spaced: true, parse: Number },
  {
    re: CN_NUMBERED,
    kind: 'chapter',
    no: 1,
    tail: 2,
    max: VOLUME_TAIL_MAX,
    spaced: true,
    parse: parseNumber,
  },
  // 序章 / 番外 没有序号，后面直接跟正文的话更像句子
  { re: SPECIAL, kind: 'chapter', tail: 2, max: SPECIAL_TAIL_MAX },
];

/** 标题行的首字只可能是这几类；先用它挡掉绝大多数正文行，再跑 6 条规则 */
const HEADING_HEAD = new RegExp(`^(?:正文|第|[${NUM}]|[序楔引前后尾终完作番外]|chapter)`, 'i');

/** 一行是否构成章节 / 卷标题；不像就不返回，正文原样保留 */
function headingOf(line: string): Marker | null {
  const text = line.trim();
  if (!text || text.length > TITLE_LINE_MAX) return null;
  if (BODY_PUNCT.test(text)) return null;
  if (!HEADING_HEAD.test(text)) return null;
  const loose = !punctFitsTitle(text);

  for (const rule of HEADING_RULES) {
    const match = rule.re.exec(text);
    if (!match) continue;
    const spaced = rule.gap === undefined ? rule.spaced === true : !!match[rule.gap];
    if (!titleLike(match[rule.tail], rule.max, spaced)) continue;
    const no = rule.no === undefined ? null : (rule.parse ?? parseNumber)(match[rule.no]);
    return { kind: rule.kind, no, title: text, loose };
  }
  return null;
}

function clampChunk(value?: number) {
  if (!value || !Number.isFinite(value)) return DEFAULT_CHUNK;
  return Math.min(CHUNK_MAX, Math.max(CHUNK_MIN, Math.round(value)));
}

/** 全文有没有空行——有，说明这份 TXT 是靠空行分段的 */
const hasBlankLine = (lines: string[]) => lines.some((line) => !line.trim());

/** 把若干行拼成规范化的正文；空行只为分段服务，不保留 */
function bodyOf(lines: string[]) {
  return normalizeBody(lines.filter((line) => line.trim()).join('\n\n'));
}

/** 正文 + 字数，章节对象统一从这里生成 */
function makeChapter(title: string, body: string): ParsedChapter {
  return { title, body, words: countWords(body) };
}

/** 这一行前后有没有空行（文件开头 / 结尾也算有空行） */
function blankAround(lines: string[], index: number) {
  return {
    before: index === 0 || !lines[index - 1].trim(),
    after: index + 1 >= lines.length || !lines[index + 1].trim(),
  };
}

/** 按空行分段；没有空行的 TXT 里，每一行就是一段 */
function paragraphsOf(lines: string[]) {
  if (!hasBlankLine(lines)) return lines.map((line) => line.trim()).filter(Boolean);

  const out: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('').trim();
    if (text) out.push(text);
    buffer = [];
  };
  for (const line of lines) {
    if (line.trim()) buffer.push(line.trim());
    else flush();
  }
  flush();
  return out;
}

/** 超长段落按句末标点切开，实在找不到标点就在上限处硬切 */
function splitLong(text: string, limit: number) {
  const out: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const matches = [...window.matchAll(/[。！？…；!?;]["'”’」』）)]*/g)];
    const last = matches[matches.length - 1];
    let cut = last ? (last.index ?? 0) + last[0].length : 0;
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/** 没有章节标题时的兜底：按段落凑到每节字数上限，标题用「第 N 节」 */
function sizeChapters(lines: string[], limit: number): ParsedChapter[] {
  const paragraphs = paragraphsOf(lines).flatMap((p) => (p.length > limit ? splitLong(p, limit) : [p]));
  const chunks: string[] = [];
  let buffer: string[] = [];
  let size = 0;

  for (const paragraph of paragraphs) {
    if (size && size + paragraph.length > limit) {
      chunks.push(buffer.join('\n\n'));
      buffer = [];
      size = 0;
    }
    buffer.push(paragraph);
    size += paragraph.length;
  }
  if (buffer.length) chunks.push(buffer.join('\n\n'));

  return chunks
    .map((text, i) => {
      const body = normalizeBody(text);
      return makeChapter(`第 ${i + 1} 节`, body);
    })
    .filter((chapter) => chapter.body);
}

/** 下一行非空文本的行号，没有返回 -1 */
function firstNonBlank(lines: string[], from: number) {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i].trim()) return i;
  }
  return -1;
}

/**
 * 卷标题的判断要更严：真正的卷标题后面一定跟着章节标题，
 * 而正文里提到的「第三卷」后面接的是句子。宁可漏认一个卷（只影响分组），
 * 也不要把正文切成假的卷。
 */
function volumeFits(
  lines: string[],
  index: number,
  markers: (Marker | null)[],
  nextChapter: Int32Array,
  nextVolume: Int32Array,
) {
  const chapterAt = nextChapter[index + 1];
  const volumeAt = nextVolume[index + 1];
  if (chapterAt === -1) return false;
  if (volumeAt !== -1 && volumeAt < chapterAt) return false;

  // 前后有空行，说明这行是独立成行的标题
  const { before, after } = blankAround(lines, index);
  if (before || after) return true;

  // 没空行时，下一行直接是章节标题也算
  const nextLine = firstNonBlank(lines, index + 1);
  return nextLine !== -1 && markers[nextLine]?.kind === 'chapter';
}

/**
 * 标题行是否独立成行（前后有空行），且后面跟的是正文而不是另一个标题。
 * TXT 里章节编号写错（618 写成 518）或重号时，靠这条把标题和正文里的引用区分开。
 */
function standalone(lines: string[], index: number, markers: (Marker | null)[]) {
  const { before, after } = blankAround(lines, index);
  if (!before && !after) return false;
  const next = firstNonBlank(lines, index + 1);
  // 后面已经没有内容了（文件以标题结尾），也算独立成行
  return next === -1 || !markers[next];
}

/**
 * 扫描全文，把「像标题」的行挑出来。
 * 关键：标题必须成序列（第三章后面才可能有第四章），正文里偶发的「第N章」因此被挡在正文里。
 */
function parseHeadings(lines: string[]) {
  const volumes: VolumeBlock[] = [];
  const loose: Block[] = [];
  const preface: string[] = [];

  const markers = lines.map(headingOf);
  // 文件本身用空行分段时，标题行才谈得上「独立成行」；每行一段的 TXT 不能要求这个
  const blankSeparated = hasBlankLine(lines);
  const nextChapter = new Int32Array(lines.length + 1).fill(-1);
  const nextVolume = new Int32Array(lines.length + 1).fill(-1);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    nextChapter[i] = markers[i]?.kind === 'chapter' ? i : nextChapter[i + 1];
    nextVolume[i] = markers[i]?.kind === 'volume' ? i : nextVolume[i + 1];
  }

  let volume: VolumeBlock | null = null;
  let chapter: Block | null = null;
  let lastVolumeNo = 0;
  let lastChapterNo = 0;
  let chapterChars = 0; // 当前章节已有多少正文
  let volumeChars = 0; // 当前卷已有多少正文

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const marker = markers[i];

    if (marker?.kind === 'volume') {
      const no = marker.no;
      // 序号递增才算新卷；上一卷还是空的（比如目录里连排卷名）允许重新计数
      const next = no !== null && no > lastVolumeNo;
      const restart = volume !== null && volumeChars === 0;
      // 全书第一个卷必须是第一卷，否则更像正文里提到的卷名
      const opener = no === null || no === 1;
      // 带标点的卷标题只能靠序号接上：首卷，或紧接上一卷
      const chained = !marker.loose || lastVolumeNo === 0 || no === lastVolumeNo + 1;
      const accepted = chained && (next || restart || lastVolumeNo === 0) && (lastVolumeNo !== 0 || opener);
      if (accepted && volumeFits(lines, i, markers, nextChapter, nextVolume)) {
        volume = { title: marker.title, lines: [], chapters: [] };
        volumes.push(volume);
        lastVolumeNo = no ?? lastVolumeNo + 1;
        lastChapterNo = 0;
        chapter = null;
        chapterChars = 0;
        volumeChars = 0;
        continue;
      }
    } else if (marker?.kind === 'chapter') {
      const no = marker.no;
      // 分部之后从第一章重新开始
      const restart = no === 1 && chapterChars > 1500;
      // 标题独立成行，且后面跟的是正文
      const isolated = standalone(lines, i, markers);
      // 源文件编号写错（618 标成 518）或重号：独立成行的标题照样当新章，不能整段吞掉
      const reissue = chapterChars > 0 && isolated;
      // 结构约束：文件本来用空行分段时，以问号 / 感叹号收尾的行
      // 也可能是句子（「第二章 他为什么不告而别？」），必须独立成行才算标题
      const shaped = isolated || !blankSeparated || !SENTENCE_TAIL.test(marker.title);
      // 带标点的候选只能靠序号链接上：首章、紧接上一章、或文件里漏了几章。
      // 序号对不上的（正文里提到的「第三百章的时候……」）照旧留在正文里
      const chained =
        !marker.loose ||
        (no === null
          ? isolated
          : restart ||
            chapterChars === 0 ||
            (no > lastChapterNo && no - lastChapterNo <= SEQUENCE_GAP_MAX));
      // 序号只能往前走，除非是重新开头的章节、或回退过的独立标题
      const ahead = no === null || no > lastChapterNo || chapterChars === 0 || restart || reissue;
      if (shaped && chained && ahead) {
        chapter = { title: marker.title, lines: [] };
        (volume ? volume.chapters : loose).push(chapter);
        if (no !== null) lastChapterNo = no;
        chapterChars = 0;
        continue;
      }
    }

    // 不像标题，按正文收下
    const length = line.trim().length;
    if (chapter) {
      chapter.lines.push(line);
      chapterChars += length;
      volumeChars += length;
    } else if (volume) {
      volume.lines.push(line);
      volumeChars += length;
    } else {
      preface.push(line);
    }
  }

  return { volumes, loose, preface };
}

function toChapter(block: Block): ParsedChapter | null {
  const body = bodyOf(block.lines);
  return body ? makeChapter(block.title, body) : null;
}

export function splitChapters(raw: string, options: SplitOptions = {}): SplitResult {
  if (!raw.trim()) return { volumes: [], chapters: [], error: '文本是空的。' };
  if (raw.length > MAX_LENGTH) {
    return { volumes: [], chapters: [], error: '文本太大了（上限 500 万字）。' };
  }

  const text = raw.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const lines = text.split('\n');
  const mode = options.mode ?? 'auto';
  const chunk = clampChunk(options.chunkChars);

  /** 按字数切分；prefix 用来区分主动选择还是认不到标题的兜底 */
  const bySize = (prefix: string): SplitResult => {
    const chapters = sizeChapters(lines, chunk);
    if (!chapters.length) return { volumes: [], chapters: [], error: '没有可导入的正文。' };
    return {
      volumes: [],
      chapters,
      note: `${prefix}已按每 ${chunk} 字切分为 ${chapters.length} 节。`,
    };
  };

  /** 没有可用标题时，整段正文当一章 */
  const wholeText = (): SplitResult => {
    const body = bodyOf(lines);
    if (!body) return { volumes: [], chapters: [], error: '没有可导入的正文。' };
    return { volumes: [], chapters: [makeChapter('正文', body)] };
  };

  if (mode === 'size') return bySize('');

  const blocks = parseHeadings(lines);
  const headingCount = countParsedChapters(blocks.volumes, blocks.loose);

  // 一个标题都没认出来
  if (!headingCount) {
    return mode === 'headings' ? wholeText() : bySize('没有识别到章节标题，');
  }

  const volumes: ParsedVolume[] = [];
  for (const block of blocks.volumes) {
    const chapters = block.chapters
      .map(toChapter)
      .filter((chapter): chapter is ParsedChapter => chapter !== null);
    const intro = bodyOf(block.lines);

    if (chapters.length) {
      volumes.push({ title: block.title, intro, chapters });
    } else if (intro) {
      // 卷名下面没有章节标题：整卷正文当一章，至少不丢内容
      volumes.push({
        title: block.title,
        intro: '',
        chapters: [makeChapter(block.title || '正文', intro)],
      });
    }
  }

  const chapters: ParsedChapter[] = [];
  // 第一个标题之前的内容单独成「序」
  const preface = bodyOf(blocks.preface);
  if ((volumes.length || blocks.loose.length) && preface) {
    chapters.push(makeChapter('序', preface));
  }
  for (const block of blocks.loose) {
    const chapter = toChapter(block);
    if (chapter) chapters.push(chapter);
  }

  // 有标题但标题下面全是空的，整段当一章
  if (!volumes.length && !chapters.length) return wholeText();

  return { volumes, chapters };
}

/**
 * 导入是「预览 → 提交」两次请求，原文会原样再传一次：
 * 留一份最近的切分结果，提交时直接复用，不再把整本书重切一遍。
 * 只留一条，key 用长度 + 首尾片段（比整篇哈希便宜，两次提交必然一致）。
 */
let lastSplit: { key: string; at: number; result: SplitResult } | null = null;
const SPLIT_TTL = 10 * 60_000;

export function splitChaptersCached(raw: string, options: SplitOptions = {}): SplitResult {
  const key = `${options.mode ?? 'auto'}:${options.chunkChars ?? DEFAULT_CHUNK}:${raw.length}:${raw.slice(0, 64)}:${raw.slice(-64)}`;
  if (lastSplit && lastSplit.key === key && Date.now() - lastSplit.at < SPLIT_TTL) {
    return lastSplit.result;
  }
  const result = splitChapters(raw, options);
  lastSplit = { key, at: Date.now(), result };
  return result;
}

/** 入库后立刻释放，避免一本大书的切分结果长期占着内存 */
export function releaseSplitCache() {
  lastSplit = null;
}

/** 卷和未归卷章节加起来一共多少章 */
export function countParsedChapters(
  volumes: readonly { chapters: readonly unknown[] }[],
  chapters: readonly unknown[],
) {
  return volumes.reduce((n, volume) => n + volume.chapters.length, 0) + chapters.length;
}
