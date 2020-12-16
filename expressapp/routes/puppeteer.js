var express = require('express');
var router = express.Router();
//const remote = require('electron').remote;
//const unique = require('unique-selector');
//const strip = require('strip-comments');

let webviewTargetPage;
let currentRes = undefined;

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
    let updatedCodeString = code.replace(/await page/gi, 'await webviewTargetPage');
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
    updatedCodeString = `async function x() { try {`
    //+ middleStringToWrap +
    + updatedCodeString +
    `} catch (error) {
        let errorMessage = error.name + ": " + error.message;
        console.error(error);
        currentRes.send({type: 'groupFailure', errorMessage: errorMessage});
        return;
    } } x();`;
    console.log("updatedCodeString", updatedCodeString);

    currentRes = res;
    if(!webviewTargetPage){
        resetWebviewTargetPage(req, function(){
            //updatePuppeteerPage = false;
            eval(updatedCodeString);
            console.log("Before eval");
            //eval("async function x() { console.log('before'); await webviewTargetPage.type('#twotabsearchtextbox', 'toothpaste'); console.log('after'); } x();");
            console.log("After eval");
        });
    }else{
        eval(updatedCodeString);
        console.log("Before eval");
        //eval("async function x() { console.log('before'); await webviewTargetPage.type('#twotabsearchtextbox', 'toothpaste'); console.log('after'); } x();");
        console.log("After eval");
    }
});

const resetWebviewTargetPage = async function(req, callback){
    let targets = await req.app.locals.puppeteerBrowser.targets();
    console.log("targets", targets);

    let webviewTarget;
    for(let i = 0; i < targets.length; i++){
        const target = targets[i];
        //if(target._targetInfo.type === "webview"){
        if(target._targetInfo.title === "https://www.amazon.com"){
            // This is going to run code on only one of the pages (not multiple if they exist)
            webviewTarget = target;
            break;
        }
    }

    //console.log("webviewTarget", webviewTarget);

    webviewTargetPage = await webviewTarget.page();
    console.log("webviewTargetPage", webviewTargetPage);

    webviewTargetPage.setDefaultTimeout(10000); // it's 30000ms by default

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

module.exports.router = router;