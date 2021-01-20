var express = require('express');
const { BrowserWindow, BrowserView } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');
const { resetTargetPages } = require('./puppeteer');

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
            updateExampleWindows(req, startingUrl);
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
    res.render('layouts/border', { layout: 'other' });
});

const updateExampleWindows = function(req, startingUrl){
    req.app.locals.targetPageListReady = false;
    // First remove all existing BrowserViews (except for editor browser view)
    const browserViews = req.app.locals.win.getBrowserViews();
    for(let browserView of browserViews){
        if(browserView.webContents.id !== req.app.locals.editorBrowserViewID){
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
        const parameterValueSets = [ {1: "Home & Kitchen",  2: "can opener"} ];

        for(let i = 0; i < parameterValueSets.length; i++){
            const paramSet = parameterValueSets[i]
            // Create a BrowserView to contain the actual website, and then create a background border BrowserView
            const borderView = new BrowserView({webPreferences: {nodeIntegration: true } });
            req.app.locals.win.addBrowserView(borderView);
            //borderView.setBounds({ x: 780, y: 0, width: 940, height: 470 });
            borderView.setBounds({ x: 780, y: i*500, width: 920, height: 530 });
            borderView.webContents.loadURL('http://localhost:3000/border');
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
                0
            `);
            borderView.webContents.openDevTools({mode: "detach"});

            const pageView = new BrowserView({webPreferences: {zoomFactor: 0.5, nodeIntegration: true, webSecurity: false } });
            req.app.locals.win.addBrowserView(pageView);
            pageView.setBounds({ x: 800, y: (i*500 + 30), width: 860, height: 450 });
            pageView.webContents.loadURL(addHttpsIfNeeded(startingUrl));
            pageView.webContents.openDevTools();

            // Store metadata in this global object
            req.app.locals.windowMetadata[pageView.webContents.id] = {
                correspondingBorderWinID: borderView.webContents.id,
                parameterValueSet: paramSet
            };
        }

        setTimeout((req, startingUrl) => {
            resetTargetPages(req, startingUrl);
        }, 1000, req, startingUrl);
    }
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
    updateExampleWindows
};