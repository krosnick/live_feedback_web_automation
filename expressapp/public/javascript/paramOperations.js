function sendUpdatedParamsToServer(){
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
}

function paramsOnDidChangeContent(){
    clearTimeout(paramChangeSetTimeout);
    paramChangeSetTimeout = setTimeout((event) => {
        // Check if script is currently running; if so, don't send params to server now - send updated params to server afterwards
        if($("#runCode").is(':visible')){
            //console.log("Can send updated params to server");
            sendUpdatedParamsToServer();
        }else{
            //console.log("CANNOT send updated params to server");
        }
    }, 1000);
}

function paramsOnDidChangeCursorPosition(){
    $(".tooltip").remove();
}