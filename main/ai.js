'use strict';

const SYSTEM_PROMPT = `你是一位严谨的中英双语词典编辑，同时也研究词源与技术史。服务对象是中文母语的英语学习者。
用户会给你一个英文单词、短语或句子。请先判断类型，然后只输出一个 JSON 对象（不要 markdown 代码块、不要任何解释）。

如果是领域术语、概念、行业缩写（中文或英文，如「幂等性」「VMI」「安全左移」），输出：
{
  "kind": "term",
  "word": "术语原样（保留中英文原样）",
  "phonetic": "",
  "pos": "术语",
  "meaning_zh": "准确、简洁的定义（2 句以内）",
  "definition_en": "对应的英文说法，没有就给空字符串",
  "examples": [
    { "en": "该术语在这个领域的典型用法例句（可为中文语境的英文表达）", "zh": "中文翻译" }
  ],
  "synonyms": ["相近术语或说法，最多 4 个"],
  "collocations": ["这个术语常见的搭配场景，最多 4 个"],
  "memory": "一句话说清楚为什么它重要：不搞懂它会在什么场合吃亏",
  "note": "最常见的误解或易混概念，没有就给空字符串",
  "origin": {
    "root": "概念出处：谁提出的、源自哪个领域、何时流行；不确定就写「资料有限」",
    "first_use": "",
    "story": "3 到 5 句中文，讲清楚这个概念的来龙去脉：解决什么问题、如何演变、现状",
    "timeline": [
      { "when": "时期", "what": "当时的含义或标志性事件" }
    ],
    "scenes": ["在这个领域里，它通常出现在什么场景", "和外行理解相比，内行怎么用"],
    "why": "值得注意的辨析：容易和什么概念混淆、关键差别是什么",
    "related": ["周边概念，最多 4 个"]
  },
  "followups": ["围绕这个术语的短问题", "围绕用法的短问题", "围绕相关概念的短问题"]
}

如果是单词或短语，输出：
{
  "kind": "word",
  "word": "词条原形（普通单词用小写；专有名词、品牌名、技术产品名保留原大小写；短语保留原样；如果是变形，还原为原形）",
  "phonetic": "通用 IPA 音标，带斜杠，如 /juːˈbɪkwɪtəs/；短语可为空",
  "pos": "词性缩写，如 adj. / n. / v. / phr.",
  "meaning_zh": "简洁准确的中文释义，多义项用分号分隔，按常用度排序",
  "definition_en": "A concise English definition",
  "examples": [
    { "en": "英文例句", "zh": "中文翻译" }
  ],
  "synonyms": ["近义词或近义表达，最多 4 个"],
  "collocations": ["常见搭配或短语，最多 4 个"],
  "memory": "一句中文记忆法（词根词缀、联想、易错点），没有就给空字符串",
  "note": "语体、易混词、使用提醒等，没有就给空字符串",
  "origin": {
    "root": "词源 / 构词：来自哪种语言、由哪些词根词缀构成。例如「拉丁语 ubique（到处）+ -ous」",
    "first_use": "这个词最早出现或进入英语的大致时期、最初使用的领域；不确定就写「资料有限」",
    "story": "3 到 5 句中文，讲清楚从源头到今天的语义演变。技术词要说明它怎样进入该领域、含义发生过什么变化",
    "timeline": [
      { "when": "16世纪", "what": "当时指什么、在什么语境使用" }
    ],
    "scenes": ["在……领域 / 语境里，它通常指……", "容易和……混淆，差别是……"],
    "why": "为什么值得知道：常见误解、技术语境中的关键差别、使用边界。没有就给空字符串",
    "related": ["相关词、词根或概念，最多 4 个"]
  },
  "followups": ["围绕词义辨析的短问题", "围绕用法或搭配的短问题", "围绕词源或技术背景的短问题"]
}

如果是句子，输出：
{
  "kind": "sentence",
  "word": "原句（保持用户输入，去掉首尾空白）",
  "sentence_translation": "准确、自然的中文翻译",
  "key_points": ["语法、结构或语气要点，2 到 4 条，中文"],
  "key_words": [
    { "word": "句中的关键词或短语", "meaning": "它在本句中的意思" }
  ],
  "note": "文化背景、隐含语气或使用场景，没有就给空字符串",
  "origin": {
    "root": "这句话的出处 / 语境：技术文档、口语、新闻、文学作品等；不确定就写「资料有限」",
    "first_use": "",
    "story": "2 到 4 句中文，说明这句话背后的语境、说话人想表达什么、常见于什么场景",
    "timeline": [],
    "scenes": ["这句话常见于……", "换成更口语的说法是……"],
    "why": "值得注意的语气、歧义或文化背景",
    "related": ["相关表达或语法点，最多 4 个"]
  },
  "followups": ["围绕语法的短问题", "围绕词义的短问题", "围绕语境的短问题"]
}

硬性要求：
1. examples 给 2 条，覆盖最常见的用法；释义贴合当代英语。
2. origin 只写有把握的内容。不确定就明确写「资料有限」或「一说」，绝对不要编造年份、人名、典故或词源。
3. 技术术语的 origin.story 要讲清楚它在专业语境里怎么被使用，而不只是普通词义。
4. followups 给 3 条，每条不超过 24 个字，必须是用户真的会想问的问题。
5. 正文里可以用 **加粗** 标出关键对比或易混点，每个字段最多 1 处；不要用标题、表格或代码块。
6. 术语（kind 为 term）的解释要贴合用户声明或最贴近的学习方向。
7. 只输出 JSON。所有中文内容使用简体中文。`;

