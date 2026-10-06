/**
 * 系统字体按字重拆开展示。
 * 只列字体族时，同一族的常规 / 粗体 / 细体会合成一项，浏览器再按 font-weight 挑一款；
 * 不少中文字体的字重元数据并不准确，结果会偏粗或偏细。
 * 多字重族改为「族名 + 字重」，并用 @font-face local() 锁到具体 PostScript / 全名。
 */

export type RawSystemFontFace = {
  family: string;
  /** 样式名，如 Regular、Bold Italic、W3、常规 */
  style: string;
  postscriptName: string;
  /** 额外的 local() 候选（全名、本地化「族名 样式」） */
  localNames: string[];
  /** 同族内排序；各平台量纲可以不同 */
  weight: number;
  italic: boolean;
};

export type ListedSystemFont = {
  /** 列表展示名，同时作为 CSS font-family */
  name: string;
  /**
   * 非空时注入 @font-face，用这些名字做 local()。
   * 空数组表示只有一款，直接用族名，与旧行为一致。
   */
  locals: string[];
};

type ListedInternal = ListedSystemFont & {
  family: string;
  rank: number;
  italic: boolean;
};

const WEIGHT_WORDS: Record<string, { zh: string; rank: number }> = {
  hairline: { zh: "极细", rank: 100 },
  ultralight: { zh: "极细", rank: 120 },
  ultrathin: { zh: "极细", rank: 120 },
  thin: { zh: "纤细", rank: 150 },
  extralight: { zh: "特细", rank: 200 },
  light: { zh: "细体", rank: 300 },
  regular: { zh: "常规", rank: 400 },
  normal: { zh: "常规", rank: 400 },
  roman: { zh: "常规", rank: 400 },
  book: { zh: "常规", rank: 400 },
  medium: { zh: "中黑", rank: 500 },
  semibold: { zh: "中粗", rank: 600 },
  demibold: { zh: "中粗", rank: 600 },
  bold: { zh: "粗体", rank: 700 },
  extrabold: { zh: "特粗", rank: 800 },
  ultrabold: { zh: "特粗", rank: 800 },
  heavy: { zh: "特粗", rank: 850 },
  black: { zh: "超粗", rank: 900 },
};

const WIDTH_WORDS: Record<string, string> = {
  condensed: "窄体",
  narrow: "窄体",
  semicondensed: "窄体",
  extracondensed: "窄体",
  ultracondensed: "窄体",
  expanded: "宽体",
  extended: "宽体",
  semiexpanded: "宽体",
  extraexpanded: "宽体",
  ultraexpanded: "宽体",
};

const ITALIC_WORDS = new Set(["italic", "oblique"]);

const ZH_RANKS: readonly [string, number][] = [
  ["极细", 100],
  ["超细", 120],
  ["纤细", 150],
  ["特细", 200],
  ["细体", 300],
  ["常规", 400],
  ["标准", 400],
  ["正常", 400],
  ["中等", 500],
  ["中黑", 500],
  ["半粗", 600],
  ["中粗", 600],
  ["粗体", 700],
  ["特粗", 850],
  ["超粗", 900],
  ["浓黑", 900],
];

function quoteCssFamily(name: string): string {
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function combineStyleTokens(style: string): string[] {
  const parts = style
    .split(/[\s_+-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i]!.toLowerCase();
    const next = parts[i + 1]?.toLowerCase();
    if (
      next &&
      (cur === "extra" || cur === "ultra" || cur === "semi" || cur === "demi")
    ) {
      out.push(cur + next);
      i++;
      continue;
    }
    out.push(parts[i]!);
  }
  return out;
}

function chineseStyleRank(style: string, weight: number): number {
  let best = 0;
  for (const [word, rank] of ZH_RANKS) {
    if (style.includes(word) && rank > best) best = rank;
  }
  return best || (weight > 0 ? weight : 400);
}

function styleSuffix(
  style: string,
  italic: boolean,
  weight: number,
): { text: string; rank: number } {
  const trimmed = style.trim();
  const appendItalic = (text: string): string => {
    if (!italic) return text;
    if (/斜|italic|oblique/i.test(text)) return text;
    return text ? `${text} 斜体` : "斜体";
  };

  if (!trimmed) {
    return { text: italic ? "斜体" : "", rank: 400 };
  }
  if (hasCjk(trimmed)) {
    return {
      text: appendItalic(trimmed),
      rank: chineseStyleRank(trimmed, weight),
    };
  }

  const tokens = combineStyleTokens(trimmed);
  const widths: string[] = [];
  const weights: { text: string; rank: number }[] = [];
  let sawItalic = false;
  for (const token of tokens) {
    const key = token.toLowerCase().replace(/-/g, "");
    if (ITALIC_WORDS.has(key)) {
      sawItalic = true;
      continue;
    }
    const width = WIDTH_WORDS[key];
    if (width) {
      if (!widths.includes(width)) widths.push(width);
      continue;
    }
    const mapped = WEIGHT_WORDS[key];
    if (mapped) {
      weights.push({ text: mapped.zh, rank: mapped.rank });
      continue;
    }
    return {
      text: appendItalic(trimmed),
      rank: weight > 0 ? weight : 400,
    };
  }

  weights.sort((a, b) => a.rank - b.rank);
  const rank = weights.length > 0 ? weights[weights.length - 1]!.rank : 400;
  const pieces = [
    ...widths,
    ...weights.map((item) => item.text),
  ];
  if (sawItalic || italic) pieces.push("斜体");
  return { text: pieces.join(" "), rank };
}

function normalizeFace(face: RawSystemFontFace): RawSystemFontFace | null {
  if (!face || typeof face.family !== "string") return null;
  const family = face.family.trim();
  if (!family || family.startsWith(".")) return null;
  const localNames = Array.isArray(face.localNames)
    ? face.localNames.filter((name): name is string => typeof name === "string")
    : [];
  return {
    family,
    style: typeof face.style === "string" ? face.style.trim() : "",
    postscriptName:
      typeof face.postscriptName === "string" ? face.postscriptName.trim() : "",
    localNames,
    weight:
      typeof face.weight === "number" && Number.isFinite(face.weight)
        ? face.weight
        : 0,
    italic: Boolean(face.italic),
  };
}

function faceLocals(face: RawSystemFontFace): string[] {
  const out: string[] = [];
  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === face.family || out.includes(trimmed)) return;
    out.push(trimmed);
  };
  add(face.postscriptName);
  for (const name of face.localNames) add(name);
  // 具体字重名解析失败时，仍落到该族，而不是换成完全无关的字体
  if (out.length > 0) out.push(face.family);
  return out;
}

