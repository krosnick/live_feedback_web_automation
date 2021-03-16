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
const snapshotWidth = 250;
const snapshotHeight = 125;
const puppeteerMethodsWithSelectorArg = [ "$", "$$", "$$eval", "$eval", "click", "focus", "hover", "select", "tap", "type", "waitForSelector", "waitFor" ];
const puppeteerKeyboardMethods = ["down", "press", "sendCharacter", "type", "up"];
//let activeViewLine;

function editorOnDidChangeContent(e){
    clearTimeout(codeChangeSetTimeout);
    codeChangeSetTimeout = setTimeout(() => {
        const updatedCode = monacoEditor.getValue();
        console.log("updatedCode", updatedCode);

        // Send the updated code value to the server
        $.ajax({
            method: "PUT",
            url: "/code/update",
            data: {
                updatedFileContents: updatedCode
            }
        }).done(function(data){
            /*console.log("browserWindowFinishAndErrorData", data);
            const errorData = data.errors;
            //const ranToCompletionData = data.ranToCompletion;
            createSquigglyErrorMarkers(errorData);*/
        });
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
            }
            if(parseInt(lineNumberStr) === lowestLineNumber){
                const lineObj = snapshotLineToDOMSelectorData[lineNumberStr];
                for(data of Object.values(lineObj)){
                    //console.log("before data", data);
                    delete data["afterDomString"];
                    //console.log("after data", data);
                }
            }
        }
        //console.log("after snapshotLineToDOMSelectorData", Object.keys(snapshotLineToDOMSelectorData).length);

        // For lowestLineNumber, see if it has any selectors. If so, check if that selector exists in beforeSnapshot
            // Might need to give server the line of code to analyze it's AST and get selector
        const selectorDataList = findSelector(lowestLineNumber);
        
        // Also need to remove all line numbers >= lowestLineNumber from selectorSpecificModelMarkerData
        // so that we don't have stale selector squiggles
        const modelMarkerLineNumbers = Object.keys(selectorSpecificModelMarkerData);
        for(lineNumberStr of modelMarkerLineNumbers){
            if(parseInt(lineNumberStr) >= lowestLineNumber){
                delete selectorSpecificModelMarkerData[lineNumberStr];
            }
        }

        if(selectorDataList){
            // For each obj in array, check the selector against beforeSnapshot; and show squiggle for it at the given location
            // Can probably reuse some code from earlier
            for(selectorDataItem of selectorDataList){
                // Update selectorDataItem; it's line numbers are wrong, because we sent over only a single line of code (not the whole code),
                    // which actually isn't correct, should be lowestLineNumber
                const numLines = selectorDataItem.selectorLocation.end.line - selectorDataItem.selectorLocation.start.line; // should be 0?
                selectorDataItem.selectorLocation.start.line = lowestLineNumber;
                selectorDataItem.selectorLocation.end.line = lowestLineNumber + numLines;
                identifyAndCreateSelectorSquiggleData(lowestLineNumber, selectorDataItem);
            }
            // Update model markers
            monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', generateModelMarkerList());
        }
    }
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
                                    isSelectorOwn: false, // So client knows to not try setting a selector validity message for this line
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

function findSelector(lineNumber){
    const fullCode = monacoEditor.getValue();
    const acornAST = acorn.parse(fullCode, {
        ecmaVersion: 2020,
        allowAwaitOutsideFunction: true,
        locations: true
    });
    let selectorDataList = [];
    walk.ancestor(acornAST, {
        ExpressionStatement(node, ancestors) {
            // Look for the line number of interest
            if(node.loc.start.line === lineNumber){
                // Will be null if no selector found
                const selectorInfo = checkForSelector(node.expression);
                if(selectorInfo){
                    const prevStatement = findPrevStatement(node.expression, ancestors[ancestors.length-2]);
                    const prevLineNumber = prevStatement.loc.start.line;
                    selectorInfo.prevLineNumber = prevLineNumber;
                    selectorDataList.push(selectorInfo);
                }
            }
        },
        VariableDeclaration(node, ancestors) {
            // Look for the line number of interest
            if(node.loc.start.line === lineNumber){
                // Will be null if no selector found
                const selectorInfo = checkForSelector(node.declarations[0].init);
                if(selectorInfo){
                    const prevStatement = findPrevStatement(node.declarations[0].init, ancestors[ancestors.length-2]);
                    const prevLineNumber = prevStatement.loc.start.line;
                    selectorInfo.prevLineNumber = prevLineNumber;
                    selectorDataList.push(selectorInfo);
                }
            }
        }
    });
    
    return selectorDataList;
}

