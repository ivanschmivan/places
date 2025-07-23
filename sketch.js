let img;
let asciiChar = "/"; // This is the currently displayed ASCII character
let gridSize = 6;
let displayedText = "Waiting for input...";
let speechRec;
let mic;
let amplitude;
let isImageReady = false;
let flickerBoost = 0; // This is the dynamic flicker value
let flickerBoostAmount = 15; // Amount to boost flicker when volume exceeds threshold
let volumeThreshold = 0.01;
const flickerMinBrightness = 120;
let speechBuffer = "";
let lastSpeechTime = Date.now(); // Track last speech timestamp

const minTextSize = 10;
const maxTextSize = 18;
const minColor = 50;
const maxColor = 240;
const minAvgVol = 0.005;
const maxAvgVol = 0.03;
const dynamicScaleMin = 1;
const dynamicScaleMax = 4;

let volumeHistory = [];
const volumeWindowSize = 180; // ~3 seconds at 60fps

let nextImg = null;

let welcomeScreen = 1;
let debugVisible = 0;
let isFetching = false;

// --- Color Definitions ---
const lowlightColor = '#320e9e'; // Dark purple color
const highlightColor = '#02f065'; // Bright green color

// --- Scramble Effect Definitions ---
const scrambleChar = "//";       // The character to alternate with during scrambling
const scrambleInterval = 100;   // Time in milliseconds to swap scramble characters
let lastScrambleTime = 0;       // Tracks the last time the scramble character was swapped
let isScrambling = false;       // Flag to indicate if scrambling is active
let originalAsciiChar;    // Stores the original ASCII character to revert to (initialized in setup)

function preload() {
  // Load the default image. The callback ensures it's ready before setup proceeds.
  img = loadImage("default.png", () => {
    img.resize(windowWidth, windowHeight);
    img.loadPixels();
  });
}

function setup() {
  // Initialize originalAsciiChar based on the initial value of asciiChar
  originalAsciiChar = asciiChar;

  // Create the welcome overlay div
  const welcomeOverlay = document.createElement('div');
  welcomeOverlay.id = 'welcomeOverlay';
  welcomeOverlay.style.position = 'absolute';
  welcomeOverlay.style.top = '0';
  welcomeOverlay.style.left = '0';
  welcomeOverlay.style.width = '100%';
  welcomeOverlay.style.height = '100%';
  welcomeOverlay.style.display = 'flex';
  welcomeOverlay.style.flexDirection = 'column';
  welcomeOverlay.style.justifyContent = 'center';
  welcomeOverlay.style.alignItems = 'center';
  welcomeOverlay.style.zIndex = '1'; // Ensure it's above the canvas

  // Create the title element
  const title = document.createElement('h1');
  title.innerText = 'Welcome to Places/';
  title.style.color = 'white';
  title.style.marginBottom = '40px';
  title.style.fontSize = '48px';
  title.style.fontFamily = 'monospace';

  // Create the start button
  const startButton = document.createElement('button');
  startButton.innerText = 'Start';
  startButton.style.background = 'white';
  // Use lowlightColor for button text
  startButton.style.color = lowlightColor; 
  startButton.style.border = 'none';
  startButton.style.padding = '15px 30px';
  startButton.style.borderRadius = '12px';
  startButton.style.fontSize = '24px';
  startButton.style.fontFamily = 'monospace';
  startButton.style.cursor = 'pointer';

  // Add event listener to the start button to remove the overlay and resume audio
  startButton.addEventListener('click', () => {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) overlay.remove(); // Remove the welcome overlay
    getAudioContext().resume(); // Resume the audio context
    welcomeScreen = 0; // Set welcomeScreen to 0 to indicate the app has started
  });

  // Append title and button to the overlay, then append overlay to the body
  welcomeOverlay.appendChild(title);
  welcomeOverlay.appendChild(startButton);
  document.body.appendChild(welcomeOverlay);

  // Initialize p5.js canvas
  createCanvas(windowWidth, windowHeight);
  textFont("monospace"); // Set font for the sketch
  noStroke(); // No outlines for shapes
  // Use lowlightColor for initial background
  background(lowlightColor); 

  // Attempt to resume AudioContext and start microphone
  getAudioContext().resume().then(() => {
    mic = new p5.AudioIn(); // Create a new audio input
    mic.start(() => { // Start the microphone
      console.log("✅ Mic started");
      amplitude = new p5.Amplitude(); // Create an amplitude object
      amplitude.setInput(mic); // Set mic as input for amplitude
    }, (err) => {
      console.error("❌ Mic start failed:", err); // Log error if mic fails to start
    });
  }).catch((err) => {
    console.error("⚠️ AudioContext resume failed:", err); // Log error if AudioContext fails to resume
  });

  isImageReady = true; // Indicate that the image is ready to be displayed

  // Call draw() once immediately after setup is complete to render the initial state.
  // This ensures createCanvas() has run and p5.js drawing functions are available.
  //draw();


  //FIX ATTEMPT
  if (img) {
  img.loadPixels(); // Ensure pixels are available after setup
  }

   // Initialize speech recognition
  speechRec = new p5.SpeechRec('en-US', gotSpeech); // Create speech recognition object
  speechRec.continuous = true; // Keep listening continuously
  speechRec.interimResults = false; // Only get final results
  speechRec.start(); // Start speech recognition once in setup.

  // Add an onEnd handler to ensure it restarts if the speech recognition service stops.
  speechRec.onEnd = () => {
    console.log("Speech recognition ended, attempting to restart...");
    // Only restart if we are past the welcome screen and not currently fetching an image.
    if (welcomeScreen === 0) {
      speechRec.start();
      console.log("Speech recognition restarted.");
    }
  };
}

