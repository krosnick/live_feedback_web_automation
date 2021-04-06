const express = require('express');
//const capcon = require('capture-console');
const acorn = require("acorn");
const _ = require("lodash");
const walk = require("acorn-walk");
const pixelmatch = require('pixelmatch');
const sizeOf = require('buffer-image-size');
const PNG = require('pngjs').PNG;
const Jimp = require('jimp');
const skmeans = require("skmeans");
const graphlib = require("graphlib");
var router = express.Router();
//const remote = require('electron').remote;
//const unique = require('unique-selector');
//const strip = require('strip-comments');

// All Puppeteer methods who have a selector arg; the selector arg is always the first one
const puppeteerMethodsWithSelectorArg = [ "$", "$$", "$$eval", "$eval", "click", "focus", "hover", "select", "tap", "type", "waitForSelector", "waitFor" ]
const puppeteerKeyboardMethods = ["down", "press", "sendCharacter", "type", "up"];
const evalMethods = ["evaluate", "evaluateHandle", "evaluateOnNewDocument", "$$eval", "$eval", "waitForFunction"];
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

let userRequestedStop = false;
let winIDToUserRequestedStopLineNumber = {};

router.post('/stop', async function(req, res, next) {
    userRequestedStop = true;
    /*capcon.stopCapture(process.stdout);
    capcon.stopCapture(process.stderr);*/
    res.end();
});

