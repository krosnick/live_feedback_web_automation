function paramsOnDidChangeContent(){
    clearTimeout(paramChangeSetTimeout);
    paramChangeSetTimeout = setTimeout((event) => {
        $("#runCode").prop("disabled",true);
        const updatedParamCodeString = paramEditor.getValue();
        console.log("updatedParamCodeString", updatedParamCodeString);

        // Send the updated param code to the server
        $.ajax({
            method: "PUT",
            url: "/params/update",
            data: {
                updatedParamCodeString: updatedParamCodeString
            }
        }).done(function(data) {
            setTimeout(function(){
                $("#runCode").prop("disabled",false);
            }, 5000);
        });
    }, 1000);
}

function paramsOnDidChangeCursorPosition(){
    $(".tooltip").remove();
}