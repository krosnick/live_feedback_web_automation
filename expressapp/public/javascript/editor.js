$(function(){
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
    }, 1000);
});