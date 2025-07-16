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
  let apiLanguage;

  let aiApiCallCount = 0;

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
    // console.log("stopListening", isListening);
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
      console.log("Audio started playing:", updatedAudioPath);
      if (animation && typeof animation.play === "function") {
        animation.play();
        console.log("Animation started.");
        chatMic.classList.remove("bg-green-300");
        chatMicIcon.src = micOffURI;
      }
    };

    aiAudioVoice.onended = () => {
      console.log("Audio ended.");
      if (animation && typeof animation.stop === "function") {
        animation.stop();
        console.log("Animation stopped after playback.");
      }
      chatMic.classList.add("bg-green-300");
      chatMicIcon.src = micOnURI;
      startListening(); // Continue voice input
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
        startListening();
      });
    };

    aiAudioVoice.load();
  }

  // Function to speak static audio text with browser compatibility issue resolved
  function speakStaticAudioText(audioPath) {
    // console.log("Speaking static audio text:", audioPath);

    if (!aiAudioVoice) {
      console.error("Audio element not found");
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
      console.log("Audio ended.");
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
          console.log("Audio playback started:", audioPath);
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

  // recognition voice to text result
  function attachRecognitionEvents() {
    recognition.addEventListener("start", () => {
      isListening = true;
      chatMic.classList.add("bg-green-300");
      chatMicIcon.src = micOnURI;
    });

    recognition.addEventListener("end", () => {
      isListening = false;
      chatMic.classList.remove("bg-green-300");
      console.log(chatMic);
      chatMicIcon.src = micOffURI;
    });

    recognition.addEventListener("error", (event) => {
      console.log(event.error === "network");
      // console.error("Speech recognition error: 177", event.error);
      isListening = false;
      chatMic.classList.remove("bg-green-300");
      chatMicIcon.src = micOffURI;

      if (event.error === "network") {
        alert(
          "Network error occurred during speech recognition. Please check your connection and try again."
        );
      } else if (event.error === "no-speech") {
        // User did not speak — restart listening after 500ms
        setTimeout(() => {
          if (!isListening) {
            try {
              recognition.start();
            } catch (e) {
              console.error("Error restarting recognition after no-speech:", e);
            }
          }
        }, 500);
      }
    });

    // recognition voice to text result
    recognition.addEventListener("result", async (event) => {
      // console.log("Speech recognition result received:", event);
      const transcript = Array.from(event.results)
        .map((result) => result[0])
        .map((result) => result.transcript)
        .join("")
        .trim()
        .toLowerCase();

      const now = new Date();
      const timeString = now.toTimeString().split(" ")[0];

      appendUserMessage(transcript, timeString);
      // console.log("User transcript:", transcript);

      if (firstInteraction) {
        if (
          transcript.includes("english") ||
          transcript.includes("ইংরেজি") ||
          transcript.includes("अंग्रेज़ी")
        ) {
          selectedLanguage = "english";
        } else if (
          transcript.includes("bengali") ||
          transcript.includes("বাংলা") ||
          transcript.includes("bangla")
        ) {
          selectedLanguage = "bengali";
        } else if (
          transcript.includes("hindi") ||
          transcript.includes("हिन्दी") ||
          transcript.includes("हिंदी")
        ) {
          selectedLanguage = "hindi";
        } else {
          const retryMsg =
            "Sorry, I didn't catch that. Please say English, বাংলা, or हिंदी.";

          // Wait for speech to finish before listening again
          appendAIMessage(retryMsg, new Date().toTimeString().split(" ")[0]);
          if (retryMsg || retryMsg.includes("Sorry")) {
            startListening();
            return;
          }
          // speakAIResponse(retryMsg, () => { });
          return;
        }

        firstInteraction = false;
        recognition.lang = languageMap[selectedLanguage].recognition;
        apiLanguage = languageMap[selectedLanguage].language;

        const greetings = {
          english: "Great! Let's continue in English.",
          bengali: "দারুণ! চলুন, আমরা বাংলায় কথা বলি।",
          hindi: "बहुत बढ़िया! आइए हिंदी में जारी रखें।",
        };

        const thankYouMessages = {
          english:
            "Thank you for your response. Please, share your name & email for continue.",
          bengali:
            "আপনার পছন্দের জন্য ধন্যবাদ। বলুন, আমি কীভাবে আপনাকে সাহায্য করতে পারি!",
          hindi: "आपकी पसंद के लिए धन्यवाद। आप क्या जानना चाहेंगे?",
        };

        // greet the user in selected language
        const fullMessage =
          greetings[selectedLanguage] +
          " " +
          thankYouMessages[selectedLanguage];

        appendAIMessage(fullMessage, new Date().toTimeString().split(" ")[0]);


        // Speak the greeting message in selected language
        if (
          selectedLanguage.includes("bengali") ||
          selectedLanguage.includes("bangla") ||
          selectedLanguage.includes("বাংলা")
        ) {
          console.log(
            "Selected Bengali language for AI response.",
            ai_beng_speech
          );
          speakStaticAudioText(ai_beng_speech);
        }
        if (
          selectedLanguage.includes("hindi") ||
          selectedLanguage.includes("हिन्दी") ||
          selectedLanguage.includes("हिंदी")
        ) {
          console.log(
            "Selected hindi language for AI response.",
            ai_hindi_speech
          );
          speakStaticAudioText(ai_hindi_speech);
        }
        if (
          selectedLanguage.includes("english") ||
          selectedLanguage.includes("इंग्रेजी") ||
          selectedLanguage.includes("ইংরেজি")
        ) {
          console.log(
            "Selected English language for AI response.",
            ai_eng_speech
          );
          speakStaticAudioText(ai_eng_speech);
        }

        // // Speak the greeting message in selected name & email
        // const playGreetingAndAskName = async () => {
        //   const { greeting } = await greetingAIResponse(transcript);
        //   const timeString2 = new Date().toTimeString().split(" ")[0];
        //   appendAIMessage(greeting, timeString2);
        //   trackAiSpeechPlayback(api_ai_speech);
        // };

        // if(aiAudioVoice.paused) {
        //   console.log("AI audio is paused, starting playback. 389L");

        //   if(!isListening) {
        //    setTimeout(async() => {
        //       await playGreetingAndAskName();
        //     }, 1000);
        //   }
        // }

        return;
      }

      // If language selected and normal chat interaction
      try {
        const { summary: aiResponse, matched:status , audio_file} = await generateAIResponse(transcript);
        const now2 = new Date();
        const timeString2 = now2.toTimeString().split(" ")[0];

        if (!aiResponse) {
          throw new Error("Invalid AI response");
        }
        console.log("AI response:", aiResponse, "Status:", status);
        // append & Speak the AI response
        appendAIMessage(aiResponse, timeString2);
        trackAiSpeechPlayback(audio_file);
      } catch (err) {
        if (err) {
          console.error("Error generating AI response:", err);
          appendAIMessage("Sorry, I couldn't process your query(Error generating AI response).", new Date().toTimeString().split(" ")[0]
          );
          startListening();
        }

        // speakAIResponse("Sorry, I couldn't process your request.", () => {});
      }
    });
  }

  // function for scrolling the chat container to the bottom
  function scrollToBottom() {
    // console.log("Scrolled to bottom of chat container. before: ", chatContainer.scrollHeight);
    chatContainer.scrollTop = chatContainer.scrollHeight * 100;
    // console.log("Scrolled to bottom of chat container. after: ", chatContainer.scrollHeight);
  }

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
  }

  function chatOptionUI() {
    return `
    <div class="ticket-pop-up flex flex-col space-y-2 relative flex-1">
      <p class="text-gray-200 text-[.85rem] break-words italic max-w-2xl">Does this response helpful ?
        OR you take
        <span class="text-yellow-500 font-medium">raise-ticket</span> to connect our technical support team for further assistance.
      </p>
      <div class="raise-ticket-options flex items-center gap-2 translate-y-[0%] hover:translate-y-0 transition-all duration-300 ease-in-out">
        <button id="raise-ticket-btn"
          class="bg-green-500/20 text-green-100 px-4 py-1 rounded-full border-[1px] outline-offset-2 border-green-500 shadow-md hover:bg-green-500/50 transition-colors duration-300 text-sm text-balance"
          onclick="resolveTicket()">Resolve</button>
        <button id="close-chat-btn"
          class="bg-rose-500/20 text-rose-100 px-4 py-1 rounded-full border-[1px] border-rose-500 shadow-md hover:bg-rose-500/50 transition-colors duration-300 text-sm text-balance"
          onclick="raiseTicket()">Raise Ticket</button>
        <button id="continue-chat-conversation-btn"
          class="bg-yellow-500/20 text-yellow-100 px-4 py-1 rounded-full border-[1px] border-yellow-500 shadow-md hover:bg-yellow-500/50 transition-colors duration-300 text-sm text-balance"
          onclick="chatContinue()">Continue chat</button>
      </div>
    </div>
  `;
  }

  function raiseTicket() {
    alert("Raise ticket button clicked.");
    console.log("Raise ticket button clicked.");
  }

  function resolveTicket() {
    alert("Resolve ticket button clicked.");
    console.log("Resolve ticket button clicked.");
  }

  function chatContinue() {
    console.log("Continue chat button clicked.");
    // Reset the AI API call count to allow further interactions
    aiApiCallCount = 0;
    // Reset the recognition to allow new interactions
    resetRecognition();
    // Start listening for new user input
    startListening();
  }

  function appendAIMessage(message, time) {
    console.log("AI Message:", message);
    const msg = document.createElement("div");
    const showRaiseTicket = aiApiCallCount === 4;

    msg.className = "ai-chat-main";
    msg.innerHTML = `
            <div class="ai-chat flex justify-start items-center p-2">
            <div class="md:w-3/4 flex p-3 items-center gap-4 border border-white/20 rounded-md mx-1 bg-gray-600/10 backdrop-blur-[.25rem] shadow-md border-b border-white/20 rounded-md border border-gray-500">
             <div class="ai-chat-icon md:w-8 md:h-8 p-[1px] bg-gray-100 rounded-full self-start overflow-hidden">
                <img src="${AI_BOT_ICON}" alt="ai-icon" class="object-cover lg:object-fit rounded-full w-8 h-auto md:w-full md:h-full" width="24" height="24" />
                </div>
              <div class="ai-chat-text w-full">
                <p class="break-words text-[.75rem] md:text-sm text-wrap text-justify text-gray-200">${message}</p>
                <div class="ai-chat-options flex items-center gap-2 ${showRaiseTicket ? "mt-4 relative" : "mt-2"}">
                   <div class="w-32 md:w-48 lg:w-64">
                    <span class="text-[.75rem] text-gray-200 block italic">${time}</span>
                   </div>
                 <!-- inside ai-chat-main, after ai-chat raise ticket will show -->
                    ${showRaiseTicket ? chatOptionUI() : ""}
                </div>
              </div>
             </div>
            </div
          `;
    chatContainer.appendChild(msg);
    scrollToBottom();
  }

  // Function to ask AI via API
  async function askAiByApi(userText) {
    try {
      // Abort previous request if any
      if (apiAbortController) {
        apiAbortController.abort();
        console.log("Previous API call aborted.");
      }

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
          id: "1",
          question: userText,
        }),
        signal: apiAbortController.signal,
      });
      const data = await response.json();
      console.log("AI response data:", data);

      if(data.matched === false) {
        console.log("error in AI response:", data.matched);
        throw new Error("AI response not matched");
      }
      
      return data
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn("Fetch request aborted.");
        return null;
      }
      console.error("Error fetching AI response:", error);
      return `Sorry, I couldn't process your request API-res-error.`;
    }
  }

  async function greetingAIResponse(userText) {
    try{
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

      if(!data) {
        console.log("error in greeting AI response:", data.matched);
        throw new Error("Greeting AI response not matched");
      }

      return data;

    }catch(e) {
      console.error("Error in greetingAIResponse:", e);
      return {
        greeting: "Sorry, I couldn't process your request.",
        matched: false,
      };
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
    if (userText.includes("why price is so high") || userText.includes("why price is low")) {
      const response =
        "The price is determined by various factors including market demand, supply chain costs, and economic conditions. If you have specific concerns about a product's price, please let me know!";
      return {
        response: response,
        status: true,
      };
    }
    if (userText.includes("what is the price") || userText.includes("what is price of")) {
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
    //  if (res?.status) {
    //    aiApiCallCount++;
    //    console.log("AI API hit count:", aiApiCallCount);
    //  }
    //  return res;
    
    // Simulated AI response (replace with real API later)
      const response = await askAiByApi(userText);
      if(response?.matched) 
        aiApiCallCount++;
      return response;
  }

  // Attach event listeners and set initial language & greeting
  attachRecognitionEvents();

  // Start conversation by greeting and asking for language choice
  const initialGreeting = `Welcome! Which language would you like to continue in? Say English, বাংলা (Bangla), or हिंदी (Hindi).`;

  // Mic button toggle stop & start listening
  chatMic.addEventListener("click", () => {
    if (!isListening) {
      startListening();
    } else {
      stopListening();
    }
  });

  // stop listening and reset recognition when the chat is turned off
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

  function handleOnFirstLoad() {
    console.log("Handling first load for AI chat...");
    // Append initial greeting message
    appendAIMessage(initialGreeting, new Date().toTimeString().split(" ")[0]);

    if(ai_welcome_speech) {
      speakStaticAudioText(ai_welcome_speech);
    } else {
      startListening();
    }
  }

  handleOnFirstLoad();

  // loads and initialize handleItemSelection() when user clicks on the checkbox
  window.addEventListener("load", () => {
    window.raiseTicket = raiseTicket;
    window.resolveTicket = resolveTicket;
    window.chatContinue = chatContinue;
  });
};


// initial page load event listener
window.addEventListener("DOMContentLoaded", () => {
  if (navigator.userAgent.includes("Firefox")) {
    alert("You're using Firefox. This browser may not support speech recognition reliably.");
    console.warn("You're using Firefox. Speech recognition may not work reliably.");
    window.location.href = "/";
    return;
  }
  // Check for Edge browser
  if (navigator.userAgent.includes("Edg")) {
    alert("Note: You're using Microsoft Edge. So, Sometimes it may fails due to browser restrictions");
    console.warn("You're using Microsoft Edge. Speech recognition may not work reliably.");
    return;
  }

  handleOnAiChat();
});


// const now2 = new Date();
// const timeString2 = now2.toTimeString().split(" ")[0];
// const { greeting } = await greetingAIResponse(transcript);
// appendAIMessage(greeting, timeString2);
// trackAiSpeechPlayback(api_ai_speech);



 // // Speak the greeting message in selected name & email
        // const playGreetingAndAskName = async () => {
        //   const { greeting } = await greetingAIResponse(transcript);
        //   const timeString2 = new Date().toTimeString().split(" ")[0];
        //   appendAIMessage(greeting, timeString2);
        //   trackAiSpeechPlayback(api_ai_speech);
        // };
	