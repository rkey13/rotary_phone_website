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
            numberStatus.innerText = "🔒 This number is locked for new submissions.";
            recordingSection.classList.add('hidden');
        } else {
            numberStatus.innerText = "";
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
fileUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        activeAudioFile = e.target.files[0];
        audioPreview.src = URL.createObjectURL(activeAudioFile);
        audioPreview.classList.remove('hidden');
        submitBtn.disabled = false;
        recordBtn.disabled = true; // Disable mic if file selected
    }
});

recordBtn.addEventListener('click', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        activeAudioFile = new Blob(audioChunks, { type: 'audio/webm' });
        audioPreview.src = URL.createObjectURL(activeAudioFile);
        audioPreview.classList.remove('hidden');
        submitBtn.disabled = false;
        stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    fileUpload.disabled = true; // Disable upload if recording
});

stopBtn.addEventListener('click', () => {
    mediaRecorder.stop();
    stopBtn.disabled = true;
    recordBtn.disabled = false;
});

// --- SUBMISSION ---
submitBtn.addEventListener('click', async () => {
    const formData = new FormData();
    formData.append('phoneNumber', currentNumber);
    formData.append('description', descriptionInput.value);
    formData.append('password', currentPassword);
    formData.append('isPublic', isPublicCheckbox.checked);
    formData.append('lockNumber', lockNumberCheckbox.checked);
    // Determine extension based on input type
    const ext = activeAudioFile instanceof File ? activeAudioFile.name.split('.').pop() : 'webm';
    formData.append('audioFile', activeAudioFile, `${currentNumber}_${Date.now()}.${ext}`);

    submitBtn.innerText = "Uploading..."; submitBtn.disabled = true;

    const res = await fetch(`${API_URL}/api/submit`, { method: 'POST', body: formData });
    
    if (res.ok) {
        alert("Success!");
        activeAudioFile = null;
        fileUpload.value = '';
        fileUpload.disabled = false;
        audioPreview.classList.add('hidden');
        submitBtn.innerText = "Submit to Archive";
        refreshHistory();
    } else {
        const err = await res.text();
        alert("Upload failed: " + err);
        submitBtn.innerText = "Submit to Archive"; submitBtn.disabled = false;
    }
});
