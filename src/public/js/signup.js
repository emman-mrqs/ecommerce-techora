document.addEventListener("DOMContentLoaded", () => {
    const toggleButtons = document.querySelectorAll(".toggle-password");
    const passwordFields = [
        document.getElementById("password"),
        document.getElementById("confirmPassword")
    ];

    toggleButtons.forEach(button => {
        button.addEventListener("click", () => {
            const isPassword = passwordFields[0].type === "password"; 

            // Switch all password fields together
            passwordFields.forEach(input => {
                input.type = isPassword ? "text" : "password";
            });

            // Update all icons together
            document.querySelectorAll(".toggle-password i").forEach(icon => {
                if (isPassword) {
                    icon.classList.remove("bi-eye-slash-fill");
                    icon.classList.add("bi-eye-fill");
                } else {
                    icon.classList.remove("bi-eye-fill");
                    icon.classList.add("bi-eye-slash-fill");
                }
            });
        });
    });
});
