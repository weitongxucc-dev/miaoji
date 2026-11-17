'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const send = (channel, ...args) => ipcRenderer.send(channel, ...args);

const EVENTS = ['ui:expanded', 'ui:collapsed', 'ui:nav', 'ui:toast', 'ui:focus', 'ui:dev-query', 'ui:dev-followup', 'ui:dev-zone', 'ui:capture', 'ui:clipwatch', 'ui:pipeline-progress'];

contextBridge.exposeInMainWorld('api', {
  init: () => invoke('app:init'),
  query: (text, mode, trackId) => invoke('ai:query', text, mode, trackId),
  followUp: (key, question) => invoke('ai:followup', key, question),
  testApi: () => invoke('ai:test'),
  saveConfig: (patch) => invoke('config:save', patch),
  chooseFile: () => invoke('config:choose-file'),
  detectObsidian: () => invoke('obsidian:detect'),
  useVault: (vaultPath) => invoke('obsidian:use-vault', vaultPath),
  openObsidianDownload: () => invoke('app:open-obsidian-download'),
  setLaunch: (enabled) => invoke('app:launch-at-login', enabled),
  readClipboard: () => invoke('clipboard:read'),

  expand: () => invoke('win:expand'),
  collapse: () => invoke('win:collapse'),
  petMenu: () => send('win:pet-menu'),

  dragStart: (x, y) => send('win:drag-start', { x, y }),
  dragMove: (x, y) => send('win:drag-move', { x, y }),
  dragEnd: () => send('win:drag-end'),

  master: (key, mastered) => invoke('entry:master', key, mastered),
  remove: (key) => invoke('entry:delete', key),
  submitReview: (key, grade) => invoke('review:submit', key, grade),
  setEntryTrack: (key, trackId) => invoke('entry:set-track', key, trackId),
  collectTerm: (word, trackId) => invoke('term:collect', word, trackId),
  noteSave: (text, trackId) => invoke('note:save', text, trackId),
  noteOrganize: (key) => invoke('note:organize', key),
  noteOptInReview: (key) => invoke('note:optin-review', key),
  openUrl: (url) => invoke('app:open-url', url),
  generateQuiz: (keys) => invoke('quiz:generate', keys),
  weeklyReport: () => invoke('weekly:report'),
  collectClipTerms: (key) => invoke('pipeline:terms', key),
  runAgent: (text) => invoke('agent:run', text),
  statsOverview: (range) => invoke('stats:overview', range),
  checkUpdate: () => invoke('update:check'),

  openNote: () => invoke('obsidian:open'),
  syncNote: () => invoke('obsidian:sync'),
  openDataDir: () => invoke('app:open-data-dir'),

  quit: () => invoke('app:quit'),

  on: (channel, handler) => {
    if (!EVENTS.includes(channel)) return () => {};
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
