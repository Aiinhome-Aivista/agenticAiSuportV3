import { API_BASE_URL, endpointConfig } from "../api.config.js";

// Function to handle AI chat interactions
let loadedVoices = [];
window.speechSynthesis.getVoices().forEach((v) => {
  console.log(`${v.name} [${v.lang}]`);
});

window.speechSynthesis.onvoiceschanged = () => {
  loadedVoices = window.speechSynthesis.getVoices();
  loadedVoices.map((v) => v.lang);
  console.log("Support voices are loaded ...");
  // console.log("Support voices are loaded:", loadedVoices);
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

const aiAudioVoice = document.getElementById("ai-chat-voice");
const chatMic = document.getElementById("chat-mic");
const chatContainer = document.querySelector(".hero-chat-area");
const chatMicIcon = document.getElementById("mic-icon");

// setup for icons & audio
const USER_ICON = document.body.dataset.usericon;
const AI_BOT_ICON = document.body.dataset.aiicon;
const api_ai_speech = document.body.dataset.aispeech;
const ai_greet_error_speech = document.body.dataset.greeterrorspeech; 
const ai_beng_speech = document.body.dataset.bengspeech;
const ai_eng_speech = document.body.dataset.engspeech;
const ai_hindi_speech = document.body.dataset.hindispeech;
const ai_welcome_speech = document.body.dataset.welcomespeech;
const micOnURI = document.body.dataset.miconuri;
const micOffURI = document.body.dataset.micoffuri;

//  console.log("line 36 ",document.body.dataset)
//  console.log("line 37 ",document.body.dataset.usericon)
//  console.log("line 38 ", ai_beng_speech);

// Controller for aborting API requests
let apiAbortController = null;

// function to handle session storage for chat history 
let chatHistory = JSON.parse(sessionStorage.getItem("chatQnA")) || [];
function updateSessionChatHistory(role, message, time) {
  chatHistory.push({ role, message, time });
  sessionStorage.setItem("chatQnA", JSON.stringify(chatHistory));
  // console.log("Stored Chat:",JSON.stringify(sessionStorage.getItem("chatQnA"))); 
}

// Function to handle AI chat interactions
const handleOnAiChat = () => {
  // Check if SpeechRecognition is supported
  if (!SpeechRecognition) {
    alert("Your browser does not support Speech Recognition API");
  }

  let recognition = new SpeechRecognition();
  recognition.interimResults = false;
  recognition.continuous = false;

  const languageMap = {
    english: { recognition: "en-US", synthesis: "en-US", language: "en" },
    bengali: { recognition: "bn-BD", synthesis: "bn-BD", language: "bn" },
    hindi: { recognition: "hi-IN", synthesis: "hi-IN", language: "hi" },
  };

  let isListening = false;
  let selectedLanguage = null;
  let firstInteraction = true;
  let awaitingNameEmail = false;
  let apiLanguage;

  // inactivity handling
  let inactivityTimer = null;
  let promptCount = 0;
  const MAX_PROMPT_COUNT = 2;
  let lastRegularAPIResponse = null;
  let lastRegularAudioPlaying = null;
  const inactiveMsgList = [
    "do you have any further queries you'd like to ask?",
    "do you have any further queries you'd like to ask?",
    "since you're not responding, we're closing this session and will send you an email summarizing our conversation.",
  ];


  // ================ SPEECH RECOGNITION HELPER FUNCTION ==================
  // function to start listening for speech input
  function startListening() {
    // console.log("startListening", isListening);
    if (isListening) {
      return;
    }
    // prevent multiple starts
    try {
      recognition.start();
    } catch (e) {
      console.error("Error starting recognition:", e);
    }
  }

  // function to stop listening for speech input
  function stopListening() {
    console.log("stopListening", isListening);
    if (!isListening) {
      return;
    }
    recognition.stop();
  }

  // Function to reset recognition settings
  function resetRecognition() {
    recognition.abort();
    recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.continuous = false;

    if (selectedLanguage) {
      recognition.lang = languageMap[selectedLanguage].recognition;
      apiLanguage = languageMap[selectedLanguage].language;
    }

    // Uncomment if you want to set default language and speak on that languages from the ui-end
    // recognition.lang = selectedLanguage ? languageMap[selectedLanguage].recognition : "en-US";

    attachRecognitionEvents();
  }
  let isFirstAudioPlaying = false;
  // ================ AI AUDIO PLAYBACK HANDLING ==================
  // Function to track AI speech playback and handle animations
  function trackAiSpeechPlayback(audioPath) {
    if (!aiAudioVoice) {
      console.error("AI audio element not found.");
      return;
    }

    const updatedAudioPath = `${audioPath}?t=${Date.now()}`;

    // Stop and reset previous audio
    aiAudioVoice.pause();
    aiAudioVoice.src = "";
    aiAudioVoice.load();

    aiAudioVoice.src = updatedAudioPath;
    aiAudioVoice.loop = false;
    aiAudioVoice.muted = false;
    aiAudioVoice.volume = 1.0;

    aiAudioVoice.onplay = () => {
      // console.log("Audio started playing:", updatedAudioPath);
      if (animation && typeof animation.play === "function") {
        animation.play();
        // console.log("Animation started.");
        chatMic.classList.remove("bg-green-300");
        chatMicIcon.src = micOffURI;
      }
    };

    aiAudioVoice.onended = () => {
      // console.log("Audio ended.");
      if (animation && typeof animation.stop === "function") {
        animation.stop();
        // console.log("Animation stopped after playback.");
      }
      chatMic.classList.add("bg-green-300");
      chatMicIcon.src = micOnURI;
      lastRegularAudioPlaying = true;
      isFirstAudioPlaying = true;
      startListening();
    };

    aiAudioVoice.onerror = (e) => {
      console.error("Audio error:", e);
      if (animation && typeof animation.stop === "function") {
        animation.stop();
      }
      startListening();
    };

    aiAudioVoice.oncanplaythrough = () => {
      aiAudioVoice.play().catch((err) => {
        console.error("Playback failed:", err);
        chatMic.classList.add("bg-green-300");
        chatMicIcon.src = micOnURI;
        // startListening();
      });
    };

    aiAudioVoice.load();
  }

  // Function to speak static audio text with browser compatibility issue resolved
  function speakStaticAudioText(audioPath) {
    // console.log("Speaking static audio text:", audioPath);

    if (!aiAudioVoice) {
      // console.error("Audio element not found");
      startListening();
      return;
    }

    // Reset and prepare the audio element
    aiAudioVoice.pause();
    aiAudioVoice.removeAttribute("src"); // Safe reset
    aiAudioVoice.load();

    // Set the new source
    aiAudioVoice.src = audioPath;
    aiAudioVoice.loop = false;

    // When playback ends
    aiAudioVoice.onended = () => {
      // console.log("Audio ended.");
      if (animation && typeof animation?.pause === "function") {
        animation.pause();
      }
      startListening();
    };

    // Try to play once it's ready
    aiAudioVoice.oncanplaythrough = () => {
      aiAudioVoice
        .play()
        .then(() => {
          console.log("static() => Audio playback started:", audioPath);
          if (animation && typeof animation?.play === "function") {
            animation.play();
          }
        })
        .catch((error) => {
          console.error("Playback error oncanplaythrough:", error);
          resetRecognition();
          startListening();
        });
    };

    // Fallback in case autoplay is blocked
    setTimeout(() => {
      aiAudioVoice.play().catch((err) => {
        console.warn("Autoplay blocked. Waiting for user interaction...", err);
        chatMic.addEventListener(
          "click",
          () => {
            aiAudioVoice.play().catch(console.error);
          },
          { once: true }
        );
      });
    }, 500);

    aiAudioVoice.load(); // Finally, trigger loading
  }

  // ================ INACTIVITY HANDLING ON 15ms ==================
  // Function to reset inactivity logic
  function resetInactivityMonitor() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    promptCount = 0;
  }

  // Start inactivity check
  function startInactivityCheck() {
    inactivityTimer = setTimeout(async function promptUser() {
      const now = new Date();
      const time = now.toTimeString().split(" ")[0];

      console.log("custom msg : ", lastRegularAPIResponse === true && promptCount < MAX_PROMPT_COUNT)

      let getSessionName = JSON.parse(sessionStorage.getItem("userName"));
      let getName = !getSessionName ? getSessionName?.name : "User";

      if ((lastRegularAudioPlaying === true && lastRegularAPIResponse === true) && promptCount < MAX_PROMPT_COUNT) {
        console.log(inactiveMsgList[promptCount]);
        appendAIMessage(`Hi ${getName}, ` + inactiveMsgList[promptCount], time);
        promptCount++;
        inactivityTimer = setTimeout(promptUser, 15000); // Set next prompt
      } else {
        console.log("Inactivity check ended, no more prompts.");
        setTimeout(() => {
          appendAIMessage(
            `Hi ${getName}, ` + inactiveMsgList[inactiveMsgList.length - 1],
            time
          );
          console.log("calling .....")
        }, 15000);
        clearTimeout(inactivityTimer);
      }
    }, 15000); // 15 seconds of inactivity
  }



  // ================ LANGUAGE SELECTION & API HELPER HANDLING ==================
  // handle for confirmation name & email audio ===> first API call
  async function handleConfirmationAudio(transcript) {
   try {
       console.log("Handling confirmation audio with transcript:", transcript);
       const now2 = new Date();
       const timeString2 = now2.toTimeString().split(" ")[0];
       const { summary: greeting, companies, email, session_id, first_name } = await greetingAIResponse(transcript);
       if (greeting === null || greeting === undefined) {
         appendAIMessage("Sorry your details do not exist in my system. Please share correct credentials.", timeString2);
          speakStaticAudioText(ai_greet_error_speech);
         awaitingNameEmail = true;    
          return true;
        }
      // sessionStorage.setItem("sid", session_id);
     if (greeting !== null && greeting.includes(" Salesforce or o9?")) {
        sessionStorage.setItem("userEmail", JSON.stringify({ email }));
        sessionStorage.setItem("userCompanies", JSON.stringify({ companies }));
        sessionStorage.setItem("first_name", first_name);
        localStorage.setItem("greeting", greeting);
        appendAIMessage(greeting, timeString2);
        trackAiSpeechPlayback(api_ai_speech);
        if(isFirstAudioPlaying){
          setTimeout(async() => {
            const localGreeting = localStorage.getItem("greeting");
            if (localGreeting && localGreeting.toLowerCase().includes("hi")) {
              console.log("Session greeting found:", localGreeting);
              await regularApiCall(localGreeting);
              localStorage.removeItem("greeting");
            }
          }, 200);
          
        }
      }else{
       sessionStorage.setItem("userEmail", JSON.stringify({ email }));
       sessionStorage.setItem("userCompanies", JSON.stringify({ companies }));
       sessionStorage.setItem("first_name", first_name);
       localStorage.setItem("greeting", greeting);
       appendAIMessage(greeting, timeString2);
       trackAiSpeechPlayback(api_ai_speech);
       if (isFirstAudioPlaying) {
         setTimeout(async () => {
           const localGreeting = localStorage.getItem("greeting");
           if (localGreeting && localGreeting.toLowerCase().includes("hi")) {
             console.log("Session greeting found:", localGreeting);
             await regularApiCall(localGreeting);
             localStorage.removeItem("greeting");
           }
         }, 200);
      }
    }
    
      
       return false;
    } catch (error) {
        customToastUI(error.message, "error");
        return;
   }
  }

  // after confermation of name & email, this function will be called ===> regular API call
  async function regularApiCall(transcript) {
    try {
      const { response: aiResponse, matched: status, } = await generateAIResponse(transcript);
      const now2 = new Date();
      const timeString2 = now2.toTimeString().split(" ")[0];
      console.log("AI response:", aiResponse, "Status:", status);
      
      if (aiResponse === null || aiResponse === undefined) {
        throw new Error("Invalid AI response");
      }
      // append & Speak the AI response
      appendAIMessage(aiResponse, timeString2);
      trackAiSpeechPlayback(api_ai_speech);
    } catch (err) {
        // console.error("Error generating AI response:", err);
        lastRegularAPIResponse = null;
        customToastUI("Error generating AI response", "error");
        }   
     }
    
  // handle language selection based on user input
  function handleLanguageSelection(transcript, timeString) {
    let audioPath;

    if (
      transcript.includes("english") ||
      transcript.includes("ইংরেজি") ||
      transcript.includes("अंग्रेज़ी")
    ) {
      selectedLanguage = "english";
      audioPath = ai_eng_speech;
    } else if (
      transcript.includes("bengali") ||
      transcript.includes("বাংলা") ||
      transcript.includes("bangla")
    ) {
      selectedLanguage = "bengali";
      audioPath = ai_beng_speech;
    } else if (
      transcript.includes("hindi") ||
      transcript.includes("हिन्दी") ||
      transcript.includes("हिंदी")
    ) {
      selectedLanguage = "hindi";
      audioPath = ai_hindi_speech;
    } else {
      const retryMsg =
        "Sorry, I didn't catch that. Please say English, বাংলা, or हिंदी.";
      appendAIMessage(retryMsg, timeString);
      startListening();
      return false; // language not matched
    }

    recognition.lang = languageMap[selectedLanguage].recognition;
    apiLanguage = languageMap[selectedLanguage].language;

    const greetings = {
      english: "Great! Let's continue in English.",
      bengali: "দারুণ! চলুন, আমরা বাংলায় কথা বলি।",
      hindi: "बहुत बढ़िया! आइए हिंदी में जारी रखें।",
    };

    const thankYouMessages = {
      english:
        "Thank you for your response. Please share your name & email to continue.",
      bengali:
        "আপনার পছন্দের জন্য ধন্যবাদ। বলুন, আমি কীভাবে আপনাকে সাহায্য করতে পারি!",
      hindi: "आपकी पसंद के लिए धन्यवाद। आप क्या जानना चाहेंगे?",
    };

    const fullMessage =
      greetings[selectedLanguage] + " " + thankYouMessages[selectedLanguage];
    appendAIMessage(fullMessage, timeString);

    if (audioPath) {
      speakStaticAudioText(audioPath);
    } else {
      console.error(
        "Audio path not found for selected language:",
        selectedLanguage
      );
    }

    firstInteraction = false;
    awaitingNameEmail = true;

    return true;
  }

  // ================ SPEECH RECOGNITION EVENTS HANDLING ==================
  // recognition voice to text result
  function attachRecognitionEvents() {
    // recognition start listening user voice
    recognition.addEventListener("start", () => {
      isListening = true;
      chatMic.classList.add("bg-green-300");
      chatMicIcon.src = micOnURI;
    });

    // recognition user voice to text end
    recognition.addEventListener("end", () => {
      isListening = false;
      chatMic.classList.remove("bg-green-300");
      chatMicIcon.src = micOffURI;
    });

    // recognition error handling ===> network error & no-speech (problem on listening user voice)
    recognition.addEventListener("error", (event) => {
      console.log(event.error === "network");
      // console.error("Speech recognition error: 177", event.error);
      isListening = false;
      chatMic.classList.remove("bg-green-300");
      chatMicIcon.src = micOffURI;

      if (event.error === "network") {
        alert("Network error occurred during speech recognition. Please check your connection and try again.");
      }
      // else if (event.error === "no-speech") {
      //   // User did not speak — restart listening after 500ms
      //   setTimeout(() => {
      //     if (!isListening) {
      //       try {
      //         recognition.start();
      //       } catch (e) {
      //         console.error("Error restarting recognition after no-speech:", e);
      //       }
      //     }
      //   }, 500);
      // }
    });

    // recognition voice to text result ===> handle user voice input to text
    recognition.addEventListener("result", async (event) => {
      // get human speech (voice) to text result
      const transcript = [...event.results]
        .map((r) => r[0].transcript)
        .join("")
        .trim()
        .toLowerCase();

      // set the current time for the message
      const now = new Date();
      const timeString = now.toTimeString().split(" ")[0];

      // add user message to chat container
      appendUserMessage(transcript, timeString);

      // handle first interaction and language selection
      if (firstInteraction) {
        const languageDetected = handleLanguageSelection(transcript, timeString);
        if (!languageDetected) return;
        return;
      } 
      if (awaitingNameEmail) {
        // === NAME & EMAIL PHASE ===
        if ((transcript.includes("my name is") || transcript.includes("i am ") || transcript.includes("myself") || transcript.includes("name is")) && (transcript.includes("email") || transcript.includes("mail"))) {
           let respFlag = await handleConfirmationAudio(transcript); 
           if(!respFlag) {
            awaitingNameEmail = false; // reset awaiting state
          }
          return;
        } else {
          appendAIMessage("Please share your name & email to continue.", timeString);
          startListening();
          return;
        }
      } 
       else{
           // === REGULAR CHAT PHASE ===
           await regularApiCall(transcript); // Normal chat
       }    
    });

  }

  // ================ UI HELPER FUNCTIONS ==================
  // function for scrolling the chat container to the bottom
  function scrollToBottom() {
    // console.log("Scrolled to bottom of chat container. before: ", chatContainer.scrollHeight);
    chatContainer.scrollTop = chatContainer.scrollHeight * 100;
    // console.log("Scrolled to bottom of chat container. after: ", chatContainer.scrollHeight);
  }

  // ===================  UI FUNCTIONS ==================
  // Function to append AI message to chat container UI
  // This function is called when the AI responds to the user
  function appendAIMessage(message, time) {
    console.log("AI Message:", message);
    const msg = document.createElement("div");

    msg.className = "ai-chat-main";
    msg.innerHTML = `
            <div class="ai-chat flex justify-start items-center p-2">
            <div class="md:w-3/4 flex p-3 items-center gap-4 border border-white/20 rounded-md mx-1 bg-gray-600/10 backdrop-blur-[.25rem] shadow-md border-b border-white/20 rounded-md border border-gray-500">
             <div class="ai-chat-icon md:w-8 md:h-8 p-[1px] bg-gray-100 rounded-full self-start overflow-hidden">
                <img src="${AI_BOT_ICON}" alt="ai-icon" class="object-cover lg:object-fit rounded-full w-8 h-auto md:w-full md:h-full" width="24" height="24" />
                </div>
              <div class="ai-chat-text w-full">
                <p class="break-words text-[.75rem] md:text-sm text-wrap text-justify text-gray-200">${message}</p>
                <div class="ai-chat-options flex items-center gap-2">
                   <div class="w-32 lg:w-64">
                    <span class="text-[.75rem] text-gray-200 block italic">${time}</span>
                   </div>
                </div>
              </div>
             </div>
            </div
          `;
    chatContainer.appendChild(msg);
    scrollToBottom();
    updateSessionChatHistory("ai", message, time);
  }

  // Function to append user message to chat container UI
  function appendUserMessage(message, time) {
    const msg = document.createElement("div");
    msg.className = "user-chat-main flex justify-end items-center p-2";
    msg.innerHTML = `
            <div class="md:w-3/4 flex p-3 items-center gap-4 border border-white/20 rounded-md mx-1 mt-2 bg-gray-600/10 backdrop-blur-[.25rem] shadow-md border-b border-white/20 rounded-md border border-gray-500">
              <div class="user-chat-icon md:w-8 md:h-8 p-1 bg-gray-100 rounded-full self-start text-center">
                <img src="${USER_ICON}" alt="user-icon" class="object-cover rounded-full" width="24" height="24"/>
              </div>
              <div class="user-chat-text w-full">
                <p class="text-[.75rem] break-words text-wrap md:text-sm text-justify text-gray-200">${message}</p>
                <span class="text-[.75rem] text-gray-200 mt-2 block italic">${time}</span>
              </div>
            </div>
          `;
    chatContainer.appendChild(msg);
    scrollToBottom();
    updateSessionChatHistory("user", message, time); // Update session storage with user message
  }


  function customToastUI(message, type = "success", duration = 15000) {
    let bgColor;
    switch (type) {
      case "success":
        bgColor = "bg-green-500/40 text-green-100";
        break;
      case "error":
        bgColor = "bg-red-500/40 text-red-100";
        break;
      case "info":
        bgColor = "bg-blue-500/40 text-blue-100";
        break;
      case "warning":
        bgColor = "bg-yellow-500/40 text-yellow-100";
      default:
        bgColor = "bg-slate-800/40 text-slate-100";
    }

    let toastHTML = `
    <div class="toast fixed top-4 right-4 transition-transform duration-300 ease-in-out transform translate-y-0 z-50">
      <div class="toast-msg text-gray-100 ${bgColor} py-3 px-2 rounded-sm shadow-lg flex items-center justify-center">
       ${message}
      </div>
    </div>
    `;
    // Insert safely without disrupting DOM
    document.body.insertAdjacentHTML("beforeend", toastHTML);

    // Auto-remove after 5 seconds
    const toastNode = document.querySelector(".toast:last-of-type");
    if (toastNode) {
      setTimeout(() => {
        toastNode.remove();
      }, duration);
    }
  }


  // ==================  API CALLS ==================
  // Function to handle greeting AI response API call
  async function greetingAIResponse(userText) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpointConfig.greet}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Connection: "keep-alive",
        },
        body: JSON.stringify({
          text: userText,
        }),
      });

      const data = await response.json();
      console.log("Greeting AI response data:", data);
      lastRegularAPIResponse = null;
      return data;
    } catch (e) {
      console.error("Error in greetingAIResponse:", e.message);
      return {
        summary: "Error in greeting ai response",
        matched: false,
        audio_path: null,
        email: null,
        companies: null,
        error: true,
      };
    }
  }

  // Function to ask AI via API
  async function askAiByApi(userText) {
    try {
      // Abort previous request if any
      if (apiAbortController) {
        apiAbortController.abort();
        console.log("Previous API call aborted.");
      }

      // check session storage for email and companies
      const getSessionEmail = JSON.parse(sessionStorage.getItem("userEmail"))?.email;
      const getSessionCompanies = JSON.parse(sessionStorage.getItem("userCompanies"))?.companies;
      const getSessionId = sessionStorage.getItem("sid");
      const firstName = JSON.parse(sessionStorage.getItem("first_name"));

      // if (!getSessionEmail || !getSessionCompanies || !getSessionId) {
      //   // console.warn("Session data for email or companies is missing.");
      //   // customToastUI("Missing data for email or companies is missing.", "error");
      //   appendAIMessage("Session data for email or companies is missing.", new Date().toTimeString().split(" ")[0]);
      //   startListening();
      //   return {
      //     summary: "Session data for email or companies is missing.",
      //     matched: false,
      //     audio_file: null,
      //   };
      // }


      // Create new controller for this request
      apiAbortController = new AbortController();

      // Replace API_BASE_URL and endpointConfig.ask with your API details
      const response = await fetch(`${API_BASE_URL}${endpointConfig.ask}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Connection: "keep-alive",
        },
        body: JSON.stringify({
          id: getSessionId,
          first_name: firstName,
          question: userText,
          companies: getSessionCompanies,
          email: getSessionEmail
        }),
        signal: apiAbortController.signal,
      });
      const data = await response.json();
      // track last regular API response
      lastRegularAPIResponse = true;
      console.log("AI response data:", data);

      if (data.matched === false) {
        console.log("error in AI response:", data.matched);
        return {
          summary: data.generated_answer,
          matched: false,
          audio_file: data.audio_file,
        };
      }

      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn("Fetch request aborted.");
        return null;
      }
      lastRegularAPIResponse = null;
      // console.error("Error fetching AI response:", error);
      return `Sorry, I couldn't process your request API-res-error.`;
    }
  }

  // Dummy API call simulation for testing purposes
  function dummyApiCall(userText) {
    console.log("demo api calling with user text:", userText);
    // Simulated responses based on user input
    if (userText.includes("hello") || userText.includes("hi")) {
      const response = "Hello! How can I assist you today?";
      return {
        response: response,
        status: true,
      };
    }
    if (
      userText.includes("why price is so high") ||
      userText.includes("why price is low")
    ) {
      const response =
        "The price is determined by various factors including market demand, supply chain costs, and economic conditions. If you have specific concerns about a product's price, please let me know!";
      return {
        response: response,
        status: true,
      };
    }
    if (
      userText.includes("what is the price") ||
      userText.includes("what is price of")
    ) {
      const response =
        "The price of a product can vary based on factors like location, availability, and market conditions. Please specify the product you're interested in for accurate pricing information.";
      return {
        response: response,
        status: true,
      };
    }
  }

  // Function to generate AI response based on user input
  async function generateAIResponse(userText) {
    // console.log("api language", apiLanguage);

    // let res = dummyApiCall(userText);
    //  return res;

    // Simulated AI response (replace with real API later)
    const response = await askAiByApi(userText);
    console.log("AI response:", response);
    return response;
  }


  // ==================  AI CHAT MIC HANDLER ==================
  // Mic button toggle stop & start listening
  chatMic.addEventListener("click", () => {
    if (!isListening) {
      startListening();
    } else {
      stopListening();
    }
  });

  // COMPLETELY CHAT TURN OFF HANDLER BUTTON
  document.getElementById("chat-turn-off").addEventListener("click", () => {
    // Stop speech recognition if it's running
    try {
      recognition.abort();
      isListening = false;
      chatMic.classList.remove("bg-green-300");
      console.log("Speech recognition stopped.");
    } catch (e) {
      console.warn("Error stopping recognition:", e);
    }

    // Stop any currently playing AI audio
    if (aiAudioVoice && !aiAudioVoice.paused) {
      aiAudioVoice.pause();
      aiAudioVoice.currentTime = 0;
      aiAudioVoice.removeAttribute("src");
      aiAudioVoice.load();
      console.log("AI audio playback stopped.");
    }

    // Stop speechSynthesis (text-to-speech) if active
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
      console.log("Speech synthesis canceled.");
    }

    // Abort ongoing API call
    if (apiAbortController) {
      apiAbortController.abort();
      apiAbortController = null;
      console.log("API call aborted due to chat turned off.");
    }

    // Optional: stop animation
    if (animation && typeof animation.stop === "function") {
      animation.stop();
    }
  });


  // ================== CALLER FUNCTIONS  ==================
  // Attach event listeners and set initial language & greeting
  attachRecognitionEvents();

  // Start conversation by greeting and asking for language choice
  const initialGreeting = `Welcome! Please share your preferred language to continue: English, বাংলা (Bangla), or हिंदी (Hindi).`;

  // Handle first load of AI chat
  function handleOnFirstLoad() {
    console.log("Handling first load for AI chat...");
    // Append initial greeting message
    appendAIMessage(initialGreeting, new Date().toTimeString().split(" ")[0]);

    if (ai_welcome_speech) {
      speakStaticAudioText(ai_welcome_speech);
    } else {
      startListening();
    }
  }

  handleOnFirstLoad();

  // loads and initialize the raiseTicket, resolveTicket, and chatContinue functions ===> for global access
  window.addEventListener("load", () => {
    // window.raiseTicket = raiseTicket;
    // window.resolveTicket = resolveTicket;
    // window.chatContinue = chatContinue;

    // remove session storage on page reload
    sessionStorage.clear();
    chatHistory = []
    sessionStorage.setItem("sid", Date.now());
  });
};

// initial page load event listener, 
window.addEventListener("DOMContentLoaded", () => {
  if (navigator.userAgent.includes("Firefox")) {
    alert(
      "You're using Firefox. This browser may not support speech recognition reliably."
    );
    console.warn(
      "You're using Firefox. Speech recognition may not work reliably."
    );
    window.location.href = "/";
    return;
  }
  // Check for Edge browser
  if (navigator.userAgent.includes("Edg")) {
    alert(
      "Note: You're using Microsoft Edge. So, Sometimes it may fails due to browser restrictions"
    );
    console.warn(
      "You're using Microsoft Edge. Speech recognition may not work reliably."
    );
    return;
  }

  handleOnAiChat();
});