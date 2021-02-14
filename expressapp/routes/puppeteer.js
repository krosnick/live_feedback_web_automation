const express = require('express');
const capcon = require('capture-console');
const acorn = require("acorn");
const _ = require("lodash");
const walk = require("acorn-walk");
var router = express.Router();
//const remote = require('electron').remote;
//const unique = require('unique-selector');
//const strip = require('strip-comments');

// All Puppeteer methods who have a selector arg; the selector arg is always the first one
const puppeteerMethodsWithSelectorArg = [ "$", "$$", "$$eval", "$eval", "click", "focus", "hover", "select", "tap", "type", "waitForSelector", "waitFor" ]
const puppeteerKeyboardMethods = ["down", "press", "sendCharacter", "type", "up"];
// page.waitFor(selectorOrFunctionOrTimeout[, options[, ...args]])
// So for "waitFor", check the first arg and see if it's a string (rather than function or variable)

//let webviewTargetPage;
let targetPagesList = [];
let prevUsedTargetIDs = {};
let currentRes = undefined;
let currentReq = undefined;
let numBrowserWindowsFinishedCodeExecution = 0;
let browserWindowFinishAndErrorData = {
    errors: {},
    ranToCompletion: {}
};
let snapshotLineToDOMSelectorData = {}

//let codeToRunAfterPause = undefined;
let currentCodeString = undefined;

