const express = require('express');
const capcon = require('capture-console');
var router = express.Router();
//const remote = require('electron').remote;
//const unique = require('unique-selector');
//const strip = require('strip-comments');

//let webviewTargetPage;
let targetPagesList = [];
let currentRes = undefined;
let currentReq = undefined;
let numBrowserWindowsFinishedCodeExecution = 0;
let browserWindowErrors = {}; // {winID: { errorMessage, errorLineNumber }}

//let codeToRunAfterPause = undefined;
let currentCodeString = undefined;


/*// This is for running the macro code using the barebones input values
    // (when the user explicitly clicks one of the "Run" buttons)
router.post('/runGroup', async function(req, res, next) {
    const runFuncString = req.body.runFuncString;
    let updatedRunFuncString = runFuncString.replace(/await page/gi, 'await webviewTargetPage');
    //console.log("updatedRunFuncString", updatedRunFuncString);
    
    
    // Update updatedRunFuncString to wrap contents of funcToRun with a try catch, so that we can send the error back to the client
    const functionMatchingStringArray = updatedRunFuncString.match(/(function)\s+(funcToRun)/);
    const functionMatchingString = functionMatchingStringArray[0];
    const indexOfFunctionMatchingString = updatedRunFuncString.indexOf(functionMatchingString);
    const indexOfOpeningCurlyBrace = updatedRunFuncString.indexOf("{", indexOfFunctionMatchingString);
    
    const funcToRunCallMatchingStringArray = updatedRunFuncString.match(/(funcToRun\(params\))/);
    const funcToRunCallMatchingString = funcToRunCallMatchingStringArray[0];
    const indexOfFuncToRunCallMatchingString = updatedRunFuncString.indexOf(funcToRunCallMatchingString);
    const indexOfClosingCurlyBrace = updatedRunFuncString.lastIndexOf("}", indexOfFuncToRunCallMatchingString);

    const beginningString = updatedRunFuncString.substring(0, indexOfOpeningCurlyBrace + 1);
    const endingString = updatedRunFuncString.substring(indexOfClosingCurlyBrace);

    const middleStringToWrap = updatedRunFuncString.substring(indexOfOpeningCurlyBrace + 1, indexOfClosingCurlyBrace);
    const wrappedBodyString = `try {`
    + middleStringToWrap +
    `} catch (error) {
        let errorMessage = error.name + ": " + error.message;
        console.error(error);
        currentRes.send({type: 'groupFailure', errorMessage: errorMessage});
        return;
    }`;
    
    console.log("wrappedBodyString", wrappedBodyString);
    
    updatedRunFuncString = beginningString + wrappedBodyString + endingString;
    console.log("updatedRunFuncString", updatedRunFuncString);

    currentCodeString = updatedRunFuncString;

    console.log("updatePuppeteerPage", updatePuppeteerPage);

    currentRes = res;
    if(!webviewTargetPage || updatePuppeteerPage){
        resetWebviewTargetPage(req, function(){
            updatePuppeteerPage = false;
            eval(updatedRunFuncString);
        });
    }else{
        eval(updatedRunFuncString);
    }
});

router.post('/continueRunning', async function(req, res, next) {
    console.log("continueRunning");
    console.log("currentCodeString", currentCodeString);
    currentRes = res;
    if(!webviewTargetPage || updatePuppeteerPage){
        resetWebviewTargetPage(req, function(){
            updatePuppeteerPage = false;
            eval(currentCodeString);
        });
    }else{
        eval(currentCodeString);
    }
});*/

/*router.post('/runPuppeteerCode', async function(req, res, next) {
    console.log("runPuppeteerCode");
    currentRes = res;
    if(!webviewTargetPage){
        resetWebviewTargetPage(req, function(){
            //updatePuppeteerPage = false;
            //eval(currentCodeString);
            //console.log("webviewTargetPage", webviewTargetPage);
            //console.log("Before eval");
            eval("async function x() { console.log('before'); await webviewTargetPage.type('#twotabsearchtextbox', 'toothpaste'); console.log('after'); } x();");
            //console.log("After eval");
        });
    }else{
        //eval(currentCodeString);
        //console.log("webviewTargetPage", webviewTargetPage);
        //console.log("Before eval");
        eval("async function x() { console.log('before'); await webviewTargetPage.type('#twotabsearchtextbox', 'toothpaste'); console.log('after'); } x();");
        //console.log("After eval");
    }

    setTimeout(function(){
        console.log("req.app.locals.win", req.app.locals.win);
        console.log("req.app.locals.view1", req.app.locals.view1);
        console.log("req.app.locals.view2", req.app.locals.view2);

        // Testing removing the BrowserView
        req.app.locals.win.removeBrowserView(req.app.locals.view1);
        setTimeout(function(){
            // Testing adding the BrowserView back, to see if the state is the same
            req.app.locals.win.addBrowserView(req.app.locals.view1);
            
            // Yes the UI state is the same (e.g., Amazon search bar still shows the search text)
        }, 5000);

    }, 8000);
});*/

