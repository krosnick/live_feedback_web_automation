const contextMenu = require('electron-context-menu');
const remote = require('electron').remote;
const { app } = remote;
console.log("app", app);
//contextMenu();

setTimeout(() => {
    console.log("Inside setTimeout");
    const remoteWebContents = remote.getCurrentWebContents();
    //remoteWebContents.focus();
    contextMenu({
        window: {
            webContents: remoteWebContents,
            inspectElement: remoteWebContents.inspectElement.bind(remoteWebContents)
        }
    });

    /*document.querySelector("body").addEventListener("blur", function(){
        console.log("blur occurred");
    });*/

    /*document.querySelector("body").addEventListener("focus", function(){
        console.log("focus event");
    });*/
}, 1000);
/*setTimeout(function(){
    const remoteWebContents = remote.getCurrentWebContents();
    contextMenu({
        window: {
            webContents: remoteWebContents,
            inspectElement: remoteWebContents.inspectElement.bind(remoteWebContents)
        }
    });
}, 0);*/

//window.addEventListener('focus', () => remote.getCurrentWebContents().focus());
//window.addEventListener('focus', () => console.log("focus"));


/*document.querySelector("body").addEventListener("focus", function(){
    console.log("focus event");
});*/

/*window.addEventListener('DOMContentLoaded', function () {
    //alert("It's loaded!")
    document.querySelector("body").addEventListener("blur", function(){
        console.log("blur occurred");
    });
});*/

/*addEventListener('dom-ready', () => {
    webview.focus()
})*/