// API URL for Automatic1111 Stable Diffusion
const A1111_API_URL = "http://127.0.0.1:7860/sdapi/v1/txt2img";
// Model to use for image generation
const SDXL_MODEL = "SD-XL-Turbo-1.0.safetensors";

// Callback function for speech recognition results
function gotSpeech() {
  lastSpeechTime = Date.now(); // Update the timestamp of the last speech event
  if (speechRec.resultValue) { // Check if a speech result is available
    const full = speechRec.resultString; // Get the full recognized string
    console.log("🎤 Heard:", full);
    speechBuffer += " " + full; // Append to speech buffer
    displayedText = speechBuffer.trim(); // Update displayed text

    const overlay = document.getElementById("overlayText");
    if (overlay) overlay.innerText = displayedText; // Update overlay text if it exists

    // Use regex to find the prompt within "my answer is ... final answer"
    const match = [...speechBuffer.matchAll(/my answer is (.*?) final answer/gi)].pop();
    console.log("🧠 Matched:", match);

    if (match && match[1]) { // If a match is found
      const prompt = match[1].trim(); // Extract the prompt
      console.log("🚀 Sending prompt:", prompt);
      generateImageFromPrompt(prompt); // Call function to generate image
      speechBuffer = ""; // Clear speech buffer after processing
      // After processing a command, reset displayedText to indicate readiness for next input
      displayedText = "Waiting for input...";
      if (overlay) overlay.innerText = displayedText;
    }
  }
}

