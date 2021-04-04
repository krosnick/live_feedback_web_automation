// Messaging approach from https://stackoverflow.com/questions/52236641/electron-ipc-and-nodeintegration
const { ipcRenderer, remote } = require('electron');
const contextMenu = require('electron-context-menu');
ipcRenderer.on('highlightUIElements', function(event, selector){
    window.postMessage({
        type: 'highlightUIElements',
        selector: selector,
    });
});

ipcRenderer.on('clearHighlightedUIElements', function(event){
    window.postMessage({
        type: 'clearHighlightedUIElements'
    });
});

window.rrwebSnapshot = require("rrweb-snapshot");
window.getCurrentSnapshot = function(){
    return window.rrwebSnapshot["snapshot"](document)[0];
};

// Right-click context menu
const remoteWebContents = remote.getCurrentWebContents();
contextMenu({
    window: {
        webContents: remoteWebContents,
        inspectElement: remoteWebContents.inspectElement.bind(remoteWebContents)
    }
});