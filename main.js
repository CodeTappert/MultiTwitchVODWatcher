const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'ts', 'avi', 'flv'];

let ytdlp = null;
const downloadJobs = new Map();

function isWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

let cachedBaseDir = null;
let portableMode = false;
function baseDir() {
  if (cachedBaseDir) return cachedBaseDir;
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir && isWritable(portableDir)) {
    cachedBaseDir = portableDir;
    portableMode = true;
    return cachedBaseDir;
  }
  try {
    const exeDir = path.dirname(app.getPath('exe'));
    if (fs.existsSync(path.join(exeDir, 'portable.txt')) && isWritable(exeDir)) {
      cachedBaseDir = exeDir;
      portableMode = true;
      return cachedBaseDir;
    }
  } catch {
    /* ignore */
  }
  cachedBaseDir = app.getPath('userData');
  portableMode = false;
  return cachedBaseDir;
}

function sessionFile() {
  return path.join(baseDir(), 'session.json');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0e0e10',
    autoHideMenuBar: true,
    title: 'VOD Sync Local',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  return win;
}

app.whenReady().then(() => {
  backupSessionSnapshot();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openVideos', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Add VOD files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video', extensions: VIDEO_EXTENSIONS }],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('dialog:openOne', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Locate video file',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: VIDEO_EXTENSIONS }],
  });
  return res.canceled ? null : res.filePaths[0];
});

function readSessionFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function hasData(session) {
  return (
    session &&
    ((Array.isArray(session.videos) && session.videos.length > 0) ||
      (Array.isArray(session.library) && session.library.length > 0))
  );
}

function backupSessionSnapshot() {
  try {
    const file = sessionFile();
    const data = readSessionFile(file);
    if (!hasData(data)) return;
    const dir = path.join(baseDir(), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, path.join(dir, 'session-' + stamp + '.json'));
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('session-') && f.endsWith('.json'))
      .sort();
    while (files.length > 10) {
      fs.unlinkSync(path.join(dir, files.shift()));
    }
  } catch {
    /* ignore backup errors */
  }
}

ipcMain.handle('session:load', async () => {
  const file = sessionFile();
  const current = readSessionFile(file);
  const backup = readSessionFile(file + '.bak');
  const isEmpty = (s) =>
    !s || ((!s.videos || !s.videos.length) && (!s.library || !s.library.length));
  if (isEmpty(current) && backup && !isEmpty(backup)) return backup;
  return current || backup;
});

