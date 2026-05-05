const API_URL = "https://rotary-backend.rkey13.workers.dev";

// DOM Elements
const passwordStatusBadge = document.getElementById('passwordStatusBadge');
const updateSettingsBtn = document.getElementById('updateSettingsBtn');
const phoneNumberInput = document.getElementById('phoneNumber');
const passwordInput = document.getElementById('numberPassword');
const checkBtn = document.getElementById('checkBtn');
const step2 = document.getElementById('step-2');
const displayNumber = document.getElementById('displayNumber');
const displayProjectName = document.getElementById('displayProjectName'); 
const numberStatus = document.getElementById('numberStatus');
const historyList = document.getElementById('historyList');
const recordingSection = document.getElementById('recordingSection');

const fileUpload = document.getElementById('fileUpload');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const audioPreview = document.getElementById('audioPreview');
const descriptionInput = document.getElementById('description');
const numberNameInput = document.getElementById('projectName'); 
const isPublicCheckbox = document.getElementById('isPublic');
const lockNumberCheckbox = document.getElementById('lockNumber');
const submitBtn = document.getElementById('submitBtn');

let currentNumber = "";
let currentPassword = "";
let activeAudioFile = null; 
let mediaRecorder;
let activeRecordingExtension = 'webm'; 
let audioChunks = [];