function editorOnDidChangeCursorPosition(e){
    //console.log("editorOnDidChangeCursorPosition");
    const lineNumber = e.position.lineNumber;
    const selectorDataList = findSelector(lineNumber);
    // Assuming at most 1 selector per line
    let currentSelector = null;
    if(selectorDataList.length > 0){
        currentSelector = selectorDataList[0].selectorString;
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
            ipcRenderer.sendTo(parseInt(winID), "clearHighlightedUIElements", currentSelector);
        }
    }

    // Only create/show snapshots if "Show" button (#showSnapshots) is currently hidden (meaning that snapshots should be shown)
    if($("#showSnapshots").is(":hidden")){
        createSnapshots(lineNumber, currentSelector);
    }
}

function createSnapshots(lineNumber, currentSelector){
    // Should update the tooltip that's being shown
    // First delete all existing .tooltip elements
    $(".tooltip").remove();
    
    // If there's a snapshot for this line
    if(snapshotLineToDOMSelectorData && snapshotLineToDOMSelectorData[lineNumber]){
        const newElement = $(`
            <div class="tooltip" role="tooltip" data-show="">
                <div id="labels">
                    <div id="beforeLabel" class="beforeAfterLabel">Before</div>
                    <div id="afterLabel" class="beforeAfterLabel">After</div>
                </div>
                <div id="snapshots">
                </div>
            </div>
        `).appendTo("#codePane");

        // Create a cluster for last run (start with all winIDs minimized)
        // (Maybe even have the cluster itself minimized?)
        if(lastRunSnapshotLineToDOMSelectorData && lastRunSnapshotLineToDOMSelectorData[lineNumber]){
            let cluster = Object.keys(lastRunSnapshotLineToDOMSelectorData[lineNumber]);
            createCluster(cluster, "Last run", newElement, lastRunSnapshotLineToDOMSelectorData, lineNumber, lastRunErrorData, currentSelector);
        }

        let clusterList = [];
        const winIDsForThisLine = Object.keys(snapshotLineToDOMSelectorData[lineNumber]);
        if(lineNumToComponentsList && lineNumToComponentsList[lineNumber]){
            const connectedComponents = Object.values(lineNumToComponentsList[lineNumber]);

            // Create actual clusters

            const winIDsWithoutAfterSnapshot = [];
            const winIDsNotInConnectedComponents = [];

            for(const winID of winIDsForThisLine){
                let winIDFound = false;
                const winIDStr = winID + "";
                for(const component of connectedComponents){
                    if(component.includes(winIDStr)){
                        winIDFound = true;
                    }
                }
                if(!winIDFound){
                    winIDsNotInConnectedComponents.push(winIDStr);
                }

                if(!snapshotLineToDOMSelectorData[lineNumber][winID].afterDomString){
                    winIDsWithoutAfterSnapshot.push(winIDStr);
                }
            }

            // Start off using connectedComponents
            if(connectedComponents.length > 0){
                clusterList = clusterList.concat(connectedComponents);
            }

            // Cluster winIDsWithoutAfterSnapshot together as their own cluster
            if(winIDsWithoutAfterSnapshot.length > 0){
                clusterList.push(winIDsWithoutAfterSnapshot);
            }

            // For winIDsNotInConnectedComponents that are not in winIDsWithoutAfterSnapshot, keep each one separate
            for(const winIDStr of winIDsNotInConnectedComponents){
                if(!winIDsWithoutAfterSnapshot.includes(winIDStr)){
                    // For some reason this winID wasn't included in a cluster, but it does have an afterSnapshot
                    // Let's just keep it as a separate cluster
                    clusterList.push([winIDStr]);
                }
            }
        }else{
            // No clusters were identified on the server. Likely means that no winIDs on
                // this line had afterSnapshot.
            // So let's just cluster all of the winIDs together
            const cluster = [];
            for(const winID of winIDsForThisLine){
                const winIDStr = winID + "";
                cluster.push(winIDStr);
            }
            clusterList.push(cluster);
        }

        console.log(`clusterList for lineNumber ${lineNumber}`, clusterList);

        // Let's user clusterList now for grouping snapshots visually
        for(let index = 0; index < clusterList.length; index++){
            const cluster = clusterList[index];
            // cluster is of the form ["1", "2", "4"] (where "1" is a winID, etc)
            createCluster(cluster, index, newElement, snapshotLineToDOMSelectorData, lineNumber, errorData, currentSelector);
        }
        
        //const element = document.querySelector("#paramEditor");
        const element = document.querySelector("#codePane");
        const tooltip = newElement[0];

        // Pass the button, the tooltip, and some options, and Popper will do the
        // magic positioning for you:
        Popper.createPopper(tooltip, element, {
            placement: 'right'
        });
    }
}

