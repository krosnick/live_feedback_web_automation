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
        });
    });

    $("body").on("click", "#nodeTerminalClearButton", function(e){
        // Should empty #nodeTerminal of all children
        $("#nodeTerminal").empty();
    });
});