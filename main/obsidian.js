'use strict';

const fs = require('fs');
const path = require('path');

const HOT_START = '<!-- sm-hot-start -->';
const HOT_END = '<!-- sm-hot-end -->';
const SECTION_TITLE = '## 全部词条';

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmt(iso, withTime = true) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

function cell(v) {
  return String(v || '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

/** 把多行文本变成 Obsidian callout 里的引用行 */
function quoteBlock(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.trim() ? `> ${line.replace(/\|/g, '\\|')}` : '>'))
    .join('\n');
}

function quoteInline(text) {
  return String(text || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function enc(key) {
  return encodeURIComponent(key);
}

function markers(key) {
  return {
    start: `<!-- sm:entry:${enc(key)} -->`,
    end: `<!-- /sm:entry:${enc(key)} -->`
  };
}

function baseDoc() {
  const today = fmt(new Date().toISOString(), false);
  return `---
title: 秒记生词本
tags:
  - 秒记
  - 英语
  - 生词本
created: ${today}
---

# 📒 秒记生词本

> 由桌面小工具「秒记」自动维护。同一个词在同一个方向下查询多次只会累计次数；换一个方向会另存一条，分别复习。
> 如果想补自己的笔记，请写在每个词条的标记块之外，工具更新时不会覆盖。

${HOT_START}
${HOT_END}

${SECTION_TITLE}
`;
}

function hotEntries(entries, config) {
  return entries
    .filter((e) => !e.mastered && (e.count || 1) >= config.hotThreshold)
    .sort((a, b) => (b.count || 0) - (a.count || 0) || new Date(b.lastAt) - new Date(a.lastAt))
    .slice(0, config.hotLimit);
}

function hotBlock(entries, config) {
  const list = hotEntries(entries, config);
  if (!list.length) {
    return `## 🔥 热词榜

> 同一词查询 ≥ **${config.hotThreshold}** 次就会自动上榜，方便反复攻克。目前还没有热词。
`;
  }
  const rows = list
    .map((e) => {
      const tn = trackLabel(config, e.track);
      return `| **${cell(e.word)}**${tn ? ` · ${cell(tn)}` : ''} | ${cell(e.meaning_zh || e.sentence_translation).slice(0, 48)} | ${e.count} | ${fmt(e.lastAt, false)} |`;
    })
    .join('\n');
  return `## 🔥 热词榜

> 同一词查询 ≥ **${config.hotThreshold}** 次自动上榜，共 **${list.length}** 个。按查询次数排序。

| 词条 | 释义 | 次数 | 最近查询 |
| --- | --- | --- | --- |
${rows}
`;
}

function originLines(entry) {
  const o = entry.origin || {};
  const isSentence = entry.kind === 'sentence';
  const has = o.root || o.first_use || o.story ||
    (o.timeline && o.timeline.length) ||
    (o.scenes && o.scenes.length) || o.why ||
    (o.related && o.related.length);
  if (!has) return [];

  const lines = [`> [!note] ${isSentence ? '语境与出处' : '词源与脉络'}`, '>'];
  const facts = [];
  if (o.root) facts.push(`**${isSentence ? '出处' : '词源'}**：${quoteInline(o.root)}`);
  if (o.first_use) facts.push(`**最早**：${quoteInline(o.first_use)}`);
  for (const f of facts) lines.push(`> ${f}`);
  if (facts.length) lines.push('>');

  if (o.story) {
    lines.push(quoteBlock(o.story));
    lines.push('>');
  }
  if (o.timeline && o.timeline.length) {
    for (const t of o.timeline) {
      lines.push(`> - **${quoteInline(t.when || '—')}** — ${quoteInline(t.what)}`);
    }
    lines.push('>');
  }
  if (o.scenes && o.scenes.length) {
    lines.push(`> **关联场景**：${o.scenes.map(quoteInline).join('；')}`);
    lines.push('>');
  }
  if (o.why) {
    lines.push(`> **为什么值得知道**：${quoteInline(o.why)}`);
    lines.push('>');
  }
  if (o.related && o.related.length) {
    lines.push(`> **相关**：${o.related.map(quoteInline).join(' · ')}`);
    lines.push('>');
  }
  if (lines[lines.length - 1] === '>') lines.pop();
  lines.push('');
  return lines;
}

function threadLines(entry) {
  const thread = Array.isArray(entry.thread) ? entry.thread.filter((m) => m && m.text) : [];
  if (!thread.length) return [];
  const rounds = thread.filter((m) => m.role === 'user').length;
  const lines = [`> [!question]- 追问记录（${rounds} 轮）`, '>'];
  for (const m of thread) {
    const who = m.role === 'assistant' ? '小记' : '你';
    const parts = String(m.text).replace(/\r\n/g, '\n').split('\n');
    lines.push(`> **${who}**：${parts[0].replace(/\|/g, '\\|')}`);
    for (const line of parts.slice(1)) {
      lines.push(line.trim() ? `> ${line.replace(/\|/g, '\\|')}` : '>');
    }
    lines.push('>');
  }
  if (lines[lines.length - 1] === '>') lines.pop();
  lines.push('');
  return lines;
}

function trackLabel(config, trackId) {
  const id = String(trackId || '');
  if (!id) return '';
  const t = ((config && config.tracks) || []).find((x) => x && x.id === id);
  return t ? t.name : '';
}

function entryBlock(entry, trackName) {
  const m = markers(entry.key);
  const lines = [];
  const isSentence = entry.kind === 'sentence';
  const isClip = entry.kind === 'clip';
  const isNote = entry.kind === 'note';
  const isLookup = entry.kind === 'lookup';
  const rawWord = String(entry.word || '').replace(/\s+/g, ' ').trim();
  const heading = isSentence
    ? `## “${rawWord.length > 60 ? rawWord.slice(0, 59) + '…' : rawWord}”`
    : `## ${rawWord}`;

  lines.push(m.start);
  lines.push(heading);
  lines.push('');

  const metaBits = [];
  if (isSentence) metaBits.push('💬 句子');
  if (entry.kind === 'term') metaBits.push('🧩 术语');
  if (isClip && entry.source && entry.source.type === 'video') metaBits.push('🎬 视频');
  if (isClip && (!entry.source || entry.source.type !== 'video')) metaBits.push('💾 剪藏');
  if (isNote) metaBits.push('✍️ 闪念');
  if (isLookup) metaBits.push('🔎 反查');
  if (isClip && entry.source && entry.source.type === 'video' && entry.source.author) metaBits.push(entry.source.author);
  if (isClip && entry.source && entry.source.type === 'video' && entry.source.transcriptSource) metaBits.push(entry.source.transcriptSource);
  if (isClip && entry.source && entry.source.site) metaBits.push(entry.source.site);
  if (trackName) metaBits.push(`🎯 ${trackName}`);
  if (entry.phonetic) metaBits.push(`\`${entry.phonetic}\``);
  if (entry.kind !== 'term' && entry.pos && !isClip && !isNote) metaBits.push(`*${entry.pos}*`);
  metaBits.push(`🔥 **${entry.count} 次**`);
  metaBits.push(`最近 ${fmt(entry.lastAt)}`);
  metaBits.push(`首查 ${fmt(entry.firstAt, false)}`);
  if (entry.mastered) metaBits.push('✅ 已掌握');
  if (entry.graduated) metaBits.push('🏅 复习毕业');
  lines.push(metaBits.join(' · '));
  lines.push('');

  if (isClip && entry.source && entry.source.url) {
    lines.push(`> 🔗 来源：[${cell(entry.source.title || entry.source.site || entry.source.url)}](${entry.source.url})`);
    if (entry.source.capturedAt) lines.push(`> 收藏于 ${fmt(entry.source.capturedAt, true)}`);
    lines.push('');
  }

  if (isClip || isNote) {
    if (entry.summary) {
      lines.push(cell(entry.summary));
      lines.push('');
    }
    if (entry.key_points && entry.key_points.length) {
      lines.push('**关键点**');
      lines.push('');
      entry.key_points.forEach((p) => lines.push(`- ${cell(p)}`));
      lines.push('');
    }
    if (entry.terms && entry.terms.length) {
      lines.push('**文中术语**');
      lines.push('');
      entry.terms.forEach((t) => {
        lines.push(`- **${cell(t.word)}**${t.meaning ? `：${cell(t.meaning)}` : ''}`);
      });
      lines.push('');
    }
    if (entry.note) {
      lines.push(`- ⚠️ **备注**：${cell(entry.note)}`);
      lines.push('');
    }
    if (entry.original) {
      lines.push('> [!quote]- 原文');
      for (const p of String(entry.original).split(/\n{2,}/)) {
        const clean = p.trim();
        if (!clean) continue;
        for (const ln of clean.split('\n')) lines.push(`> ${cell(ln)}`);
        lines.push('>');
      }
      if (lines[lines.length - 1] === '>') lines.pop();
      lines.push('');
    }
  } else if (isLookup) {
    if (entry.lookup_zh) {
      lines.push(`> 想表达：**${cell(entry.lookup_zh)}**`);
      lines.push('');
    }
    if (entry.meaning_zh) {
      lines.push(`**${cell(entry.meaning_zh)}**`);
      lines.push('');
    }
    if (entry.definition_en) {
      lines.push(`*${cell(entry.definition_en)}*`);
      lines.push('');
    }
    if (entry.alternatives && entry.alternatives.length) {
      lines.push('**备选表达**');
      lines.push('');
      entry.alternatives.forEach((a) => {
        lines.push(`- **${cell(a.en)}**${a.nuance ? `：${cell(a.nuance)}` : ''}`);
      });
      lines.push('');
    }
    if (entry.examples && entry.examples.length) {
      entry.examples.forEach((ex) => {
        lines.push(`- 📝 ${cell(ex.en)}`);
        if (ex.zh) lines.push(`  - ${cell(ex.zh)}`);
      });
      lines.push('');
    }
    if (entry.collocations && entry.collocations.length) {
      lines.push(`- 🧩 **搭配**：${entry.collocations.map(cell).join(' · ')}`);
    }
    if (entry.memory) lines.push(`- 🧠 **记忆**：${cell(entry.memory)}`);
    if (entry.note) lines.push(`- ⚠️ **备注**：${cell(entry.note)}`);
    lines.push('');
  } else if (isSentence) {
    lines.push(`> ${cell(entry.sentence_translation)}`);
    lines.push('');
    if (entry.key_points && entry.key_points.length) {
      lines.push('**要点**');
      lines.push('');
      entry.key_points.forEach((p) => lines.push(`- ${cell(p)}`));
      lines.push('');
    }
    if (entry.key_words && entry.key_words.length) {
      lines.push('**关键词**');
      lines.push('');
      entry.key_words.forEach((k) => {
        lines.push(`- **${cell(k.word)}**${k.meaning ? `：${cell(k.meaning)}` : ''}`);
      });
      lines.push('');
    }
  } else {
    if (entry.meaning_zh) {
      lines.push(`**${cell(entry.meaning_zh)}**`);
      lines.push('');
    }
    if (entry.definition_en) {
      lines.push(`*${cell(entry.definition_en)}*`);
      lines.push('');
    }
    if (entry.examples && entry.examples.length) {
      entry.examples.forEach((ex) => {
        lines.push(`- 📝 ${cell(ex.en)}`);
        if (ex.zh) lines.push(`  - ${cell(ex.zh)}`);
      });
      lines.push('');
    }
    if (entry.synonyms && entry.synonyms.length) {
      lines.push(`- 🔗 **近义**：${entry.synonyms.map(cell).join(' · ')}`);
    }
    if (entry.collocations && entry.collocations.length) {
      lines.push(`- 🧩 **搭配**：${entry.collocations.map(cell).join(' · ')}`);
    }
    if (entry.memory) lines.push(`- 🧠 **记忆**：${cell(entry.memory)}`);
    if (entry.note) lines.push(`- ⚠️ **备注**：${cell(entry.note)}`);
    lines.push('');
  }

  if (isSentence && entry.note) {
    lines.push(`- ⚠️ **备注**：${cell(entry.note)}`);
    lines.push('');
  }

  lines.push(...originLines(entry));
  lines.push(...threadLines(entry));

  lines.push(m.end);
  return lines.join('\n');
}

function ensureHotMarkers(doc) {
  if (doc.includes(HOT_START) && doc.includes(HOT_END)) return doc;
  const placeholder = `${HOT_START}\n${HOT_END}`;
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(doc);
  if (fm) {
    return doc.slice(0, fm[0].length) + '\n' + placeholder + '\n\n' + doc.slice(fm[0].length);
  }
  return placeholder + '\n\n' + doc;
}

function writeHot(doc, entries, config) {
  const start = doc.indexOf(HOT_START);
  const end = doc.indexOf(HOT_END, start + HOT_START.length);
  if (start === -1 || end === -1) return doc;
  const block = `${HOT_START}\n${hotBlock(entries, config)}\n${HOT_END}`;
  return doc.slice(0, start) + block + doc.slice(end + HOT_END.length);
}

function replaceEntry(doc, entry, block) {
  const { start, end } = markers(entry.key);
  const i = doc.indexOf(start);
  if (i === -1) return null;
  const j = doc.indexOf(end, i + start.length);
  if (j === -1) return null;
  return doc.slice(0, i) + block + doc.slice(j + end.length);
}

function removeEntryBlock(doc, key) {
  const { start, end } = markers(key);
  const i = doc.indexOf(start);
  if (i === -1) return doc;
  const j = doc.indexOf(end, i + start.length);
  if (j === -1) return doc;
  const before = doc.slice(0, i).replace(/[ \t]*\n{0,3}$/, '\n\n');
  const after = doc.slice(j + end.length).replace(/^[ \t]*\n{0,3}/, '');
  return before + after;
}

function readDoc(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function noteFile(config) {
  if (!config || config.obsidianEnabled === false) return '';
  return String(config.obsidianFile || '').trim();
}

function ensureDoc(config) {
  const file = noteFile(config);
  if (!file) throw new Error('还没有启用 Obsidian 生词本');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readDoc(file);
  if (existing === null) {
    const fresh = baseDoc();
    fs.writeFileSync(file, fresh, 'utf8');
    return { doc: fresh, created: true };
  }
  return { doc: existing, created: false };
}

function writeDoc(file, doc) {
  fs.writeFileSync(file, doc.replace(/\s+$/, '') + '\n', 'utf8');
}

/**
 * 写入或更新一个词条，并同步热词榜。
 */
function upsert(entry, entries, config) {
  const file = noteFile(config);
  if (!file) return { ok: true, skipped: true, path: '', created: false };
  const { doc: rawDoc, created } = ensureDoc(config);
  let doc = ensureHotMarkers(rawDoc);
  doc = writeHot(doc, entries, config);

  const block = entryBlock(entry, trackLabel(config, entry.track));
  const replaced = replaceEntry(doc, entry, block);
  if (replaced !== null) {
    doc = replaced;
  } else {
    doc = doc.replace(/\s+$/, '') + '\n\n' + block;
  }
  writeDoc(file, doc);
  return { ok: true, path: file, created };
}

function update(entry, entries, config) {
  return upsert(entry, entries, config);
}

function remove(key, entries, config) {
  const file = noteFile(config);
  if (!file) return { ok: true, skipped: true, path: '', created: false };
  const rawDoc = readDoc(file);
  if (rawDoc === null) return { ok: true, path: file, created: false };
  let doc = ensureHotMarkers(rawDoc);
  doc = writeHot(doc, entries, config);
  doc = removeEntryBlock(doc, key);
  writeDoc(file, doc);
  return { ok: true, path: file, created: false };
}

/**
 * 词条换方向时主键会变：把原标记块的开头/结尾改成新键，只改标记，不动块内内容。
 * 新键的标记已经存在时不自动合并，交给上层提示用户。
 */
function rename(oldKey, newKey, config) {
  const file = noteFile(config);
  if (!file) return { ok: true, skipped: true, path: '' };
  if (!oldKey || !newKey || oldKey === newKey) return { ok: true, skipped: true, path: file };
  const rawDoc = readDoc(file);
  if (rawDoc === null) return { ok: true, skipped: true, path: file };
  const oldM = markers(oldKey);
  const newM = markers(newKey);
  if (!rawDoc.includes(oldM.start) && !rawDoc.includes(oldM.end)) {
    return { ok: true, skipped: true, path: file };
  }
  if (rawDoc.includes(newM.start) || rawDoc.includes(newM.end)) {
    return { ok: false, error: '笔记里已经有这个方向的词条块，未自动合并', path: file };
  }
  const doc = rawDoc
    .split(oldM.start).join(newM.start)
    .split(oldM.end).join(newM.end);
  writeDoc(file, doc);
  return { ok: true, path: file, renamed: true };
}

/**
 * 按本地记录重新生成整篇笔记（会保留文件头部之外的人工内容？不会——这是一次全量重建）。
 */
function syncAll(entries, config) {
  const file = noteFile(config);
  if (!file) throw new Error('还没有设置或启用 Obsidian 生词本');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let doc = baseDoc();
  doc = writeHot(doc, entries, config);
  const sorted = [...entries].sort((a, b) => new Date(a.firstAt || 0) - new Date(b.firstAt || 0));
  if (sorted.length) {
    doc = doc.replace(/\s+$/, '') + '\n\n' + sorted.map((e) => entryBlock(e, trackLabel(config, e.track))).join('\n\n') + '\n';
  }
  writeDoc(file, doc);
  return { ok: true, path: file, created: true };
}

function weekMarkers(period) {
  const tag = `${period && period.to ? period.to : fmt(new Date().toISOString(), false)}`;
  return {
    start: `<!-- sm:week:${tag} -->`,
    end: `<!-- /sm:week:${tag} -->`
  };
}

function weeklyBaseDoc() {
  return `---
title: 秒记周报
tags:
  - 秒记
  - 周报
---

# 🗓 秒记周报

> 由「秒记」根据本机学习记录生成，只在本地写入，不上传任何地方。
> 每周一份，重新生成同一周会更新这一周的块，不覆盖更早的周报。
`;
}

/**
 * 写周报到与生词本同目录的「秒记周报.md」。同一周重复生成时原地更新。
 * report 由 ai.weeklyReport 生成；period 为 { from, to }。
 */
function writeWeekly(report, config, period) {
  const note = noteFile(config);
  if (!note) return { ok: true, skipped: true, path: '' };
  const file = path.join(path.dirname(note), '秒记周报.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readDoc(file);
  let doc = existing === null ? weeklyBaseDoc() : existing;

  const p = period || {};
  const label = p.to || fmt(new Date().toISOString(), false);
  const { start, end } = weekMarkers({ to: label });
  const lines = [start, '', `## ${label} · ${cell(report.title || '本周学习记录')}`, ''];
  if (p.from || p.to) lines.push(`> 📅 周期：${p.from || '—'} → ${p.to || '—'}`, '');
  if (report.summary) {
    lines.push(cell(report.summary), '');
  }
  if (report.highlights && report.highlights.length) {
    lines.push('**做得好的**', '');
    report.highlights.forEach((h) => lines.push(`- ${cell(h)}`));
    lines.push('');
  }
  if (report.weak && report.weak.length) {
    lines.push('**还不太稳**', '');
    report.weak.forEach((w) => lines.push(`- ${cell(w)}`));
    lines.push('');
  }
  if (report.advice) {
    lines.push(`> [!tip] 下一步`, `> ${cell(report.advice)}`);
    if (report.next) lines.push(`>`, `> **下周目标**：${cell(report.next)}`);
    lines.push('');
  }
  lines.push(end);

  const block = lines.join('\n');
  const i = doc.indexOf(start);
  if (i !== -1) {
    const j = doc.indexOf(end, i + start.length);
    if (j !== -1) {
      doc = doc.slice(0, i) + block + doc.slice(j + end.length);
    } else {
      doc = doc.slice(0, i) + block;
    }
  } else {
    doc = doc.replace(/\s+$/, '') + '\n\n' + block + '\n';
  }
  writeDoc(file, doc);
  return { ok: true, path: file, created: existing === null };
}

module.exports = { upsert, update, remove, rename, syncAll, baseDoc, writeWeekly };