function createCluster(cluster, indexOrName, newElement, snapshotObj, lineNumber, errorObj, currentSelector){
    newElement.find("#snapshots").append(`<div class="clusterLabel">Label: ${indexOrName}</div>`);
    const clusterElement = $(`
        <div class="cluster" clusterIndex="${indexOrName}">
        </div>
    `);
    newElement.find("#snapshots").append(clusterElement);

    // Now for each winID in this cluster, create an html string and append to clusterElement
    for(let winIDIndex = 0; winIDIndex < cluster.length; winIDIndex++){
        const winIDStr = cluster[winIDIndex];
        const winID = parseInt(winIDStr);

        const lineObj = snapshotObj[lineNumber][winID];
        const beforeSnapshot = lineObj.beforeDomString;
        const afterSnapshot = lineObj.afterDomString;
        const parametersString = JSON.stringify(lineObj.parametersString);
        let errorString = "";
        const errorInfoForWin = errorObj[winID];
        if(errorInfoForWin){
            if(errorInfoForWin.errorLineNumber === lineNumber){
                // Check if lineObj.parametersString key/value are in errorInfoForWin.parameterValueSet
                const [key, value] = Object.entries(lineObj.parametersString)[0];
                if(errorInfoForWin.parameterValueSet[key] && errorInfoForWin.parameterValueSet[key] === value){
                    // Show this error for this snapshot
                    errorString = errorInfoForWin.errorMessage;
                }
            }
        }

        // If last run, minimize all snapshots. Otherwise, show snapshots if it's the first winID or there's an error; otherwise, hide.
        if((indexOrName !== "Last run") && (winIDIndex === 0 || errorString)){
            clusterElement.append(`
                <div class="colHeader" winID='${winID}'>
                    <span class="fullViewContents">
                        <span class="runInfo" winID='${winID}'>
                            ${parametersString}
                            <span class="errorText">${errorString}</span>
                        </span>
                        <button class="hideRun hideShowRun" winID='${winID}'>-</button>
                    </span>
                    <button class="showRun hideShowRun" winID='${winID}'>+</button>
                </div>
                <div class="snapshotContainer" winID='${winID}'>
                    <iframe winID='${winID}' class='snapshot beforeSnapshot'></iframe>
                </div>
                <div class="downArrow" winID='${winID}'>&#8595;</div>
                <div class="snapshotContainer" winID='${winID}'>
                    <iframe winID='${winID}' class='snapshot afterSnapshot'></iframe>
                </div>
            `);
        }else{
            clusterElement.append(`
                <div class="colHeader" winID='${winID}' style="width: 30px;">
                    <span class="fullViewContents" style="display: none;">
                        <span class="runInfo" winID='${winID}'>
                            ${parametersString}
                        </span>
                        <button class="hideRun hideShowRun" winID='${winID}'>-</button>
                    </span>
                    <button class="showRun hideShowRun" winID='${winID}' style="display: block;">+</button>
                </div>
                <div class="snapshotContainer" winID='${winID}' style="width: 30px;">
                    <iframe winID='${winID}' class='snapshot beforeSnapshot' style="visibility: hidden;"></iframe>
                </div>
                <div class="downArrow" winID='${winID}' style="width: 30px;">&#8595;</div>
                <div class="snapshotContainer" winID='${winID}' style="width: 30px;">
                    <iframe winID='${winID}' class='snapshot afterSnapshot' style="visibility: hidden;"></iframe>
                </div>
            `);
        }
        clusterElement.find(`[winID='${winID}'].beforeSnapshot`).attr("srcdoc", beforeSnapshot);
        clusterElement.find(`[winID='${winID}'].afterSnapshot`).attr("srcdoc", afterSnapshot);

        const beforeSnapshotIframe = document.querySelector(`[winID='${winID}'].beforeSnapshot`);
        const afterSnapshotIframe = document.querySelector(`[winID='${winID}'].afterSnapshot`);
        scaleIframe(beforeSnapshotIframe, lineObj, `left top`, currentSelector);
        scaleIframe(afterSnapshotIframe, lineObj, `left top`, currentSelector);
    }
}

