const inputs = document.querySelectorAll(".code-inputs input");
const verifyBtn = document.getElementById("verifyBtn");
const countdown = document.getElementById("countdown");
const finalCode = document.getElementById("finalCode");

let time = 300; // 5 minutes

inputs[0].focus();

// Input handling
inputs.forEach((input, idx) => {
  input.addEventListener("input", (e) => {
    if (!/^\d$/.test(e.target.value)) {
      e.target.value = "";
      return;
    }

    if (idx < inputs.length - 1) inputs[idx + 1].focus();
    checkFilled();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && input.value === "" && idx > 0) {
      inputs[idx - 1].focus();
    }
  });

  // Handle paste of full 6-digit code
  input.addEventListener("paste", (e) => {
    const paste = e.clipboardData.getData("text");
    if (/^\d{6}$/.test(paste)) {
      for (let i = 0; i < 6; i++) {
        inputs[i].value = paste[i];
      }
      checkFilled();
      inputs[5].focus();
    }
    e.preventDefault();
  });
});

// Enable button when all filled
function checkFilled() {
  const filled = [...inputs].every((input) => input.value !== "");
  verifyBtn.disabled = !filled;

  if (filled) {
    finalCode.value = [...inputs].map((input) => input.value).join("");
  }
}

// Countdown timer
function updateCountdown() {
  const minutes = String(Math.floor(time / 60)).padStart(2, "0");
  const seconds = String(time % 60).padStart(2, "0");
  countdown.textContent = `${minutes}:${seconds}`;

  if (time > 0) {
    time--;
  } else {
    verifyBtn.disabled = true;
    document.querySelector('.timer').textContent = 'Code has expired';
  }
}

// Call immediately so it shows 05:00 right away
updateCountdown();
setInterval(updateCountdown, 1000);

const resendLink = document.getElementById("resend");

resendLink.addEventListener("click", async (e) => {
  e.preventDefault();

  try {
    const response = await fetch("/resend-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    if (data.success) {
      alert("A new code was sent to your email.");

      // Reset inputs
      inputs.forEach(input => input.value = "");
      verifyBtn.disabled = true;

      // Reset countdown
      time = 300;
      updateCountdown();
    } else {
      alert(data.message);
    }
  } catch (err) {
    console.error(err);
    alert("Something went wrong. Try again.");
  }
});


