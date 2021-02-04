const { ipcRenderer } = require('electron');
$(function(){
    //$("#websiteURLInput").focus();
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
            const url = data.url;
            updateBackForwardButtonsAndUrl(canGoBack, canGoForward, url);
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
            const url = data.url;
            updateBackForwardButtonsAndUrl(canGoBack, canGoForward, url);
        });
    });

    /*$("body").on("focus", function(event){
        console.log("body got focus");
        $("#websiteURLInput").focus();
    });

    $("body").on("click", "#websiteURLInput", function(event){
        console.log("#websiteURLInput clicked");
        $("#borderElement").trigger("focus");
        //$("#forwardButton").trigger("click");
        //$("#forwardButton").trigger("focus");
        //$("#websiteURLInput").trigger("focus");
    });*/
    $("body").on("keypress", "#websiteURLInput", function(event){
        if(event.which == 13) {
            const urlValue = $("#websiteURLInput").val();
            
            // Tell server to call loadUrl to update it for pageView
                // (but shouldn't be anything else the server does, i.e., no updates to db)
            $.ajax({
                method: "POST",
                url: "/windowData/updateUrl",
                data: {
                    url: urlValue,
                    borderViewID: $("#borderElement").attr("borderViewID")
                }
            }).done(function(data) {
                // Update whether "Back" and "Forward" buttons are enabled/disabled
                const canGoBack = data.canGoBack;
                const canGoForward = data.canGoForward;
                const url = data.url;
                updateBackForwardButtonsAndUrl(canGoBack, canGoForward, url);
            });
        }
    });
});

const updateBackForwardButtonsAndUrl = function(canGoBack, canGoForward, url){
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
    $("#websiteURLInput").val(url);
};

ipcRenderer.on('errorMessage', function(event, message){
    console.log('errorMessage occurred');
    document.querySelector('#borderElement').classList.add('errorBorder');
    document.querySelector('#errorMessage').textContent = message;
});
ipcRenderer.on('clear', function(event){
    console.log('clear occurred');
    document.querySelector('#borderElement').classList.remove('errorBorder');
    document.querySelector('#errorMessage').textContent = "";
});
ipcRenderer.on('updateParameters', function(event, message){
    console.log('updateParameters occurred');
    document.querySelector('#parameters').textContent = message;
});
ipcRenderer.on('updateBackForwardButtonsAndUrl', function(event, canGoBack, canGoForward, url){
    updateBackForwardButtonsAndUrl(canGoBack, canGoForward, url);
});