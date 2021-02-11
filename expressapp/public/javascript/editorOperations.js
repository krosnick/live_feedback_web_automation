const { ipcRenderer } = require('electron');

let decorations = [];
let snapshotLineToDOMSelectorData;
//let activeViewLine;

function editorOnDidChangeContent(){
    clearTimeout(codeChangeSetTimeout);
    codeChangeSetTimeout = setTimeout((event) => {
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
                const scrollLeftAmount = iframeDocument.querySelector(selector).getBoundingClientRect().x - newSnapshotWidth/4;
                const scrollTopAmount = iframeDocument.querySelector(selector).getBoundingClientRect().y - newSnapshotHeight/4;

                iframeDocument.querySelector('html').scrollLeft = scrollLeftAmount;
                iframeDocument.querySelector('html').scrollTop = scrollTopAmount;
            }
        }
    }, 500);
    //});
}

$(function(){
    /*// For some reason not capturing key events, so for now just listening for clicks
    $("body").on("click", "#codeEditor .view-line", function(e){
        console.log("#codeEditor .view-line", e);
        activeViewLine = $(e.target);
    });*/
    $("body").on("click", "#runCode", function(e){
        // Clear all existing puppeteer error markers
        monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', []);

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

                /*//for(let snapshotIndex = 0; snapshotIndex < snapshotsList.length; snapshotIndex++){
                for(let snapshotIndex = 0; snapshotIndex < 1; snapshotIndex++){
                    // Contains might not be good, because multiple line numbers that include "1" in it
                    // Might instead need to loop through to check for exact string.
                    // Or, loop through the line number divs and insert tooltips based on what's in snapshotsList
                    //const lineNumberElement = $("#codeEditor .line-numbers:contains(3)");
                    const lineNumberElement = $("#codeEditor");
                    const offset = lineNumberElement.offset();
                    const left = offset.left;
                    const top = offset.top;
                    const newElement = $(`<div class="tooltip" role="tooltip" style="left: ${left}px; top: ${top}px;"><iframe></iframe></div>`).appendTo("body");
                    newElement.find("iframe").attr("srcdoc", snapshotsList[snapshotIndex]);
                    //const newElement = $(`<div class="tooltip" role="tooltip" style="left: ${left}px; top: ${top}px;"><iframe srcdoc=${snapshotsList[snapshotIndex]} sandbox></iframe></div>`).appendTo("body");
                    //const newElement = $(`<div class="tooltip" role="tooltip" style="left: ${left}px; top: ${top}px;">${snapshotsList[snapshotIndex]}</div>`).appendTo("body");
                    
                    
                    //const newElement = $(`<div class="tooltip" role="tooltip" style="left: ${left}px; top: ${top}px;">${snapshotsList[snapshotIndex]}</div>`).appendTo("#codeEditor");
                    //const newElement = $(`<div class="tooltip" role="tooltip" style="position: absolute; left: 20px">${snapshotsList[snapshotIndex]}</div>`).appendTo(lineNumberElement);
                    //const newElement = $(`<div class="tooltip" role="tooltip" style="position: absolute; left: 20px"><iframe srcdoc="${snapshotsList[snapshotIndex]}"></iframe></div>`).appendTo(lineNumberElement);
                    //const newElement = $(`<div class="tooltip" role="tooltip" style="position: absolute; left: 20px">I'm a tooltip</div>`).appendTo(lineNumberElement);
                    //lineNumberElement.append(`<div id="tooltip" role="tooltip" style="position: absolute;">I'm a tooltip</div>`);

                    const element = lineNumberElement[0];
                    const tooltip = newElement[0];

                    function show() {
                        tooltip.setAttribute('data-show', '');
                    }
                    
                    function hide() {
                        tooltip.removeAttribute('data-show');
                    }
                    
                    const showEvents = ['mouseenter', 'focus'];
                    const hideEvents = ['mouseleave', 'blur'];
                    
                    showEvents.forEach(event => {
                        element.addEventListener(event, show);
                    });
                    
                    hideEvents.forEach(event => {
                        element.addEventListener(event, hide);
                    });

                    // Pass the button, the tooltip, and some options, and Popper will do the
                    // magic positioning for you:
                    Popper.createPopper(tooltip, element, {
                        placement: 'right'
                    });

                }*/
            });
        });
    });

    $("body").on("click", "#puppeteerTerminalClearButton", function(e){
        // Should empty #puppeteerTerminal of all children
        $("#puppeteerTerminal").empty();
    });
});

const createSquigglyErrorMarkers = function(errorData){
    let errorLineNumbers = [];
    if(Object.keys(errorData).length > 0){
        // There are puppeteer errors; render markers appropriately
        const uniqueErrorObjList = createUniqueListOfErrorObjects(errorData);

        const markerObjList = [];
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
            markerObjList.push(markerObj);
        }
        
        monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', markerObjList);

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