const NOTE_PROMPT = `你是「秒记」的整理助手。用户会给你一段随手记下的想法或摘录（可能很口语、没有结构）。
请只做轻整理，**绝对不要改写用户的观点或语气**，也不要补充用户没说的内容。
输出一个 JSON 对象：
{
  "kind": "note",
  "word": "不超过 20 字的标题，概括这段笔记在讲什么",
  "summary": "2 句以内，忠实复述这段话的核心；保留用户的关键说法",
  "key_points": ["从原文里提炼的要点，可加少量结构化，最多 5 条"],
  "terms": [
    { "word": "原文里值得学习的英文词/术语（如果原文是中文，给对应的英文说法）", "meaning": "在这段话里它指什么" }
  ],
  "note": "如果发现逻辑跳跃或未展开的地方，用一句话指出，没有就给空字符串",
  "followups": ["围绕这段笔记的短问题，最多 3 条，每条不超过 24 字"],
  "track": "最贴近的学习方向名称；用户没有设定方向或都不贴近就给空字符串"
}
要求：只输出 JSON；中文用简体；terms 最多 8 个，没有就给空数组。`;

const LOOKUP_PROMPT = `你是「秒记」的中英表达助手。用户想表达一个中文概念，但不确定英文怎么说。
用户会给你中文内容（可能是一个词、一句想说的话、一个概念）。请给出最自然、最贴切的英文表达。
输出一个 JSON 对象：
{
  "kind": "lookup",
  "word": "最推荐的英文表达（单词或短语）",
  "phonetic": "IPA 音标，带斜杠；短语可为空",
  "pos": "词性缩写",
  "meaning_zh": "这个英文表达准确的中文含义，以及它和中文原意的贴合点",
  "definition_en": "A concise English definition",
  "alternatives": [
    { "en": "另一个候选表达", "nuance": "和首选表达的差别：语体、正式程度、使用场合" }
  ],
  "examples": [
    { "en": "英文例句", "zh": "中文翻译" }
  ],
  "collocations": ["常见搭配，最多 4 个"],
  "memory": "一句话说清楚怎么记住或怎么区分这几个候选",
  "note": "容易用错的地方；没有就给空字符串",
  "followups": ["围绕用法的短问题，最多 3 条"],
  "track": "最贴近的学习方向名称；没有给空字符串"
}
要求：alternatives 给 1 到 3 个，必须说明差别；examples 给 2 条；只输出 JSON；中文用简体。`;

const CLIP_PROMPT = `你是「秒记」的阅读助手。用户会给你一个网页的标题、网址和正文。请只根据正文内容输出一个 JSON 对象：
{
  "kind": "clip",
  "word": "文章标题（沿用原标题，不要改写）",
  "summary": "3 到 5 句中文摘要：这篇文章在讲什么、核心观点是什么",
  "key_points": ["3 到 5 条关键信息，每条一句中文"],
  "terms": [
    { "word": "文中出现的值得学习的英文词/术语（原文是中文就给对应英文）", "meaning": "它在这篇文章里的意思" }
  ],
  "note": "文章最重要的一个判断或提醒，一句中文；没有就给空字符串",
  "followups": ["围绕文章的短问题，最多 3 条，每条不超过 24 字"],
  "track": "最贴近的学习方向名称；没有给空字符串"
}
要求：terms 最多 12 个，优先选对理解全文关键的术语，不要选常见词；不要编造正文里没有的内容；只输出 JSON；中文用简体。`;

