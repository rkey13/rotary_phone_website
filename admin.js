const API_URL = "https://rotary-backend.rkey13.workers.dev";

const adminPasswordInput = document.getElementById('adminPassword');
const loginBtn = document.getElementById('loginBtn');
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const refreshBtn = document.getElementById('refreshBtn');

let masterPassword = "";

loginBtn.addEventListener('click', async () => {
    masterPassword = adminPasswordInput.value.trim();
    if (!masterPassword) return;

    loginBtn.innerText = "Authenticating...";
    const success = await loadAdminData();
    
    if (success) {
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
    } else {
        alert("Authentication failed. Incorrect admin password.");
        loginBtn.innerText = "Authenticate";
    }
});

refreshBtn.addEventListener('click', loadAdminData);

async function loadAdminData() {
    try {
        const res = await fetch(`${API_URL}/api/admin/data`, {
            method: 'GET',
            headers: { 'Admin-Password': masterPassword }
        });

        if (!res.ok) return false;

        const data = await res.json();
        renderNumbers(data.numbers);
        renderRecordings(data.recordings, data.numbers);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

function renderNumbers(numbers) {
    const tbody = document.querySelector('#numbersTable tbody');
    tbody.innerHTML = numbers.map(n => `
        <tr>
            <td><strong>${n.phone_number}</strong></td>
            <td>${n.project_name || '-'}</td>
            <td>${n.is_locked ? '🔒 Yes' : '🔓 No'}</td>
            <td>
                <button class="danger-btn" onclick="adminAction('delete_number', { phoneNumber: '${n.phone_number}' })">Delete Entire Number</button>
            </td>
        </tr>
    `).join('');
}

function renderRecordings(recordings, numbers) {
    const tbody = document.querySelector('#recordingsTable tbody');
    
    // Create a map to look up if a recording is currently the active deployment
    const deployedMap = {};
    numbers.forEach(n => deployedMap[n.deployed_recording_id] = true);

    tbody.innerHTML = recordings.map(r => {
        const isDeployed = deployedMap[r.id];
        const audioUrl = `${API_URL}/api/audio/${r.audio_filename}?pw=${encodeURIComponent(masterPassword)}`;
        
        return `
        <tr>
            <td>${r.id} ${isDeployed ? '<span class="badge">Active</span>' : ''}</td>
            <td>${r.phone_number}</td>
            <td>${r.description}</td>
            <td>
                <select onchange="adminAction('toggle_privacy', { id: ${r.id}, isPublic: this.value })">
                    <option value="1" ${r.is_public ? 'selected' : ''}>Public</option>
                    <option value="0" ${!r.is_public ? 'selected' : ''}>Private</option>
                </select>
            </td>
            <td><audio controls src="${audioUrl}" style="height: 30px; width: 150px;"></audio></td>
            <td>
                <button class="danger-btn" onclick="adminAction('delete_recording', { id: ${r.id} })">Delete Audio</button>
            </td>
        </tr>
    `;
    }).join('');
}

window.adminAction = async (actionType, payload) => {
    if (actionType.startsWith('delete') && !confirm("Are you sure? This is permanent and deletes the file from cloud storage!")) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/admin/action`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Admin-Password': masterPassword 
            },
            body: JSON.stringify({ action: actionType, ...payload })
        });

        if (res.ok) {
            await loadAdminData(); // Refresh tables
        } else {
            alert("Action failed. Check console.");
        }
    } catch (e) { alert("Network error."); }
};