ipcMain.handle('session:save', async (_event, data) => {
  try {
    const file = sessionFile();
    try {
      const previous = readSessionFile(file);
      if (hasData(previous) && hasData(data)) {
        fs.copyFileSync(file, file + '.bak');
      }
    } catch {
      /* ignore backup errors */
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('file:exists', async (_event, filePath) => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
});

ipcMain.handle('dialog:openDirectory', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Choose download folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('paths:defaultDownloadDir', async () => {
  baseDir();
  if (portableMode) return path.join(cachedBaseDir, 'downloads');
  return path.join(app.getPath('videos'), 'VOD Sync Downloads');
});

ipcMain.handle('paths:info', async () => ({
  baseDir: baseDir(),
  userData: app.getPath('userData'),
  defaultDownloadDir: portableMode
    ? path.join(cachedBaseDir, 'downloads')
    : path.join(app.getPath('videos'), 'VOD Sync Downloads'),
  portable: portableMode,
}));

ipcMain.handle('i18n:list', async () => {
  const dir = path.join(__dirname, 'locales');
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const file = path.basename(f, '.json');
        let code = file;
        let name = file;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          if (data && data.meta) {
            if (data.meta.code) code = data.meta.code;
            if (data.meta.name) name = data.meta.name;
          }
        } catch {
          /* ignore */
        }
        return { id: file, code, name };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  } catch {
    return [{ id: 'en-GB', code: 'en-GB', name: 'English' }];
  }
});

ipcMain.handle('i18n:load', async (_event, lang) => {
  try {
    const safe = String(lang).replace(/[^a-zA-Z0-9_-]/g, '');
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', safe + '.json'), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('i18n:system', async () => app.getLocale());

ipcMain.handle('session:exportFile', async (_event, data) => {
  const res = await dialog.showSaveDialog({
    title: 'Export session',
    defaultPath: 'vod-sync-session.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2));
  return res.filePath;
});

ipcMain.handle('session:importFile', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Import session',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  try {
    return JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
  } catch {
    return null;
  }
});

function execFileAsync(cmd, args, options) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

function binDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'bin')
    : path.join(__dirname, 'bin');
}

const YTDLP_CANDIDATES = () => [
  { cmd: path.join(binDir(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'), prefix: [] },
  { cmd: 'yt-dlp', prefix: [] },
  { cmd: 'python', prefix: ['-m', 'yt_dlp'] },
  { cmd: 'python3', prefix: ['-m', 'yt_dlp'] },
  { cmd: 'py', prefix: ['-3', '-m', 'yt_dlp'] },
];

function localFfmpeg() {
  const names = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
  for (const name of names) {
    const candidate = path.join(binDir(), name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function ffmpegArgs() {
  const local = localFfmpeg();
  return local ? ['--ffmpeg-location', local] : [];
}

async function probeYtDlp() {
  for (const candidate of YTDLP_CANDIDATES()) {
    try {
      const { stdout } = await execFileAsync(candidate.cmd, [...candidate.prefix, '--version'], { timeout: 20000, windowsHide: true });
      if (stdout && stdout.trim()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function ensureYtDlp() {
  if (!ytdlp) ytdlp = await probeYtDlp();
  return ytdlp;
}

function formatFor(quality) {
  switch (quality) {
    case 'audio': return 'bestaudio/best';
    case '1080': return 'bv*[height<=1080]+ba/b[height<=1080]/b';
    case '720': return 'bv*[height<=720]+ba/b[height<=720]/b';
    case '480': return 'bv*[height<=480]+ba/b[height<=480]/b';
    default: return 'bv*+ba/b';
  }
}

function findDownloadedFile(dir, id) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.includes('[' + id + ']') && !f.endsWith('.part') && !f.endsWith('.ytdl'))
      .map((f) => path.join(dir, f))
      .map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .map((x) => x.f)[0] || null;
  } catch {
    return null;
  }
}

ipcMain.handle('ytdlp:status', async () => {
  const found = await ensureYtDlp();
  return { available: !!found, command: found ? found.cmd + ' ' + found.prefix.join(' ') : null };
});

ipcMain.handle('ffmpeg:status', async () => {
  const local = localFfmpeg();
  if (local) return { available: true, location: local };
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 15000, windowsHide: true });
    return { available: true, location: 'PATH' };
  } catch {
    return { available: false, location: null };
  }
});

ipcMain.handle('ytdlp:update', async () => {
  const found = await ensureYtDlp();
  if (!found) throw new Error('yt-dlp not found');
  const { stdout, stderr } = await execFileAsync(found.cmd, [...found.prefix, '-U'], {
    timeout: 180000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { output: ((stdout || '') + (stderr || '')).trim() };
});

ipcMain.handle('ytdlp:info', async (_event, url) => {
  const found = await ensureYtDlp();
  if (!found) throw new Error('yt-dlp not found');
  const { stdout } = await execFileAsync(
    found.cmd,
    [...found.prefix, '--no-warnings', '--skip-download', '--print', '%(id)s\t%(duration)s\t%(uploader)s\t%(timestamp)s\t%(title)s', url],
    { maxBuffer: 1024 * 1024 * 16, timeout: 120000, windowsHide: true }
  );
  const parts = stdout.replace(/\r?\n+$/, '').split('\t');
  const id = parts[0];
  const duration = Number(parts[1]) || 0;
  const uploader = parts[2] || '';
  const startTime = /^\d+$/.test(parts[3] || '') ? Number(parts[3]) : 0;
  const title = parts.slice(4).join('\t') || id;
  return { id, duration, uploader, startTime, title };
});

ipcMain.handle('ytdlp:download', async (event, { url, quality, dir, id, uid }) => {
  const found = await ensureYtDlp();
  if (!found) throw new Error('yt-dlp not found');
  fs.mkdirSync(dir, { recursive: true });

  const jobId = Math.random().toString(36).slice(2, 10);
  const args = [
    ...found.prefix,
    '--newline',
    '--no-playlist',
    '--concurrent-fragments', '8',
    '--retries', '10',
    '--fragment-retries', '10',
    ...ffmpegArgs(),
    '-f', formatFor(quality),
    '--merge-output-format', 'mp4',
    '-o', path.join(dir, '%(title)s [%(id)s].%(ext)s'),
    url,
  ];

  const child = spawn(found.cmd, args, { windowsHide: true });
  downloadJobs.set(uid, child);

  return await new Promise((resolve, reject) => {
    let stderrTail = '';
    const emit = (line) => {
      if (!event.sender.isDestroyed()) event.sender.send('ytdlp:progress', { jobId, uid, line });
    };
    child.stdout.on('data', (d) => d.toString().split(/\r?\n/).forEach((l) => l && emit(l)));
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      text.split(/\r?\n/).forEach((l) => l && emit(l));
    });
    child.on('error', (err) => {
      downloadJobs.delete(uid);
      reject(err);
    });
    child.on('close', (code) => {
      downloadJobs.delete(uid);
      if (code !== 0) return reject(new Error(stderrTail.trim() || 'yt-dlp exited with code ' + code));
      resolve({ jobId, file: findDownloadedFile(dir, id) });
    });
  });
});

ipcMain.handle('ytdlp:cancel', async (_event, uid) => {
  const child = downloadJobs.get(uid);
  if (child) {
    child.kill();
    downloadJobs.delete(uid);
    return true;
  }
  return false;
});