const FOLLOWUP_PROMPT = `你是「秒记」的英语词典助教。用户正在追问一个已经记录过的词条或句子。
你会收到词条上下文和之前的追问记录。请基于这些内容回答当前问题。
要求：
- 用简体中文，先直接回答，再补充 1 个例句或 1 组对比；不要整段重复原词条。
- 回答控制在 180 字以内；确实需要展开时最多 260 字。
- 可以用换行分段，需要列举时用「- 」开头的短列表；可以用 **加粗** 标出关键差别，整个回答最多 2 处。
- 不编造词源、年份或用法；不确定就说明。
- 不要使用标题、表格、代码块或 HTML。
- 只输出一个 JSON 对象，不要 markdown 代码块：
{ "answer": "回答正文，可用换行分段", "suggestions": ["接下来可能想问的短问题", "……", "……"] }
suggestions 给 2 到 3 条，每条不超过 24 个字。`;

function extractJson(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 返回的内容不是有效 JSON');
  }
  return JSON.parse(s.slice(start, end + 1));
}

async function callChat(messages, config, { maxTokens = 1500, temperature = 0.2, json = true } = {}) {
  const apiKey = String(config.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('还没有填写 DeepSeek API Key。打开「设置」填入后即可使用。');
  }

  const base = String(config.baseUrl || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';

  const body = {
    model: String(config.model || 'deepseek-chat').trim() || 'deepseek-chat',
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false
  };
  if (json) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') throw new Error('请求超时（60 秒），请检查网络后重试');
    throw new Error('无法连接接口：' + (err && err.message ? err.message : String(err)));
  }
  clearTimeout(timer);

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const apiMsg = data && data.error && (data.error.message || data.error.code);
    const hint =
      res.status === 401 ? ' API Key 无效，请检查设置。' :
      res.status === 402 ? ' 账户余额不足。' :
      res.status === 429 ? ' 请求太频繁，稍后再试。' :
      res.status >= 500 ? ' 接口服务异常，稍后再试。' : '';
    throw new Error(`接口返回 ${res.status}：${apiMsg || text.slice(0, 160)}${hint}`);
  }
  if (!data) throw new Error('接口返回内容无法解析');

  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('接口没有返回内容');
  return content;
}

function cleanStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function cleanArr(v) {
  return Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : [];
}

function strList(v, limit) {
  return cleanArr(v)
    .map((x) => {
      if (typeof x === 'string') return x.trim();
      if (x && typeof x === 'object') return cleanStr(x.word || x.term || x.text || x.question || x.scene);
      return '';
    })
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeOrigin(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const timeline = cleanArr(o.timeline)
    .map((t) => {
      if (typeof t === 'string') return { when: '', what: t.trim() };
      if (t && typeof t === 'object') return { when: cleanStr(t.when || t.time), what: cleanStr(t.what || t.text) };
      return null;
    })
    .filter((t) => t && (t.when || t.what))
    .slice(0, 6);

  return {
    root: cleanStr(o.root),
    first_use: cleanStr(o.first_use || o.firstUse),
    story: cleanStr(o.story),
    timeline,
    scenes: strList(o.scenes, 4),
    why: cleanStr(o.why),
    related: strList(o.related, 6)
  };
}

function normalizeEntry(raw, inputText) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 返回的内容格式不正确，请重试');

  const kind = raw.kind === 'sentence' ? 'sentence' : raw.kind === 'term' ? 'term' : 'word';
  const word = cleanStr(raw.word) || String(inputText || '').trim();

  const examples = cleanArr(raw.examples)
    .map((x) => {
      if (typeof x === 'string') return { en: x.trim(), zh: '' };
      if (x && typeof x === 'object') return { en: cleanStr(x.en), zh: cleanStr(x.zh) };
      return null;
    })
    .filter((x) => x && x.en)
    .slice(0, 4);

  const keyWords = cleanArr(raw.key_words)
    .map((x) => {
      if (typeof x === 'string') return { word: x.trim(), meaning: '' };
      if (x && typeof x === 'object') return { word: cleanStr(x.word), meaning: cleanStr(x.meaning) };
      return null;
    })
    .filter((x) => x && x.word)
    .slice(0, 10);

  const entry = {
    kind,
    word,
    phonetic: cleanStr(raw.phonetic),
    pos: cleanStr(raw.pos),
    meaning_zh: cleanStr(raw.meaning_zh),
    definition_en: cleanStr(raw.definition_en),
    examples,
    synonyms: strList(raw.synonyms, 6),
    collocations: strList(raw.collocations, 6),
    memory: cleanStr(raw.memory),
    note: cleanStr(raw.note),
    sentence_translation: cleanStr(raw.sentence_translation),
    key_points: strList(raw.key_points, 6),
    key_words: keyWords,
    origin: normalizeOrigin(raw.origin),
    followups: strList(raw.followups, 4),
    track: cleanStr(raw.track)
  };

  if (!entry.word) throw new Error('AI 没有识别出词条内容，请重试');
  if (kind === 'term' && !entry.meaning_zh) {
    throw new Error('AI 没有返回术语定义，请重试');
  }
  if (kind === 'word' && !entry.meaning_zh) {
    throw new Error('AI 没有返回释义，请重试');
  }
  if (kind === 'sentence' && !entry.sentence_translation) {
    throw new Error('AI 没有返回翻译，请重试');
  }
  return entry;
}

