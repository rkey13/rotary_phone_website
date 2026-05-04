const API_URL = "https://rotary-backend.rkey13.workers.dev";

// DOM Elements
const phoneNumberInput = document.getElementById('phoneNumber');
const passwordInput = document.getElementById('numberPassword');
const checkBtn = document.getElementById('checkBtn');
const step2 = document.getElementById('step-2');
const displayNumber = document.getElementById('displayNumber');
const numberStatus = document.getElementById('numberStatus');
const historyList = document.getElementById('historyList');
const recordingSection = document.getElementById('recordingSection');

const fileUpload = document.getElementById('fileUpload');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const audioPreview = document.getElementById('audioPreview');
const descriptionInput = document.getElementById('description');
const isPublicCheckbox = document.getElementById('isPublic');
const lockNumberCheckbox = document.getElementById('lockNumber');
const submitBtn = document.getElementById('submitBtn');

let currentNumber = "";
let currentPassword = "";
let activeAudioFile = null; // Can be a File or a Blob
let mediaRecorder;
let activeRecordingExtension = 'webm'; // Default fallback
let audioChunks = [];

// --- LOAD NUMBER DATA ---
checkBtn.addEventListener('click', async () => {
    currentNumber = phoneNumberInput.value.trim();
    currentPassword = passwordInput.value.trim();
    
    if (!/^\d{1,7}$/.test(currentNumber)) { alert("Enter a valid 1 to 7 digit number."); return; }

    displayNumber.innerText = `Number: ${currentNumber}`;
    step2.classList.remove('hidden');
    await refreshHistory();
});

async function refreshHistory() {
    historyList.innerHTML = "<em>Loading...</em>";
    try {
        const res = await fetch(`${API_URL}/api/history/${currentNumber}`);
        const data = await res.json();
        
        // Handle Lock State
        if (data.state && data.state.is_locked === 1) {
            numberStatus.innerText = "🔒 This number is locked. Only the owner can submit new recordings.";
            recordingSection.classList.remove('hidden'); // Keep UI visible for the owner
        } else {
            numberStatus.innerText = "🔓 This number is open. Anyone can leave a recording without a password.";
            recordingSection.classList.remove('hidden');
        }

        if (data.recordings.length === 0) {
            historyList.innerHTML = "<p>Brand new number! You will set the password upon first submission.</p>";
            return;
        }

        historyList.innerHTML = data.recordings.map(item => {
            const isDeployed = data.state && data.state.deployed_recording_id === item.id;
            const audioUrl = `${API_URL}/api/audio/${item.audio_filename}?pw=${encodeURIComponent(currentPassword)}`;
            
            return `
            <div class="history-item">
                <strong>${new Date(item.date).toLocaleString()}</strong>
                ${isDeployed ? '<span class="badge">Active Deployment</span>' : ''}
                ${item.is_public === 0 ? '<span class="private-badge">Private</span>' : ''}
                <p>${item.description}</p>
                <audio controls src="${audioUrl}"></audio>
                <br>
                <a href="${audioUrl}" download="${item.audio_filename}"><button>Download File</button></a>
                ${!isDeployed ? `<button onclick="setDeployment(${item.id})">Set as Deployment</button>` : ''}
            </div>`;
        }).join('');
    } catch (err) { historyList.innerHTML = "<p>Error loading.</p>"; }
}

