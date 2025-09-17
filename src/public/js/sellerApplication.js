const steps = document.querySelectorAll(".form-step");
const stepIndicators = document.querySelectorAll(".step");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");
const form = document.getElementById("sellerForm");

let currentStep = 0;

function showStep(step) {
  steps.forEach((s, i) => {
    if (i === step) {
      s.classList.add("active");
    } else {
      s.classList.remove("active");
    }
    stepIndicators[i].classList.toggle("active", i === step);
  });

  prevBtn.classList.toggle("hidden", step === 0);
  nextBtn.textContent = step === steps.length - 1 ? "Submit" : "Next";
}

function validateStep(step) {
  const inputs = steps[step].querySelectorAll("input, select, textarea");
  for (let input of inputs) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  return true;
}

function markStepCompleted(index) {
  const span = stepIndicators[index].querySelector("span");
  span.textContent = ""; // hide number
  stepIndicators[index].classList.add("completed");
}


nextBtn.addEventListener("click", () => {
  if (currentStep < steps.length - 1) {
    if (!validateStep(currentStep)) return;

    // ✅ Mark current step as completed
    markStepCompleted(currentStep);

    currentStep++;
    showStep(currentStep);
  } else {
    if (!validateStep(currentStep)) return;
    form.submit();
  }
});

prevBtn.addEventListener("click", () => {
  if (currentStep > 0) {
    currentStep--;
    showStep(currentStep);
  }
});

showStep(currentStep);
