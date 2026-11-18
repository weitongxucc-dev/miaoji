'use strict';

/**
 * 本地统计与建议。只读本机记录，不联网、不上报。
 */

const store = require('./store');

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 「收录量 / 领域覆盖」只统计术语类词条；闪念、剪藏是记录与来源，不算术语积累。
// 复习次数（reviewed / streak 里的复习日）仍覆盖整个复习队列（含主动加入的闪念）。
const TERM_KINDS = new Set(['word', 'sentence', 'term', 'lookup']);

function dayKey(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayStart(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function overview(range) {
  const conf = store.loadConfig();
  const all = store.listEntries();
  const state = store.reviewState(conf.reviewDaily);
  const tracks = conf.tracks || [];

  // 统计区间：近 7 天 / 近 30 天 / 本月（从 1 号到今天）
  const mode = ['7', '30', 'month'].includes(String(range)) ? String(range) : '7';
  let start;
  let rangeLabel;
  if (mode === 'month') {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeLabel = '本月';
  } else {
    const n = mode === '30' ? 29 : 6;
    start = dayStart(-n);
    rangeLabel = mode === '30' ? '近 30 天' : '近 7 天';
  }

  const days = [];
  const cursorDay = new Date(start);
  cursorDay.setHours(0, 0, 0, 0);
  const today = dayStart(0);
  const spanDays = Math.round((today.getTime() - cursorDay.getTime()) / 86400000) + 1;
  // 超过一周时不标星期，改标日期数字，避免挤在一起
  const labelOf = (d) => (spanDays <= 7 ? WEEKDAYS[d.getDay()] : String(d.getDate()));
  for (;;) {
    days.push({ date: dayKey(cursorDay), label: labelOf(cursorDay), added: 0, reviewed: 0 });
    if (cursorDay.getTime() >= today.getTime()) break;
    cursorDay.setDate(cursorDay.getDate() + 1);
  }
  const byDate = new Map(days.map((d) => [d.date, d]));

  const terms = all.filter((e) => TERM_KINDS.has(e.kind));
  for (const e of terms) {
    const k = dayKey(e.firstAt);
    if (byDate.has(k)) byDate.get(k).added += 1;
  }
  for (const e of all) {
    for (const r of Array.isArray(e.reviews) ? e.reviews : []) {
      const k = r && r.at ? dayKey(r.at) : '';
      if (byDate.has(k)) byDate.get(k).reviewed += 1;
    }
  }

  // 连续学习天数：从今天（今天还没学则从昨天）往回数，每天至少新增或复习过一次
  // 用全量记录计算，而不是只看这 7 天，否则长期坚持会被截成 7
  const active = new Set();
  for (const e of terms) {
    const k = dayKey(e.firstAt);
    if (k) active.add(k);
  }
  for (const e of all) {
    for (const r of Array.isArray(e.reviews) ? e.reviews : []) {
      const rk = r && r.at ? dayKey(r.at) : '';
      if (rk) active.add(rk);
    }
  }
  let streak = 0;
  let cursor = active.has(dayKey(dayStart(0))) ? 0 : -1;
  for (;;) {
    const k = dayKey(dayStart(cursor));
    if (!active.has(k)) break;
    streak += 1;
    cursor -= 1;
    if (streak > 3650) break;
  }

  const trackStats = tracks.map((t) => {
    const list = terms.filter((e) => e.track === t.id);
    return {
      id: t.id,
      name: t.name,
      count: list.length,
      graduated: list.filter((e) => e.graduated || e.mastered).length
    };
  }).sort((a, b) => b.count - a.count);
  const noTrack = terms.filter((e) => !e.track || !tracks.some((t) => t.id === e.track)).length;

  const kindCounts = {};
  for (const e of all) kindCounts[e.kind || 'word'] = (kindCounts[e.kind || 'word'] || 0) + 1;

  const rangeAdded = days.reduce((n, d) => n + d.added, 0);
  const rangeReviewed = days.reduce((n, d) => n + d.reviewed, 0);

  // 统计区间内「没想起」次数最多的词
  const forgotten = new Map();
  const since = start.getTime();
  for (const e of all) {
    for (const r of Array.isArray(e.reviews) ? e.reviews : []) {
      if (!r || !r.at || r.grade !== 0) continue;
      const t = new Date(r.at).getTime();
      if (Number.isFinite(t) && t >= since) forgotten.set(e.word, (forgotten.get(e.word) || 0) + 1);
    }
  }
  const weak = Array.from(forgotten.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, times]) => ({ word, times }));

  return {
    days,
    range: mode,
    rangeLabel,
    streak,
    rangeAdded,
    rangeReviewed,
    stats: state.stats,
    due: state.due.length,
    doneToday: state.doneToday,
    remaining: state.remaining,
    tracks: trackStats,
    noTrack,
    kinds: kindCounts,
    weak,
    total: terms.length
  };
}

/**
 * 规则化的本地建议，只根据本机数据，不做画像。
 * 返回 [{ id, text, action }]，action 供界面决定按钮行为。
 */
function suggestions(data, conf) {
  const list = [];
  const d = data || overview();
  const tracks = conf.tracks || [];

  if (!tracks.length) {
    list.push({ id: 'track-empty', text: '还没有学习方向。先定一个（比如「编程」），AI 的解释会贴合你的领域。', action: 'settings-tracks' });
  }
  if (d.due > 0) {
    list.push({ id: 'due', text: `今天有 ${d.due} 个词到期，先复习一轮比继续收藏更划算。`, action: 'review' });
  }
  if (d.weak.length) {
    list.push({ id: 'weak', word: d.weak[0].word, text: `「${d.weak[0].word}」最近 ${d.weak[0].times} 次没想起来，可以打开追问拆一下构词或用法。`, action: 'search-weak' });
  }
  if (tracks.length) {
    const thin = d.tracks.filter((t) => t.count < 5)[0];
    if (thin) list.push({ id: 'thin-track', text: `「${thin.name}」方向只有 ${thin.count} 个词，遇到相关文章可以剪藏一篇补一补。`, action: 'capture' });
  }
  if (!d.total) {
    list.push({ id: 'first', text: '还没有术语记录。复制一个想弄懂的词，点开机器人回车就行。', action: 'capture' });
  }
  if (!d.rangeReviewed && d.total > 0) {
    list.push({ id: 'no-review', text: '这段时间还没有复习记录。收藏不会自动变成掌握，去回顾页翻几张卡。', action: 'review' });
  }
  return list.slice(0, 3);
}

function localRecommendations(conf) {
  if (!conf.recommendSlot) return [];
  return suggestions(null, conf);
}

module.exports = { overview, suggestions, localRecommendations, dayKey };
