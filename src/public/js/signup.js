// Toggle password visibility and change icon
document.querySelectorAll(".toggle-password").forEach(button => {
    button.addEventListener("click", (e) => {
        e.preventDefault();

        const targetId = button.getAttribute("data-target");
        const input = document.getElementById(targetId);
        const icon = button.querySelector("img");

        if (input.type === "password") {
            input.type = "text";
            icon.src = "/techora/img/hide.png"; // change to hide icon
        } else {
            input.type = "password";
            icon.src = "/techora/img/show.png"; // change to show icon
        }
    });
});

// Handle signup form submit
document.getElementById("signupForm").addEventListener("submit", function(e) {
    e.preventDefault();
    alert("Sign Up Successful!");
});