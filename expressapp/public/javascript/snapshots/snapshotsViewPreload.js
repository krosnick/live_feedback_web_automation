const { remote } = require('electron');
const contextMenu = require('electron-context-menu');

// Right-click context menu
const remoteWebContents = remote.getCurrentWebContents();
contextMenu({
    window: {
        webContents: remoteWebContents,
        inspectElement: remoteWebContents.inspectElement.bind(remoteWebContents)
    }
});