// --- LOAD NUMBER DATA ---
async function accessNumber() {
    currentNumber = phoneNumberInput.value.trim();
    currentPassword = passwordInput.value.trim();
    
    if (!/^\d{1,7}$/.test(currentNumber)) { alert("Enter a valid 1 to 7 digit number."); return; }

    displayNumber.innerText = `Number: ${currentNumber}`;
    step2.classList.remove('hidden');
    
    // Check Password Status First
    try {
        const verifyRes = await fetch(`${API_URL}/api/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: currentNumber, password: currentPassword })
        });
        const verifyData = await verifyRes.json();
        
        if (verifyData.status === "new") {
            passwordStatusBadge.innerText = "✨ Unclaimed Number";
            passwordStatusBadge.style.background = "#ff00ff";
            if(updateSettingsBtn) updateSettingsBtn.disabled = true; 
        } else if (verifyData.status === "owner") {
            passwordStatusBadge.innerText = "🔑 Owner Verified";
            passwordStatusBadge.style.background = "#00cc00";
            if(updateSettingsBtn) updateSettingsBtn.disabled = false;
        } else {
            passwordStatusBadge.innerText = "👁️ Guest Mode (Read Only)";
            passwordStatusBadge.style.background = "#ff9900";
            if(updateSettingsBtn) updateSettingsBtn.disabled = true; 
        }
    } catch (e) {
        passwordStatusBadge.innerText = "Connection Error";
    }

    await refreshHistory();
}

// Attach the function to the button click
checkBtn.addEventListener('click', accessNumber);


async function refreshHistory() {
    historyList.innerHTML = "<em>Loading...</em>";
    try {
        const res = await fetch(`${API_URL}/api/history/${currentNumber}`);
        const data = await res.json();
        
        if (data.state && data.state.project_name) {
            if (displayProjectName) displayProjectName.innerText = data.state.project_name;
            if (numberNameInput) numberNameInput.value = data.state.project_name; 
        } else {
            if (displayProjectName) displayProjectName.innerText = "";
            if (numberNameInput) numberNameInput.value = "";
        }

        // Handle Lock State
        if (data.state && data.state.is_locked === 1) {
            numberStatus.innerText = "🔒 This number is locked. Only the owner can submit new recordings.";
            lockNumberCheckbox.checked = true;
        } else {
            numberStatus.innerText = "🔓 This number is open. Anyone can leave a recording without a password.";
            lockNumberCheckbox.checked = false;
        }

        if (data.recordings.length === 0) {
            historyList.innerHTML = "<p>Brand new number! You will set the password upon first submission.</p>";
            return;
        }

        historyList.innerHTML = data.recordings.map(item => {
            const isDeployed = data.state && data.state.deployed_recording_id === item.id;
            const audioUrl = `${API_URL}/api/audio/${item.audio_filename}?pw=${encodeURIComponent(currentPassword)}`;

            // FIXED: Corrected the HTML tag syntax here
            return `
            <div class="history-item" ${isDeployed ? 'id="active-deployment"' : ''}>
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
    if (res.ok) { alert("Deployment updated!"); refreshHistory(); if (typeof loadDirectory === 'function') loadDirectory(); }
    else { alert("Unauthorized: Incorrect password."); }
};

// --- AUDIO INPUT (FILE VS MIC) ---

// 1. File Upload Logic
fileUpload.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        activeAudioFile = e.target.files[0];
        
        submitBtn.disabled = false;
        submitBtn.removeAttribute('disabled');
        recordBtn.disabled = true; 

        try {
            audioPreview.src = URL.createObjectURL(activeAudioFile);
            audioPreview.load(); 
            audioPreview.classList.remove('hidden');
        } catch (err) {
            console.warn("Preview failed, but upload works.", err);
            audioPreview.classList.add('hidden');
        }
    } else {
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
        
        let mimeType = '';
        if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
            activeRecordingExtension = 'webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
            activeRecordingExtension = 'm4a'; 
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
            mimeType = 'audio/aac';
            activeRecordingExtension = 'aac'; 
        }

        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        
        mediaRecorder.onstop = () => {
            const recordedMimeType = mediaRecorder.mimeType || 'audio/mp4';
            activeAudioFile = new Blob(audioChunks, { type: recordedMimeType });
            const audioUrl = URL.createObjectURL(activeAudioFile);
            
            audioPreview.src = audioUrl;
            audioPreview.load(); 
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
    
    if (numberNameInput) {
        formData.append('projectName', numberNameInput.value.trim());
    }
    
    formData.append('description', descriptionInput.value || "No description");
    formData.append('password', currentPassword);
    formData.append('isPublic', isPublicCheckbox.checked);
    formData.append('lockNumber', lockNumberCheckbox.checked);
    
    const ext = activeAudioFile.name ? activeAudioFile.name.split('.').pop() : activeRecordingExtension;
    formData.append('audioFile', activeAudioFile, `${currentNumber}_${Date.now()}.${ext}`);

    submitBtn.innerText = "Uploading..."; 
    submitBtn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/submit`, { method: 'POST', body: formData });
        
        if (res.ok) {
            alert("Successfully saved to the archive!");
            
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

// --- UPDATE SETTINGS WITHOUT AUDIO ---
updateSettingsBtn.addEventListener('click', async () => {
    updateSettingsBtn.innerText = "Saving...";
    updateSettingsBtn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/update-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber: currentNumber,
                password: currentPassword,
                projectName: numberNameInput.value.trim(),
                lockNumber: lockNumberCheckbox.checked
            })
        });

        if (res.ok) {
            alert("Settings updated successfully!");
            await refreshHistory();
            if (typeof loadDirectory === 'function') loadDirectory();
        } else {
            const err = await res.text();
            alert("Failed to update: " + err);
        }
    } catch (e) {
        alert("Network error.");
    }

    updateSettingsBtn.innerText = "Save Settings";
    updateSettingsBtn.disabled = false;
});

// --- DIRECTORY LOGIC ---
const directoryList = document.getElementById('directoryList');

function formatPhoneNumber(numStr) {
    if (numStr && numStr.length === 7) {
        return `${numStr.slice(0, 3)}-${numStr.slice(3)}`;
    }
    return numStr; 
}

async function loadDirectory() {
    try {
        const res = await fetch(`${API_URL}/api/directory`);
        const numbers = await res.json();

        if (numbers.length === 0) {
            directoryList.innerHTML = "<p>The directory is currently empty.</p>";
            return;
        }

        // FIXED: Passing event to quickAccess
        directoryList.innerHTML = numbers.map(n => {
            const formattedNum = formatPhoneNumber(n.phone_number);
            const displayTitle = n.project_name ? `${n.project_name} (${formattedNum})` : formattedNum;
            
            return `
            <div class="directory-item" style="border-bottom: 1px solid #eee; padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="font-size: 1.2rem; color: #007bff; cursor: pointer;" onclick="quickAccess(event, '${n.phone_number}')">
                        ${displayTitle}
                    </strong>
                    ${n.is_locked ? ' 🔒' : ''}
                    <br>
                    <small>${n.description || "No description provided."}</small>
                </div>
                <button onclick="quickAccess(event, '${n.phone_number}')">View</button>
            </div>
            `;
        }).join('');
    } catch (err) {
        directoryList.innerHTML = "<p>Error loading directory.</p>";
    }
}

// FIXED: Cleaned up duplicate functions and added preventDefault/setTimeout
window.quickAccess = async (event, num) => {
    if (event) event.preventDefault(); 

    phoneNumberInput.value = num;
    passwordInput.value = ""; 
    
    await accessNumber(); 
    
    setTimeout(() => {
        const activeItem = document.getElementById('active-deployment');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            activeItem.style.transition = "background-color 0.5s";
            activeItem.style.backgroundColor = "rgba(0, 255, 255, 0.2)"; 
            setTimeout(() => activeItem.style.backgroundColor = "transparent", 1500); 
            
        } else {
            step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
};

// Initial load
loadDirectory();
