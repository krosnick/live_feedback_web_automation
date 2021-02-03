var express = require('express');
const { BrowserWindow, BrowserView, webContents } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');
const _ = require('lodash');
const path = require('path');
const { resetTargetPages, addTargetPages } = require('./puppeteer');

/* GET home page. */
router.get('/', function(req, res, next) {

    // Check DB for existing files
    // If no existing files, create a new one
    req.app.locals.filesCollection.find().sort( { lastModified: -1 } ).toArray(function(error, docs){
        let fileObj;
        if(docs.length > 0){
            // There are existing files
            // Choose the one that was most recently edited (i.e., the first one in this sorted list)
            fileObj = docs[0];
            req.app.locals.fileID = fileObj.fileID;
            console.log("mostRecentlyModifiedFileObj", fileObj);

            const startingUrl = fileObj.startingUrl;
            // Will show example windows if there is a non-null url
            resetExampleWindows(req, startingUrl);
        }else{
            // No existing files, create a new one
            req.app.locals.fileID = uuidv1();
            // Insert new entry into DB
            fileObj = {
                fileID: req.app.locals.fileID,
                fileName: "untitled_" + req.app.locals.fileID + ".js",
                fileContents: "",
                lastModified: Date.now()
            };
            req.app.locals.filesCollection.insertOne(fileObj);
        }

        // Create pairs of file IDs and names
        let fileIDNamePairs = [];
        // Add all pairs to the list (except for the first one which is actually being shown)
        for(let i = 1; i < docs.length; i++){
            fileIDNamePairs.push({
                fileID: docs[i].fileID,
                fileName: docs[i].fileName
            });
        }
        console.log("fileIDNamePairs", fileIDNamePairs);

        // Now render appropriately
        res.render('layouts/index', {
            currentFileID: fileObj.fileID,
            currentFileName: fileObj.fileName,
            currentFileContents: fileObj.fileContents,
            fileIDNamePairs: fileIDNamePairs,
            routesRoot: __dirname // e.g., /Users/rkros/Desktop/desktop/PhD/web_automation/expressapp/routes
        });
    });
});

router.get('/border', function(req, res, next) {
    res.render('layouts/border', { layout: 'borderLayout' });
});

router.get('/windowSelection', function(req, res, next) {
    res.render('layouts/windowSelection', {
        layout: 'windowSelectionLayout'
    });
});

router.post('/hideShowWindows', function(req, res, next) {
    const pageWinIDToHide = req.body.oldPageWinID;
    const pageWinIDToShow = req.body.newPageWinID;
    console.log("pageWinIDToHide", pageWinIDToHide);
    console.log("pageWinIDToShow", pageWinIDToShow);

    console.log("req.app.locals.windowMetadata", req.app.locals.windowMetadata);
    // Hide the page and border BrowserViews corresponding to pageWinIDToHide
    const toHideBrowserViewsObj = req.app.locals.windowMetadata[pageWinIDToHide].browserViews;
    console.log("toHideBrowserViewsObj", toHideBrowserViewsObj);
    /*req.app.locals.win.removeBrowserView(toHideBrowserViewsObj.pageView);
    req.app.locals.win.removeBrowserView(toHideBrowserViewsObj.borderView);*/
    movePageWindowOutOfView(toHideBrowserViewsObj.pageView);
    moveBorderWindowOutOfView(toHideBrowserViewsObj.borderView);

    // Show the page and border BrowserViews corresponding to pageWinIDToShow
    const toShowBrowserViewObj = req.app.locals.windowMetadata[pageWinIDToShow].browserViews;
    console.log("toShowBrowserViewObj", toShowBrowserViewObj);
    /*req.app.locals.win.addBrowserView(toShowBrowserViewObj.pageView);
    req.app.locals.win.addBrowserView(toShowBrowserViewObj.borderView);*/
    movePageWindowIntoView(toShowBrowserViewObj.pageView);
    moveBorderWindowIntoView(toShowBrowserViewObj.borderView);

    res.end();
});

const addExampleWindows = function(req, paramSets){
    req.app.locals.targetPageListReady = false;

    req.app.locals.filesCollection.find({
        fileID: req.app.locals.fileID
    }).toArray(function(error, docs){
        const startingUrl = docs[0].startingUrl;

        // Add window per paramSet
        for(let i = 0; i < paramSets.length; i++){
            const paramSet = paramSets[i];
            const windowIndexInApp = Object.keys(req.app.locals.windowMetadata).length;
            createExampleWindow(req, windowIndexInApp, paramSet, startingUrl);
        }

        setTimeout((req, startingUrl) => {
            addTargetPages(req, startingUrl);
        }, 1000, req, startingUrl);
    });
};