router.post('/runPuppeteerCode', async function(req, res, next) {
    console.log("runPuppeteerCode");
    const code = req.body.code;
    browserWindowFinishAndErrorData = {
        errors: {},
        ranToCompletion: {}
    };
    snapshotLineToDOMSelectorData = {};
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

    // AST processing
    const acornAST = acorn.parse(code, {
        ecmaVersion: 2020,
        allowAwaitOutsideFunction: true,
        locations: true
    });
    let statementAndDeclarationData = {};
    walk.ancestor(acornAST, {
        ExpressionStatement(node, ancestors) {
            statementAndDeclarationData[node.end] = {
                lineObj: node.loc.start.line
            };
            //console.log("node.loc.start.line", node.loc.start.line);
            // Will be null if no selector found
            const selectorInfo = checkForSelector(node.expression, ancestors);
            if(selectorInfo){
                statementAndDeclarationData[node.end].selectorData = selectorInfo;
            }
        },
        VariableDeclaration(node, ancestors) {
            statementAndDeclarationData[node.end] = {
                lineObj: node.loc.start.line
            };
            //console.log("node.loc.start.line", node.loc.start.line);
            // Will be null if no selector found
            const selectorInfo = checkForSelector(node.declarations[0].init, ancestors);
            if(selectorInfo){
                statementAndDeclarationData[node.end].selectorData = selectorInfo;
            }
        }
    });
    let endIndices = [];
    Object.keys(statementAndDeclarationData).forEach(element => endIndices.push(parseInt(element)));
    endIndices.sort((a, b) => a - b);
    
    // Create "instrumentedCodeString" by splitting "code" at statementAndDeclarationEndIndices
        // and inserting the "capture" commands
    let instrumentedCodeString = "";
    for(i = 0; i < endIndices.length; i++){
        instrumentedCodeString += `; beforePageContent = await page.content();`;
        const endIndex = endIndices[i];
        if(i === 0){
            // Substring from beginning of string
            instrumentedCodeString += code.substring(0, endIndex);
        }else{
            const priorEndIndex = endIndices[i-1];
            instrumentedCodeString += code.substring(priorEndIndex, endIndex);
        }
        data = statementAndDeclarationData[endIndex];
        const startLineNumber = data.lineObj;
        const selectorData = data.selectorData;
        //instrumentedCodeString += `; await page.waitFor(500); pageContent = await page.content(); lineObj = snapshotLineToDOMSelectorData[${startLineNumber}] || {}; lineObj[winID] =  { domString: pageContent, selectorData: ${JSON.stringify(selectorData)} }; snapshotLineToDOMSelectorData[${startLineNumber}] = lineObj;`;
        instrumentedCodeString += `; afterPageContent = await page.content(); lineObj = snapshotLineToDOMSelectorData[${startLineNumber}] || {}; lineObj[winID] =  { beforeDomString: beforePageContent, afterDomString: afterPageContent, selectorData: ${JSON.stringify(selectorData)} }; snapshotLineToDOMSelectorData[${startLineNumber}] = lineObj;`;
    }
    console.log("instrumentedCodeString", instrumentedCodeString);

    // Let's split the code by semicolons(;)
    // Right after each semicolon, let's insert "await page.waitFor(200);snapshotsList.push(await page.content());" to take
        // a DOM snapshot at that point in the execution
    /*const codeSegments = code.split(";");
    let instrumentedCodeString = "";
    for(let segmentIndex = 0; segmentIndex < codeSegments.length; segmentIndex++){
        const codeSegment = codeSegments[segmentIndex];
        //instrumentedCodeString += codeSegment;
        if((segmentIndex+1 < codeSegments.length) && (codeSegments[segmentIndex+1].includes("waitFor"))){
            // Don't try to capture page content at this point, because the user is intending to wait for the page to finish navigation or waiting for a timeout, selector, etc.
            // So it makes sense to just wait until that has finished before we capture any snapshot.
            instrumentedCodeString += codeSegment;
        }else{
            instrumentedCodeString += codeSegment + "; await page.waitFor(1000); pageContent = await page.content(); snapshotsList.push(pageContent);";
        }
        //instrumentedCodeString += codeSegment + "; await page.waitFor(500); pageContent = await page.content(); snapshotsList.push(pageContent);";
    }*/
    //console.log("instrumentedCodeString", instrumentedCodeString);
    let wrappedCodeString = `let lineObj; let beforePageContent; let afterPageContent; let errorMessage; let errorLineNumber; async function runUserCode ( winID ) { try {`
    //+ middleStringToWrap +
    //+ code +
    + instrumentedCodeString +
    `} catch (error) {
        errorMessage = error.name + ": " + error.message;
        console.error(error);

        // Find line number where error occurred
        errorLineNumber = parseInt(findPuppeteerErrorLineNumber(error.stack));
        
        return;
    } finally {
        numBrowserWindowsFinishedCodeExecution += 1;
        if(errorMessage){
            browserWindowFinishAndErrorData.errors[winID] = { errorMessage: errorMessage,  errorLineNumber: errorLineNumber, correspondingBorderWinID: currentReq.app.locals.windowMetadata[winID].correspondingBorderWinID, parameterValueSet: currentReq.app.locals.windowMetadata[winID].parameterValueSet};
        }else{
            browserWindowFinishAndErrorData.ranToCompletion[winID] = { correspondingBorderWinID: currentReq.app.locals.windowMetadata[winID].correspondingBorderWinID, parameterValueSet: currentReq.app.locals.windowMetadata[winID].parameterValueSet }
        }
        if(numBrowserWindowsFinishedCodeExecution === Object.keys(currentReq.app.locals.windowMetadata).length){
            // All windows have finished executing now
            numBrowserWindowsFinishedCodeExecution = 0; // reset
            // Stop captures and send blank response 
            capcon.stopCapture(process.stdout);
            capcon.stopCapture(process.stderr);
            //console.log("snapshotLineToDOMSelectorData", snapshotLineToDOMSelectorData);
            browserWindowFinishAndErrorData.snapshotLineToDOMSelectorData = snapshotLineToDOMSelectorData;
            currentRes.send(browserWindowFinishAndErrorData);
        }
    }}`;
    //}} x();`;
    //console.log("wrappedCodeString", wrappedCodeString);

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
    /*req.app.locals.filesCollection.find({
        fileID: req.app.locals.fileID
    }).toArray(function(error, docs){
        //console.log("docs[0].startingUrl", docs[0].startingUrl);*/
    let checkIfTargetPageListReady = setInterval((wrappedCodeString) => {
        if(req.app.locals.targetPageListReady){
            clearTimeout(checkIfTargetPageListReady);
            evaluateCodeOnAllPages(wrappedCodeString);
        }
    }, 200, wrappedCodeString);
    /*});*/
});

router.post('/findSelectorsInLine', async function(req, res, next) {
    //console.log("findSelectorsInLine");
    const codeLine = req.body.codeLine;

    try {
        const acornAST = acorn.parse(codeLine, {
            ecmaVersion: 2020,
            allowAwaitOutsideFunction: true,
            locations: true
        });
        let selectorDataList = [];
        walk.ancestor(acornAST, {
            ExpressionStatement(node, ancestors) {
                // Only include if this node doesn't have any "real" ancestors
                if(ancestors.length <= 2){
                    // Will be null if no selector found
                    const selectorInfo = checkForSelector(node.expression);
                    if(selectorInfo){
                        //console.log("selectorInfo", selectorInfo);
                        selectorDataList.push(selectorInfo);
                    }
                }
            },
            VariableDeclaration(node, ancestors) {
                // Only include if this node doesn't have any "real" ancestors
                if(ancestors.length <= 2){
                    // Will be null if no selector found
                    const selectorInfo = checkForSelector(node.declarations[0].init);
                    if(selectorInfo){
                        //console.log("selectorInfo", selectorInfo);
                        selectorDataList.push(selectorInfo);
                    }
                }
            }
        });
        res.send({ selectorDataList: selectorDataList });
    } catch (error) {
        res.end();
    }
});

