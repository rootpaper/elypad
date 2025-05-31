const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');

process.env.LANG = 'en_US.UTF-8';

let mainWindow;
let fileWatcher;

function createWindow() {
 mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  icon: path.join(__dirname, 'icon.png'),
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  },
  backgroundColor: '#1a1a1a',
  show: false
});

  mainWindow.loadFile('index.html').then(() => {
    console.log('index.html loaded successfully');
  }).catch((err) => {
    console.error('error loading index.html:', err.message);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  
Menu.setApplicationMenu(null);

}

ipcMain.handle('open-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'lua files', extensions: ['lua'] }, { name: 'all files', extensions: ['*'] }]
    });
    return result;
  } catch (err) {
    console.error('error in open file:', err.message);
    return { canceled: true, error: err.message };
  }
});

ipcMain.handle('open-folder-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result;
  } catch (err) {
    console.error('error in open folder:', err.message);
    return { canceled: true, error: err.message };
  }
});

ipcMain.handle('save-file-dialog', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'lua files', extensions: ['lua'] }, { name: 'all files', extensions: ['*'] }]
    });
    return result;
  } catch (err) {
    console.error('error in save file:', err.message);
    return { canceled: true, error: err.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (err) {
    console.error('error reading file:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    console.error('error writing file:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = entries.map(item => ({
      name: item.name,
      path: path.join(dirPath, item.name),
      isDirectory: item.isDirectory(),
      isFile: item.isFile()
    }));
    return { success: true, items: result };
  } catch (err) {
    console.error('error reading directory:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('watch-directory', async (event, dirPath) => {
  try {
    if (fileWatcher) {
      fileWatcher.close();
    }

    fileWatcher = chokidar.watch(dirPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true
    });

    fileWatcher.on('change', (filePath) => {
      mainWindow.webContents.send('file-changed', filePath);
    });

    fileWatcher.on('add', (filePath) => {
      mainWindow.webContents.send('file-added', filePath);
    });

    fileWatcher.on('unlink', (filePath) => {
      mainWindow.webContents.send('file-removed', filePath);
    });

    return { success: true };
  } catch (err) {
    console.error('error watching directory:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      success: true,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      size: stats.size,
      modified: stats.mTime
    };
  } catch (err) {
    console.error('error getting file stats:', err.message);
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  try {
    createWindow();
  } catch (err) {
    console.error('error creating window:', err.message);
  }
});

app.on('window-all-closed', () => {
  if (fileWatcher) {
    fileWatcher.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});