router.post('/runPuppeteerCode', async function(req, res, next) {
    console.log("runPuppeteerCode");
    const code = req.body.code;
    browserWindowErrors = {}; // resetting, so that it contains errors only for the current run

    //let updatedCodeString = code.replace(/await page/gi, 'await webviewTargetPage');
    //console.log("updatedRunFuncString", updatedRunFuncString);
    
    
    // Update updatedRunFuncString to wrap contents with a try catch, so that we can send the error back to the client
    /*const functionMatchingStringArray = updatedRunFuncString.match(/(function)\s+(funcToRun)/);
    const functionMatchingString = functionMatchingStringArray[0];
    const indexOfFunctionMatchingString = updatedRunFuncString.indexOf(functionMatchingString);
    const indexOfOpeningCurlyBrace = updatedRunFuncString.indexOf("{", indexOfFunctionMatchingString);
    
    const funcToRunCallMatchingStringArray = updatedRunFuncString.match(/(funcToRun\(params\))/);
    const funcToRunCallMatchingString = funcToRunCallMatchingStringArray[0];
    const indexOfFuncToRunCallMatchingString = updatedRunFuncString.indexOf(funcToRunCallMatchingString);
    const indexOfClosingCurlyBrace = updatedRunFuncString.lastIndexOf("}", indexOfFuncToRunCallMatchingString);*/

    /*const beginningString = updatedRunFuncString.substring(0, indexOfOpeningCurlyBrace + 1);
    const endingString = updatedRunFuncString.substring(indexOfClosingCurlyBrace);

    const middleStringToWrap = updatedRunFuncString.substring(indexOfOpeningCurlyBrace + 1, indexOfClosingCurlyBrace);*/
    let wrappedCodeString = `let errorMessage; let errorLineNumber; async function x ( winID ) { try {`
    //+ middleStringToWrap +
    + code +
    `} catch (error) {
        errorMessage = error.name + ": " + error.message;
        console.error(error);

        // Find line number where error occurred
        errorLineNumber = parseInt(findPuppeteerErrorLineNumber(error.stack));
        
        return;
    } finally {
        numBrowserWindowsFinishedCodeExecution += 1;
        if(errorMessage){
            browserWindowErrors[winID] = { errorMessage: errorMessage,  errorLineNumber: errorLineNumber, correspondingBorderWinID: currentReq.app.locals.windowMetadata[winID].correspondingBorderWinID};
        }
        if(numBrowserWindowsFinishedCodeExecution === Object.keys(currentReq.app.locals.windowMetadata).length){
            // All windows have finished executing now
            numBrowserWindowsFinishedCodeExecution = 0; // reset
            // Stop captures and send blank response 
            capcon.stopCapture(process.stdout);
            capcon.stopCapture(process.stderr);
            if(Object.keys(browserWindowErrors).length > 0){
                currentRes.send(browserWindowErrors);
            }else{
                currentRes.end();
            }
        }
    }}`;
    //}} x();`;
    console.log("wrappedCodeString", wrappedCodeString);

    currentRes = res;
    currentReq = req;
    //if(!webviewTargetPage){
    /*if(targetPagesList.length === 0){
        resetTargetPages(req, function(){
            evaluateCodeOnAllPages(wrappedCodeString);
            //updatePuppeteerPage = false;
            //eval(updatedCodeString);
            //eval("async function x() { console.log('before'); await webviewTargetPage.type('#twotabsearchtextbox', 'toothpaste'); console.log('after'); } x();");
        });
    }else{
        evaluateCodeOnAllPages(wrappedCodeString);
        //eval(updatedCodeString);
        //eval("async function x() { console.log('before'); await webviewTargetPage.type('#twotabsearchtextbox', 'toothpaste'); console.log('after'); } x();");
    }*/

    // For now checking the db for startingUrl and resetting the target pages
        // each time "Run" is clicked. If this is too slow (which it probably will be, esp for live feedback),
        // then we can adjust this to reset target pages less often, only when file changes,
        // when user updates url, etc.
        // Maybe a way to do it even less often is to keep a boolean of whether the windows need to be updated
        // and have this boolean set to "true" anytime the file changes or user updates url.
        // Then, we can set the target pages later only when we need to run the code (so ideally by this point
        // the BrowserViews will all have been updated)
    req.app.locals.filesCollection.find({
        fileID: req.app.locals.fileID
    }).toArray(function(error, docs){
        //console.log("docs[0].startingUrl", docs[0].startingUrl);
        resetTargetPages(req, docs[0].startingUrl, function(){
            evaluateCodeOnAllPages(wrappedCodeString);
        });
    });
});