const checkForSelector = function(expressionObj, ancestors){
    // Return selector string and the line/col location
    // Or, if no selector in expression, return null

    // Check if this is an Await expression, then check that it has Puppeteer method call, and that the method takes a selector or that it is a keyboard action
    if(expressionObj.type === "AwaitExpression"){
        if(expressionObj.argument && expressionObj.argument.callee && expressionObj.argument.callee.object && expressionObj.argument.callee.object.name === "page"){
            // Is a Puppeteer page method. Checking if takes a selector
            if(expressionObj.argument.callee.property){
                const methodName = expressionObj.argument.callee.property.name;
                if(puppeteerMethodsWithSelectorArg.includes(methodName)){
                    // This method does/may have a selector as the arg
                    const selector = expressionObj.argument.arguments[0].value;

                    // Have to confirm it's a string (because "waitFor" could take function or number instead)
                    if(typeof(selector) === "string"){
                        // It is a selector
                        const loc = expressionObj.argument.arguments[0].loc;
                        return {
                            method: methodName,
                            isSelectorOwn: true,
                            selectorString: selector,
                            selectorLocation: loc
                        };
                    }
                }
            }
        }else if(expressionObj.argument && expressionObj.argument.callee && expressionObj.argument.callee.object && expressionObj.argument.callee.object.object && expressionObj.argument.callee.object.object.name === "page" && expressionObj.argument.callee.object.property && expressionObj.argument.callee.object.property.name === "keyboard"){
            // Is Puppeteer page.keyboard; let's check that it's a method, i.e., in puppeteerKeyboardMethods
            if(expressionObj.argument.callee.property){
                const methodName = expressionObj.argument.callee.property.name;
                if(puppeteerKeyboardMethods.includes(methodName)){
                    // This is a page.keyboard method. We now need to get expressionObj's prev sibling, and see if it has a selector (and only then return that info)
                    // So we need to find expressionObj within ancestors[ancestors.length-2], so that we can then find it's prev sibling
                    if(ancestors){
                        const prevSiblingExpressionObj = findPrevSibling(expressionObj, ancestors[ancestors.length-2]);
                        if(prevSiblingExpressionObj){
                            const siblingSelectorInfo = checkForSelector(prevSiblingExpressionObj, null);
                            return {
                                method: "keyboard." + methodName,
                                isSelectorOwn: false, /* So client knows to not try setting a selector validity message for this line */
                                selectorString: siblingSelectorInfo.selectorString,
                                selectorLocation: siblingSelectorInfo.selectorLocation
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
};

const findPrevSibling = function(expressionObj, parentObj){
    // Check that parentObj has "body" attribute
        // and that "body" is either a "BlockStatement" (with it's own "body" attribute)
        // or that "body" is an array
    if(parentObj.body){
        let statementList;
        if(Array.isArray(parentObj.body)){
            statementList = parentObj.body;
        }else if(parentObj.body.type === "BlockStatement"){
            statementList = parentObj.body.body;
        }
        if(statementList){
            // Find expressionObj in statementList
            for(let i = 0; i < statementList.length; i++){
                const statement = statementList[i];
                let candidateExpression;
                if(statement.type === "ExpressionStatement"){
                    candidateExpression = statement.expression;
                }else if(statement.type === "VariableDeclaration"){
                    candidateExpression = statement.declarations[0].init;
                }

                if(candidateExpression && _.isEqual(expressionObj, candidateExpression)){
                    // Found our own expression
                    if(i > 0){
                        // Now let's find the previous expression
                        const prevStatement = statementList[i-1];
                        if(prevStatement.type === "ExpressionStatement"){
                            return prevStatement.expression;
                        }else if(prevStatement.type === "VariableDeclaration"){
                            return prevStatement.declarations[0].init;
                        }
                    }
                }
            }
        }
    }
    return null;
};

const findPuppeteerErrorLineNumber = function(errorStackString){
    const lineStrings = errorStackString.split("\n");
    for(let i = 0; i < lineStrings.length; i++){
        const lineString = lineStrings[i].trim();
        if(lineString.indexOf("at async runUserCode") > -1){
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
    const pageWinIDs = Object.keys(currentReq.app.locals.windowMetadata);
    let numPageWinIDs = [];
    pageWinIDs.forEach(element => numPageWinIDs.push(parseInt(element)));
    numPageWinIDs.sort((a, b) => a - b);
    for(let i = 0; i < targetPagesList.length; i++){
        let updatedCodeString = wrappedCodeString;
        const pageVarCode = `const page = targetPagesList[${i}];`;
        const pageWinID = numPageWinIDs[i]; // This should work, because targetPagesList and numPageWinIDs should both in order of their creation
        const paramSetObj = currentReq.app.locals.windowMetadata[pageWinID].parameterValueSet;
        let allParamsVarCode = "";
        for(const [paramName, paramValue] of Object.entries(paramSetObj)){
            const singleParamCode = `const ${paramName} = ${JSON.stringify(paramValue)};`;
            allParamsVarCode += singleParamCode;
        }
        //console.log("allParamsVarCode", allParamsVarCode);

        // Append param code to front, and func x call to end
        updatedCodeString = pageVarCode + allParamsVarCode + updatedCodeString + `; runUserCode(${pageWinID});`;
        //updatedCodeString += ` x(${borderWinID});`;
        eval(updatedCodeString);
    }
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
        const escapedString = str.replaceAll(/'/ig, "\\'");
        const codeToRun = `
        // create a new div element
        newDiv = document.createElement('div');
        newPre = document.createElement('pre');
        // and give it some content
        newContent = document.createTextNode('${escapedString}');
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

const stripPrefixAndCheckIfUrlsSame = function(url1, url2){
    const strippedUrl1 = stripUrlPrefix(url1).trim();
    const strippedUrl2 = stripUrlPrefix(url2).trim();
    /*console.log("strippedUrl1", strippedUrl1);
    console.log("strippedUrl2", strippedUrl2);*/

    const same = (strippedUrl1.includes(strippedUrl2) || strippedUrl2.includes(strippedUrl1));
    //console.log("same", same);
    return same;
};

// Strip off http:// or https://
const stripUrlPrefix = function(url){
    let trimmedUrl = url.trim();
    const httpIndex = trimmedUrl.indexOf("http://");
    const httpsIndex = trimmedUrl.indexOf("https://");

    if(httpIndex === -1 && httpsIndex === -1){
        return trimmedUrl;
    }else if(httpIndex === 0){
        return trimmedUrl.substring(7);
    }else{ // httpsIndex === 0
        return trimmedUrl.substring(8);
    }
};

const confirmNotDevTools = function(url){
    //console.log("url", url);
    const notDevTools = !(url.includes("devtools://"));
    //console.log("notDevTools", notDevTools);
    return notDevTools;
};

const addTargetPages = async function(req, startingUrl){
    let targets = await req.app.locals.puppeteerBrowser.targets();
    /*console.log("targets", targets);
    console.log("resetTargetPages startingUrl", startingUrl);*/

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
        //if(target._targetInfo.type === "page" && (target._targetInfo.url.includes(startingUrl) || startingUrl.includes(target._targetInfo.url))){
        if(target._targetInfo.type === "page" && stripPrefixAndCheckIfUrlsSame(target._targetInfo.url, startingUrl) && confirmNotDevTools(target._targetInfo.url) && !prevUsedTargetIDs.hasOwnProperty(target._targetInfo.targetId)){
            //console.log("added target", target);
            prevUsedTargetIDs[target._targetInfo.targetId] = 1;

            // This is going to run code on only one of the pages (not multiple if they exist)
            //webviewTarget = target;
            const targetPage = await target.page();
            targetPage.setDefaultTimeout(10000); // it's 30000ms by default
            targetPagesList.push(targetPage);
            //break;
        }
    }

    req.app.locals.targetPageListReady = true;

    //console.log("webviewTarget", webviewTarget);

    /*webviewTargetPage = await webviewTarget.page();
    console.log("webviewTargetPage", webviewTargetPage);

    webviewTargetPage.setDefaultTimeout(10000); // it's 30000ms by default*/

    /*//console.log('callback', callback);
    if(typeof callback === 'function'){
        callback();
    }*/
};

const resetTargetPages = async function(req, startingUrl/*, callback*/){
    targetPagesList = [];
    addTargetPages(req, startingUrl);
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
    router,
    resetTargetPages,
    addTargetPages,
    findPuppeteerErrorLineNumber
};