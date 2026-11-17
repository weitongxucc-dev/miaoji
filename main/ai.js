'use strict';

const SYSTEM_PROMPT = `你是一位严谨的中英双语词典编辑，同时也研究词源与技术史。服务对象是中文母语的英语学习者。
用户会给你一个英文单词、短语或句子。请先判断类型，然后只输出一个 JSON 对象（不要 markdown 代码块、不要任何解释）。

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
6. 只输出 JSON。所有中文内容使用简体中文。`;

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

  const kind = raw.kind === 'sentence' ? 'sentence' : 'word';
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
    followups: strList(raw.followups, 4)
  };

  if (!entry.word) throw new Error('AI 没有识别出词条内容，请重试');
  if (kind === 'word' && !entry.meaning_zh) {
    throw new Error('AI 没有返回释义，请重试');
  }
  if (kind === 'sentence' && !entry.sentence_translation) {
    throw new Error('AI 没有返回翻译，请重试');
  }
  return entry;
}

async function askDeepSeek(text, config) {
  if (process.env.MIAOJI_MOCK === '1') {
    await new Promise((r) => setTimeout(r, 600));
    return mockEntry(text);
  }
  const content = await callChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: String(text).trim() }
    ],
    config,
    { maxTokens: 2200, temperature: 0.2, json: true }
  );
  return normalizeEntry(extractJson(content), text);
}

function entryContext(entry) {
  const bits = [];
  bits.push(entry.kind === 'sentence' ? '句子' : '单词 / 短语');
  bits.push(`词条：${entry.word}`);
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
  const isSentence = text.split(/\s+/).filter(Boolean).length > 3;
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

module.exports = {
  askDeepSeek,
  askFollowUp,
  normalizeEntry,
  normalizeFollowUp,
  testConnection
};
