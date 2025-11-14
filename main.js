const {app, BrowserWindow, ipcMain, session} = require('electron');
const path = require('path');

function createMainWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true
        }
    });




    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

ipcMain.handle('open-multiple-windows', async (event, {url, count}) => {
    const total = Number(count);

    if (!url || !total || total <= 0) {
        return {ok: false, message: 'URL o cantidad inválida.'};
    }

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
    }

    for (let i = 0; i < total; i++) {
        const partitionName = `persist:session-${Date.now()}-${i}`;
        const ses = session.fromPartition(partitionName);

        const win = new BrowserWindow({
            width: 1024,
            height: 768,
            webPreferences: {
                session: ses
            }
        });

        win.loadURL(finalUrl);
    }

    return {ok: true, message: `Se abrieron ${total} ventanas hacia ${finalUrl}`};
});

app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
