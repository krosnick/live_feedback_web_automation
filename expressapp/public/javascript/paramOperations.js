function paramsOnDidChangeContent(){
    clearTimeout(paramChangeSetTimeout);
    paramChangeSetTimeout = setTimeout((event) => {
        const updatedParamCodeString = paramEditor.getValue();
        console.log("updatedParamCodeString", updatedParamCodeString);

        // Send the updated param code to the server
        $.ajax({
            method: "PUT",
            url: "/params/update",
            data: {
                updatedParamCodeString: updatedParamCodeString
            }
        });
    }, 1000);
}

function paramsOnDidChangeCursorPosition(){
    $(".tooltip").remove();
}