/* ---------------- 剪藏 / 闪念 / 中文反查 ---------------- */

function normalizeTerms(raw) {
  return cleanArr(raw)
    .map((t) => {
      if (typeof t === 'string') return { word: t.trim(), meaning: '' };
      if (t && typeof t === 'object') return { word: cleanStr(t.word || t.term), meaning: cleanStr(t.meaning) };
      return null;
    })
    .filter((t) => t && t.word)
    .slice(0, 12);
}

function normalizeClip(raw, page) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 返回的内容格式不正确，请重试');
  return {
    kind: 'clip',
    word: cleanStr(raw.word) || page.title || page.site,
    summary: cleanStr(raw.summary),
    key_points: strList(raw.key_points, 6),
    terms: normalizeTerms(raw.terms),
    note: cleanStr(raw.note),
    followups: strList(raw.followups, 4),
    track: cleanStr(raw.track),
    source: {
      type: 'url',
      url: page.url,
      title: page.title,
      site: page.site,
      capturedAt: new Date().toISOString()
    },
    original: page.text,
    phonetic: '',
    pos: '',
    meaning_zh: '',
    examples: [],
    synonyms: [],
    collocations: [],
    memory: '',
    origin: normalizeOrigin(null)
  };
}

function normalizeNote(raw, text) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 返回的内容格式不正确，请重试');
  return {
    kind: 'note',
    word: cleanStr(raw.word) || String(text || '').trim().slice(0, 20),
    summary: cleanStr(raw.summary),
    key_points: strList(raw.key_points, 6),
    terms: normalizeTerms(raw.terms),
    note: cleanStr(raw.note),
    followups: strList(raw.followups, 4),
    track: cleanStr(raw.track),
    source: { type: 'manual', url: '', title: '', site: '', capturedAt: new Date().toISOString() },
    original: String(text || '').trim(),
    phonetic: '',
    pos: '',
    meaning_zh: '',
    examples: [],
    synonyms: [],
    collocations: [],
    memory: '',
    origin: normalizeOrigin(null)
  };
}

function normalizeLookup(raw, text) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 返回的内容格式不正确，请重试');
  const alternatives = cleanArr(raw.alternatives)
    .map((a) => {
      if (typeof a === 'string') return { en: a.trim(), nuance: '' };
      if (a && typeof a === 'object') return { en: cleanStr(a.en), nuance: cleanStr(a.nuance) };
      return null;
    })
    .filter((a) => a && a.en)
    .slice(0, 4);
  const entry = normalizeEntry(
    {
      kind: 'word',
      word: cleanStr(raw.word) || String(text || '').trim(),
      phonetic: raw.phonetic,
      pos: raw.pos,
      meaning_zh: raw.meaning_zh,
      definition_en: raw.definition_en,
      examples: raw.examples,
      synonyms: Array.isArray(raw.alternatives) ? [] : raw.synonyms,
      collocations: raw.collocations,
      memory: raw.memory,
      note: raw.note,
      followups: raw.followups,
      track: raw.track
    },
    text
  );
  entry.kind = 'lookup';
  entry.alternatives = alternatives;
  entry.lookup_zh = String(text || '').trim();
  return entry;
}

/**
 * 把用户的学习方向注入提示词：AI 按「track」字段建议归属，并贴合领域语境解释。
 */
function withTrackContext(trackNames) {
  const names = (Array.isArray(trackNames) ? trackNames : []).filter(Boolean);
  if (!names.length) return '';
  return [
    '',
    `用户正在学习这些方向：${names.join('、')}。`,
    `判断这个输入最贴近哪个方向，在输出里加一个字段 "track"，值为上面的方向名称之一；都不贴切就给空字符串。`,
    `解释内容请优先贴合该领域的语境和用法；同一个词在不同领域含义不同（如 port 在网络里是端口、物流里是港口），必须按所属领域解释。`
  ].join('\n');
}

