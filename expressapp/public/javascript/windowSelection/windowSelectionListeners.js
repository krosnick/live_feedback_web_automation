let oldPageWinID;
$(function(){
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
});