//function addCursorAndBorder(iframeElement, methodType, selector){
function addCursorAndBorder(iframeElement, selector){
    const iframeContentDocument = iframeElement.contentDocument;
    
    const targetSelector = selector;
    //const eventType = methodType;

    if(targetSelector){
        const iframeDocBody = iframeElement.contentWindow.document.body;
        console.log("iframeDocBody", iframeDocBody);
        //console.log("iframeDocBody", iframeDocBody);
        //const element = iframeDocBody.querySelector(targetSelector);
        const elements = iframeDocBody.querySelectorAll(targetSelector);
        console.log("addCursorAndBorder elements", elements);
        console.log("targetSelector", targetSelector);
        for(let element of elements){
            // Apply border only if this is an interactive widget,
                // e.g., <button>, <input>, <a>, <select>, <option>, <textarea>
            //if(element.tagName === "BUTTON" || element.tagName === "INPUT" || element.tagName === "A" || element.tagName === "SELECT" || element.tagName === "OPTION" || element.tagName === "TEXTAREA"){
                // If a radio button or checkbox, let's add the border and mouse icon to its parent since checkboxes and radio buttons are small, won't be able to see border/mouse icon
                if(element.tagName === "INPUT" && (element.type === "checkbox" || element.type === "radio")){
                    borderElement = element.parentNode;
                }else{
                    borderElement = element;
                }
                borderElement.style.border = "5px solid blue";
                borderElement.style.borderRadius = "10px";

                // Append mouse icon img if element is semantically "clickable",
                    // e.g., button, link, radio button, checkbox, but NOT textfield etc
                if(element.tagName === "BUTTON" || element.tagName === "A" || element.tagName === "SELECT" || element.tagName === "OPTION" || (element.tagName === "INPUT" && (element.type === "button" || element.type === "checkbox" || element.type === "color" || element.type === "file" || element.type === "radio" || element.type === "range" || element.type === "submit"))){
                    const imageElement = document.createElement('img');
                    borderElement.appendChild(imageElement);
                    
                    // Should change this to a local file
                    imageElement.src = "https://cdn2.iconfinder.com/data/icons/design-71/32/Design_design_cursor_pointer_arrow_mouse-512.png";
                    imageElement.width = 20;
                    imageElement.height = 20;
                    //imageElement.maxWidth = "50%";
                    //imageElement.maxHeight = "50%";
                    imageElement.style.position = "absolute";
                    imageElement.style.left = "calc(50% - 10px)";
                    imageElement.style.top = "calc(50% - 10px)";
                    //imageElement.style.left = "50%";
                    //imageElement.style.top = "50%";
                }
            //}
        }
    }
    /*iframeContentDocument.body.innerHTML = iframeContentDocument.body.innerHTML +
    `<style>
        .selectorReferenceInlineDecoration {
            background-color: lightsalmon;
        }
    </style>`;*/
}