async function askDeepSeek(text, config) {
  const trackNames = Array.isArray(config.tracks) ? config.tracks.map((t) => t.name) : [];
  if (process.env.MIAOJI_MOCK === '1') {
    await new Promise((r) => setTimeout(r, 600));
    return mockEntry(text);
  }
  const content = await callChat(
    [
      { role: 'system', content: SYSTEM_PROMPT + withTrackContext(trackNames) },
      { role: 'user', content: String(text).trim() }
    ],
    config,
    { maxTokens: 2200, temperature: 0.2, json: true }
  );
  return normalizeEntry(extractJson(content), text);
}

/** 抓到的网页正文 → 摘要 + 关键点 + 术语标注 */
async function summarizeClip(page, config) {
  const trackNames = Array.isArray(config.tracks) ? config.tracks.map((t) => t.name) : [];
  if (process.env.MIAOJI_MOCK === '1') {
    await new Promise((r) => setTimeout(r, 600));
    return mockClip(page);
  }
  const material = [
    `标题：${page.title}`,
    `站点：${page.site}`,
    page.publishedAt ? `发布时间：${page.publishedAt}` : '',
    '正文：',
    String(page.text || '').slice(0, 8000)
  ].filter(Boolean).join('\n');
  const content = await callChat(
    [
      { role: 'system', content: CLIP_PROMPT + withTrackContext(trackNames) },
      { role: 'user', content: material }
    ],
    config,
    { maxTokens: 2000, temperature: 0.2, json: true }
  );
  return normalizeClip(extractJson(content), page);
}

/** 随手记的文字 → 轻整理（不改写原意） */
async function cleanNote(text, config) {
  const trackNames = Array.isArray(config.tracks) ? config.tracks.map((t) => t.name) : [];
  if (process.env.MIAOJI_MOCK === '1') {
    await new Promise((r) => setTimeout(r, 500));
    return mockNote(text);
  }
  const content = await callChat(
    [
      { role: 'system', content: NOTE_PROMPT + withTrackContext(trackNames) },
      { role: 'user', content: String(text || '').slice(0, 6000) }
    ],
    config,
    { maxTokens: 1500, temperature: 0.3, json: true }
  );
  return normalizeNote(extractJson(content), text);
}

/** 中文 → 英文表达 */
async function lookupZh(text, config) {
  const trackNames = Array.isArray(config.tracks) ? config.tracks.map((t) => t.name) : [];
  if (process.env.MIAOJI_MOCK === '1') {
    await new Promise((r) => setTimeout(r, 500));
    return mockLookup(text);
  }
  const content = await callChat(
    [
      { role: 'system', content: LOOKUP_PROMPT + withTrackContext(trackNames) },
      { role: 'user', content: String(text || '').trim() }
    ],
    config,
    { maxTokens: 1600, temperature: 0.3, json: true }
  );
  return normalizeLookup(extractJson(content), text);
}

function entryContext(entry) {
  const bits = [];
  const kindLabel = { sentence: '句子', term: '术语', note: '闪念笔记', clip: '剪藏文章', lookup: '中文反查' }[entry.kind] || '单词 / 短语';
  bits.push(kindLabel);
  bits.push(`词条：${entry.word}`);
  if (entry.lookup_zh) bits.push(`用户想表达的中文：${entry.lookup_zh}`);
  if (entry.summary) bits.push(`摘要：${entry.summary}`);
  if (entry.original) bits.push(`原文摘录：${String(entry.original).slice(0, 1200)}`);
  if (entry.terms && entry.terms.length) {
    bits.push(`文中术语：${entry.terms.map((t) => `${t.word}（${t.meaning}）`).join('；')}`);
  }
  if (entry.phonetic) bits.push(`音标：${entry.phonetic}`);
  if (entry.pos) bits.push(`词性：${entry.pos}`);
  if (entry.meaning_zh) bits.push(`中文释义：${entry.meaning_zh}`);
  if (entry.definition_en) bits.push(`英文释义：${entry.definition_en}`);
  if (entry.sentence_translation) bits.push(`句子翻译：${entry.sentence_translation}`);
  if (entry.key_points && entry.key_points.length) bits.push(`要点：${entry.key_points.join('；')}`);
  if (entry.key_words && entry.key_words.length) {
    bits.push(`关键词：${entry.key_words.map((k) => `${k.word}（${k.meaning}）`).join('；')}`);
  }
  if (entry.examples && entry.examples.length) {
    bits.push(`例句：${entry.examples.slice(0, 3).map((x) => x.en).join(' / ')}`);
  }
  if (entry.collocations && entry.collocations.length) bits.push(`搭配：${entry.collocations.join('；')}`);
  const o = entry.origin || {};
  if (o.root) bits.push(`词源：${o.root}`);
  if (o.first_use) bits.push(`最早：${o.first_use}`);
  if (o.story) bits.push(`脉络：${o.story}`);
  if (o.timeline && o.timeline.length) {
    bits.push(`时间线：${o.timeline.map((t) => `${t.when || '—'} ${t.what}`).join(' / ')}`);
  }
  if (o.scenes && o.scenes.length) bits.push(`场景：${o.scenes.join('；')}`);
  if (o.why) bits.push(`注意：${o.why}`);
  if (o.related && o.related.length) bits.push(`相关：${o.related.join('、')}`);
  if (entry.note) bits.push(`备注：${entry.note}`);
  return bits.join('\n');
}

