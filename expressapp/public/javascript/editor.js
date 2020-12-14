$(function(){
    let updateFileNameTimeout;
    let codeChangeSetTimeout;
    let monacoEditor;

    setTimeout(function(){
        monacoEditor = monaco.editor.create(document.getElementById("codeEditor"), {
            value: "",
            language: "javascript",
            wordWrap: "on",
            wrappingIndent: "deepIndent",
            scrollbar: {
                // Render vertical arrows. Defaults to false.
                verticalHasArrows: true,
                
                // Render vertical scrollbar.
                // Accepted values: 'auto', 'visible', 'hidden'.
                // Defaults to 'auto'
                vertical: 'visible',
                
                verticalScrollbarSize: 17,
                arrowSize: 30
            }
        });
        // Send request to server for file's code
        $.ajax({
            method: "POST",
            url: "/code/getCurrentFileCode"
        }).done(function(data) {
            monacoEditor.getModel().setValue(data);
        });

        monacoEditor.getModel().onDidChangeContent((event) => {
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
        });
    }, 3000);

    $('#currentFileName').on('input',function(e){
        // Send update to DB if user hasn't edited in past few seconds
        clearTimeout(updateFileNameTimeout);
        updateFileNameTimeout = setTimeout(function(){
            // Send update to DB
            $.ajax({
                method: "POST",
                url: "/files/updateName",
                data: {
                    updatedFileName: $('#currentFileName').val()
                }
            });
        }, 1000);
    });

    $("#createNewFile").on("click", function(e){
        // To make sure that any incoming updates are canceled (because we're changing the current file)
        clearTimeout(updateFileNameTimeout);
        clearTimeout(codeChangeSetTimeout);
        
        let currentFileContents = "";
        if(monacoEditor){
            currentFileContents = monacoEditor.getValue();
        }
        // Should send current file name and file contents to server to make sure they're updated first
        $.ajax({
            method: "POST",
            url: "/files/createNewFile",
            data: {
                currentFileName: $('#currentFileName').val(),
                currentFileContents: currentFileContents
            }
        }).done(function(data) {
            // "data" is the rendered html - replace the contents of #fileSelection with  this
            $("#fileSelection").empty();
            $("#fileSelection").append(data);

            // Also empty the monaco editor
            monacoEditor.getModel().setValue("");
        });
    });
});