$(function(){
    let updateFileNameTimeout;

    setTimeout(function(){
        const monacoEditor = monaco.editor.create(document.getElementById("codeEditor"), {
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
        }, 3000);
    });

    $("#createNewFile").on("click", function(e){
        $.ajax({
            method: "POST",
            url: "/files/createNewFile"
        }).done(function(data) {
            // "data" is the rendered html - replace the contents of #fileSelection with  this
            $("#fileSelection").empty();
            $("#fileSelection").append(data);
        });
    });
});