const { ipcRenderer } = require('electron');

let decorations = [];
let snapshotLineToDOMSelectorData;
let runtimeErrorModelMarkerData = {};
let selectorSpecificModelMarkerData = {};

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

    // Updating snapshotLineToDOMSelectorData and checking validity of selectors in current line
    //console.log("editorOnDidChangeContent event", e);
    let lowestLineNumber = undefined;
    for(change of e.changes){
        const startLineNumber = change.range.startLineNumber;
        if(lowestLineNumber === undefined || startLineNumber < lowestLineNumber){
            lowestLineNumber = startLineNumber;
        }
    }

    if(snapshotLineToDOMSelectorData){
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
        const codeLineString = monacoEditor.getModel().getLineContent(lowestLineNumber);
        $.ajax({
            method: "POST",
            url: "/puppeteer/findSelectorsInLine",
            data: {
                codeLine: codeLineString
            }
        }).done(function(data){
            // Also need to remove all line numbers >= lowestLineNumber from selectorSpecificModelMarkerData
            // so that we don't have stale selector squiggles
            const modelMarkerLineNumbers = Object.keys(selectorSpecificModelMarkerData);
            for(lineNumberStr of modelMarkerLineNumbers){
                if(parseInt(lineNumberStr) >= lowestLineNumber){
                    delete selectorSpecificModelMarkerData[lineNumberStr];
                }
            }
            
            //console.log("findSelectorsInLine data", data);
            if(data){
                const selectorDataList = data.selectorDataList;
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
        });

    }
}

function editorOnDidChangeCursorPosition(e){
    //console.log("editorOnDidChangeCursorPosition");
    const lineNumber = e.position.lineNumber;
    //console.log("lineNumber", lineNumber);
    
    // Should update the tooltip that's being shown
    // First delete all existing .tooltip elements
    $(".tooltip").remove();

    // If there's a snapshot for this line
    if(snapshotLineToDOMSelectorData && snapshotLineToDOMSelectorData[lineNumber]){
        // Currently only showing 1 snapshot (even though there are multiple - 1 per example)
        const lineObj = Object.values(snapshotLineToDOMSelectorData[lineNumber])[0];
        const beforeSnapshot = lineObj.beforeDomString;
        const afterSnapshot = lineObj.afterDomString;

        const newElement = $(`<div class="tooltip" role="tooltip" data-show=""><iframe id='beforeSnapshot' class='snapshot'></iframe><iframe id='afterSnapshot' class='snapshot'></iframe></div>`).appendTo("#paramEditor");
        newElement.find("#beforeSnapshot").attr("srcdoc", beforeSnapshot);
        newElement.find("#afterSnapshot").attr("srcdoc", afterSnapshot);
        const element = document.querySelector("#paramEditor");
        const tooltip = newElement[0];

        // Pass the button, the tooltip, and some options, and Popper will do the
        // magic positioning for you:
        Popper.createPopper(tooltip, element, {
            placement: 'right'
        });

        const beforeSnapshotIframe = document.querySelector("#beforeSnapshot");
        const afterSnapshotIframe = document.querySelector("#afterSnapshot");
        scaleIframe(beforeSnapshotIframe, lineObj, `left top`);
        scaleIframe(afterSnapshotIframe, lineObj, `right top`);
    }
}

function addCursorAndBorder(iframeElement, methodType, selector){
    const iframeContentDocument = iframeElement.contentDocument;
    
    const targetSelector = selector;
    const eventType = methodType;

    if(targetSelector){
        const iframeDocBody = iframeElement.contentWindow.document.body;
        console.log("iframeDocBody", iframeDocBody);
        //console.log("iframeDocBody", iframeDocBody);
        const element = iframeDocBody.querySelector(targetSelector);
        console.log("targetSelector", targetSelector);
        console.log("element", element);
        //console.log("element", element);
        // Apply border only if this is an interactive widget,
            // e.g., <button>, <input>, <a>, <select>, <option>, <textarea>
        if(element.tagName === "BUTTON" || element.tagName === "INPUT" || element.tagName === "A" || element.tagName === "SELECT" || element.tagName === "OPTION" || element.tagName === "TEXTAREA"){
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
        }
    }
    iframeContentDocument.body.innerHTML = iframeContentDocument.body.innerHTML +
    `<style>
        .selectorReferenceInlineDecoration {
            background-color: lightsalmon;
        }
    </style>`;
}

function scaleIframe(iframeElement, lineObj, transformOriginString){
    //beforeSnapshotIframeDocument.addEventListener('DOMFrameContentLoaded', (event) => {
    // Using setTimeout for now, to wait 500ms and hope that's enough for the DOM to be loaded so that
        // we know the dimensions we're accessing are stable (i.e., that the elements exist and they're not just size 0)
        // Prev tried using .onload or DOMFrameContentLoaded or DOMContentLoaded but these didn't work
    setTimeout(function(){
        const iframeDocument = iframeElement.contentWindow.document;
        if(lineObj.selectorData){
            const selector = lineObj.selectorData.selectorString;
            const selectorElement = iframeDocument.querySelector(selector);
            
            // Zoom to selector element if it is present in DOM
            if(selectorElement){
                scaleToElement(selectorElement, iframeElement, iframeDocument, transformOriginString);
                addCursorAndBorder(iframeElement, lineObj.selectorData.method, lineObj.selectorData.selectorString);
                return;
            }else{
                // TODO - Check if this is a keyboard command and if the prior command had a selector it was operating on

            }
        }
        // Otherwise, scale to page width
        scaleToPageWidth(iframeElement, iframeDocument, transformOriginString);
    }, 500);
    //});
}

