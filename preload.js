const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openMultipleWindows: (data) => ipcRenderer.invoke('open-multiple-windows', data)
});
