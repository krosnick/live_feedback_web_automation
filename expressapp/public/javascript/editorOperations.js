const { ipcRenderer } = require('electron');
const acorn = require("acorn");
const walk = require("acorn-walk");

let decorations = [];
let winIDList = {};
let snapshotLineToDOMSelectorData;
let errorData;
let lastRunSnapshotLineToDOMSelectorData;
let lastRunErrorData;
let lineNumToComponentsList;
let runtimeErrorModelMarkerData = {};
let selectorSpecificModelMarkerData = {};
let runtimeErrorMessagesStale = false;
const puppeteerMethodsWithSelectorArg = [ "$", "$$", "$$eval", "$eval", "click", "focus", "hover", "select", "tap", "type", "waitForSelector", "waitFor" ];
const puppeteerKeyboardMethods = ["down", "press", "sendCharacter", "type", "up"];
//let activeViewLine;
let snapshotsBrowserViewID;
let windowSelectionViewID;
let mightBeOutOfSync = false;
let showSnapshotsView = true; // default

function sendUpdatedCodeToServer(){
    const updatedCode = monacoEditor.getValue();
    console.log("updatedCode", updatedCode);
    // Send the updated code value to the server
    $.ajax({
        method: "PUT",
        url: "/code/update",
        data: {
            updatedFileContents: updatedCode
        }
    });
}

function editorOnDidChangeContent(e){
    clearTimeout(codeChangeSetTimeout);
    codeChangeSetTimeout = setTimeout(() => {
        // Check if script is currently running; if so, don't send code to server now - send updated code to server afterwards
        if($("#runCode").is(':visible')){
            //console.log("Can send updated code to server");
            sendUpdatedCodeToServer();
        }else{
            //console.log("CANNOT send updated code to server");
        }
    }, 1000);

    if(runtimeErrorMessagesStale === false){
        // Update runtimeErrorModelMarkerData error messages to warn they might be stale 
        for(lineObj of Object.values(runtimeErrorModelMarkerData)){
            for(markerDatum of lineObj){
                markerDatum.message = "[Note error might be stale] " + markerDatum.message;
                markerDatum.severity = monaco.MarkerSeverity.Hint;
            }
        }
        runtimeErrorMessagesStale = true;
    }

    // Updating snapshotLineToDOMSelectorData and checking validity of selectors in current line
    //console.log("editorOnDidChangeContent event", e);
    let lowestLineNumber = undefined;
    let isLowestLineNumberJustANewline;
    for(change of e.changes){
        const position = monacoEditor.getModel().getPositionAt(change.rangeOffset);
        const lineNumber = position.lineNumber;
        const column = position.column;
        const lineMaxColumn = monacoEditor.getModel().getLineMaxColumn(lineNumber);
        const startLineNumber = change.range.startLineNumber;
        if(lowestLineNumber === undefined || startLineNumber < lowestLineNumber){
            lowestLineNumber = startLineNumber;
            isLowestLineNumberJustANewline = change.rangeLength === 0 && (column === lineMaxColumn);
        }
    }

    // Don't delete/change any snapshot or selector data if the change is just a newline
    if(snapshotLineToDOMSelectorData && !isLowestLineNumberJustANewline){
        //console.log("before snapshotLineToDOMSelectorData", Object.keys(snapshotLineToDOMSelectorData).length);
        // Go through and remove all line numbers greater than lowestLineNumber
        // And for lowestLineNumber, remove it's afterSnapshots
        const lineNumbers = Object.keys(snapshotLineToDOMSelectorData);
        for(lineNumberStr of lineNumbers){
            if(parseInt(lineNumberStr) > lowestLineNumber){
                delete snapshotLineToDOMSelectorData[lineNumberStr];
                // Tell snapshots view to delete this
                ipcRenderer.sendTo(parseInt(snapshotsBrowserViewID), "deleteAllSnapshotsForLine", lineNumberStr);

            }
            if(parseInt(lineNumberStr) === lowestLineNumber){
                const lineObj = snapshotLineToDOMSelectorData[lineNumberStr];
                for(data of Object.values(lineObj)){
                    delete data["afterDomString"];
                    // Tell snapshots view to delete this
                    ipcRenderer.sendTo(parseInt(snapshotsBrowserViewID), "deleteAfterDomStringForLine", lineNumberStr);
                }
            }
        }
        //console.log("after snapshotLineToDOMSelectorData", Object.keys(snapshotLineToDOMSelectorData).length);
        
        // Also need to remove all line numbers >= lowestLineNumber from selectorSpecificModelMarkerData
        // so that we don't have stale selector squiggles
        const modelMarkerLineNumbers = Object.keys(selectorSpecificModelMarkerData);
        for(lineNumberStr of modelMarkerLineNumbers){
            if(parseInt(lineNumberStr) >= lowestLineNumber){
                delete selectorSpecificModelMarkerData[lineNumberStr];
            }
        }

        const codeValidityResult = checkValidity(monacoEditor.getValue());
        //console.log("codeValidityResult", codeValidityResult);
        // If syntax error, don't update any squiggles
        if(codeValidityResult === "valid"){
            // For lowestLineNumber, see if it has any selectors. If so, check if that selector exists in beforeSnapshot
            const selectorDataItem = findSelector(lowestLineNumber, false);
            //console.log("selectorDataItem", selectorDataItem);
            if(selectorDataItem){
                //console.log("selectorDataList", selectorDataList);
                //console.log("selectorDataList.length", selectorDataList.length);
                // For each obj in array, check the selector against beforeSnapshot; and show squiggle for it at the given location
                // Can probably reuse some code from earlier
                //for(selectorDataItem of selectorDataList){
                // Update selectorDataItem; it's line numbers are wrong, because we sent over only a single line of code (not the whole code),
                    // which actually isn't correct, should be lowestLineNumber
                const numLines = selectorDataItem.selectorLocation.end.line - selectorDataItem.selectorLocation.start.line; // should be 0?
                selectorDataItem.selectorLocation.start.line = lowestLineNumber;
                selectorDataItem.selectorLocation.end.line = lowestLineNumber + numLines;
                
                // This will indirectly call identifyAndCreateSelectorSquiggleData and setModelMarkers
                ipcRenderer.sendTo(parseInt(snapshotsBrowserViewID), "getSelectorNumResults", lowestLineNumber, selectorDataItem);
                /*// Before calling next 2 lines, need to call getSelectorNumResults and get result in selectorNumResults
                identifyAndCreateSelectorSquiggleData(lowestLineNumber, selectorDataItem);
                //}
                // Update model markers
                monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', generateModelMarkerList());*/
            }
        }
    }
}

