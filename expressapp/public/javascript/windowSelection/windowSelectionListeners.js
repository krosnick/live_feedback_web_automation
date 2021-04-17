const { ipcRenderer } = require('electron');
let oldPageWinID;
let editorBrowserViewID;
let snapshotsBrowserViewID;
$(function(){
    editorBrowserViewID = $("#editorBrowserViewID").attr("editorBrowserViewID");
    snapshotsBrowserViewID = $("#snapshotsBrowserViewID").attr("snapshotsBrowserViewID");
    $("body").on("change", "#windowSelectMenu", function(e){
        const newPageWinID = $(e.target).val();
        
        // Update disabled status of left/right buttons appropriately
        const currentOptionNode = $(`option[value="${newPageWinID}"`);

        // If no prev sibling exists, set disabled to true, otherwise set to false
        const prevOptionNode = currentOptionNode.prev();
        if(prevOptionNode.length > 0){
            $("#left").prop("disabled",false);
        }else{
            $("#left").prop("disabled",true);
        }
        
        // If no next sibling exists, set disabled to true, other set to false
        const nextOptionNode = currentOptionNode.next();
        if(nextOptionNode.length > 0){
            $("#right").prop("disabled",false);
        }else{
            $("#right").prop("disabled",true);
        }

        // Send oldPageWinID and newPageWinID to server
        $.ajax({
            method: "POST",
            url: "/hideShowWindows",
            data: {
                oldPageWinID: oldPageWinID,
                newPageWinID: newPageWinID
            }
        }).done(function(data) {
            oldPageWinID = newPageWinID;
        });
    });

    $("body").on("click", "#left", function(e){
        // Find currently selected <option>
        const currentValue = $("#windowSelectMenu").val();
        const currentOptionNode = $(`option[value="${currentValue}"`);
        const prevOptionNode = currentOptionNode.prev();
        console.log("prevOptionNode", prevOptionNode);
        
        // If it has a prev sibling (https://api.jquery.com/prev/), 
            // change the value of the <select> to that sibling's pageWinID
            // (https://stackoverflow.com/questions/78932/how-do-i-programmatically-set-the-value-of-a-select-box-element-using-javascript)
        if(prevOptionNode.length > 0){
            const newValue = prevOptionNode.attr("value");
            $("#windowSelectMenu").val(newValue);
            $("#windowSelectMenu").trigger("change");
        }
        // And then if it now has no prev sibling, disable #left
        if(prevOptionNode.prev().length === 0){
            $("#left").prop("disabled",true);
        }
        // And regardless, enable #right
        $("#right").prop("disabled",false);
    });

    $("body").on("click", "#right", function(e){
        // Find currently selected <option>
        const currentValue = $("#windowSelectMenu").val();
        const currentOptionNode = $(`option[value="${currentValue}"`);
        const nextOptionNode = currentOptionNode.next();
        console.log("nextOptionNode", nextOptionNode);
        
        // If it has a next sibling (https://api.jquery.com/next/), 
            // change the value of the <select> to that sibling's pageWinID
            // (https://stackoverflow.com/questions/78932/how-do-i-programmatically-set-the-value-of-a-select-box-element-using-javascript)
        if(nextOptionNode.length > 0){
            const newValue = nextOptionNode.attr("value");
            $("#windowSelectMenu").val(newValue);
            $("#windowSelectMenu").trigger("change");
        }
        // And then if it now has no next sibling, disable #right
        if(nextOptionNode.next().length === 0){
            $("#right").prop("disabled",true);
        }
        // And regardless, enable #left
        $("#left").prop("disabled",false);
    });

    $("body").on("click", "#hideSnapshots", function(e){
        // Tell server to hide snapshots view and show last shown page/border views
        $.ajax({
            method: "POST",
            url: "/showPageView"
        });
        // Update status in editor view
        ipcRenderer.sendTo(parseInt(editorBrowserViewID), "updateHideShowSnapshotsViewStatus", "hide");

        // Hide this button and show #showSnapshots button
        $("#hideSnapshots").hide();
        $("#showSnapshots").show();
    });

    $("body").on("click", "#showSnapshots", function(e){
        // Tell server to hide page/border views and show snapshots view
        $.ajax({
            method: "POST",
            url: "/showSnapshotView"
        });
        // Update status in editor view
        ipcRenderer.sendTo(parseInt(editorBrowserViewID), "updateHideShowSnapshotsViewStatus", "show");
        // Unlock line number in snapshots view
        ipcRenderer.sendTo(parseInt(snapshotsBrowserViewID), "unlockLineNumber");

        // Hide this button and show #hideSnapshots button
        $("#hideSnapshots").show();
        $("#showSnapshots").hide();
    });
});

ipcRenderer.on('addWindow', function(event, pageWinID, paramString, isFirstWindow){
    console.log('addWindow occurred');
    let selectMenu = document.querySelector('#windowSelectMenu');
    let optionNode = document.createElement("option");
    optionNode.setAttribute("value", pageWinID);
    // If the window for this paramset was the first one created, then it's being shown and so this <option> should be selected
    if(isFirstWindow){
        optionNode.setAttribute("selected", "");
    }
    optionNode.textContent = paramString;
    selectMenu.append(optionNode);

    const currentValue = $("#windowSelectMenu").val();
    const currentOptionNode = $('option[value="' + currentValue + '"');
    // Check and see if after this addition, if the currently selected <option> has prev and next siblings (set left/right buttons disabled as appropriate)
    if(currentOptionNode.prev().length === 0){
        $("#left").prop("disabled",true);
    }else{
        $("#left").prop("disabled",false);
    }
    if(currentOptionNode.next().length === 0){
        $("#right").prop("disabled",true);
    }else{
        $("#right").prop("disabled",false);
    }
    
    // Set this variable to keep track of value
    oldPageWinID = pageWinID;
});
ipcRenderer.on('updateParameters', function(event, pageWinID, paramString){
    console.log('updateParameters occurred');
    const selector = 'option[value="' + pageWinID + '"]';
    document.querySelector(selector).textContent = paramString;
});
ipcRenderer.on('clear', function(event){
    document.querySelector('#windowSelectMenu').innerHTML = "";
});
ipcRenderer.on('hideUISnapshots', function(event){
    $("#hideSnapshots").trigger("click");
});
ipcRenderer.on('showUISnapshots', function(event){
    $("#showSnapshots").trigger("click");
});