function normalizeFollowUp(raw) {
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) throw new Error('AI 没有返回回答，请重试');
    return { answer: text, suggestions: [] };
  }
  if (!raw || typeof raw !== 'object') throw new Error('AI 返回的内容格式不正确，请重试');
  const answer = cleanStr(raw.answer || raw.answer_zh || raw.reply || raw.content);
  if (!answer) throw new Error('AI 没有返回回答，请重试');
  return { answer, suggestions: strList(raw.suggestions || raw.followups, 3) };
}

async function askFollowUp(entry, question, config) {
  const q = String(question || '').trim();
  if (!q) throw new Error('先写一个追问');
  if (!entry) throw new Error('找不到该词条');

  if (process.env.MIAOJI_MOCK === '1') {
    await new Promise((r) => setTimeout(r, 700));
    return mockFollowUp(entry, q);
  }

  const history = Array.isArray(entry.thread) ? entry.thread.slice(-12) : [];
  const messages = [
    { role: 'system', content: FOLLOWUP_PROMPT },
    { role: 'user', content: `词条上下文：\n${entryContext(entry)}\n\n请基于以上内容回答我接下来的追问。` },
    { role: 'assistant', content: '好的，我已经读过这个词条和它的脉络。' }
  ];
  for (const m of history) {
    if (!m || !m.text) continue;
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text) });
  }
  messages.push({ role: 'user', content: q });

  const content = await callChat(messages, config, { maxTokens: 900, temperature: 0.4, json: true });
  let parsed;
  try {
    parsed = extractJson(content);
  } catch {
    parsed = content.trim();
  }
  return normalizeFollowUp(parsed);
}

async function testConnection(config) {
  const content = await callChat(
    [{ role: 'user', content: '只回复两个字：可用' }],
    config,
    { maxTokens: 8, temperature: 0, json: false }
  );
  return { ok: true, reply: String(content).trim().slice(0, 40) };
}

function mockOrigin(isSentence) {
  if (isSentence) {
    return {
      root: '技术文档 / 产品说明（测试数据）',
      first_use: '',
      story: '这句话常见于产品发布或技术说明的语境，语气偏正式，强调变化已经持续了一段时间。测试数据用来检查「脉络」分区的排版、时间线与长段落。',
      timeline: [],
      scenes: ['常见于技术博客、发布说明、行业报告', '日常口语里会说得更直接'],
      why: '现在完成时把过去发生的事和现在的影响连在一起，这是理解这句话语气的关键。',
      related: ['现在完成时', '非限制性定语从句']
    };
  }
  return {
    root: '拉丁语 ubique（到处）+ 后缀 -ous',
    first_use: '19 世纪前后进入英语书面语',
    story: 'ubique 在拉丁语里就是「到处、处处」。加上 -ous 之后，ubiquitous 表示「到处都有的」。它最初多用于书面语和学术语境，后来随着计算机与互联网的发展，ubiquitous computing（普适计算）让这个词进入了技术领域：不是指某个设备很强，而是指计算能力散布在环境里、随处可见。今天它既可以形容技术，也可以形容一种无法回避的现象。',
    timeline: [
      { when: '19世纪', what: '进入英语书面语，主要指「到处存在的」' },
      { when: '1990s', what: 'ubiquitous computing 成为人机交互领域的关键词' },
      { when: '现在', what: '常用来形容技术、平台或现象的普遍渗透' }
    ],
    scenes: ['技术写作里常说 ubiquitous connectivity / computing', '形容某物无处不在时，比 everywhere 更正式', '注意它强调「同时到处都有」，不是「频繁发生」'],
    why: '它和 pervasive 很接近，但 ubiquitous 更强调空间上的「处处可见」；普通口语里用 everywhere 更自然。',
    related: ['ubiquity', 'pervasive', 'omnipresent', 'ubiquitous computing']
  };
}

