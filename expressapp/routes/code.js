var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');

//const puppeteer = require('puppeteer');
const { resetExampleWindows, createBaseSearchQueryObj } = require('./index');
//const { findPuppeteerErrorLineNumber } = require("./puppeteer");

/*let numBrowserWindowsFinishedCodeExecution = 0;
let browserWindowFinishAndErrorData = {
    errors: {},
    ranToCompletion: {}
};
let currentRes = undefined;
let currentReq = undefined;
let runHeadlessTimer;
let lastRes;
let headlessPuppeteerBrowser;
const setupHeadlessPuppeteer = async function(){
    headlessPuppeteerBrowser = await puppeteer.launch();
    //headlessPuppeteerBrowserPage = await browser.newPage();
};
setupHeadlessPuppeteer();*/

// Update code for current file
router.put('/update/', function(req, res, next) {
    const updatedCode = req.body.updatedFileContents;
    //console.log("updatedCode", updatedCode);

    // Compare the file's current startingUrl vs what url
        // updatedCode now contains. If different, update windows.
    let searchQueryObj = createBaseSearchQueryObj(req);
    searchQueryObj.fileID = req.app.locals.fileID;
    req.app.locals.filesCollection.find(searchQueryObj).toArray(function(error, docs){
        const existingStartingUrl = docs[0].startingUrl;
        const newStartingUrl = extractStartingUrl(updatedCode);
        
        // Somewhere need to check and see if the url is valid; or, just try
            // telling BrowserView to load it and see if it works or not
        if(existingStartingUrl !== newStartingUrl){
            // Tell app to create BrowserViews (if no startingUrl existed before)
                // or to update BrowserViews with new startingUrl
            //console.log("urls not equal, need to update BrowserViews");
            resetExampleWindows(req, newStartingUrl);
        }

        req.app.locals.filesCollection.updateOne(
            {
                fileID: req.app.locals.fileID
            }, // query
            { 
                $set: {
                    fileContents: updatedCode,
                    startingUrl: newStartingUrl,
                    lastModified: Date.now()
                }
            },
            function(error, result){
                /*clearTimeout(runHeadlessTimer);
                if(lastRes){
                    lastRes.end();
                }
                runHeadlessTimer = setTimeout(function(){
                    // Take code string, replace "page" with headless browser
                    // Then run code string for each param set
                    // If syntax error, just abandon
                    // Gather the errors and show them in real-time

                    //headlessPuppeteerBrowserPage

                    browserWindowFinishAndErrorData = {
                        errors: {},
                        ranToCompletion: {}
                    };
                    let wrappedCodeString = `let errorMessage; let errorLineNumber; async function x ( winID ) { try {`
                    //+ middleStringToWrap +
                    + updatedCode +
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
                        console.log("finally block");
                        //console.log("browserWindowFinishAndErrorData", browserWindowFinishAndErrorData);
                        page.close();
                        //currentRes.end();
                        if(numBrowserWindowsFinishedCodeExecution === Object.keys(currentReq.app.locals.windowMetadata).length){
                            console.log("browserWindowFinishAndErrorData", browserWindowFinishAndErrorData);

                            // All examples have finished executing now
                            numBrowserWindowsFinishedCodeExecution = 0; // reset
                            
                            // Should send back to 
                            currentRes.send(browserWindowFinishAndErrorData);
                        }
                    }}`;
                    //}} x();`;
                    console.log("wrappedCodeString", wrappedCodeString);
                
                    currentRes = res;
                    currentReq = req;
                    evaluateCodeForAllExamples(wrappedCodeString);

                }, 3000);
                lastRes = res;*/
                res.end();
            }
        );
    });
});

router.post('/getCurrentFileCode/', function(req, res, next) {
    let searchQueryObj = createBaseSearchQueryObj(req);
    searchQueryObj.fileID = req.app.locals.fileID;
    req.app.locals.filesCollection.find(searchQueryObj).toArray(function(error, docs){
        console.log("docs[0].fileContents", docs[0].fileContents);
        res.send(docs[0].fileContents);
    });
});

/*const evaluateCodeForAllExamples = async function(wrappedCodeString){
    console.log("evaluateCodeForAllExamples");
    const pageWinIDs = Object.keys(currentReq.app.locals.windowMetadata);
    let numPageWinIDs = [];
    pageWinIDs.forEach(element => numPageWinIDs.push(parseInt(element)));
    numPageWinIDs.sort((a, b) => a - b);
    for(let i = 0; i < numPageWinIDs.length; i++){
    //for(let i = 0; i < 1; i++){
        //const i = 4;
        let updatedCodeString = wrappedCodeString;
        const headlessPuppeteerBrowserPage = await headlessPuppeteerBrowser.newPage();
        const pageVarCode = `const page = headlessPuppeteerBrowserPage;`;
        //const pageVarCode = `const page = await headlessPuppeteerBrowser.newPage();`;
        const pageWinID = numPageWinIDs[i];
        const paramSetObj = currentReq.app.locals.windowMetadata[pageWinID].parameterValueSet;
        let allParamsVarCode = "";
        for(const [paramName, paramValue] of Object.entries(paramSetObj)){
            const singleParamCode = `const ${paramName} = ${JSON.stringify(paramValue)};`;
            allParamsVarCode += singleParamCode;
        }
        //console.log("allParamsVarCode", allParamsVarCode);

        // Append param code to front, and func x call to end
        updatedCodeString = pageVarCode + allParamsVarCode + updatedCodeString + ` x(${pageWinID});`;
        eval(updatedCodeString);
    }
};*/

const extractStartingUrl = function(codeString){
    // Check and see if code contains "page.goto(", whitespace allowed between terms
    //const regex = /(page)\s*\.\s*(goto)\s*\(/;
    // Ensuring we're not matching page.goto occurrences that are commented out
    const regex = /(?<!^[\p{Zs}\t]*\/\/.*)(?<!\/\*(?:(?!\*\/)[\s\S\r])*?)(page)\s*\.\s*(goto)\s*\(/;
    const indexMatch = codeString.search(regex);
    console.log("indexMatch", indexMatch);
    if(indexMatch === -1){
        return null;
    }else{
        // Assuming no parentheses in url string
        const openingParen = codeString.indexOf("(", indexMatch);
        const closingParen = codeString.indexOf(")", openingParen);
        const startingUrlWithQuotes = codeString.substring(openingParen+1, closingParen).trim();
        
        // Assuming startingUrlWithQuotes is a string literal, and that quotes are first and last char
        const startingUrl = startingUrlWithQuotes.substring(1, startingUrlWithQuotes.length-1);
        return startingUrl;
    }
};

module.exports = {
    router,
    extractStartingUrl
};