function checkForClientSideSelector(expressionObj){
    // Return selector string and the line/col location
    // Or, if no selector in expression, return null

    // Check for client-side JS calls/methods
    if(expressionObj.callee && expressionObj.callee.object && expressionObj.callee.object.name && expressionObj.callee.object.name === "document"){
        if(expressionObj.callee && expressionObj.callee.property && expressionObj.callee.property.name){
            if(expressionObj.arguments && expressionObj.arguments.length > 0){
                const argument = expressionObj.arguments[0];
                const candidateSelector = argument.value;
                const methodName = expressionObj.callee.property.name;
                // Ignoring variable-based selectors for now. Just searching for string literal. 
                if(typeof(candidateSelector) === "string"){
                    // Different ways of processing the string arg depending on method
                    if(methodName === "querySelector"){
                        const loc = argument.loc;
                        return {
                            method: "document." + methodName,
                            isSelectorOwn: true,
                            selectorString: candidateSelector,
                            selectorLocation: loc
                        };
                    }else if(methodName === "querySelectorAll"){
                        const loc = argument.loc;
                        return {
                            method: "document." + methodName,
                            isSelectorOwn: true,
                            selectorString: candidateSelector,
                            selectorLocation: loc
                        };
                    }else if(methodName === "getElementById"){
                        // Need to prepend string with #
                        const loc = argument.loc;
                        return {
                            method: "document." + methodName,
                            isSelectorOwn: true,
                            selectorString: "#" + candidateSelector,
                            selectorLocation: loc
                        };
                    }else if(methodName === "getElementsByClassName"){
                        // Need to split candidateSelector string by space, then for each class prepend a ".", then combine
                        const classesList = candidateSelector.split(" ");
                        let classesSelector = "";
                        for(let className of classesList){
                            classesSelector += "." + className;
                        } 
                        const loc = argument.loc;
                        return {
                            method: "document." + methodName,
                            isSelectorOwn: true,
                            selectorString: classesSelector,
                            selectorLocation: loc
                        };
                    }else if(methodName === "getElementsByName"){
                        // Need to use attribute value selector syntax
                        const loc = argument.loc;
                        return {
                            method: "document." + methodName,
                            isSelectorOwn: true,
                            selectorString: `[name="${candidateSelector}"]`,
                            selectorLocation: loc
                        };
                    }else if(methodName === "getElementsByTagName"){
                        const loc = argument.loc;
                        return {
                            method: "document." + methodName,
                            isSelectorOwn: true,
                            selectorString: candidateSelector,
                            selectorLocation: loc
                        };
                    }
                }
            }
        }
    }else if(expressionObj.callee && expressionObj.callee.name && expressionObj.callee.name === "$"){
        if(expressionObj.arguments && expressionObj.arguments.length === 1){ // want to ensure we're not searching withing some other context (which could be provided as additional arg)
            const argument = expressionObj.arguments[0];
            const candidateSelector = argument.value;
            // Ignoring variable-based selectors for now. Just searching for string literal.
            if(typeof(candidateSelector) === "string"){
                // It is a selector
                const loc = argument.loc;
                return {
                    method: "$",
                    isSelectorOwn: true,
                    selectorString: candidateSelector,
                    selectorLocation: loc
                };
            }
        }
    }
    return null;
}

function checkForSelector(expressionObj, ancestors){
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
        }/*else if(expressionObj.argument && expressionObj.argument.callee && expressionObj.argument.callee.object && expressionObj.argument.callee.object.object && expressionObj.argument.callee.object.object.name === "page" && expressionObj.argument.callee.object.property && expressionObj.argument.callee.object.property.name === "keyboard"){
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
                                    isSelectorOwn: false, // So client knows to not try setting a selector validity message for this line
                                    selectorString: siblingSelectorInfo.selectorString,
                                    selectorLocation: siblingSelectorInfo.selectorLocation
                                }
                            }
                        }
                    }
                }
            }
        }*/
    }
    return null;
};

