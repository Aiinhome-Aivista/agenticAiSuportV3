//user login

function login() {
  const loginButton = document.getElementById("login-button");
  loginButton.addEventListener("click",(e) => {
    e.preventDefault();
    console.log(e);
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    if (username === "admin" && password === "admin") {
      alert("Login successful!");
      window.location.href = "/chatbot"; // Redirect to the main page
    } else {
      alert("Invalid username or password.");
    }
  });
}
// entry function
window.addEventListener("DOMContentLoaded", () => {
 login();
});

