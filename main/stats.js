'use strict';

/**
 * 本地统计与建议。只读本机记录，不联网、不上报。
 */

const store = require('./store');

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

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

function overview() {
  const conf = store.loadConfig();
  const all = store.listEntries();
  const state = store.reviewState(conf.reviewDaily);
  const tracks = conf.tracks || [];

  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = dayStart(-i);
    days.push({ date: dayKey(d), label: WEEKDAYS[d.getDay()], added: 0, reviewed: 0 });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const e of all) {
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
  for (const e of all) {
    const k = dayKey(e.firstAt);
    if (k) active.add(k);
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
    const list = all.filter((e) => e.track === t.id);
    return {
      id: t.id,
      name: t.name,
      count: list.length,
      graduated: list.filter((e) => e.graduated || e.mastered).length
    };
  }).sort((a, b) => b.count - a.count);
  const noTrack = all.filter((e) => !e.track || !tracks.some((t) => t.id === e.track)).length;

  const kindCounts = {};
  for (const e of all) kindCounts[e.kind || 'word'] = (kindCounts[e.kind || 'word'] || 0) + 1;

  const weekAdded = days.reduce((n, d) => n + d.added, 0);
  const weekReviewed = days.reduce((n, d) => n + d.reviewed, 0);

  // 最近 7 天里「没想起」次数最多的词
  const forgotten = new Map();
  const since = dayStart(-6).getTime();
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
    streak,
    weekAdded,
    weekReviewed,
    stats: state.stats,
    due: state.due.length,
    doneToday: state.doneToday,
    remaining: state.remaining,
    tracks: trackStats,
    noTrack,
    kinds: kindCounts,
    weak,
    total: all.length
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
    list.push({ id: 'first', text: '还没有任何记录。复制一个想弄懂的词，点开机器人回车就行。', action: 'capture' });
  }
  if (!d.weekReviewed && d.total > 0) {
    list.push({ id: 'no-review', text: '这周还没有复习记录。收藏不会自动变成掌握，去回顾页翻几张卡。', action: 'review' });
  }
  return list.slice(0, 3);
}

function localRecommendations(conf) {
  if (!conf.recommendSlot) return [];
  return suggestions(null, conf);
}

module.exports = { overview, suggestions, localRecommendations, dayKey };
