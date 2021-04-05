$(function(){
    $("body").on("click", "#goButton", function(event){
        $.ajax({
            method: "POST",
            url: "/login",
            data: {
                username: $("#username").val(),
                password: $("#password").val()
            }
        }).done(function(data) {
            // If error, show error on page
            if(data === "Login unsuccessful"){
                $("#errorMessage").text(data);
            }else{
                $("#errorMessage").empty();
            }
        });
    });
});