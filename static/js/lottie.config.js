const LOTTIE_URI = document.body.dataset.lottieuri;

let animation = lottie.loadAnimation({
  container: document.getElementById("lottie-animation"),
  renderer: "svg",
  loop: true,
  autoplay: false,
  path: LOTTIE_URI,
});


// Event listener for when the animation is loaded
animation.addEventListener('DOMLoaded', () => {
  console.log("Lottie animation loaded successfully.");
});

// Event listener for errors
animation.addEventListener('error', (error) => {
  console.error("Error loading Lottie animation:", error);
});