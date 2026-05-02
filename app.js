// DOM Elements
const phoneNumberInput = document.getElementById('phoneNumber');
const checkBtn = document.getElementById('checkBtn');
const step2 = document.getElementById('step-2');
const displayNumber = document.getElementById('displayNumber');
const historyList = document.getElementById('historyList');

const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const recordingStatus = document.getElementById('recordingStatus');
const audioPlayback = document.getElementById('audioPlayback');
const descriptionInput = document.getElementById('description');
const submitBtn = document.getElementById('submitBtn');

// State variables
let mediaRecorder;
let audioChunks = [];
let finalAudioBlob = null;
let currentNumber = "";

// --- STEP 1: CHECK NUMBER ---
checkBtn.addEventListener('click', async () => {
    currentNumber = phoneNumberInput.value.trim();
    
    // Validate: Only numbers, 1 to 7 digits
    if (!/^\d{1,7}$/.test(currentNumber)) {
        alert("Please enter a valid 1 to 7 digit number.");
        return;
    }

    displayNumber.innerText = `Number: ${currentNumber}`;
    historyList.innerHTML = "<em>Loading history...</em>";
    step2.classList.remove('hidden');

    /* * TODO: Replace this simulated fetch with your actual Cloudflare Worker URL
     * const response = await fetch(`https://your-worker.workers.dev/api/history/${currentNumber}`);
     * const historyData = await response.json();
     */
    
    // Simulating API response delay
    setTimeout(() => {
        // Simulated data - in reality, this comes from your Cloudflare D1 database
        const historyData = currentNumber === "555" ? [
            { desc: "Testing the mic", date: "2026-05-01" }
        ] : [];

        if (historyData.length === 0) {
            historyList.innerHTML = "<p>This is a brand new number! You are the first to record.</p>";
        } else {
            historyList.innerHTML = historyData.map(item => 
                `<div class="history-item"><strong>${item.date}</strong>: ${item.desc}</div>`
            ).join('');
        }
    }, 500);
});

// --- STEP 2: AUDIO RECORDING ---
recordBtn.addEventListener('click', async () => {
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Combine chunks into a single playable audio blob
            finalAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(finalAudioBlob);
            
            audioPlayback.src = audioUrl;
            audioPlayback.classList.remove('hidden');
            submitBtn.disabled = false; // Enable submit button
            
            // Stop all microphone tracks to release the hardware
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        recordingStatus.innerText = " 🔴 Recording...";
        submitBtn.disabled = true;
        
    } catch (err) {
        alert("Microphone access denied or not available.");
        console.error(err);
    }
});

// Stop Recording
stopBtn.addEventListener('click', () => {
    mediaRecorder.stop();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordingStatus.innerText = "";
});

// --- STEP 3: SUBMISSION ---
submitBtn.addEventListener('click', async () => {
    const desc = descriptionInput.value.trim();
    if (!desc) {
        alert("Please enter a description for this recording.");
        return;
    }

    // Package the data using FormData
    const formData = new FormData();
    formData.append('phoneNumber', currentNumber);
    formData.append('description', desc);
    // Append the audio file with a filename
    formData.append('audioFile', finalAudioBlob, `${currentNumber}_${Date.now()}.webm`);

    submitBtn.innerText = "Uploading...";
    submitBtn.disabled = true;

    /* * TODO: Send this to your Cloudflare Worker endpoint
     * await fetch('https://your-worker.workers.dev/api/submit', {
     * method: 'POST',
     * body: formData
     * });
     */

    // Simulate upload delay
    setTimeout(() => {
        alert("Successfully saved to the archive!");
        // Reset UI
        step2.classList.add('hidden');
        phoneNumberInput.value = "";
        descriptionInput.value = "";
        audioPlayback.classList.add('hidden');
        submitBtn.innerText = "Submit to Archive";
    }, 1000);
});