const resetExampleWindows = function(req, startingUrl){
    req.app.locals.targetPageListReady = false;
    // First remove all existing BrowserViews (except for editor browser view and window selection view)
    const browserViews = req.app.locals.win.getBrowserViews();
    for(let browserView of browserViews){
        if((browserView.webContents.id !== req.app.locals.editorBrowserViewID) && (browserView.webContents.id !== req.app.locals.windowSelectionViewID)){
            // Since when choosing puppeteer targets later we identify based on the url,
                // we want to ensure this BrowserView's url is cleared (in case it's actually the same/similar to future url)
            browserView.webContents.loadURL("");
            
            // Essentially "hiding"; process still exists
            req.app.locals.win.removeBrowserView(browserView);
        }
    }

    req.app.locals.windowMetadata = {};

    // Only populate windows if there's a real url
    if(startingUrl !== null){
        // The different sets of parameter values we're testing;
        // for now we'll hard-code here, so that we have some test cases and can create
        // BrowserView windows for them. In the future we'll create BrowserView windows
        // on-demand based on user or system provided test cases
        // Format?: [{ <param1>: <val1>, <param2>: <val1> }, { <param1>: <val2>, <param2>: <val2> }]
        //const parameterValueSets = [ {1: "Home & Kitchen",  2: "can opener"}, {1: "Arts, Crafts & Sewing", 2: "colored pencils"} ];
        
        // For now, make this just length 1; later on we'll dynamically show the correct number
            // of windows based on the actual number of param sets created by the user
        //const parameterValueSets = [ {1: "Home & Kitchen",  2: "can opener"} ];
        //const parameterValueSets = [ null ];
        let parameterValueSets; // This needs to contain the equivalent of what's in paramCodeString

        req.app.locals.filesCollection.find({
            fileID: req.app.locals.fileID
        }).toArray(function(error, docs){
            const paramCodeString = docs[0].paramCodeString;
            parameterValueSets = _.uniqWith(JSON.parse(paramCodeString), _.isEqual);
            console.log("parameterValueSets", parameterValueSets);
            if(parameterValueSets.length === 0){
                parameterValueSets = [ null ];
            }
            console.log("updated parameterValueSets", parameterValueSets);

            for(let i = 0; i < parameterValueSets.length; i++){
                const paramSet = parameterValueSets[i];
                createExampleWindow(req, i, paramSet, startingUrl);
            }
    
            setTimeout((req, startingUrl) => {
                resetTargetPages(req, startingUrl);
            }, 1000, req, startingUrl);
        });
    }
};

const moveBorderWindowIntoView = function(borderView){
    console.log("moveBorderWindowIntoView");
    borderView.setBounds({ x: 780, y: 30, width: 920, height: 900 });
};

const moveBorderWindowOutOfView = function(borderView){
    console.log("moveBorderWindowOutOfView");
    borderView.setBounds({ x: 780, y: 1000, width: 920, height: 900 });
};

const movePageWindowIntoView = function(pageView){
    console.log("movePageWindowIntoView");
    pageView.setBounds({ x: 800, y: 60, width: 860, height: 820 });
};

const movePageWindowOutOfView = function(pageView){
    console.log("movePageWindowOutOfView");
    pageView.setBounds({ x: 800, y: 1000, width: 860, height: 820 });
};

