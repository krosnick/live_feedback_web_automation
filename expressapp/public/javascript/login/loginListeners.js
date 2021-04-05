$(function(){
    $("body").on("click", "#goButton", function(event){
        $.ajax({
            method: "POST",
            url: "/login",
            data: {
                username: $("#username").val(),
                password: $("#password").val()
            }
        })
    });
});