function mockEntry(input) {
  const text = String(input).trim();
  const hasChinese = /[一-鿿]/.test(text);
  const isSentence = text.split(/\s+/).filter(Boolean).length > 3;
  if (hasChinese && !isSentence) return mockTermEntry(text);
  if (isSentence) {
    return {
      kind: 'sentence',
      word: text,
      phonetic: '',
      pos: '',
      meaning_zh: '',
      definition_en: '',
      examples: [],
      synonyms: [],
      collocations: [],
      memory: '',
      note: '这是测试数据，用于验证界面与写入流程。',
      sentence_translation: '（测试）这句话的中文翻译会显示在这里，用来检查排版、换行与长句的表现。',
      key_points: ['主句使用现在完成时，强调对现在造成的影响', 'which 引导非限制性定语从句，补充说明前面的名词'],
      key_words: [
        { word: 'ubiquitous', meaning: '无处不在的' },
        { word: 'environment', meaning: '环境' }
      ],
      origin: mockOrigin(true),
      followups: ['为什么这里用现在完成时？', 'which 从句可以省略吗？', '这句话适合什么场合？']
    };
  }
  return {
    kind: 'word',
    word: text.toLowerCase(),
    phonetic: '/juːˈbɪkwɪtəs/',
    pos: 'adj.',
    meaning_zh: '无处不在的；普遍存在的（测试释义，第二个义项用来检查换行）',
    definition_en: 'present, appearing, or found everywhere',
    examples: [
      { en: 'Microplastics are now ubiquitous in the environment.', zh: '微塑料如今在环境中无处不在。' },
      { en: 'Smartphones have become a ubiquitous part of daily life.', zh: '智能手机已经成为日常生活中无处不在的一部分。' }
    ],
    synonyms: ['omnipresent', 'pervasive', 'universal'],
    collocations: ['ubiquitous in', 'ubiquitous computing', 'become ubiquitous'],
    memory: 'ubique 在拉丁语里是“到处”，记成“每个角落都有它”。',
    note: '正式书面语常用，口语里说 everywhere 更自然。这是测试数据。',
    origin: mockOrigin(false),
    followups: ['它和 pervasive 有什么区别？', 'ubiquitous computing 具体指什么？', '口语里怎么替换它？']
  };
}

function mockTermEntry(text) {
  return {
    kind: 'term',
    word: text,
    phonetic: '',
    pos: '术语',
    meaning_zh: '（测试术语）同一个操作执行多次，结果与执行一次相同。测试数据用来检查术语卡的排版。',
    definition_en: 'idempotency',
    examples: [
      { en: 'Retry mechanisms rely on idempotent requests to avoid duplicate charges.', zh: '重试机制依赖幂等请求来避免重复扣款。' }
    ],
    synonyms: ['幂等性', '重试安全'],
    collocations: ['幂等请求', '幂等接口', '保证幂等'],
    memory: '不搞懂它，写重试逻辑就可能重复扣款或重复建单。',
    note: '最常见误解：把幂等当成「返回相同」——其实是「副作用相同」。测试数据。',
    origin: {
      root: '来自数学/计算机科学（测试数据）',
      first_use: '',
      story: '这个概念最早来自数学：f(f(x)) = f(x)。被引入分布式系统后，用来描述网络重试场景下的安全性。今天它是接口设计的基本要求，测试数据用来检查术语卡排版。',
      timeline: [
        { when: '数学', what: 'f(f(x)) = f(x) 的性质' },
        { when: '分布式时代', what: '成为接口重试设计的核心要求' }
      ],
      scenes: ['在接口设计里，支付、下单类接口必须保证幂等', '外行常以为幂等是「返回一样」，内行强调的是「副作用一样」'],
      why: '容易和「缓存」「去重」混淆：幂等是副作用层面的性质，不是结果层面的。',
      related: ['重试', '分布式事务', '去重', '接口设计']
    },
    followups: ['幂等和去重的区别是什么？', '怎么把接口设计成幂等的？', '哪些场景必须幂等？']
  };
}

function mockFollowUp(entry, question) {
  const base = {
    answer: `（测试回答）关于「${question}」：这个词的核心是「同时到处都存在」，不是单纯指**次数多**。\n\n对比一下：\n- The internet is ubiquitous. 强调互联网遍布各处；\n- The internet is frequently used. 只强调使用频率高。\n\n再看一个例子：Smartphones have become ubiquitous in daily life.（智能手机在日常生活中已经无处不在。）`,
    suggestions: ['再给我一个技术语境里的例子', '它和 omnipresent 的差别是什么？', '正式写作里怎么用更自然？']
  };
  if (!entry || entry.kind === 'sentence') {
    base.answer = `（测试回答）关于「${question}」：这句话的语气偏正式，重点在动作对现在的影响。\n\n把它改成更口语的说法，可以用一般过去时或直接说结果。不过具体怎么改，要看你想强调什么。`;
  }
  return base;
}

