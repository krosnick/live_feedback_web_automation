let oldPageWinID;
$(function(){
    $("body").on("change", "#windowSelectMenu", function(e){
        const newPageWinID = $(e.target).val();
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
});