function dedupeFaces(faces: RawSystemFontFace[]): RawSystemFontFace[] {
  const seen = new Set<string>();
  const out: RawSystemFontFace[] = [];
  for (const face of faces) {
    const key =
      face.postscriptName ||
      `${face.style.toLowerCase()}|${face.italic ? 1 : 0}|${face.weight}|${face.localNames.join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(face);
  }
  return out;
}

function familyEntry(family: string): ListedInternal {
  return { name: family, locals: [], family, rank: 0, italic: false };
}

export function familyNamesToRawFaces(names: string[]): RawSystemFontFace[] {
  const seen = new Set<string>();
  const out: RawSystemFontFace[] = [];
  for (const name of names) {
    const family = name.trim();
    if (!family || seen.has(family)) continue;
    seen.add(family);
    out.push({
      family,
      style: "",
      postscriptName: "",
      localNames: [],
      weight: 0,
      italic: false,
    });
  }
  return out;
}

export function buildListedSystemFonts(
  raw: readonly RawSystemFontFace[],
): ListedSystemFont[] {
  const groups = new Map<string, RawSystemFontFace[]>();
  for (const item of raw) {
    const face = normalizeFace(item);
    if (!face) continue;
    const list = groups.get(face.family);
    if (list) list.push(face);
    else groups.set(face.family, [face]);
  }

  const listed: ListedInternal[] = [];
  for (const [family, faces] of groups) {
    const unique = dedupeFaces(faces);
    if (unique.length <= 1) {
      listed.push(familyEntry(family));
      continue;
    }
    const pinned: ListedInternal[] = [];
    for (const face of unique) {
      const locals = faceLocals(face);
      if (locals.length === 0) continue;
      const suffix = styleSuffix(face.style, face.italic, face.weight);
      if (!suffix.text) continue;
      pinned.push({
        name: `${family} ${suffix.text}`,
        locals,
        family,
        rank: suffix.rank,
        italic: face.italic || /斜/.test(suffix.text),
      });
    }
    if (pinned.length <= 1) {
      listed.push(familyEntry(family));
      continue;
    }
    listed.push(...pinned);
  }

  const counts = new Map<string, number>();
  for (const item of listed) {
    counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  for (const item of listed) {
    if ((counts.get(item.name) ?? 0) < 2) continue;
    const n = (seen.get(item.name) ?? 0) + 1;
    seen.set(item.name, n);
    const tag = item.locals[0] || String(n);
    item.name = `${item.name} (${tag})`;
  }

  listed.sort((a, b) => {
    const byFamily = a.family.localeCompare(b.family, "zh-Hans-CN");
    if (byFamily !== 0) return byFamily;
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.italic !== b.italic) return a.italic ? 1 : -1;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  return listed.map(({ name, locals }) => ({ name, locals }));
}

/**
 * 只声明 font-weight: normal，阅读器的常规字重命中这一款；
 * 摸鱼「加粗」仍可在这款上做合成粗体，而不会跳到族里另一款。
 */
export function buildSystemFontFaceCss(fonts: readonly ListedSystemFont[]): string {
  const rules: string[] = [];
  for (const font of fonts) {
    if (font.locals.length === 0) continue;
    const src = font.locals
      .map((name) => `local(${quoteCssFamily(name)})`)
      .join(",");
    rules.push(
      `@font-face{font-family:${quoteCssFamily(font.name)};src:${src};font-weight:normal;font-style:normal;font-display:swap;}`,
    );
  }
  return rules.join("\n");
}