router.post('/runPuppeteerCode', async function(req, res, next) {
    console.log("runPuppeteerCode");
    const code = req.body.code;
    browserWindowFinishAndErrorData = {
        errors: {},
        ranToCompletion: {}
    };
    snapshotLineToDOMSelectorData = {};
    userRequestedStop = false;
    winIDToUserRequestedStopLineNumber = {};
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

    // Process original string to replace console statements with updateClientSideTerminal calls
        // (making sure to include winID arg), but skipping this for console statements that
        // are inside of an evaluate or evaluateHandle

    const originalCodeAST = acorn.parse(code, {
        ecmaVersion: 2020,
        allowAwaitOutsideFunction: true,
        locations: true
    });
    let consoleCallsToReplace = [];
    walk.ancestor(originalCodeAST, {
        CallExpression(node, ancestors) {
            //console.log("node", node);
            //console.log("node.callee", node.callee);
            if(node.callee && node.callee.object && node.callee.object.name === "console"){
                //console.log("node.callee", node.callee);
                if(node.callee.property && (node.callee.property.name === "log" || node.callee.property.name === "warn" || node.callee.property.name === "error" || node.callee.property.name === "info")){
                    const method = node.callee.property.name;
                    // Check to make sure it doesn't have evaluate or evaluateHandle ancestor
                    const hasEvaluateAncestor = isInsideEvaluateOrEvaluateHandle(node, ancestors);
                    if(!hasEvaluateAncestor){
                        // Capture and store info in consoleCallsToReplace
                        const consoleObj = {
                            start: node.start,
                            end: node.end,
                            method: method
                        }
                        
                        // If no arguments, then nothing to print actually, so can just ignore
                        if(node.arguments && node.arguments.length > 0){
                            const argumentsStartIndex = node.arguments[0].start;
                            const argumentsEndIndex = node.arguments[node.arguments.length-1].end;
                            consoleCallsToReplace.push({
                                start: node.start,
                                end: node.end,
                                argumentsStartIndex: argumentsStartIndex,
                                argumentsEndIndex: argumentsEndIndex,
                                method: method
                            });
                        }
                    }
                }
            }
        }
    });
    // Sort from smallest 'start' to largest
    consoleCallsToReplace.sort((a, b) => a.start - b.start);
    //console.log("consoleCallsToReplace", consoleCallsToReplace);

    // Use consoleCallsToReplace to construct new code string (codeWithConsolesReplaced)
    let codeWithConsolesReplaced = "";
    // Take bits of original code string "code". For the parts that are in consoleCallsToReplace,
        // replace appropriate parts with updateClientSideTerminal func calls
    for(i = 0; i < consoleCallsToReplace.length; i++){
        const obj = consoleCallsToReplace[i];
        const thisStart = obj.start;
        const thisEnd = obj.end;
        const method = obj.method;
        const argumentsStartIndex = obj.argumentsStartIndex;
        const argumentsEndIndex = obj.argumentsEndIndex;
        if(i === 0){
            // Substring from very beginning of string
            codeWithConsolesReplaced += code.substring(0, thisStart);
        }

        // Now, fix this console instance
        codeWithConsolesReplaced += "updateClientSideTerminal([";
        codeWithConsolesReplaced += code.substring(argumentsStartIndex, argumentsEndIndex);
        codeWithConsolesReplaced += `], winID, "${method}")`;

        // Now, take rest of string until next console obj
        if(i === consoleCallsToReplace.length - 1){
            // This is final obj. Take string until very end.
            codeWithConsolesReplaced += code.substring(thisEnd);
        }else{
            // Next console obj
            const nextStart = consoleCallsToReplace[i+1].start;
            codeWithConsolesReplaced += code.substring(thisEnd, nextStart);
        }
    }
    if(consoleCallsToReplace.length === 0){
        codeWithConsolesReplaced = code;
    }

    //console.log("codeWithConsolesReplaced", codeWithConsolesReplaced);

    // Process new string and instrument to take snapshots, etc
    // AST processing
    const acornAST = acorn.parse(codeWithConsolesReplaced, {
        ecmaVersion: 2020,
        allowAwaitOutsideFunction: true,
        locations: true
    });
    let statementAndDeclarationData = {};
    walk.ancestor(acornAST, {
        AssignmentExpression(node, ancestors) {
            // Exclude if it is a variable declaration within for loop, e.g., (for(let i = 0; ...))
            const parentType = ancestors[ancestors.length-2].type;
            if(parentType !== "ForStatement" && parentType !== "ForInStatement"){
                const hasNonAsyncFunctionAncestor = isInsideNonAsyncFunction(node, ancestors);
                const hasEvaluateAncestor = isInsideEvaluateOrEvaluateHandle(node, ancestors);
                // Don't take snapshot here, because we're inside of an "evaluate" or "evaluateHandle", so doesn't make sense; or if we're in non-async function
                if(!hasEvaluateAncestor && !hasNonAsyncFunctionAncestor){
                    statementAndDeclarationData[node.end] = {
                        lineObj: node.loc.start.line
                    };
                    //console.log("node.loc.start.line", node.loc.start.line);
                    // Will be null if no selector found
                    const selectorInfo = checkForSelector(node.right, ancestors);
                    if(selectorInfo){
                        const prevStatement = findPrevStatement(node.right, ancestors[ancestors.length-2]);
                        if(prevStatement){
                            const prevLineNumber = prevStatement.loc.start.line;
                            selectorInfo.prevLineNumber = prevLineNumber;
                        }
                        statementAndDeclarationData[node.end].selectorData = selectorInfo;
                    }
                }
            }
        },
        ExpressionStatement(node, ancestors) {
            const hasNonAsyncFunctionAncestor = isInsideNonAsyncFunction(node, ancestors);
            const hasEvaluateAncestor = isInsideEvaluateOrEvaluateHandle(node, ancestors);
            // Don't take snapshot here, because we're inside of an "evaluate" or "evaluateHandle", so doesn't make sense
            if(!hasEvaluateAncestor && !hasNonAsyncFunctionAncestor){
                statementAndDeclarationData[node.end] = {
                    lineObj: node.loc.start.line
                };
                //console.log("node.loc.start.line", node.loc.start.line);
                // Will be null if no selector found
                const selectorInfo = checkForSelector(node.expression, ancestors);
                if(selectorInfo){
                    const prevStatement = findPrevStatement(node.expression, ancestors[ancestors.length-2]);
                    if(prevStatement){
                        const prevLineNumber = prevStatement.loc.start.line;
                        selectorInfo.prevLineNumber = prevLineNumber;
                    }
                    statementAndDeclarationData[node.end].selectorData = selectorInfo;
                }
            }
        },
        VariableDeclaration(node, ancestors) {
            // Exclude if it is a variable declaration within for loop, e.g., (for(let i = 0; ...))
            const parentType = ancestors[ancestors.length-2].type;
            if(parentType !== "ForStatement" && parentType !== "ForInStatement"){
                const hasNonAsyncFunctionAncestor = isInsideNonAsyncFunction(node, ancestors);
                const hasEvaluateAncestor = isInsideEvaluateOrEvaluateHandle(node, ancestors);
                // Don't take snapshot here, because we're inside of an "evaluate" or "evaluateHandle", so doesn't make sense
                if(!hasEvaluateAncestor && !hasNonAsyncFunctionAncestor){
                    statementAndDeclarationData[node.end] = {
                        lineObj: node.loc.start.line
                    };
                    //console.log("node.loc.start.line", node.loc.start.line);
                    // Will be null if no selector found
                    const selectorInfo = checkForSelector(node.declarations[0].init, ancestors);
                    if(selectorInfo){
                        const prevStatement = findPrevStatement(node.declarations[0].init, ancestors[ancestors.length-2]);
                        if(prevStatement){
                            const prevLineNumber = prevStatement.loc.start.line;
                            selectorInfo.prevLineNumber = prevLineNumber;
                        }
                        statementAndDeclarationData[node.end].selectorData = selectorInfo;
                    }
                }
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
        const endIndex = endIndices[i];
        data = statementAndDeclarationData[endIndex];
        const startLineNumber = data.lineObj;
        const selectorData = data.selectorData;
        //instrumentedCodeString += `; snapshotCaptured = false; try { beforePageContent = await page.content(); snapshotCaptured = true; } catch(e){ } finally { if(snapshotCaptured){ lineObj = snapshotLineToDOMSelectorData[${startLineNumber}] || {}; lineObj[winID] =  { beforeDomString: beforePageContent, selectorData: ${JSON.stringify(selectorData)}, parametersString: parametersString }; snapshotLineToDOMSelectorData[${startLineNumber}] = lineObj; beforePageContent = null; } snapshotCaptured = false; } try { if(userRequestedStop){ winIDToUserRequestedStopLineNumber[winID] = ${startLineNumber}; return; } } catch(e){ }`;
        //instrumentedCodeString += `; snapshotCaptured = false; try { beforePageContent = await page.evaluate(function(){ return getCurrentSnapshot();}); snapshotCaptured = true; } catch(e){ console.error(e);} finally { if(snapshotCaptured){ lineObj = snapshotLineToDOMSelectorData[${startLineNumber}] || {}; lineObj[winID] =  { beforeDomString: beforePageContent, selectorData: ${JSON.stringify(selectorData)}, parametersString: parametersString }; snapshotLineToDOMSelectorData[${startLineNumber}] = lineObj; beforePageContent = null; } snapshotCaptured = false; } try { if(userRequestedStop){ winIDToUserRequestedStopLineNumber[winID] = ${startLineNumber}; return; } } catch(e){ }`;
        instrumentedCodeString += `; snapshotCaptured = false; try { beforeSnapshotAndSelectorInfo = await page.evaluate(function(selectorData){ var selectorNumResults; if(selectorData){ selectorNumResults = document.querySelectorAll(selectorData.selectorString).length; }; var beforePageContent = getCurrentSnapshot(); return { selectorNumResults, beforePageContent }}, ${JSON.stringify(selectorData)}); selectorNumResults = beforeSnapshotAndSelectorInfo.selectorNumResults; beforePageContent = beforeSnapshotAndSelectorInfo.beforePageContent; snapshotCaptured = true; } catch(e){ console.error(e);} finally { if(snapshotCaptured){ lineObj = snapshotLineToDOMSelectorData[${startLineNumber}] || {}; lineObj[winID] =  { beforeDomString: beforePageContent, selectorNumResults: selectorNumResults, selectorData: ${JSON.stringify(selectorData)}, parametersString: parametersString }; snapshotLineToDOMSelectorData[${startLineNumber}] = lineObj; beforeSnapshotAndSelectorInfo = null; beforePageContent = null; selectorNumResults = null; } snapshotCaptured = false; } try { if(userRequestedStop){ winIDToUserRequestedStopLineNumber[winID] = ${startLineNumber}; return; } } catch(e){ }`;
        if(i === 0){
            // Substring from beginning of string
            instrumentedCodeString += codeWithConsolesReplaced.substring(0, endIndex);
        }else{
            const priorEndIndex = endIndices[i-1];
            instrumentedCodeString += codeWithConsolesReplaced.substring(priorEndIndex, endIndex);
        }
        //instrumentedCodeString += `; snapshotCaptured = false; try { afterPageContent = await page.content(); afterPageScreenshot = await page.screenshot({ fullPage: false, clip: { x: 0, y: 0, width: 500, height: 500 } } ); snapshotCaptured = true; } catch(e){ } finally { if(snapshotCaptured){ lineObj = snapshotLineToDOMSelectorData[${startLineNumber}] || {}; if(!(lineObj[winID])){ lineObj[winID] = {}; } lineObj[winID].afterDomString = afterPageContent; lineObj[winID].afterScreenshotBuffer = afterPageScreenshot; snapshotLineToDOMSelectorData[${startLineNumber}] = lineObj; afterPageContent = null; afterPageScreenshot = null; } snapshotCaptured = false; } try { if(userRequestedStop){ winIDToUserRequestedStopLineNumber[winID] = ${startLineNumber}; return; } } catch(e){ }`;
        instrumentedCodeString += `; snapshotCaptured = false; try { afterPageContent = await page.evaluate(function(){ return getCurrentSnapshot();}); afterPageScreenshot = await page.screenshot({ fullPage: false, clip: { x: 0, y: 0, width: 500, height: 500 } } ); snapshotCaptured = true; } catch(e){ console.error(e); } finally { if(snapshotCaptured){ lineObj = snapshotLineToDOMSelectorData[${startLineNumber}] || {}; if(!(lineObj[winID])){ lineObj[winID] = {}; } lineObj[winID].afterDomString = afterPageContent; lineObj[winID].afterScreenshotBuffer = afterPageScreenshot; lineObj[winID].parametersString = parametersString; snapshotLineToDOMSelectorData[${startLineNumber}] = lineObj; afterPageContent = null; afterPageScreenshot = null; } snapshotCaptured = false; } try { if(userRequestedStop){ winIDToUserRequestedStopLineNumber[winID] = ${startLineNumber}; return; } } catch(e){ }`;
    }
    if(endIndices.length === 0){
        instrumentedCodeString = codeWithConsolesReplaced;
    }

    //console.log("instrumentedCodeString", instrumentedCodeString);

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
    let wrappedCodeString = `async function runUserCode ( winID ) { let lineObj; let beforeSnapshotAndSelectorInfo; let selectorNumResults; let beforePageContent; let afterPageContent; let afterPageScreenshot; let errorMessage; let errorLineNumber; await page.goto("about:blank"); try {`
    //+ middleStringToWrap +
    //+ code +
    + instrumentedCodeString +
    `\n} catch (error) {
        errorMessage = error.name + ": " + error.message;
        //console.error(error);
        updateClientSideTerminal([error.stack], winID, "error");

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
            //capcon.stopCapture(process.stdout);
            //capcon.stopCapture(process.stderr);
            //console.log("snapshotLineToDOMSelectorData", snapshotLineToDOMSelectorData);
            // Do some extra processing of snapshotLineToDOMSelectorData here
                // Per line, compare each pair of afterScreenshotBuffers and create pixelDiff attribute
                // Then remove afterScreenshotBuffer attribute
            const componentsPromises = [];
            const lineNumList = [];
            for(const [lineNum, lineObj] of Object.entries(snapshotLineToDOMSelectorData)){
                const componentsScreenshotComparison = compareScreenshots(lineNum, lineObj);
                componentsPromises.push(componentsScreenshotComparison);
                lineNumList.push(lineNum);
            }
            Promise.all(componentsPromises).then((values) => {
                //console.log("components values", values);
                //console.log("lineNumList", lineNumList);
                const lineNumToComponentsList = {};
                for(let i = 0; i < lineNumList.length; i++){
                    const lineNum = lineNumList[i];
                    const componentsList = values[i];
                    if(componentsList){ // i.e., not equal to null or undefined
                        lineNumToComponentsList[lineNum] = componentsList;
                    }
                }
                // Need to remove afterScreenshotBuffer attributes from snapshotLineToDOMSelectorData
                for(const lineObj of Object.values(snapshotLineToDOMSelectorData)){
                    for(const winIDObj of Object.values(lineObj)){
                        delete winIDObj.afterScreenshotBuffer;
                    }
                }
                browserWindowFinishAndErrorData.snapshotLineToDOMSelectorData = snapshotLineToDOMSelectorData;
                browserWindowFinishAndErrorData.lineNumToComponentsList = lineNumToComponentsList;
                browserWindowFinishAndErrorData.winIDToUserRequestedStopLineNumber = winIDToUserRequestedStopLineNumber;
                currentReq.app.locals.snapshotsBrowserView.webContents.send("newSnapshots", snapshotLineToDOMSelectorData, lineNumToComponentsList, browserWindowFinishAndErrorData.errors);
                currentRes.send(browserWindowFinishAndErrorData);
            });
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
    let checkIfTargetPageListReady = setInterval((wrappedCodeString) => {
        if(req.app.locals.targetPageListReady){
            clearTimeout(checkIfTargetPageListReady);
            evaluateCodeOnAllPages(wrappedCodeString);
        }
    }, 200, wrappedCodeString);
    /*});*/
});

const isInsideEvaluateOrEvaluateHandle = function(node, ancestors){
    // Loop through backwards to check and see if there is an "evaluate" or "evaluateHandle" function call
    for(let i = ancestors.length-1; i >= 0; i--){
        const ancestor = ancestors[i];
        if(ancestor.type === "CallExpression"){
            if(ancestor.callee && ancestor.callee.property && ancestor.callee.property.name){
                const methodName = ancestor.callee.property.name;
                //console.log("methodName", methodName);
                if(evalMethods.includes(methodName)){
                    return true;
                }
            }
        }
    }
    return false;
};

const isInsideNonAsyncFunction = function(node, ancestors){
    // Loop through backwards to find first containing function (if any); see if function is async or not
    for(let i = ancestors.length-1; i >= 0; i--){
        const ancestor = ancestors[i];
        if(ancestor.type === "FunctionDeclaration" || ancestor.type === "FunctionExpression"){
            if(ancestor.async === false){
                return true;
            }else{
                // If first function is async, then we're good; we only want to check the innermost function
                return false;
            }
        }
    }
    return false;
};

const compareScreenshots = function(lineNum, lineObj){
    const winIDs = Object.keys(lineObj);
    
    // Right now screenshots are all 500x500, so this isn't really necessary,
        // but let's find the smallest width and height dimensions to use
    const widthList = [];
    const heightList = [];
    for(let i = 0; i < winIDs.length; i++){
        const winID = winIDs[i];
        const screenshot = lineObj[winID].afterScreenshotBuffer;
        if(screenshot){
            const dimensions = sizeOf(screenshot);
            widthList.push(dimensions.width);
            heightList.push(dimensions.height);   
        }
    }
    /*console.log("widthList", widthList);
    console.log("heightList", heightList);*/
    
    if(widthList.length > 0){
        const smallestWidth = Math.min(...widthList);
        const smallestHeight = Math.min(...heightList);
        /*console.log("smallestWidth", smallestWidth);
        console.log("smallestHeight", smallestHeight);*/

        // Read in each screenshot using PNG, and then crop it if necessary
        const bitmapObjList = [];
        const bitmapWinIDList = [];
        for(let i = 0; i < winIDs.length; i++){
            const winID = winIDs[i];
            const screenshot = lineObj[winID].afterScreenshotBuffer;
            if(screenshot){
                bitmapWinIDList.push(winID);
                const img = PNG.sync.read(screenshot);
                const imgBitmapObj = Jimp.read(img)
                .then(image => {
                    const croppedImage = image.crop( 0, 0, smallestWidth, smallestHeight );
                    const bitmapObj = croppedImage.bitmap.data;
                    return bitmapObj;
                })
                .catch(err => {
                    // Handle an exception.
                    console.log("err", err);
                });
                bitmapObjList.push(imgBitmapObj);
            }
        }
        //console.log("bitmapObjList", bitmapObjList);
        const diff = new PNG({width: smallestWidth, height: smallestHeight});
        return Promise.all(bitmapObjList).then((values) => {
            
            // If bitmapWinIDList has only 1 winID in it, just return list with list of size 1 in it
            if(bitmapWinIDList.length === 1){
                const singleWinID = bitmapWinIDList[0];
                return [ [singleWinID] ];
            }
            
            //console.log("values", values);
            // Compare each pair of screenshots
            const numDiffPixelsList = [];
            const correspondingWinIDPairList = [];
            for(let i = 0; i < bitmapWinIDList.length - 1; i++){
                for(let j = i + 1; j < bitmapWinIDList.length; j++){
                    // Compare the 2 screenshots
                    const winID1 = bitmapWinIDList[i];
                    const winID2 = bitmapWinIDList[j];
                    const bitmapObj1 = values[i];
                    const bitmapObj2 = values[j];
                    const numDiffPixels = pixelmatch(bitmapObj1, bitmapObj2, diff.data, smallestWidth, smallestHeight);
                    //console.log(`numDiffPixels for ${winID1} and ${winID2}`, numDiffPixels);
                    numDiffPixelsList.push(numDiffPixels);
                    correspondingWinIDPairList.push({ winID1: winID1, winID2: winID2 });
                }
            }
            //console.log("numDiffPixelsList.length", numDiffPixelsList.length);
            // Compute k-means clustering (with k=2) to note which pairs are "similar" vs "dissimilar"
            if(numDiffPixelsList.length === 0){
                // Seems like no screenshots?
                //console.log("components", null);
                return null;
            }else if(numDiffPixelsList.length === 1){
                // Only 2 screenshots to show. Doesn't make sense to cluster. For now, just show both screenshots to user separately.
                const winID1 = bitmapWinIDList[0];
                const winID2 = bitmapWinIDList[1];
                const components = [ [winID1], [winID2] ];
                //console.log("components", components);
                return components;
            }else{
                const kMeansResult = skmeans(numDiffPixelsList, 2);
                //console.log("kMeansResult", kMeansResult);

                // The smaller centroid corresponds to pairs that are "similar"
                // The larger centroid corresponds to pairs that are "dissimilar"
                
                // Find the smaller centroid
                const centroids = kMeansResult.centroids;
                let smallerCentroidIndex;
                if(centroids[0] < centroids[1]){
                    smallerCentroidIndex = 0;
                }else{
                    smallerCentroidIndex = 1;
                }
                //console.log("smallerCentroidIndex", smallerCentroidIndex);

                // Identify "similar" pairs, i.e., data that are in smallerCentroidIndex
                const similarPairIndices = [];
                const idxs = kMeansResult.idxs;
                for(let index = 0; index < idxs.length; index++){
                    if(idxs[index] === smallerCentroidIndex){
                        similarPairIndices.push(index);
                    }
                }
                //console.log("similarPairIndices", similarPairIndices);

                // Take the "similar" pairs and create edges between them in a graph,
                    // and then identify connected components. If a given winID isn't in the
                    // graph at all, then that means it's "dissimilar" from all other winIDs.
                // First create graph and add all winIDs as nodes
                const g = new graphlib.Graph({ directed: false });
                for(let i = 0; i < bitmapWinIDList.length; i++){
                    const winID = bitmapWinIDList[i];
                    g.setNode(winID);
                }
                // Create edge for pairs
                for(let i = 0; i < similarPairIndices.length; i++){
                    const pairIndex = similarPairIndices[i];
                    const pairObj = correspondingWinIDPairList[pairIndex];
                    const winID1 = pairObj.winID1;
                    const winID2 = pairObj.winID2;
                    g.setEdge(winID1, winID2);
                }
                const components = graphlib.alg.components(g);
                //console.log("components", components);
                return components;
            }

            // We should send client list of sets of winIDs that are similar (for winIDs that
                // are dissimilar from all other winIDs, send each as its own set)
        });
    }
};

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
                            if(siblingSelectorInfo){
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
    }
    return null;
};

const findPrevSibling = function(expressionObj, parentObj){
    const prevStatement = findPrevStatement(expressionObj, parentObj);
    if(prevStatement){
        if(prevStatement.type === "ExpressionStatement"){
            return prevStatement.expression;
        }else if(prevStatement.type === "VariableDeclaration"){
            return prevStatement.declarations[0].init;
        }
    }else{
        return prevStatement;
    }
};

const findPrevStatement = function(expressionObj, parentObj){
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
                        return prevStatement;
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
        //if(lineString.indexOf("at async runUserCode") > -1){
        if(lineString.indexOf("puppeteer.js") > -1){
            const lastColonIndex = lineString.lastIndexOf(":");
            const secondToLastColonIndex =  lineString.lastIndexOf(":", lastColonIndex-1);
            const lineNumber = lineString.substring(secondToLastColonIndex+1, lastColonIndex);
            return lineNumber;
        }
    }
};

const evaluateCodeOnAllPages = function(wrappedCodeString){
    console.log("evaluateCodeOnAllPages");
    /*capcon.startCapture(process.stdout, function (stdout) {
        updateClientSideTerminal(stdout, false);
    });
    capcon.startCapture(process.stderr, function (stderr) {
        updateClientSideTerminal(stderr, true);
    });*/
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
        updatedCodeString = `const parametersString = ${JSON.stringify(paramSetObj)};` + pageVarCode + allParamsVarCode + updatedCodeString + `; runUserCode(${pageWinID});`;
        //updatedCodeString += ` x(${borderWinID});`;
        eval(updatedCodeString);
    }
};

const updateClientSideTerminal = function(consoleArguments, pageWinID, logType){
    let text = "";
    for(let i = 0; i < consoleArguments.length; i++){
        text += consoleArguments[i] + " ";
    }
    
    // Add new output/error to client-side terminal
    const editorBrowserViewWebContents = currentReq.app.locals.editorBrowserView.webContents;

    let className = "";
    if(logType === "error"){
        className = "errorText";
    }else if(logType === "warning"){
        className = "warningText";
    }

    // Need to split stdOutOrErr by \n, so then we print each line individually
    const itemsToPrint = text.split('\n');
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
        //puppeteerTerminalElement = document.querySelector('#puppeteerTerminal');
        puppeteerTerminalElement = document.querySelector('.puppeteerTerminal[winID="${pageWinID}"]');
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