function mockClip(page) {
  return {
    kind: 'clip',
    word: page.title || '测试文章',
    summary: '（测试摘要）这篇文章讨论了重试机制里最常见的坑：网络超时导致重复扣款。作者认为接口设计必须默认「请求可能到达两次」，并用幂等键保证副作用只发生一次。文章最后给了一份上线前的检查清单。',
    key_points: [
      '超时重试会让同一个请求到达服务端多次',
      '幂等键（idempotency key）要让客户端生成，而不是服务端补',
      '上线前检查：支付、下单、消息投递三类接口是否都做了幂等'
    ],
    terms: [
      { word: 'idempotency', meaning: '幂等性：同一操作执行多次，结果与一次相同' },
      { word: 'retry storm', meaning: '重试风暴：大量客户端同时重试把服务压垮' },
      { word: 'at-least-once delivery', meaning: '至少投递一次：消息可能重复，消费方要能去重' }
    ],
    note: '（测试数据）最大的风险不是重试本身，而是把「不重复」寄托在客户端不重试上。',
    followups: ['幂等键应该由谁生成？', '重试风暴怎么限流？', '至少一次和恰好一次怎么选？'],
    track: '',
    source: {
      type: 'url',
      url: page.url,
      title: page.title,
      site: page.site,
      capturedAt: new Date().toISOString()
    },
    original: page.text,
    phonetic: '',
    pos: '',
    meaning_zh: '',
    examples: [],
    synonyms: [],
    collocations: [],
    memory: '',
    origin: normalizeOrigin(null)
  };
}

function mockNote(text) {
  const t = String(text || '').trim();
  return {
    kind: 'note',
    word: t.slice(0, 20) || '随手记',
    summary: `（测试整理）这段话的核心是「${t.slice(0, 30)}……」这里只做结构整理，观点保持原样。`,
    key_points: ['保留原来的判断和语气', '把长句拆成短句，方便以后回看'],
    terms: [{ word: 'idempotency key', meaning: '幂等键，用来让重复请求只生效一次' }],
    note: '（测试数据）第二段的结论没有给依据，之后可以补上例子。',
    followups: ['这个判断有反例吗？', '相关术语还有哪些？'],
    track: '',
    source: { type: 'manual', url: '', title: '', site: '', capturedAt: new Date().toISOString() },
    original: t,
    phonetic: '',
    pos: '',
    meaning_zh: '',
    examples: [],
    synonyms: [],
    collocations: [],
    memory: '',
    origin: normalizeOrigin(null)
  };
}

function mockLookup(text) {
  return {
    kind: 'lookup',
    word: 'idempotent',
    phonetic: '/ˌaɪdəmˈpoʊtənt/',
    pos: 'adj.',
    meaning_zh: `（测试反查）表达「${text}」最贴切的是 idempotent：强调多次执行结果相同，而不是「重复执行」。`,
    definition_en: 'Producing the same result when applied more than once.',
    alternatives: [
      { en: 'repeatable', nuance: '更口语，强调「可以重复做」，不涉及副作用是否相同' },
      { en: 'non-duplicating', nuance: '强调不产生重复数据，范围比幂等窄' }
    ],
    examples: [
      { en: 'The endpoint is idempotent, so retries are safe.', zh: '这个接口是幂等的，所以重试是安全的。' },
      { en: 'Make the operation idempotent before adding retries.', zh: '在加重试之前，先让这个操作具备幂等性。' }
    ],
    collocations: ['idempotent request', 'idempotent operation'],
    memory: '词根 idem（相同）+ potent（有力）——同样使一次劲，效果一样。',
    note: '中文常说「幂等」，英文口语里也常用 "safe to retry"。',
    followups: ['幂等和可重复有什么区别？', '哪些 HTTP 方法是幂等的？'],
    track: '',
    lookup_zh: String(text || '').trim(),
    source: { type: 'manual', url: '', title: '', site: '', capturedAt: new Date().toISOString() },
    original: '',
    terms: [],
    summary: '',
    key_points: [],
    synonyms: [],
    origin: normalizeOrigin(null)
  };
}

module.exports = {
  askDeepSeek,
  askFollowUp,
  summarizeClip,
  cleanNote,
  lookupZh,
  normalizeEntry,
  normalizeFollowUp,
  testConnection
};
