$(function(){
    /*const { webContents } = require('electron').remote
    const emittedOnce = (element, eventName) => new Promise(resolve => {
        element.addEventListener(eventName, event => resolve(event), { once: true })
    })
    const browserView = document.getElementById('browser')
    console.log("browserView", browserView);
    const devtoolsView = document.getElementById('devtools')
    console.log("devtoolsView", devtoolsView)
    const browserReady = emittedOnce(browserView, 'dom-ready')
    const devtoolsReady = emittedOnce(devtoolsView, 'dom-ready')
    Promise.all([browserReady, devtoolsReady]).then(() => {
        const browser = webContents.fromId(browserView.getWebContentsId())
        const devtools = webContents.fromId(devtoolsView.getWebContentsId())
        browser.setDevToolsWebContents(devtools)
        browser.openDevTools()
    })*/

    /*webview = document.querySelector('#webview1');
    webview.addEventListener('dom-ready', () => {
        webview.openDevTools({});
    });*/

    setTimeout(function(){
        $.post("/puppeteer/runPuppeteerCode",
            function(){
                console.log("runPuppeteerCode done func called");
            }
        );
    }, 5000);
});