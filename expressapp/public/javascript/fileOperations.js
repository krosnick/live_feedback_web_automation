let updateFileNameTimeout;
let codeChangeSetTimeout;
let paramChangeSetTimeout;
let monacoEditor;
let paramEditor;
$(function(){
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

        monacoEditor.getModel().onDidChangeContent(editorOnDidChangeContent);
        monacoEditor.onDidChangeCursorPosition(editorOnDidChangeCursorPosition);

        paramEditor = monaco.editor.create(document.getElementById("paramEditor"), {
            value: "",
            language: "json",
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
            url: "/params/getCurrentParamCodeString"
        }).done(function(data) {
            paramEditor.getModel().setValue(data);
        });

        paramEditor.getModel().onDidChangeContent(paramsOnDidChangeContent);
        paramEditor.onDidChangeCursorPosition(paramsOnDidChangeCursorPosition);
    }, 3000);

    $('body').on('input', "#currentFileName", function(e){
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

    $("body").on("click", "#createNewFile", function(e){
        // To make sure that any incoming updates are canceled (because we're changing the current file)
        clearTimeout(updateFileNameTimeout);
        clearTimeout(codeChangeSetTimeout);
        clearTimeout(paramChangeSetTimeout);
        decorations = monacoEditor.deltaDecorations(decorations, []);
        
        let currentFileContents = "";
        if(monacoEditor){
            currentFileContents = monacoEditor.getValue();
        }
        let currentParamCodeString = "";
        if(paramEditor){
            currentParamCodeString = paramEditor.getValue();
        }
        // Should send current file name and file contents to server to make sure they're updated first
        $.ajax({
            method: "POST",
            url: "/files/createNewFile",
            data: {
                currentFileName: $('#currentFileName').val(),
                currentFileContents: currentFileContents,
                currentParamCodeString: currentParamCodeString
            }
        }).done(function(data) {
            const fileSelectionHtml = data.fileSelectionHtml;
            const fileContents = data.fileContents;
            const paramCodeString = data.paramCodeString;

            // Clear the file selection area and replace it with new rendering
            $("#fileSelection").empty();
            $("#fileSelection").append(fileSelectionHtml);

            // Set code and params for this file
            monacoEditor.getModel().setValue(fileContents);
            paramEditor.getModel().setValue(paramCodeString);
        });
    });

    $("body").on("change", "#fileSelectMenu", function(e){
        // Ignore the event if the user has simply selected the dummy "--Choose a different file--" value
            // (though technically this can't really happen at the moment, because the user would
            // have to be changing from a different value, but as soon as the user selects a dropdown item,
            // the new file is shown)
        if($(e.target).val() !== "chooseDifferentFile"){
            // To make sure that any incoming updates are canceled (because we're changing the current file)
            clearTimeout(updateFileNameTimeout);
            clearTimeout(codeChangeSetTimeout);
            clearTimeout(paramChangeSetTimeout);
            decorations = monacoEditor.deltaDecorations(decorations, []);

            let currentFileContents = "";
            if(monacoEditor){
                currentFileContents = monacoEditor.getValue();
            }
            let currentParamCodeString = "";
            if(paramEditor){
                currentParamCodeString = paramEditor.getValue();
            }

            // Figure out the new fileID to change to
            const newFileID = $(e.target).val();
            console.log("newFileID", newFileID);

            // Should send current file name and file contents to server to make sure they're updated first
            // And get back new HTML rendering for file selection area, and code to show in monaco editor
            $.ajax({
                method: "POST",
                url: "/files/showFile/" + newFileID,
                data: {
                    currentFileName: $('#currentFileName').val(),
                    currentFileContents: currentFileContents,
                    currentParamCodeString: currentParamCodeString
                }
            }).done(function(data) {
                const fileSelectionHtml = data.fileSelectionHtml;
                const fileContents = data.fileContents;
                const paramCodeString = data.paramCodeString;

                // Clear the file selection area and replace it with new rendering
                $("#fileSelection").empty();
                $("#fileSelection").append(fileSelectionHtml);

                // Set code and params for this file
                monacoEditor.getModel().setValue(fileContents);
                paramEditor.getModel().setValue(paramCodeString);
            });
        }
    });

    // Delete currently shown file, and then show most recently modified file instead (or, if no other files, a new blank file)
    $("body").on("click", "#deleteCurrentFile", function(e){
        decorations = monacoEditor.deltaDecorations(decorations, []);
        $.ajax({
            method: "DELETE",
            url: "/files/delete"
        }).done(function(data) {
            const fileSelectionHtml = data.fileSelectionHtml;
            const fileContents = data.fileContents;
            const paramCodeString = data.paramCodeString;

            // Clear the file selection area and replace it with new rendering
            $("#fileSelection").empty();
            $("#fileSelection").append(fileSelectionHtml);

            // Set code for this file
            monacoEditor.getModel().setValue(fileContents);
            paramEditor.getModel().setValue(paramCodeString);
        });
    });
});