const findPuppeteerErrorLineNumber = function(errorStackString){
    const lineStrings = errorStackString.split("\n");
    for(let i = 0; i < lineStrings.length; i++){
        const lineString = lineStrings[i].trim();
        if(lineString.indexOf("at async x") > -1){
            const lastColonIndex = lineString.lastIndexOf(":");
            const secondToLastColonIndex =  lineString.lastIndexOf(":", lastColonIndex-1);
            const lineNumber = lineString.substring(secondToLastColonIndex+1, lastColonIndex);
            return lineNumber;
        }
    }
};

const evaluateCodeOnAllPages = function(wrappedCodeString){
    console.log("evaluateCodeOnAllPages");
    capcon.startCapture(process.stdout, function (stdout) {
        updateClientSideTerminal(stdout, false);
    });
    capcon.startCapture(process.stderr, function (stderr) {
        updateClientSideTerminal(stderr, true);
    });
    for(let i = 0; i < targetPagesList.length; i++){
        let updatedCodeString = wrappedCodeString.replace(/await page/gi, 'await targetPagesList[' + i + ']');
        const lowestTestCaseWinID = lowestTestCaseWindowID();
        // Times 2 because we have 2 BrowserViews per test case; lowestTestCaseWindowID() for offset
        updatedCodeString += ` x(${(i*2) + lowestTestCaseWinID});`;
        eval(updatedCodeString);
    }
};

const lowestTestCaseWindowID = function(){
    const testCaseWinIDs = Object.keys(currentReq.app.locals.windowMetadata);
    testCaseWinIDs.sort();
    return parseInt(testCaseWinIDs[0]);
};

const updateClientSideTerminal = function(stdOutOrErr, isError){
    // Add new output/error to client-side terminal
    const editorBrowserViewWebContents = currentReq.app.locals.editorBrowserView.webContents;

    let className = "";
    if(isError){
        className = "errorText";
    }

    // Need to split stdOutOrErr by \n, so then we print each line individually
    const itemsToPrint = stdOutOrErr.split('\n');
    itemsToPrint.forEach(function(str){
        const codeToRun = `
        // create a new div element
        newDiv = document.createElement('div');
        newPre = document.createElement('pre');
        // and give it some content
        newContent = document.createTextNode('${str}');
        // add the text node to the newly created div
        newPre.appendChild(newContent);
        newDiv.appendChild(newPre);
        newDiv.className = '${className}';
        puppeteerTerminalElement = document.querySelector('#puppeteerTerminal');
        puppeteerTerminalElement.appendChild(newDiv);
        puppeteerTerminalElement.scrollIntoView(false);
        0
        `;
        // Apparently the 0 (or a non-DOM object of some kind) at the end of the script is necessary so that this is the value
            // Electron "clones" rather than the DOM element in the previous line, which it
            // actually can't clone correctly, see https://github.com/electron/electron/issues/23722
        editorBrowserViewWebContents.executeJavaScript(codeToRun);
    });
};

const resetTargetPages = async function(req, startingUrl, callback){
    let targets = await req.app.locals.puppeteerBrowser.targets();
    console.log("targets", targets);
    console.log("resetTargetPages startingUrl", startingUrl);

    //let webviewTarget;
    for(let i = 0; i < targets.length; i++){
        const target = targets[i];
        //if(target._targetInfo.type === "webview"){
        //if(target._targetInfo.title === "https://www.amazon.com"){
        //if(target._targetInfo.title === "https://www.google.com"){
        
        // Using "includes" in both directions because the startingUrl might be different than the target._targetInfo.url attribute
            // E.g., target._targetInfo.url might be "https://www.google.com", but user might've written "www.google.com";
            // Or, target._targetInfo.url might be "https://www.google.com" but user wrote "https://www.google.com/"
        //if(target._targetInfo.type === "page" && (target._targetInfo.title.includes(startingUrl) || startingUrl.includes(target._targetInfo.title))){
        if(target._targetInfo.type === "page" && (target._targetInfo.url.includes(startingUrl) || startingUrl.includes(target._targetInfo.url))){
            // This is going to run code on only one of the pages (not multiple if they exist)
            //webviewTarget = target;
            const targetPage = await target.page();
            targetPage.setDefaultTimeout(10000); // it's 30000ms by default
            targetPagesList.push(targetPage);
            //break;
        }
    }

    //console.log("webviewTarget", webviewTarget);

    /*webviewTargetPage = await webviewTarget.page();
    console.log("webviewTargetPage", webviewTargetPage);

    webviewTargetPage.setDefaultTimeout(10000); // it's 30000ms by default*/

    //console.log('callback', callback);
    if(typeof callback === 'function'){
        callback();
    }
};

/*const selectorExists = async function(selector){
    try {
        const strToEval = "document.querySelector('" + selector + "') !== null";
        const result = await webviewTargetPage.evaluate(strToEval);
        console.log("exists result", result);
        return result;
    } catch (error) {
        let errorMessage = error.name + ": " + error.message;
        console.error(error);
        currentRes.send({type: 'groupFailure', errorMessage: errorMessage});
        return;
    }
};*/

module.exports = {
    router
};