function scaleToPageWidth(iframeElement, iframeDocument, transformOriginString){
    const pageWidth = iframeDocument.querySelector("body").scrollWidth;

    const paddingTotalHoriz = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-left')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-right'));
    const tooltipWidthWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().width - paddingTotalHoriz;
    const allowedSnapshotWidth = tooltipWidthWithoutPadding/2;

    const paddingTotalVert = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-top')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-bottom'));
    const tooltipHeightWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().height - paddingTotalVert;
    const allowedSnapshotHeight = tooltipHeightWithoutPadding;

    const transformScale = allowedSnapshotWidth / pageWidth;
    const newSnapshotWidth = allowedSnapshotWidth / transformScale;
    const newSnapshotHeight = allowedSnapshotHeight / transformScale;

    $(iframeElement).css('width', `${newSnapshotWidth}px`);
    $(iframeElement).css('height', `${newSnapshotHeight}px`);
    iframeElement.style.transform = `scale(${transformScale})`;
    iframeElement.style.transformOrigin = transformOriginString;
}

function scaleToElement(selectorElement, iframeElement, iframeDocument, transformOriginString){
    const currentElementWidth = selectorElement.getBoundingClientRect().width;
    const currentElementHeight = selectorElement.getBoundingClientRect().height;

    const paddingTotalHoriz = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-left')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-right'));
    const tooltipWidthWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().width - paddingTotalHoriz;
    const allowedSnapshotWidth = tooltipWidthWithoutPadding/2;
    
    const paddingTotalVert = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-top')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-bottom'));
    const tooltipHeightWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().height - paddingTotalVert;
    const allowedSnapshotHeight = tooltipHeightWithoutPadding;
    
    const transformOption1 = allowedSnapshotWidth / (2 * currentElementWidth); // want element to take up at most half of viewport width
    const transformOption2 = allowedSnapshotHeight / (2 * currentElementHeight); // want element to take up at most half of viewport height

    const chosenTransformScale = Math.min(transformOption1, transformOption2);

    const newSnapshotWidth = allowedSnapshotWidth / chosenTransformScale;
    const newSnapshotHeight = allowedSnapshotHeight / chosenTransformScale;

    $(iframeElement).css('width', `${newSnapshotWidth}px`);
    $(iframeElement).css('height', `${newSnapshotHeight}px`);
    iframeElement.style.transform = `scale(${chosenTransformScale})`;
    iframeElement.style.transformOrigin = transformOriginString;

    // Want to center it
    const scrollLeftAmount = selectorElement.getBoundingClientRect().x - newSnapshotWidth/4;
    const scrollTopAmount = selectorElement.getBoundingClientRect().y - newSnapshotHeight/4;

    iframeDocument.querySelector('html').scrollLeft = scrollLeftAmount;
    iframeDocument.querySelector('html').scrollTop = scrollTopAmount;
}

$(function(){
    /*// For some reason not capturing key events, so for now just listening for clicks
    $("body").on("click", "#codeEditor .view-line", function(e){
        console.log("#codeEditor .view-line", e);
        activeViewLine = $(e.target);
    });*/
    $("body").on("click", "#runCode", function(e){
        // Clear all existing puppeteer error markers and gutter bar decorations
        runtimeErrorModelMarkerData = {};
        selectorSpecificModelMarkerData = {};
        snapshotLineToDOMSelectorData = {};
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
                console.log("browserWindowFinishAndErrorData", data);
                const errorData = data.errors;
                const ranToCompletionData = data.ranToCompletion;
                snapshotLineToDOMSelectorData = data.snapshotLineToDOMSelectorData;
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
            });
        });
    });

    $("body").on("click", "#puppeteerTerminalClearButton", function(e){
        // Should empty #puppeteerTerminal of all children
        $("#puppeteerTerminal").empty();
    });
});

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
    if(snapshotLineToDOMSelectorData && snapshotLineToDOMSelectorData[lineNumber]){
        const lineObj = snapshotLineToDOMSelectorData[lineNumber];
        let selectorNotFoundWinIDList = [];
        let selectorNotUniqueWinIDList = [];
        let selectorNotFoundParamString = "";
        let selectorNotUniqueParamString = "";

        // Only if isSelectorOwn (i.e., the selector occurs on this line);
            // Otherwise doesn't make sense to show error for page.keyboard command
        if(selectorDataToTest.isSelectorOwn){
            const selector = selectorDataToTest.selectorString;
            const numWindows = Object.keys(lineObj).length;
            for (const [winID, data] of Object.entries(lineObj)) {
                const beforeDomString = data.beforeDomString;

                const domObj = $(beforeDomString);
                const selectorResults = domObj.find(selector);
                if(selectorResults.length === 0){
                    selectorNotFoundWinIDList.push(winID);
                    selectorNotFoundParamString += JSON.stringify(data.parametersString);
                }else if(selectorResults.length > 1){
                    selectorNotUniqueWinIDList.push(winID);
                    selectorNotUniqueParamString += JSON.stringify(data.parametersString);
                }
            }

            /*console.log("selectorNotFoundParamString", selectorNotFoundParamString);
            console.log("selectorNotUniqueParamString", selectorNotUniqueParamString);*/

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
            }else{
                // Selector is found and is unique
                severity = monaco.MarkerSeverity.Info;
                message = `Selector ${selector} was found and is unique`;
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