// --- SET DEPLOYMENT ---
window.setDeployment = async (recordingId) => {
    const res = await fetch(`${API_URL}/api/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: currentNumber, recordingId, password: currentPassword })
    });
    if (res.ok) { alert("Deployment updated!"); refreshHistory(); }
    else { alert("Unauthorized: Incorrect password."); }
};

// --- AUDIO INPUT (FILE VS MIC) ---

// 1. File Upload Logic (This was missing!)
fileUpload.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        activeAudioFile = e.target.files[0];
        
        // Unlock submit button immediately
        submitBtn.disabled = false;
        submitBtn.removeAttribute('disabled');
        recordBtn.disabled = true; // Disable mic to prevent clashing

        try {
            audioPreview.src = URL.createObjectURL(activeAudioFile);
            audioPreview.load(); // Safari fix
            audioPreview.classList.remove('hidden');
        } catch (err) {
            console.warn("Preview failed, but upload works.", err);
            audioPreview.classList.add('hidden');
        }
    } else {
        // Reset if they canceled the file menu
        activeAudioFile = null;
        submitBtn.disabled = true;
        recordBtn.disabled = false;
        audioPreview.classList.add('hidden');
    }
});

// 2. Microphone Logic
recordBtn.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Ask the browser what format it supports
        let mimeType = '';
        if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
            activeRecordingExtension = 'webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
            activeRecordingExtension = 'm4a'; // Safari preference
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
            mimeType = 'audio/aac';
            activeRecordingExtension = 'aac'; // Safari fallback
        }

        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        
        mediaRecorder.onstop = () => {
            // Create Blob and URL
            const recordedMimeType = mediaRecorder.mimeType || 'audio/mp4';
            activeAudioFile = new Blob(audioChunks, { type: recordedMimeType });
            const audioUrl = URL.createObjectURL(activeAudioFile);
            
            // Setup preview
            audioPreview.src = audioUrl;
            audioPreview.load(); // Safari fix
            audioPreview.classList.remove('hidden');
            submitBtn.disabled = false;
            
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        fileUpload.disabled = true;
    } catch (err) {
        alert("Microphone access denied or not available. Please check browser permissions.");
        console.error(err);
    }
});

stopBtn.addEventListener('click', () => {
    mediaRecorder.stop();
    stopBtn.disabled = true;
    recordBtn.disabled = false;
});

// --- SUBMISSION ---
submitBtn.addEventListener('click', async () => {
    if (!activeAudioFile) {
        alert("Please record or upload an audio file first.");
        return;
    }

    const formData = new FormData();
    formData.append('phoneNumber', currentNumber);
    formData.append('description', descriptionInput.value || "No description");
    formData.append('password', currentPassword);
    formData.append('isPublic', isPublicCheckbox.checked);
    formData.append('lockNumber', lockNumberCheckbox.checked);
    
    // Determine extension based on input type
    const ext = activeAudioFile.name ? activeAudioFile.name.split('.').pop() : activeRecordingExtension;
    formData.append('audioFile', activeAudioFile, `${currentNumber}_${Date.now()}.${ext}`);

    submitBtn.innerText = "Uploading..."; 
    submitBtn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/submit`, { method: 'POST', body: formData });
        
        if (res.ok) {
            alert("Successfully saved to the archive!");
            
            // Reset UI completely
            activeAudioFile = null;
            fileUpload.value = '';
            fileUpload.disabled = false;
            recordBtn.disabled = false;
            audioPreview.classList.add('hidden');
            descriptionInput.value = '';
            
            submitBtn.innerText = "Submit to Archive";
            refreshHistory();
            if (typeof loadDirectory === 'function') loadDirectory();
        } else {
            const err = await res.text();
            alert("Upload failed: " + err);
            submitBtn.innerText = "Submit to Archive"; 
            submitBtn.disabled = false;
        }
    } catch (err) {
        console.error("Network Error:", err);
        alert("Network error: Could not connect to the server.");
        submitBtn.innerText = "Submit to Archive"; 
        submitBtn.disabled = false;
    }
});

// --- DIRECTORY LOGIC ---
const directoryList = document.getElementById('directoryList');

async function loadDirectory() {
    try {
        const res = await fetch(`${API_URL}/api/directory`);
        const numbers = await res.json();

        if (numbers.length === 0) {
            directoryList.innerHTML = "<p>The directory is currently empty.</p>";
            return;
        }

        directoryList.innerHTML = numbers.map(n => `
            <div class="directory-item" style="border-bottom: 1px solid #eee; padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="font-size: 1.2rem; color: #007bff; cursor: pointer;" onclick="quickAccess('${n.phone_number}')">
                        ${n.phone_number}
                    </strong>
                    ${n.is_locked ? ' 🔒' : ''}
                    <br>
                    <small>${n.description || "No description provided."}</small>
                </div>
                <button onclick="quickAccess('${n.phone_number}')">View</button>
            </div>
        `).join('');
    } catch (err) {
        directoryList.innerHTML = "<p>Error loading directory.</p>";
    }
}

window.quickAccess = (num) => {
    phoneNumberInput.value = num;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    checkBtn.click();
};

loadDirectory();
