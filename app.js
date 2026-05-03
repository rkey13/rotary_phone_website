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

    try {
        // Real fetch to your local worker
        const response = await fetch(`https://rotary-backend.rkey13.workers.dev/api/history/${currentNumber}`);
        const historyData = await response.json();

        if (historyData.length === 0) {
            historyList.innerHTML = "<p>This is a brand new number! You are the first to record.</p>";
        } else {
            historyList.innerHTML = historyData.map(item => 
                `<div class="history-item"><strong>${new Date(item.date).toLocaleString()}</strong>: ${item.description}</div>`
            ).join('');
        }
    } catch (error) {
        console.error("Failed to fetch history:", error);
        historyList.innerHTML = "<p style='color:red;'>Error loading history.</p>";
    }
});

// --- STEP 2: AUDIO RECORDING ---
recordBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            finalAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(finalAudioBlob);
            
            audioPlayback.src = audioUrl;
            audioPlayback.classList.remove('hidden');
            submitBtn.disabled = false;
            
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

    const formData = new FormData();
    formData.append('phoneNumber', currentNumber);
    formData.append('description', desc);
    formData.append('audioFile', finalAudioBlob, `${currentNumber}_${Date.now()}.webm`);

    submitBtn.innerText = "Uploading...";
    submitBtn.disabled = true;

    try {
        // Real POST request to your local worker
        const response = await fetch('https://rotary-backend.rkey13.workers.dev/api/submit', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            alert("Successfully saved to the archive!");
            step2.classList.add('hidden');
            phoneNumberInput.value = "";
            descriptionInput.value = "";
            audioPlayback.classList.add('hidden');
            submitBtn.innerText = "Submit to Archive";
        } else {
            alert("Failed to upload recording.");
            submitBtn.innerText = "Submit to Archive";
            submitBtn.disabled = false;
        }
    } catch (error) {
        console.error("Upload error:", error);
        alert("An error occurred during upload.");
        submitBtn.innerText = "Submit to Archive";
        submitBtn.disabled = false;
    }
});