const createExampleWindow = function(req, windowIndexInApp, paramSet, startingUrl){
    const paramString = JSON.stringify(paramSet);
    
    // Create a BrowserView to contain the actual website, and then create a background border BrowserView
    const borderView = new BrowserView({webPreferences: {nodeIntegration: true } });
    req.app.locals.win.addBrowserView(borderView);
    /*// Then remove BrowserView if it's not the first param set (we only want to show 1 param set at a time)
    if(Object.keys(req.app.locals.windowMetadata).length > 0){
        req.app.locals.win.removeBrowserView(borderView);
    }*/
    //borderView.setBounds({ x: 780, y: (windowIndexInApp*500 + 100), width: 920, height: 530 });
    //borderView.setBounds({ x: 780, y: 100, width: 920, height: 530 });
    const isFirstWindow = Object.keys(req.app.locals.windowMetadata).length === 0;
    if(isFirstWindow){
        // First param set; show it
        moveBorderWindowIntoView(borderView);
    }else{
        // Not the first param set; render it outside viewport
        moveBorderWindowOutOfView(borderView);
    }
    borderView.webContents.executeJavaScript(`
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('errorMessage', function(event, message){
            console.log('errorMessage occurred');
            document.querySelector('#borderElement').classList.add('errorBorder');
            document.querySelector('#errorMessage').textContent = message;
        });
        ipcRenderer.on('clear', function(event){
            console.log('clear occurred');
            document.querySelector('#borderElement').classList.remove('errorBorder');
            document.querySelector('#errorMessage').textContent = "";
        });
        ipcRenderer.on('updateParameters', function(event, message){
            console.log('updateParameters occurred');
            document.querySelector('#parameters').textContent = message;
        });
        0
    `);
    //borderView.webContents.send("updateParameters", paramString);
    /*borderView.webContents.once('did-frame-finish-load', () => {
        borderView.webContents.send("updateParameters", paramString);

        if(req.app.locals.windowMetadata[pageView.webContents.id].browserViews){
            req.app.locals.windowMetadata[pageView.webContents.id].browserViews.borderView = borderView;
        }else{
            req.app.locals.windowMetadata[pageView.webContents.id].browserViews = {
                borderView: borderView
            };
        }
    });*/
    borderView.webContents.loadURL('http://localhost:3000/border');
    borderView.webContents.openDevTools({mode: "detach"});
    //borderView.webContents.send("updateParameters", paramString);
    setTimeout(() => {
        borderView.webContents.send("updateParameters", paramString);
    }, 2000); // This is hacky, because if 2 seconds isn't enough, the param values will never be shown
    /*borderView.webContents.once('did-frame-navigate', () => {
        borderView.webContents.send("updateParameters", paramString);
    });*/

    const pageView = new BrowserView({
        webPreferences: {
            nodeIntegration: true,
            webSecurity: false,
            enableRemoteModule: true,
            preload: path.resolve(__dirname, '../public/javascript/pageViewPreload.js')
        }
    });
    req.app.locals.win.addBrowserView(pageView);
    /*// Then remove BrowserView if it's not the first param set (we only want to show 1 param set at a time)
    if(Object.keys(req.app.locals.windowMetadata).length > 0){
        req.app.locals.win.removeBrowserView(pageView);
    }*/
    //pageView.setBounds({ x: 800, y: 130, width: 860, height: 450 });
    if(isFirstWindow){
        // First param set; show it
        movePageWindowIntoView(pageView);
    }else{
        // Not the first param set; render it outside viewport
        movePageWindowOutOfView(pageView);
    }
    pageView.webContents.once('did-frame-finish-load', () => {
        req.app.locals.windowSelectionView.webContents.send("addWindow", pageView.webContents.id, paramString, isFirstWindow);

        /*if(req.app.locals.windowMetadata[pageView.webContents.id].browserViews){
            req.app.locals.windowMetadata[pageView.webContents.id].browserViews.borderView = borderView;
        }else{
            req.app.locals.windowMetadata[pageView.webContents.id].browserViews = {
                borderView: borderView
            };
        }

        if(req.app.locals.windowMetadata[pageView.webContents.id].browserViews){
            req.app.locals.windowMetadata[pageView.webContents.id].browserViews.pageView = pageView;
        }else{
            req.app.locals.windowMetadata[pageView.webContents.id].browserViews = {
                pageView: pageView
            };
        }*/
    });
    pageView.webContents.loadURL(addHttpsIfNeeded(startingUrl));
    pageView.webContents.openDevTools({mode: "bottom"});

    /*// Only show the BrowserViews if this is the first param set
    if(Object.keys(req.app.locals.windowMetadata).length === 0){
        req.app.locals.win.addBrowserView(borderView);
        req.app.locals.win.addBrowserView(pageView);
    }*/

    // This is kind of hacky, waiting 3 seconds. Because if the computer is slow and 3 seconds isn't enough,
     //then #windowSelectMenu won't be populated appropriately
    /*setTimeout(() => {
        req.app.locals.windowSelectionView.webContents.send("addWindow", req.app.locals.windowSelectionViewID, paramString);
    }, 3000);*/
    //pageView.webContents.on('dom-ready', () => {
    //pageView.webContents.on('new-window', () => {
    

    // Store metadata in this global object
    req.app.locals.windowMetadata[pageView.webContents.id] = {
        browserViews: {
            pageView: pageView,
            borderView: borderView
        },
        correspondingBorderWinID: borderView.webContents.id,
        parameterValueSet: paramSet
    };
};

// If no http or https prefix, add https prefix (only for purposes of calling webContents.loadURL)
const addHttpsIfNeeded = function(startingUrl){
    let trimmedNewURL = startingUrl.trim();
    const httpIndex = trimmedNewURL.indexOf("http://");
    const httpsIndex = trimmedNewURL.indexOf("https://");

    if(httpIndex === 0){
        // replace it with https instead
        trimmedNewURL = trimmedNewURL.replace("http://", "https://");
    }else if(httpsIndex === -1){
        // neither https or http present; append https at front
        trimmedNewURL = "https://" + trimmedNewURL;
    }
    return trimmedNewURL;
};

module.exports = {
    router,
    resetExampleWindows,
    addExampleWindows
};