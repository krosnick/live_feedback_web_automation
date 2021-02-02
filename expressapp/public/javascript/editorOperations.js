const { ipcRenderer } = require('electron');

let decorations = [];

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
        });
    }, 1000);
}

$(function(){
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
            });
        });
    });

    $("body").on("click", "#puppeteerTerminalClearButton", function(e){
        // Should empty #puppeteerTerminal of all children
        $("#puppeteerTerminal").empty();
    });
});

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