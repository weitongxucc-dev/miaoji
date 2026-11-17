'use strict';

/**
 * 开发用：验证网页提取（Readability 渲染层 + 静态兜底）。
 * 用法：electron tools/test-extract.js <url1> <url2> ...
 * 结果写到 MIAOJI_EXTRACT_OUT（默认 test-extract-result.json），不写任何业务数据。
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const outPath = process.env.MIAOJI_EXTRACT_OUT || path.join(__dirname, 'test-extract-result.json');

function done(results) {
  try {
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  } catch (e) {
    console.error('WRITE_FAIL', e);
  }
  app.exit(0);
}

process.on('uncaughtException', (e) => {
  done([{ fatal: String((e && e.stack) || e) }]);
});

setTimeout(() => done([{ fatal: 'harness timeout 60s' }]), 60000);

app.whenReady().then(async () => {
  const results = [];
  try {
    const extract = require('../main/extract');
    // URL 从 MIAOJI_EXTRACT_URLS 读（空格分隔），避开 electron 启动器的多参数解析问题
    const targets = String(process.env.MIAOJI_EXTRACT_URLS || '')
      .split(/\s+/)
      .filter((a) => /^https?:\/\//.test(a));
    for (const url of targets) {
      try {
        const r = await extract.extractFromUrl(url);
        results.push({
          url,
          extractor: r.extractor,
          title: r.title,
          textLen: r.text.length,
          head: r.text.slice(0, 60).replace(/\s+/g, ' ')
        });
      } catch (e) {
        results.push({ url, error: e && e.message ? e.message : String(e) });
      }
    }
  } catch (e) {
    results.push({ fatal: String((e && e.stack) || e) });
  }
  done(results);
}).catch((e) => {
  done([{ fatal: 'whenReady: ' + String((e && e.stack) || e) }]);
});