function scaleIframe(iframeElement, lineObj, transformOriginString, currentSelector){
    //beforeSnapshotIframeDocument.addEventListener('DOMFrameContentLoaded', (event) => {
    // Using setTimeout for now, to wait 500ms and hope that's enough for the DOM to be loaded so that
        // we know the dimensions we're accessing are stable (i.e., that the elements exist and they're not just size 0)
        // Prev tried using .onload or DOMFrameContentLoaded or DOMContentLoaded but these didn't work
    setTimeout(function(){
        const iframeDocument = iframeElement.contentWindow.document;
        if(currentSelector){
            //const selector = lineObj.selectorData.selectorString;
            const selectorElement = iframeDocument.querySelector(currentSelector);
            
            // Zoom to selector element if it is present in DOM
            if(selectorElement){
                scaleToElement(selectorElement, iframeElement, iframeDocument, transformOriginString);
                //addCursorAndBorder(iframeElement, lineObj.selectorData.method, lineObj.selectorData.selectorString);
                addCursorAndBorder(iframeElement, currentSelector);
                return;
            }else{
                // TODO - Check if this is a keyboard command and if the prior command had a selector it was operating on

            }
        }
        // Otherwise, scale to page width
        scaleToPageWidth(iframeElement, iframeDocument, transformOriginString);
    }, 1000);
    //});
}

function scaleToPageWidth(iframeElement, iframeDocument, transformOriginString){
    const pageWidth = iframeDocument.querySelector("body").scrollWidth;

    /*const paddingTotalHoriz = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-left')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-right'));
    const tooltipWidthWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().width - paddingTotalHoriz;
    const allowedSnapshotWidth = tooltipWidthWithoutPadding/2;

    const paddingTotalVert = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-top')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-bottom'));
    const tooltipHeightWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().height - paddingTotalVert;
    const allowedSnapshotHeight = tooltipHeightWithoutPadding;*/

    /*const transformScale = allowedSnapshotWidth / pageWidth;
    const newSnapshotWidth = allowedSnapshotWidth / transformScale;
    const newSnapshotHeight = allowedSnapshotHeight / transformScale;*/
    
    const transformScale = snapshotWidth / pageWidth;
    const newSnapshotWidth = snapshotWidth / transformScale;
    const newSnapshotHeight = snapshotHeight / transformScale;

    $(iframeElement).css('width', `${newSnapshotWidth}px`);
    $(iframeElement).css('height', `${newSnapshotHeight}px`);
    iframeElement.style.transform = `scale(${transformScale})`;
    iframeElement.style.transformOrigin = transformOriginString;
}

