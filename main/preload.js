'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const send = (channel, ...args) => ipcRenderer.send(channel, ...args);

const EVENTS = ['ui:expanded', 'ui:collapsed', 'ui:nav', 'ui:toast', 'ui:focus', 'ui:dev-query', 'ui:dev-followup', 'ui:dev-zone'];

contextBridge.exposeInMainWorld('api', {
  init: () => invoke('app:init'),
  query: (text) => invoke('ai:query', text),
  followUp: (key, question) => invoke('ai:followup', key, question),
  testApi: () => invoke('ai:test'),
  saveConfig: (patch) => invoke('config:save', patch),
  chooseFile: () => invoke('config:choose-file'),
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
