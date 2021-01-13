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

            // Clear all existing puppeteer error markers
            monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', []);
            console.log("runPuppeteerCode data", data);
            if(data){
                // There are puppeteer errors; render markers appropriately
                const uniqueErrorObjList = createUniqueListOfErrorObjects(data);

                const markerObjList = [];
                // For each error, render markers
                for(const errorObj of uniqueErrorObjList) {
                    const message = errorObj.errorMessage;
                    const lineNumber = errorObj.errorLineNumber;
                    const windowIDs = errorObj.windowIDs;

                    const markerObj = {
                        startLineNumber: lineNumber,
                        startColumn: 0,
                        endLineNumber: lineNumber,
                        endColumn: 1000,
                        message: "The following error occurred for windows " + windowIDs.toString() + ": " + message,
                        severity: monaco.MarkerSeverity.Error
                    };
                    markerObjList.push(markerObj);
                }
                
                monaco.editor.setModelMarkers(monacoEditor.getModel(), 'test', markerObjList);
            }
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
    for (let [key, value] of errorObjEntries) {
        key = parseInt(key);
        let sameErrorAtIndex = undefined;
        for(let i = 0; i < uniqueErrorObjList.length; i++){
            const prevFoundValue = uniqueErrorObjList[i];
            if(_.isEqual(value, prevFoundValue)){
                sameErrorAtIndex = i;
                break;
            }
        }
        if(sameErrorAtIndex === undefined){
            // Add this new error
            uniqueErrorObjList.push(value);
            errorWinIDs.push([key]);
        }else{
            // Add winID to list
            errorWinIDs[sameErrorAtIndex].push(key);
        }
    }
    for(let i = 0; i < uniqueErrorObjList.length; i++){
        const obj = uniqueErrorObjList[i];
        obj['windowIDs'] = errorWinIDs[i];
    }
    console.log("uniqueErrorObjList", uniqueErrorObjList);
    return uniqueErrorObjList;
};