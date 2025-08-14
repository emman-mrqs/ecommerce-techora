document.querySelectorAll(".toggle-password").forEach(button => {
    button.addEventListener("click", (e) => {
        e.preventDefault();

        const targetId = button.getAttribute("data-target");
        const input = document.getElementById(targetId);
        const icon = button.querySelector("img");

        if (input.type === "password") {
            input.type = "text";
            icon.src = "/techora/img/hide.png"; 
        } else {
            input.type = "password";
            icon.src = "/techora/img/show.png"; 
        }
    });
});


const modal = document.getElementById("forgotModal");
const openLink = document.getElementById("forgotLink");
const closeBtn = document.querySelector(".close");
const resetBtn = document.getElementById("resetBtn");

openLink.onclick = function(e) {
  e.preventDefault();
  modal.style.display = "block";
}

closeBtn.onclick = function() {
  modal.style.display = "none";
}

window.onclick = function(e) {
  if (e.target === modal) {
    modal.style.display = "none";
  }
}

resetBtn.onclick = function() {
  const email = document.getElementById("resetEmail").value.trim();
  if (!email) {
    alert("Please enter your email.");
    return;
  }
  alert("Password reset link has been sent to: " + email);
  modal.style.display = "none";
}


document.getElementById("loginForm").addEventListener("submit", function(event) {
    event.preventDefault();
    
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
        alert("Please enter both email and password.");
        return;
    }

    alert("Login submitted successfully!");
});