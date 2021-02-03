$(function(){
    $("body").on("click", "#backButton", function(){
        // Send message to server try to "go back"; it'll update pageView's webContents appropriately
        // Then, we should receive response saying if canGoBack and canGoForward, so we can update
            // buttons appropriately
        $.ajax({
            method: "POST",
            url: "/windowData/goBack",
            data: {
                borderViewID: $("#borderElement").attr("borderViewID")
            }
        }).done(function(data) {
            // Update whether "Back" and "Forward" buttons are enabled/disabled
            const canGoBack = data.canGoBack;
            const canGoForward = data.canGoForward;
            updateBackForwardButtons(canGoBack, canGoForward);
        });
    });

    $("body").on("click", "#forwardButton", function(){
        // Send message to server try to "go forward"; it'll update pageView's webContents appropriately
        // Then, we should receive response saying if canGoBack and canGoForward, so we can update
            // buttons appropriately
        $.ajax({
            method: "POST",
            url: "/windowData/goForward",
            data: {
                borderViewID: $("#borderElement").attr("borderViewID")
            }
        }).done(function(data) {
            // Update whether "Back" and "Forward" buttons are enabled/disabled
            const canGoBack = data.canGoBack;
            const canGoForward = data.canGoForward;
            updateBackForwardButtons(canGoBack, canGoForward);
        });
    });
});

const updateBackForwardButtons = function(canGoBack, canGoForward){
    if(canGoBack){
        // Enable "Back" button
        $("#backButton").prop("disabled",false);
    }else{
        // Disable "Back" button
        $("#backButton").prop("disabled",true);
    }
    if(canGoForward){
        // Enable "Forward" button
        $("#forwardButton").prop("disabled",false);
    }else{
        // Disable "Forward" button
        $("#forwardButton").prop("disabled",true);
    }
};