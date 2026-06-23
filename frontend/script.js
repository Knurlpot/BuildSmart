const stepsTrack = document.querySelector("#stepsTrack");
const nextButton = document.querySelector("#nextButton");
const backButton = document.querySelector("#backButton");
const form = document.querySelector("#registrationForm");
const logoFaces = document.querySelectorAll(".face");
const totalSteps = 3;
let currentStep = 0;

const voxelCounts = [35, 35, 28];

logoFaces.forEach((face, index) => {
  for (let i = 0; i < voxelCounts[index]; i += 1) {
    face.appendChild(document.createElement("span"));
  }
});

function updateStep() {
  stepsTrack.style.transform = `translateX(-${currentStep * 33.333333}%)`;
  backButton.hidden = currentStep === 0;
  nextButton.querySelector("span").textContent = currentStep === totalSteps - 1 ? "Log In" : "Continue";
}

nextButton.addEventListener("click", () => {
  if (currentStep < totalSteps - 1) {
    currentStep += 1;
    updateStep();
    return;
  }

  nextButton.querySelector("span").textContent = "Submitted";
  nextButton.disabled = true;
  nextButton.style.opacity = "0.82";
  form.classList.add("is-complete");
});

backButton.addEventListener("click", () => {
  if (currentStep > 0) {
    currentStep -= 1;
    updateStep();
  }
});

document.querySelectorAll("[data-multi-select] .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chip.classList.toggle("is-selected");
    chip.setAttribute("aria-pressed", chip.classList.contains("is-selected").toString());
  });
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.setAttribute("aria-pressed", "false");
});

updateStep();