// Function to generate an image from a given prompt using the A1111 API
async function generateImageFromPrompt(prompt) {
  displayedText = `Generating: "${prompt}"...`; // Update displayed text to show generation status
  const overlay = document.getElementById("overlayText");
  if (overlay) overlay.innerText = displayedText;
  isFetching = true; // Set fetching flag to true, which will trigger scrambling
  isImageReady = false; // Set image ready flag to false

  // Request body for the Stable Diffusion API
  const requestBody = {
    prompt: prompt,
    steps: 1, // Number of sampling steps
    width: 1024, // Fixed width for image generation
    height: 576, // Fixed height for image generation
    cfg_scale: 1, // Classifier Free Guidance scale
    sampler_name: "DPM++ SDE", // Sampler algorithm
    seed: -1, // Random seed
    n_iter: 1, // Number of images to generate
    batch_size: 1, // Batch size
    negative_prompt: "blurry, low quality, bad anatomy, deformed, disfigured, ugly, out of frame", // Negative prompt
    override_settings: {
      sd_model_checkpoint: SDXL_MODEL // Specify the model checkpoint
    }
  };

  try {
    // Send POST request to the A1111 API
    const response = await fetch(A1111_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json(); // Parse the JSON response
    const base64Img = data.images[0]; // Get the base64 encoded image

    // Load the generated image
    loadImage(
      "data:image/png;base64," + base64Img,
      loadedImg => {
        nextImg = loadedImg; // Store the newly loaded image
        nextImg.resize(windowWidth, windowHeight); // Resize to window dimensions to fill the screen
        nextImg.loadPixels(); // Load pixel data for processing
        isFetching = false; // Reset fetching flag, which will stop scrambling
      },
      err => {
        console.error("Failed to load image from base64:", err); // Log image load error
        displayedText = "Image load failed.";
        const overlay = document.getElementById("overlayText");
        if (overlay) overlay.innerText = displayedText;
        isFetching = false; // Reset fetching flag, which will stop scrambling
      }
    );
  } catch (err) {
    console.error("Image generation error:", err); // Log image generation error
    displayedText = "Failed to generate image.";
    const overlay = document.getElementById("overlayText");
    if (overlay) overlay.innerText = displayedText;
    isFetching = false; // Reset fetching flag, which will stop scrambling
  }
}

// Main draw loop for p5.js
function draw() {
  // Use lowlightColor for background

  background(lowlightColor); 

  // Handle character scrambling effect
  if (isFetching) {
    if (!isScrambling) {
      isScrambling = true; // Start scrambling
      lastScrambleTime = millis(); // Initialize scramble timer
      asciiChar = originalAsciiChar; // Ensure it starts with original or scramble based on first toggle
    }
    
    // Toggle character based on scramble interval
    if (millis() - lastScrambleTime > scrambleInterval) {
      if (asciiChar === originalAsciiChar) {
        asciiChar = scrambleChar;
      } else {
        asciiChar = originalAsciiChar;
      }
      lastScrambleTime = millis(); // Reset timer
    }
  } else {
    // If not fetching, ensure scrambling is off and character is original
    if (isScrambling) {
      isScrambling = false;
      asciiChar = originalAsciiChar; // Revert to original character
    }
  }

  // Calculate offset to center the image if it's smaller than the canvas
  let offsetX = (width - img.width) / 2;
  let offsetY = (height - img.height) / 2;

  // Initialize dynamicScale, avgVol, and vol to default values
  // These will be updated if amplitude is available.
  let dynamicScale = 1; // Initialize with a default of 1
  let avgVol = 0;
  let vol = 0;

  // Only calculate dynamic scale and volume if amplitude is initialized
  if (amplitude) {
    amplitude.smooth(0.1); // Smooth the amplitude readings
    vol = amplitude.getLevel(); // Get current microphone volume

    // Apply flicker boost if volume exceeds threshold
    if (vol > volumeThreshold) {
      flickerBoost = flickerBoostAmount;
    } else if (flickerBoost > 0) {
      flickerBoost = 0;
    }

    // Maintain a history of volume levels for average calculation
    volumeHistory.push(vol);
    if (volumeHistory.length > volumeWindowSize) {
      volumeHistory.shift(); // Remove oldest entry if window size is exceeded
    }
    // Calculate average volume over the history window
    avgVol = volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length;
    if (avgVol > 0) {
    
    let normVol = constrain((avgVol - minAvgVol) / (maxAvgVol - minAvgVol), 0, 1);
    dynamicScale = dynamicScaleMin + (dynamicScaleMax - dynamicScaleMin) * pow(normVol, 3);

    dynamicScale = constrain(dynamicScale, dynamicScaleMin, dynamicScaleMax); // Constrain dynamic scale
    }
}

  // Iterate through image pixels to draw ASCII characters
  for (let y = 0; y < img.height; y += gridSize) {
    for (let x = 0; x < img.width; x += gridSize) {
      let index = (x + y * img.width) * 4; // Calculate pixel index (RGBA)
      let r = img.pixels[index];
      let g = img.pixels[index + 1];
      let b = img.pixels[index + 2];
      let brightness = (r + g + b) / 3; // Calculate average brightness

      // Map brightness to a color range
      let flickerBrightness = map(brightness, 0, 255, minColor, maxColor);
      // Apply flicker boost for brighter areas
      if (brightness > flickerMinBrightness) {
        flickerBrightness += flickerBoost;
      }
      flickerBrightness = constrain(flickerBrightness, minColor, 255); // Constrain brightness
      // Use fixed red and blue, with flickerBrightness affecting green
      fill(2, flickerBrightness, 101); 

      // Calculate base text size based on brightness
      let baseSize = map(brightness, 0, 255, minTextSize, maxTextSize);
      
      let charSize = baseSize * dynamicScale; // Final character size

      textSize(charSize); // Set text size
      textAlign(CENTER, CENTER); // Align text
      text(asciiChar, offsetX + x, offsetY + y); // Draw the ASCII character
    }
  }

  // Display debug information (volume)
  if (debugVisible) {
    let volText = document.getElementById("volumeDisplay");
    if (!volText) {
      // Create the volume display div if it's not present
      volText = document.createElement("div");
      volText.id = "volumeDisplay";
      volText.style.position = "absolute";
      volText.style.bottom = "10px";
      volText.style.left = "50%";
      volText.style.transform = "translateX(-50%)";
      // Use highlightColor for volume display text
      volText.style.color = highlightColor; 
      volText.style.fontSize = "16px";
      volText.style.fontFamily = "monospace";
      document.body.appendChild(volText);
    }
    // Update the volume text only if amplitude is available, otherwise show placeholder
    if (amplitude) {
      volText.innerText = `volume: ${vol.toFixed(3)} | 3s avg volume: ${avgVol.toFixed(3)}`;
    } else {
      volText.innerText = ``;
    }
  } else {
    // Remove the volume display if debug is not visible
    const existing = document.getElementById("volumeDisplay");
    if (existing) existing.remove();
  }

const overlayText = document.getElementById("overlayText");
if (!debugVisible && overlayText) {
  overlayText.style.display = "none";
} else if (debugVisible && overlayText) {
  overlayText.style.display = "block";
}

  // If a new image is ready and not currently fetching, swap images
  if (nextImg && !isFetching) {
    img = nextImg; // Set current image to the new one
    nextImg = null; // Clear next image
    img.loadPixels(); // Load pixels for the new image
    isImageReady = true; // Mark image as ready
  }
}

// Function to handle key presses
function keyPressed() {
  if (key === 's' || key === 'S') { // If 's' or 'S' is pressed
    // Sanitize the displayed text for use as a filename
    let sanitizedPrompt = displayedText.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60);
    // Create a filename, defaulting if prompt is empty
    let filename = sanitizedPrompt ? `ascii_${sanitizedPrompt}` : 'ascii_render';
    saveCanvas(filename, 'png'); // Save the canvas as a PNG image
  }
}
