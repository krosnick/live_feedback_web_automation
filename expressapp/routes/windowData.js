var express = require('express');
var router = express.Router();

router.post('/getBorderWinIDs', function(req, res, next) {
    // return list of border window IDs
    const borderWinIDList = [];
    const objList = Object.values(req.app.locals.windowMetadata);
    for(obj of objList){
        borderWinIDList.push(obj.correspondingBorderWinID);
    }
    res.send(borderWinIDList);
});

router.post('/goBack', function(req, res, next) {
    const borderViewID = parseInt(req.body.borderViewID);
    // Find the corresponding pageViewID, then tell its webContents to goBack
    let pageViewID;
    for (const [key, value] of Object.entries(req.app.locals.windowMetadata)) {
        if(value.correspondingBorderWinID === borderViewID){
            pageViewID = parseInt(key);
            break;
        }
    }
    const pageWebContents = req.app.locals.windowMetadata[pageViewID].browserViews.pageView.webContents;
    pageWebContents.goBack();
    const canGoBack = pageWebContents.canGoBack();
    const canGoForward = pageWebContents.canGoForward();
    res.send({
        canGoBack: canGoBack,
        canGoForward: canGoForward
    });
});

router.post('/goForward', function(req, res, next) {
    const borderViewID = parseInt(req.body.borderViewID);
    // Find the corresponding pageViewID, then tell its webContents to goForward
    let pageViewID;
    for (const [key, value] of Object.entries(req.app.locals.windowMetadata)) {
        if(value.correspondingBorderWinID === borderViewID){
            pageViewID = parseInt(key);
            break;
        }
    }
    const pageWebContents = req.app.locals.windowMetadata[pageViewID].browserViews.pageView.webContents;
    pageWebContents.goForward();
    const canGoBack = pageWebContents.canGoBack();
    const canGoForward = pageWebContents.canGoForward();
    res.send({
        canGoBack: canGoBack,
        canGoForward: canGoForward
    });
});

module.exports = {
    router
};