function findPrevStatement(expressionObj, parentObj){
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

function findSelector(lineNumber, searchClientSideJS){
    const fullCode = monacoEditor.getValue();
    const acornAST = acorn.parse(fullCode, {
        ecmaVersion: 2020,
        allowAwaitOutsideFunction: true,
        locations: true
    });
    let selectorDataList = [];
    walk.ancestor(acornAST, {
        CallExpression(node, ancestors) {
            if(searchClientSideJS){
                // Look for the line number of interest
                if(node.loc.start.line === lineNumber){
                    // Will be null if no selector found
                    const selectorInfo = checkForClientSideSelector(node);
                    console.log("checkForClientSideSelector result", selectorInfo); 
                    if(selectorInfo){
                        selectorDataList.push(selectorInfo);
                    }
                }
            }
        },
        AwaitExpression(node, ancestors) {
            // Look for the line number of interest
            if(node.loc.start.line === lineNumber){
                // Will be null if no selector found
                const selectorInfo = checkForSelector(node, searchClientSideJS);
                if(selectorInfo){
                    const prevStatement = findPrevStatement(node, ancestors[ancestors.length-2]);
                    if(prevStatement){
                        const prevLineNumber = prevStatement.loc.start.line;
                        selectorInfo.prevLineNumber = prevLineNumber;   
                    }
                    selectorDataList.push(selectorInfo);
                }
            }
        },
        AssignmentExpression(node, ancestors) {
            // Look for the line number of interest
            if(node.loc.start.line === lineNumber){
                // Will be null if no selector found
                const selectorInfo = checkForSelector(node.right, searchClientSideJS);
                if(selectorInfo){
                    const prevStatement = findPrevStatement(node.right, ancestors[ancestors.length-2]);
                    if(prevStatement){
                        const prevLineNumber = prevStatement.loc.start.line;
                        selectorInfo.prevLineNumber = prevLineNumber;   
                    }
                    selectorDataList.push(selectorInfo);
                }
            }
        },
        ExpressionStatement(node, ancestors) {
            // Look for the line number of interest
            if(node.loc.start.line === lineNumber){
                // Will be null if no selector found
                const selectorInfo = checkForSelector(node.expression, searchClientSideJS);
                if(selectorInfo){
                    const prevStatement = findPrevStatement(node.expression, ancestors[ancestors.length-2]);
                    if(prevStatement){
                        const prevLineNumber = prevStatement.loc.start.line;
                        selectorInfo.prevLineNumber = prevLineNumber;   
                    }
                    selectorDataList.push(selectorInfo);
                }
            }
        },
        VariableDeclaration(node, ancestors) {
            // Look for the line number of interest
            if(node.loc.start.line === lineNumber){
                // Will be null if no selector found
                const selectorInfo = checkForSelector(node.declarations[0].init, searchClientSideJS);
                if(selectorInfo){
                    const prevStatement = findPrevStatement(node.declarations[0].init, ancestors[ancestors.length-2]);
                    if(prevStatement){
                        const prevLineNumber = prevStatement.loc.start.line;
                        selectorInfo.prevLineNumber = prevLineNumber;
                    }
                    selectorDataList.push(selectorInfo);
                }
            }
        }
    });
    
    for(let i = 0; i < selectorDataList.length; i++){
        const selectorDataObj = selectorDataList[i];
        if(Number.isInteger(selectorDataObj.prevLineNumber)){
            return selectorDataObj;
        }
    }
    // None had prevLineNumber, so just return first result
        // (this is assuming only 1 selector per line)
    return selectorDataList[0];
    //return selectorDataList;
}

function editorOnDidChangeCursorPosition(e){
    //console.log("editorOnDidChangeCursorPosition");
    const lineNumber = e.position.lineNumber;
    
    ipcRenderer.sendTo(parseInt(snapshotsBrowserViewID), "showLineNumber", lineNumber);
    if(mightBeOutOfSync){
        mightBeOutOfSync = false;
        
        // Tell snapshots view to update snapshots shown (since snapshots might be different now for the currently selected line number)
        ipcRenderer.sendTo(parseInt(snapshotsBrowserViewID), "forceShowLineNumber", lineNumber);

        // Depending on hide/show snapshots button status, tell server to /showSnapshotView
        if(showSnapshotsView){
            // Tell server to show UI snapshots view
            $.ajax({
                method: "POST",
                url: "/showSnapshotView"
            });
        }
    }

    // Assuming at most 1 selector per line
    let currentSelector = null;
    const codeValidityResult = checkValidity(monacoEditor.getValue());
    //console.log("codeValidityResult", codeValidityResult);
    // If syntax error, don't try checking for selectors
    if(codeValidityResult === "valid"){
        const selectorDataItem = findSelector(lineNumber, true);
        //console.log("selectorDataItem", selectorDataItem);
        if(selectorDataItem){
            currentSelector = selectorDataItem.selectorString;
        }
    }

    console.log("winIDList", winIDList);
    if(currentSelector){
        // For each winID, tell BrowserViews to highlight currentSelector on their page
        for(let winID of Object.keys(winIDList)){
            ipcRenderer.sendTo(parseInt(winID), "highlightUIElements", currentSelector);
        }
    }else{
        // For each winID, tell BrowserViews to clear 
        for(let winID of Object.keys(winIDList)){
            ipcRenderer.sendTo(parseInt(winID), "clearHighlightedUIElements");
        }
    }

    $(".tooltip").remove();
    // Show these hide/show UI snapshot buttons as long as snapshots exist somewhere (i.e., that snapshotLineToDOMSelectorData isn't empty)
    if(snapshotLineToDOMSelectorData){
        // For this line number, show "show UI snapshot" or "hide UI snapshot"
        
        // Reference element (line number in gutter to attach to)
        const lineNumberElements = document.querySelectorAll("#codeEditor .line-numbers");
        let referenceLineNumberElement = undefined;
        for(let i = 0; i < lineNumberElements.length; i++){
            const candidateElement = lineNumberElements[i];
            const lineNumberToGet = Math.max(1, lineNumber-1);
            if(candidateElement.textContent == lineNumberToGet){
                referenceLineNumberElement = candidateElement;
                break;
            }
        }
        // Use referenceLineNumberElement to determine offset position of .tooltip
        const lineNumberOffset = $(referenceLineNumberElement).offset();
        const editorOffset = $("#codeEditor").offset();
        const withinEditorLineVerticalOffset = lineNumberOffset.top - editorOffset.top;

        //const element = document.querySelector("#codePane");
        const element = document.querySelector("#codeEditor");
        
        let newElement;
        if(showSnapshotsView){
            newElement = $(`
                <div class="tooltip" role="tooltip" data-show="" style="top: ${withinEditorLineVerticalOffset}px;">
                    <button id="showUISnapshots" class="clickableButton" style="display: none;">Show UI snapshots</button>
                    <button id="hideUISnapshots" class="clickableButton" style="display: block;">Hide UI snapshots</button>
                </div>
            `).appendTo($(element));
        }else{
            newElement = $(`
                <div class="tooltip" role="tooltip" data-show="" style="top: ${withinEditorLineVerticalOffset}px;">
                    <button id="showUISnapshots" class="clickableButton" style="display: block;">Show UI snapshots</button>
                    <button id="hideUISnapshots" class="clickableButton" style="display: none;">Hide UI snapshots</button>
                </div>
            `).appendTo($(element));
        }

        const tooltip = newElement[0];

        // Pass the button, the tooltip, and some options, and Popper will do the
        // magic positioning for you:
        Popper.createPopper(tooltip, element, {
            placement: 'right'
        });
    }
}

const generateModelMarkerList = function(){
    let modelMarkerList = [];
    for(lineList of Object.values(runtimeErrorModelMarkerData)){
        modelMarkerList = modelMarkerList.concat(lineList);
    }
    for(lineList of Object.values(selectorSpecificModelMarkerData)){
        modelMarkerList = modelMarkerList.concat(lineList);
    }
    //console.log("modelMarkerList", modelMarkerList);
    return modelMarkerList;
};

const identifyAndCreateSelectorSquiggleData = function(lineNumber, selectorDataToTest){
    //console.log("identifyAndCreateSelectorSquiggleData");
    //console.log("line number", lineNumber);
    if(snapshotLineToDOMSelectorData){
        // Should compare selector against prior line's 'after' snapshot
        if(snapshotLineToDOMSelectorData[lineNumber]){
            const lineObj = snapshotLineToDOMSelectorData[lineNumber];
            //const prevLineObj = snapshotLineToDOMSelectorData[prevLineNumberWithSnapshots];
            //console.log("prevLineObj", prevLineObj);
            let selectorNotFoundIterationIndexList = [];
            let selectorNotUniqueIterationIndexList = [];
            let selectorFoundAndUniqueIterationIndexList = [];
            
            // Only if isSelectorOwn (i.e., the selector occurs on this line);
                // Otherwise doesn't make sense to show error for page.keyboard command
            if(selectorDataToTest.isSelectorOwn){
                const selector = selectorDataToTest.selectorString;
                //console.log("selector", selector);
                //const numWindows = Object.keys(prevLineObj).length;
                let numIterations = 0;
                for (const [winID, data] of Object.entries(lineObj)) {
                    // Make sure exists
                    if(snapshotLineToDOMSelectorData[lineNumber] && snapshotLineToDOMSelectorData[lineNumber][winID]){
                        const beforeObj = snapshotLineToDOMSelectorData[lineNumber][winID]['before'];
                        //console.log("beforeObj", beforeObj);
                        numIterations = Math.max(numIterations, beforeObj.length);
                        //console.log("numIterations", numIterations);
                        // Loop through iterations
                        for(let iterationIndex = 0; iterationIndex < beforeObj.length; iterationIndex++){
                            const iterationObj = beforeObj[iterationIndex];
                            //console.log("iterationObj", iterationObj);
                            const selectorNumResults = parseInt(iterationObj.selectorNumResults);
                            //console.log("selectorNumResults", selectorNumResults);
                            if(Number.isInteger(selectorNumResults)){ // i.e., it was set
                                if(selectorNumResults === 0){
                                    selectorNotFoundIterationIndexList.push(iterationIndex);
                                    //selectorNotFoundParamString += JSON.stringify(data.parametersString);
                                }else if(selectorNumResults === 1){
                                    selectorFoundAndUniqueIterationIndexList.push(iterationIndex);
                                    //selectorFoundAndUniqueParamString += JSON.stringify(data.parametersString);
                                }else if(selectorNumResults > 1){
                                    selectorNotUniqueIterationIndexList.push(iterationIndex);
                                    //selectorNotUniqueParamString += JSON.stringify(data.parametersString);
                                }
                            } 
                        }  
                    }
                }

                const selectorLocation = selectorDataToTest.selectorLocation;
                // Create squiggle model marker obj accordingly, add to squiggleLineMarkerObjList
                let message;
                let severity;
                if(selectorNotFoundIterationIndexList.length > 0){
                    // Selector not found (for at least some windows); indicate error
                    severity = monaco.MarkerSeverity.Error;
                    if(selectorNotFoundIterationIndexList.length === numIterations){
                        // Not found for any windows
                        message = `Selector ${selector} cannot be found at this point in the execution`;
                    }else{
                        // Found for some windows but not all
                        message = `Selector ${selector} cannot be found at this point in the execution for iterations: ${JSON.stringify(selectorNotFoundIterationIndexList)}`;
                    }
                }else if(selectorNotUniqueIterationIndexList.length > 0){
                    // Selector found but not unique
                    severity = monaco.MarkerSeverity.Warning;
                    if(selectorNotUniqueIterationIndexList.length === numIterations){
                        // For all windows, not unique
                        message = `Selector ${selector} is not unique`;
                    }else{
                        // For some windows not unique
                        message = `Selector ${selector} is not unique for iterations: ${JSON.stringify(selectorNotUniqueIterationIndexList)}`;
                    }
                }else if(selectorFoundAndUniqueIterationIndexList.length > 0){
                    // Selector is found and is unique
                    severity = monaco.MarkerSeverity.Info;
                    message = `Selector ${selector} was found and is unique`;
                }else{
                    // Means no after snapshots found, so can't check selector
                    return;
                }
                const markerObj = {
                    startLineNumber: selectorLocation.start.line,
                    startColumn: selectorLocation.start.column + 1,
                    endLineNumber: selectorLocation.end.line,
                    endColumn: selectorLocation.end.column + 1,
                    message: message,
                    severity: severity
                };
                const lineList = selectorSpecificModelMarkerData[lineNumber] || [];
                lineList.push(markerObj);
                selectorSpecificModelMarkerData[lineNumber] = lineList;
            }
        }
    }
};

const createSquigglyErrorMarkers = function(errorData){
    let errorLineNumbers = [];
    if(Object.keys(errorData).length > 0){
        // There are puppeteer errors; render markers appropriately
        const uniqueErrorObjList = createUniqueListOfErrorObjects(errorData);

        const borderWindowIDAndMessageList = [];
        // For each error, render markers
        for(const errorObj of uniqueErrorObjList) {
            const message = errorObj.errorMessage;
            const lineNumber = errorObj.errorLineNumber;
            errorLineNumbers.push(lineNumber);
            const borderWinIDs = errorObj.borderWinIDs;
            const parameterValueSets = errorObj.parameterValueSets;
            for(const borderWinID of borderWinIDs){
                borderWindowIDAndMessageList.push({borderWinID: borderWinID, message: message});
            }

            /*const numIterationObjects = Object.values(snapshotLineToDOMSelectorData[lineNumber])[0]['before'].length;
            const failingIterationNumber = numIterationObjects - 1;*/

            const markerObj = {
                startLineNumber: lineNumber,
                startColumn: 0,
                endLineNumber: lineNumber,
                endColumn: 1000,
                message: `The following error occurred:\n${message}`, // ideally would like to say loop iteration number, but hard to do with if/else statement bodies, etc
                severity: monaco.MarkerSeverity.Error
            };
            const lineList = runtimeErrorModelMarkerData[lineNumber] || [];
            lineList.push(markerObj);
            runtimeErrorModelMarkerData[lineNumber] = lineList;
        }

        for(const pair of borderWindowIDAndMessageList){
            const borderWinID = parseInt(pair.borderWinID);
            console.log("borderWinID", borderWinID);
            const message = pair.message;
            ipcRenderer.sendTo(borderWinID, "errorMessage", message);
        }
    }
    return errorLineNumbers;
};

const createUniqueListOfErrorObjects = function(errorObjectMap){
    const errorObjEntries = Object.entries(errorObjectMap);
    const uniqueErrorObjList = [];
    const errorWinIDs = [];
    const borderWinIDs = [];
    const parameterValueSets = [];
    for (let [key, value] of errorObjEntries) {
        key = parseInt(key);
        let sameErrorAtIndex = undefined;
        for(let i = 0; i < uniqueErrorObjList.length; i++){
            const prevFoundValue = uniqueErrorObjList[i];
            if(value.errorMessage === prevFoundValue.errorMessage && value.errorLineNumber === prevFoundValue.errorLineNumber){
                sameErrorAtIndex = i;
                break;
            }
        }
        if(sameErrorAtIndex === undefined){
            // Add this new error
            uniqueErrorObjList.push(_.cloneDeep(value));
            errorWinIDs.push([key]);
            borderWinIDs.push([value.correspondingBorderWinID]);
            parameterValueSets.push([value.parameterValueSet]);
        }else{
            // Add winID to list
            errorWinIDs[sameErrorAtIndex].push(key);
            borderWinIDs[sameErrorAtIndex].push(value.correspondingBorderWinID);
            parameterValueSets[sameErrorAtIndex].push(value.parameterValueSet);
        }
    }
    for(let i = 0; i < uniqueErrorObjList.length; i++){
        const obj = uniqueErrorObjList[i];
        obj['windowIDs'] = errorWinIDs[i];
        obj['borderWinIDs'] = borderWinIDs[i];
        obj['parameterValueSets'] = parameterValueSets[i];
        delete obj['correspondingBorderWinID'];
        delete obj['parameterValueSet'];
    }
    console.log("uniqueErrorObjList", uniqueErrorObjList);
    return uniqueErrorObjList;
};

const updateUIForStartingCodeRun = function(){
    // Update buttons
    $("#runCode").hide();
    $("#stopRunning").show();

    // Make editors gray
    monaco.editor.setTheme('themeWhileScriptRunning');
};

const updateUIForEndingCodeRun = function(){
    // Update buttons
    $("#runCode").show();
    $("#stopRunning").hide();

    // Return to original (white background) theme
    monaco.editor.setTheme("vs");
};

const checkValidity = function(codeString){
    const surroundedWithFuncStr = `async function testValidityFunc(){${codeString}\n}`;
    try{
        eval(surroundedWithFuncStr);
    }catch(error){
        return error;
    }
    return "valid";
};

const addTextToPuppeteerConsole = function(stdOutOrErr, isError){
    let className = "";
    if(isError){
        className = "errorText";
    }

    // Need to split stdOutOrErr by \n, so then we print each line individually
    const itemsToPrint = stdOutOrErr.split('\n');
    itemsToPrint.forEach(function(str){
        //const escapedString = str.replaceAll(/'/ig, "\\'");
        // create a new div element
        newDiv = document.createElement('div');
        newPre = document.createElement('pre');
        // and give it some content
        //newContent = document.createTextNode(escapedString);
        newContent = document.createTextNode(str);
        // add the text node to the newly created div
        newPre.appendChild(newContent);
        newDiv.appendChild(newPre);
        newDiv.className = className;
        //puppeteerTerminalElement = document.querySelector('#puppeteerTerminal');
        //puppeteerTerminalElement = document.querySelector(`.puppeteerTerminal[winID="${pageWinID}"]`);
        puppeteerTerminalElements = document.querySelectorAll('.puppeteerTerminal');
        for(let i = 0; i < puppeteerTerminalElements.length; i++){
            const puppeteerTerminalElement = puppeteerTerminalElements[i];
            puppeteerTerminalElement.appendChild(newDiv);
            puppeteerTerminalElement.scrollIntoView(false);
        }
    });  
};

$(function(){
    snapshotsBrowserViewID = $("#snapshotsBrowserViewID").attr("snapshotsBrowserViewID");
    windowSelectionViewID = $("#windowSelectionViewID").attr("windowSelectionViewID");
    //console.log("snapshotsBrowserViewID", snapshotsBrowserViewID);
    /*// For some reason not capturing key events, so for now just listening for clicks
    $("body").on("click", "#codeEditor .view-line", function(e){
        console.log("#codeEditor .view-line", e);
        activeViewLine = $(e.target);
    });*/
    $("body").on("click", "#stopRunning", function(e){
        $.ajax({
            method: "POST",
            url: "/puppeteer/stop"
        });
    });

    $("body").on("click", "#runCode", function(e){
        // First check if the code syntax is valid; if it isn't, then show error in console
            // and do nothing else
        const code = monacoEditor.getValue();
        const codeValidityResult = checkValidity(code);
        //console.log("codeValidityResult", codeValidityResult);
        if(codeValidityResult === "valid"){
            updateUIForStartingCodeRun();
            
            // Tell server to show border and page views (don't want snapshots view showing)
            $.ajax({
                method: "POST",
                url: "/showPageView"
            });

            // Store existing data as "last run"
            lastRunSnapshotLineToDOMSelectorData = snapshotLineToDOMSelectorData;
            lastRunErrorData = errorData;
            // Clear all existing puppeteer error markers and gutter bar decorations
            runtimeErrorModelMarkerData = {};
            selectorSpecificModelMarkerData = {};
            snapshotLineToDOMSelectorData = {};
            errorData = {};
            lineNumToComponentsList = {};

            $(".tooltip").remove();
            monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', generateModelMarkerList()); // just empty
            decorations = monacoEditor.deltaDecorations(decorations, []);

            ipcRenderer.sendTo(parseInt(snapshotsBrowserViewID), "scriptStartedRunning");

            // Need to ask server for border BrowserView IDs
            $.ajax({
                method: "POST",
                url: "/windowData/getBorderWinIDs"
            }).done(function(borderWinIDList) {

                // Clear red border and error messages from the border BrowserViews
                for(borderWinID of borderWinIDList){
                    ipcRenderer.sendTo(borderWinID, "clear");
                }

                // Get the current code, send it to the server,
                // and execute it in the Puppeteer context
                $.ajax({
                    method: "POST",
                    url: "/puppeteer/runPuppeteerCode",
                    data: {
                        code: code
                    }
                }).done(function(data) {
                    runtimeErrorMessagesStale = false;
                    console.log("browserWindowFinishAndErrorData", data);
                    errorData = data.errors;
                    const ranToCompletionData = data.ranToCompletion;
                    snapshotLineToDOMSelectorData = data.snapshotLineToDOMSelectorData;
                    lineNumToComponentsList = data.lineNumToComponentsList;

                    let rangeList = [];

                    let lineCount = monacoEditor.getModel().getLineCount();
                    let winIDToUserRequestedStopLineNumber = data.winIDToUserRequestedStopLineNumber;
                    if(Object.keys(winIDToUserRequestedStopLineNumber).length > 0){
                        // Adjust lineCount to be lowest line number minus 1 in winIDToUserRequestedStopLineNumber
                        const stopLineNumbersOrig = Object.values(winIDToUserRequestedStopLineNumber);
                        let stopLineNumbers = [];
                        stopLineNumbersOrig.forEach(element => stopLineNumbers.push(parseInt(element)));
                        stopLineNumbers.sort((a, b) => a - b);
                        const lowestLineNumber = stopLineNumbers[0];
                        lineCount = lowestLineNumber-1;

                        let highestLineNumber = stopLineNumbers[stopLineNumbers.length - 1];
                        
                        // Create yellow(?) decorations for range of line numbers in winIDToUserRequestedStopLineNumber
                        rangeList.push({ range: new monaco.Range(lowestLineNumber,1,highestLineNumber,1), options: { isWholeLine: true, linesDecorationsClassName: 'yellowLineDecoration' }});
                    }

                    let errorLineNumbers = createSquigglyErrorMarkers(errorData);
                    if(errorLineNumbers.length > 0){
                        // There were errors. Let's put red decorations on these lines
                        // First, sort
                        errorLineNumbers.sort((a, b) => a - b);

                        // Green decoration from beginning until first line with error
                        rangeList.push({ range: new monaco.Range(1,1,errorLineNumbers[0]-1,1), options: { isWholeLine: true, linesDecorationsClassName: 'greenLineDecoration' }});

                        for(let i = 0; i < errorLineNumbers.length; i++){
                            const errorNum = errorLineNumbers[i];
                            // Have gray decorations for all lines in between error lines
                            if(i > 0){
                                const prevErrorNum = errorLineNumbers[i-1];
                                rangeList.push({ range: new monaco.Range(prevErrorNum+1,1,errorNum-1,1), options: { isWholeLine: true, linesDecorationsClassName: 'grayLineDecoration' }});
                            }
                            // Red decoration for line with error
                            rangeList.push({ range: new monaco.Range(errorNum,1,errorNum,1), options: { isWholeLine: true, linesDecorationsClassName: 'redLineDecoration' }});
                        }

                        // Check if at least 1 example ran to completion; if so, show gray decoration until end of editor
                        if(Object.keys(ranToCompletionData).length > 0){
                            rangeList.push({ range: new monaco.Range(errorLineNumbers[errorLineNumbers.length-1]+1,1,lineCount,1), options: { isWholeLine: true, linesDecorationsClassName: 'grayLineDecoration' }});
                        }
                    }
                    
                    if(Object.keys(ranToCompletionData).length > 0){
                        // Show green decoration for all lines
                        rangeList.push({ range: new monaco.Range(1,1,lineCount,1), options: { isWholeLine: true, linesDecorationsClassName: 'greenLineDecoration' }});
                    }
                    decorations = monacoEditor.deltaDecorations(decorations, rangeList);
                    // For all lines in snapshotLineToDOMSelectorData, for each line that has a selector,
                        // check against the beforeSnapshot to confirm it's in DOM, and also check for it's uniqueness.
                        // Create appropriate squiggles.
                    const lineNumbers = Object.keys(snapshotLineToDOMSelectorData);
                    console.log("Before trying to identify selector squiggles");
                    for(lineNumber of lineNumbers){
                        // selectorData (string and location) is the same regardless of window
                        const selectorData = Object.values(snapshotLineToDOMSelectorData[lineNumber])[0]['before'][0].selectorData;
                        if(selectorData){
                            identifyAndCreateSelectorSquiggleData(lineNumber, selectorData);
                        }
                    }
                    monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', generateModelMarkerList());
                    
                    mightBeOutOfSync = true;

                    updateUIForEndingCodeRun();

                    // Send code and params to server now, in case any code/param edits happened while script was running (that we didn't save)
                    sendUpdatedCodeToServer();
                    sendUpdatedParamsToServer();
                });
            });
        }else{
            // Append error to console in app
            addTextToPuppeteerConsole(codeValidityResult.name + ': ' + codeValidityResult.message , true);
            //addTextToPuppeteerConsole(`${codeValidityResult.name} at line ${codeValidityResult.lineNumber}: ${codeValidityResult.message}`, true);
            //addTextToPuppeteerConsole(codeValidityResult.stack, true);
        }
    });

    $("body").on("click", "#puppeteerTerminalClearButton", function(e){
        // Should empty #puppeteerTerminal of all children
        //$("#puppeteerTerminal").empty();
        $(".puppeteerTerminal").empty();
    });

    $("body").on("mouseenter", ".tooltip", function(e){
        // Set opacity to 1.0
        $(".tooltip").css("opacity", 1.0);
    });

    $("body").on("mouseleave", ".tooltip", function(e){
        // Set opacity to .5
        $(".tooltip").css("opacity", 0.5);
    });

    $("body").on("click", "#hideUISnapshots", function(e){
        // Hide this button and show #showUISnapshots button
        $("#hideUISnapshots").hide();
        $("#showUISnapshots").show();

        // Tell windowSelectionView to click the appropriate button (#showUISnapshots or #hideSnapshots)
        ipcRenderer.sendTo(parseInt(windowSelectionViewID), "hideUISnapshots");
    });

    $("body").on("click", "#showUISnapshots", function(e){
        // Hide this button and show #hideSnapshots button
        $("#hideUISnapshots").show();
        $("#showUISnapshots").hide();

        // Tell windowSelectionView to click the appropriate button (#showUISnapshots or #hideSnapshots)
        ipcRenderer.sendTo(parseInt(windowSelectionViewID), "showUISnapshots");
    });

    $("body").on("change", "#windowSelectMenu", function(e){
        const newPageWinID = $(e.target).val();
        
        // Update disabled status of left/right buttons appropriately
        const currentOptionNode = $(`option[value="${newPageWinID}"`);

        // If no prev sibling exists, set disabled to true, otherwise set to false
        const prevOptionNode = currentOptionNode.prev();
        if(prevOptionNode.length > 0){
            $("#left").prop("disabled",false);
        }else{
            $("#left").prop("disabled",true);
        }
        
        // If no next sibling exists, set disabled to true, other set to false
        const nextOptionNode = currentOptionNode.next();
        if(nextOptionNode.length > 0){
            $("#right").prop("disabled",false);
        }else{
            $("#right").prop("disabled",true);
        }

        // Hide all .puppeteerTerminal then show this particular one
        $(".puppeteerTerminal").hide();
        $(`.puppeteerTerminal[winID=${newPageWinID}]`).show();
    });

    $("body").on("click", "#left", function(e){
        // Find currently selected <option>
        const currentValue = $("#windowSelectMenu").val();
        const currentOptionNode = $(`option[value="${currentValue}"`);
        const prevOptionNode = currentOptionNode.prev();
        
        // If it has a prev sibling (https://api.jquery.com/prev/), 
            // change the value of the <select> to that sibling's pageWinID
            // (https://stackoverflow.com/questions/78932/how-do-i-programmatically-set-the-value-of-a-select-box-element-using-javascript)
        if(prevOptionNode.length > 0){
            const newValue = prevOptionNode.attr("value");
            $("#windowSelectMenu").val(newValue);
            $("#windowSelectMenu").trigger("change");
        }
        // And then if it now has no prev sibling, disable #left
        if(prevOptionNode.prev().length === 0){
            $("#left").prop("disabled",true);
        }
        // And regardless, enable #right
        $("#right").prop("disabled",false);
    });

    $("body").on("click", "#right", function(e){
        // Find currently selected <option>
        const currentValue = $("#windowSelectMenu").val();
        const currentOptionNode = $(`option[value="${currentValue}"`);
        const nextOptionNode = currentOptionNode.next();
        
        // If it has a next sibling (https://api.jquery.com/next/), 
            // change the value of the <select> to that sibling's pageWinID
            // (https://stackoverflow.com/questions/78932/how-do-i-programmatically-set-the-value-of-a-select-box-element-using-javascript)
        if(nextOptionNode.length > 0){
            const newValue = nextOptionNode.attr("value");
            $("#windowSelectMenu").val(newValue);
            $("#windowSelectMenu").trigger("change");
        }
        // And then if it now has no next sibling, disable #right
        if(nextOptionNode.next().length === 0){
            $("#right").prop("disabled",true);
        }
        // And regardless, enable #left
        $("#left").prop("disabled",false);
    });
});

ipcRenderer.on('newWindowAlert', function(event, pageWinID){
    console.log("newWindowAlert");
    // Add to winIDList
    winIDList[pageWinID] = 1;
});

ipcRenderer.on('clearWindowList', function(event){
    console.log("clearWindowList");
    // Clear winIDList
    winIDList = {};
});

ipcRenderer.on('updateHideShowSnapshotsViewStatus', function(event, hideOrShow){
    if(hideOrShow === "hide"){
        showSnapshotsView = false;
    }else{
        showSnapshotsView = true;
    }
});

ipcRenderer.on('addWindow', function(event, pageWinID, paramString, isFirstWindow){
    console.log('addWindow occurred');
    
    // Adding to selection menu
    let selectMenu = document.querySelector('#windowSelectMenu');
    let optionNode = document.createElement("option");
    optionNode.setAttribute("value", pageWinID);
    // If the window for this paramset was the first one created, then it's being shown and so this <option> should be selected
    if(isFirstWindow){
        optionNode.setAttribute("selected", "");
        // Create terminal div and show it
        $("#puppeteerTerminals").append(`<div class="puppeteerTerminal" winID="${pageWinID}"></div>`);
    }else{
        // Create terminal div and hide it
        $("#puppeteerTerminals").append(`<div class="puppeteerTerminal" winID="${pageWinID}" style="display:none"></div>`);
    }
    optionNode.textContent = paramString;
    selectMenu.append(optionNode);

    const currentValue = $("#windowSelectMenu").val();
    const currentOptionNode = $('option[value="' + currentValue + '"');
    // Check and see if after this addition, if the currently selected <option> has prev and next siblings (set left/right buttons disabled as appropriate)
    if(currentOptionNode.prev().length === 0){
        $("#left").prop("disabled",true);
    }else{
        $("#left").prop("disabled",false);
    }
    if(currentOptionNode.next().length === 0){
        $("#right").prop("disabled",true);
    }else{
        $("#right").prop("disabled",false);
    }
    
    /*// Set this variable to keep track of value
    oldPageWinID = pageWinID;*/
});

ipcRenderer.on('updateParameters', function(event, pageWinID, paramString){
    console.log('updateParameters occurred');
    const selector = '#windowSelectMenu option[value="' + pageWinID + '"]';
    document.querySelector(selector).textContent = paramString;
});

ipcRenderer.on('clear', function(event){
    document.querySelector('#windowSelectMenu').innerHTML = "";
    $("#puppeteerTerminals").empty();
});

ipcRenderer.on('selectorNumResults', function(event, lineNumber, selectorNumResultsObjList, selectorDataItem){
    //console.log("winIDToSelectorNumResults", winIDToSelectorNumResults);
    // Need to update snapshotLineToDOMSelectorData
    const lineObj = snapshotLineToDOMSelectorData[lineNumber];
    for(let obj of selectorNumResultsObjList){
        const winID = obj.winID;
        const itemIndex = obj.itemIndex;
        const selectorNumResults = obj.selectorNumResults;
        lineObj[winID]['before'][itemIndex].selectorNumResults = selectorNumResults;
    }
    // Now, should update squiggles on page
    identifyAndCreateSelectorSquiggleData(lineNumber, selectorDataItem);
    //}
    // Update model markers
    monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', generateModelMarkerList());
});