function scaleToElement(selectorElement, iframeElement, iframeDocument, transformOriginString){
    const currentElementWidth = selectorElement.getBoundingClientRect().width;
    const currentElementHeight = selectorElement.getBoundingClientRect().height;

    /*const paddingTotalHoriz = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-left')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-right'));
    const tooltipWidthWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().width - paddingTotalHoriz;
    const allowedSnapshotWidth = tooltipWidthWithoutPadding/2;*/
    
    /*const paddingTotalVert = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-top')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-bottom'));
    const tooltipHeightWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().height - paddingTotalVert;
    const allowedSnapshotHeight = tooltipHeightWithoutPadding;*/
    
    /*const transformOption1 = allowedSnapshotWidth / (3 * currentElementWidth); // want element to take up at most half of viewport width
    const transformOption2 = allowedSnapshotHeight / (3 * currentElementHeight); // want element to take up at most half of viewport height*/
    const transformOption1 = snapshotWidth / (3 * currentElementWidth); // want element to take up at most 1/3 of viewport width
    const transformOption2 = snapshotHeight / (3 * currentElementHeight); // want element to take up at most 1/3 of viewport height

    const chosenTransformScale = Math.min(transformOption1, transformOption2);

    /*const newSnapshotWidth = allowedSnapshotWidth / chosenTransformScale;
    const newSnapshotHeight = allowedSnapshotHeight / chosenTransformScale;*/
    const newSnapshotWidth = snapshotWidth / chosenTransformScale;
    const newSnapshotHeight = snapshotHeight / chosenTransformScale;

    $(iframeElement).css('width', `${newSnapshotWidth}px`);
    $(iframeElement).css('height', `${newSnapshotHeight}px`);
    iframeElement.style.transform = `scale(${chosenTransformScale})`;
    iframeElement.style.transformOrigin = transformOriginString;

    // Want to center it
    const scrollLeftAmount = selectorElement.getBoundingClientRect().x - newSnapshotWidth/3;
    const scrollTopAmount = selectorElement.getBoundingClientRect().y - newSnapshotHeight/3;

    iframeDocument.querySelector('html').scrollLeft = scrollLeftAmount;
    iframeDocument.querySelector('html').scrollTop = scrollTopAmount;
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
    let prevLineNumberWithSnapshots = selectorDataToTest.prevLineNumber; // using the after snapshot for this line to check for the selector
    
    if(snapshotLineToDOMSelectorData){
        // Should compare selector against prior line's 'after' snapshot
        if(snapshotLineToDOMSelectorData[prevLineNumberWithSnapshots]){
            const prevLineObj = snapshotLineToDOMSelectorData[prevLineNumberWithSnapshots];
            let selectorNotFoundWinIDList = [];
            let selectorNotUniqueWinIDList = [];
            let selectorFoundAndUniqueWinIDList = [];
            let selectorNotFoundParamString = "";
            let selectorNotUniqueParamString = "";
            let selectorFoundAndUniqueParamString = "";

            // Only if isSelectorOwn (i.e., the selector occurs on this line);
                // Otherwise doesn't make sense to show error for page.keyboard command
            if(selectorDataToTest.isSelectorOwn){
                const selector = selectorDataToTest.selectorString;
                const numWindows = Object.keys(prevLineObj).length;
                for (const [winID, data] of Object.entries(prevLineObj)) {
                    const afterDomString = data.afterDomString;

                    if(afterDomString){
                        const domObj = $(afterDomString);
                        const selectorResults = domObj.find(selector);
                        if(selectorResults.length === 0){
                            selectorNotFoundWinIDList.push(winID);
                            selectorNotFoundParamString += JSON.stringify(data.parametersString);
                        }else if(selectorResults.length === 1){
                            selectorFoundAndUniqueWinIDList.push(winID);
                            selectorFoundAndUniqueParamString += JSON.stringify(data.parametersString);
                        }else if(selectorResults.length > 1){
                            selectorNotUniqueWinIDList.push(winID);
                            selectorNotUniqueParamString += JSON.stringify(data.parametersString);
                        }
                    }
                }

                const selectorLocation = selectorDataToTest.selectorLocation;
                // Create squiggle model marker obj accordingly, add to squiggleLineMarkerObjList
                let message;
                let severity;
                if(selectorNotFoundWinIDList.length > 0){
                    // Selector not found (for at least some windows); indicate error
                    severity = monaco.MarkerSeverity.Error;
                    if(selectorNotFoundWinIDList.length === numWindows){
                        // Not found for any windows
                        message = `Selector ${selector} cannot be found at this point in the execution`;
                    }else{
                        // Found for some windows but not all
                        message = `Selector ${selector} cannot be found at this point in the execution for param sets ${selectorNotFoundParamString}`;
                    }
                }else if(selectorNotUniqueWinIDList.length > 0){
                    // Selector found but not unique
                    severity = monaco.MarkerSeverity.Warning;
                    if(selectorNotUniqueWinIDList.length === numWindows){
                        // For all windows, not unique
                        message = `Selector ${selector} is not unique`;
                    }else{
                        // For some windows not unique
                        message = `Selector ${selector} is not unique for param sets ${selectorNotUniqueParamString}`;
                    }
                }else if(selectorFoundAndUniqueWinIDList.length > 0){
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

            const markerObj = {
                startLineNumber: lineNumber,
                startColumn: 0,
                endLineNumber: lineNumber,
                endColumn: 1000,
                message: `The following error occurred for the ${parameterValueSets.length} param sets ${JSON.stringify(parameterValueSets)}:\n${message}`,
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

$(function(){
    /*// For some reason not capturing key events, so for now just listening for clicks
    $("body").on("click", "#codeEditor .view-line", function(e){
        console.log("#codeEditor .view-line", e);
        activeViewLine = $(e.target);
    });*/
    $("body").on("click", "#runCode", function(e){
        
        // Disable "Run" button
        $("#runCode").prop("disabled",true);
        
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
            const code = monacoEditor.getValue();
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
                let errorLineNumbers = createSquigglyErrorMarkers(errorData);
                if(errorLineNumbers.length > 0){
                    // There were errors. Let's put red decorations on these lines
                    // First, sort
                    errorLineNumbers.sort((a, b) => a - b);

                    let rangeList = [];
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
                        const lineCount = monacoEditor.getModel().getLineCount();
                        rangeList.push({ range: new monaco.Range(errorLineNumbers[errorLineNumbers.length-1]+1,1,lineCount,1), options: { isWholeLine: true, linesDecorationsClassName: 'grayLineDecoration' }});
                    }
                    decorations = monacoEditor.deltaDecorations(decorations, rangeList);
                }
                
                if(Object.keys(ranToCompletionData).length > 0){
                    // Show green decoration for all lines
                    const lineCount = monacoEditor.getModel().getLineCount();
                    decorations = monacoEditor.deltaDecorations(decorations, [{ range: new monaco.Range(1,1,lineCount,1), options: { isWholeLine: true, linesDecorationsClassName: 'greenLineDecoration' }}]);
                }

                // For all lines in snapshotLineToDOMSelectorData, for each line that has a selector,
                    // check against the beforeSnapshot to confirm it's in DOM, and also check for it's uniqueness.
                    // Create appropriate squiggles.
                const lineNumbers = Object.keys(snapshotLineToDOMSelectorData);
                for(lineNumber of lineNumbers){
                    // selectorData (string and location) is the same regardless of window
                    const selectorData = Object.values(snapshotLineToDOMSelectorData[lineNumber])[0].selectorData;
                    if(selectorData){
                        identifyAndCreateSelectorSquiggleData(lineNumber, selectorData);
                    }
                }
                monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', generateModelMarkerList());
                
                // Enable "Run" button
                $("#runCode").prop("disabled",false);
            });
        });
    });

    $("body").on("click", "#puppeteerTerminalClearButton", function(e){
        // Should empty #puppeteerTerminal of all children
        $("#puppeteerTerminal").empty();
    });

    $("body").on("mouseenter", ".tooltip", function(e){
        // Set opacity to 1.0
        $(".tooltip").css("opacity", 1.0);
    });

    $("body").on("mouseleave", ".tooltip", function(e){
        // Set opacity to .5
        $(".tooltip").css("opacity", 0.5);
    });

    $("body").on("click", "#hideSnapshots", function(e){
        // Hide snapshots div (.tooltip)
        $(".tooltip").hide();

        // Hide this button and show #showSnapshots button
        $("#hideSnapshots").hide();
        $("#showSnapshots").show();
    });

    $("body").on("click", "#showSnapshots", function(e){
        // Show snapshots div (.tooltip)
        $(".tooltip").show();

        // Hide this button and show #hideSnapshots button
        $("#hideSnapshots").show();
        $("#showSnapshots").hide();

        // Create a snapshot tooltip for the current cursor position in the editor
        const currentLineNumber = monacoEditor.getPosition().lineNumber;
        if(currentLineNumber){
            const selectorDataList = findSelector(currentLineNumber);
            // Assuming at most 1 selector per line
            let currentSelector = null;
            if(selectorDataList.length > 0){
                currentSelector = selectorDataList[0].selectorString;
            }
            createSnapshots(currentLineNumber, currentSelector);
        }
    });

    $("body").on("click", ".hideRun", function(e){
        // Hide/show appropriate header elements
        $(e.target).closest(".fullViewContents").hide();
        $(e.target).closest(".colHeader").find(".showRun").show();

        // Hide snapshots
        const winID = $(e.target).attr("winID");
        const clusterIndex = $(e.target).closest(".cluster").attr("clusterIndex");
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshot[winID="${winID}"]`).css("visibility", "hidden");
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshotContainer[winID="${winID}"]`).animate({
            width: "30px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .colHeader[winID="${winID}"]`).animate({
            width: "30px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .downArrow[winID="${winID}"]`).animate({
            width: "30px"
        }, 500);
    });

    $("body").on("click", ".showRun", function(e){
        // Hide/show appropriate header elements
        $(e.target).hide();
        $(e.target).closest(".colHeader").find(".fullViewContents").show();

        // Show snapshots
        const winID = $(e.target).attr("winID");
        const clusterIndex = $(e.target).closest(".cluster").attr("clusterIndex");
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshotContainer[winID="${winID}"]`).animate({
            width: "250px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .colHeader[winID="${winID}"]`).animate({
            width: "250px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .downArrow[winID="${winID}"]`).animate({
            width: "250px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshot[winID="${winID}"]`).css("visibility", "visible");
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