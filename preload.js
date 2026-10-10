const { contextBridge, ipcRenderer } = require('electron');

function toFileURL(filePath) {
  let path = String(filePath).replace(/\\/g, '/');
  if (path[0] !== '/') path = '/' + path;
  return 'file://' + encodeURI(path).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

contextBridge.exposeInMainWorld('api', {
  openVideos: () => ipcRenderer.invoke('dialog:openVideos'),
  openOne: () => ipcRenderer.invoke('dialog:openOne'),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  defaultDownloadDir: () => ipcRenderer.invoke('paths:defaultDownloadDir'),
  pathsInfo: () => ipcRenderer.invoke('paths:info'),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (data) => ipcRenderer.invoke('session:save', data),
  fileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
  toFileURL: (filePath) => toFileURL(filePath),

  listLocales: () => ipcRenderer.invoke('i18n:list'),
  loadLocale: (lang) => ipcRenderer.invoke('i18n:load', lang),
  systemLocale: () => ipcRenderer.invoke('i18n:system'),

  ytdlpStatus: () => ipcRenderer.invoke('ytdlp:status'),
  ffmpegStatus: () => ipcRenderer.invoke('ffmpeg:status'),
  ytdlpInfo: (url) => ipcRenderer.invoke('ytdlp:info', url),
  ytdlpDownload: (payload) => ipcRenderer.invoke('ytdlp:download', payload),
  ytdlpCancel: (jobId) => ipcRenderer.invoke('ytdlp:cancel', jobId),
  onYtdlpProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ytdlp:progress', handler);
    return () => ipcRenderer.removeListener('ytdlp:progress', handler);
  },
});
