# ☎️ Rotary Phone Archive

## Project Overview
The **Rotary Phone Archive** is a full-stack serverless web application built for an interactive art installation (Otherworld 2026). The project serves as a digital submission portal and content management system (CMS) for a physical, modified rotary phone powered by a Raspberry Pi. 

Users can claim a "phone number" (1-7 digits), password-protect it, and submit audio recordings (via microphone or file upload). The physical rotary phone will eventually download the "Active Deployment" for each number so that when a participant dials that number in the real world, they hear the assigned audio recording.

## System Architecture
* **Frontend:** Vanilla HTML, CSS, and JavaScript. Hosted on **Cloudflare Pages** (via GitHub integration). Features a custom "Antique Psychedelic Rave" neon styling.
* **Backend API:** **Cloudflare Workers** (Serverless JavaScript). Handles all business logic, database queries, and storage interactions.
* **Database:** **Cloudflare D1** (Serverless SQLite). Tracks numbers, passwords, lock states, project names, and metadata for every audio recording.
* **Storage:** **Cloudflare R2** (Object Storage). Stores the raw `.webm`, `.m4a`, and `.mp4` audio files.

---

## Features & Mechanics
1. **Number Claiming & Voicemail Mode:** Entering a new number claims it. If left without a password, it acts as an open public voicemail. If password-protected, the creator becomes the "Owner."
2. **Locking:** Owners can "lock" a number to prevent public submissions.
3. **Active Deployments:** If a number has multiple recordings, the owner can select which specific recording is the "Active Deployment." This is the specific file the Raspberry Pi will pull.
4. **Safari/iOS Compatibility:** The frontend dynamically detects iOS Safari and records in `.m4a`/`audio/mp4` to bypass Apple's lack of `.webm` support. The backend supports HTTP `206 Partial Content` byte-range requests to satisfy Safari's strict media playback rules.
5. **Admin Dashboard (`/admin.html`):** A god-mode console protected by a Cloudflare Secret (`ADMIN_PASSWORD`). Allows the admin to delete files, wipe numbers, and toggle privacy settings.

---

## Database Schema (Cloudflare D1)

```sql
-- Tracks the state of the phone number itself
CREATE TABLE numbers (
    phone_number TEXT PRIMARY KEY,
    password TEXT,           -- Plaintext (Note: Plan to migrate to SHA-256 hash in the future)
    is_locked BOOLEAN,       -- 1 = locked, 0 = open for submissions
    deployed_recording_id INTEGER, -- The ID of the currently active recording
    project_name TEXT        -- Custom display name for the directory
);

-- Tracks every individual audio submission
CREATE TABLE recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL, 
    description TEXT,
    audio_filename TEXT NOT NULL,
    is_public BOOLEAN,       
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🍓 Raspberry Pi Integration Guide

The ultimate goal of this project is to have a Python script running on a Raspberry Pi inside a physical rotary phone. The Pi needs to download the active audio files so they can be played when a user dials a number.

### How the Pi should fetch data:
Instead of trying to connect directly to the D1 database using Cloudflare API tokens (which is overly complex), the Pi should use the public HTTP API we already built.

#### Step 1: Get the Directory Map
The Pi should make a standard `GET` request to the directory endpoint:
```http
GET https://rotary-backend.<your-subdomain>.workers.dev/api/directory
```
This returns a JSON array of all claimed numbers and their actively deployed recording descriptions. However, to get the actual *filenames* for downloading, you should hit the history endpoint for each number, or ideally, add a new specific endpoint for the Pi.

*AI/Developer Note:* To make the Pi's job easier, you should create a new backend route (e.g., `/api/pi-sync`) that runs this SQL query to get exactly what the Pi needs in one request:
```sql
SELECT n.phone_number, r.audio_filename 
FROM numbers n 
JOIN recordings r ON n.deployed_recording_id = r.id
```

#### Step 2: Download the Audio Files
Once the Pi knows the `audio_filename` for the active deployment of a number, it can download the raw audio file directly from Cloudflare R2 via the backend:
```http
GET https://rotary-backend.<your-subdomain>.workers.dev/api/audio/<audio_filename>
```
*(If the file is marked private, the Pi will need to append `?pw=<password>` to the URL, or you can update the backend to allow an `Admin-Password` header to bypass the password check for the Pi).*

#### Example Python Script for the Raspberry Pi
```python
import requests
import os

API_URL = "[https://rotary-backend.rkey13.workers.dev](https://rotary-backend.rkey13.workers.dev)"
DOWNLOAD_DIR = "/home/pi/rotary_audio"

def sync_rotary_audio():
    # 1. Fetch all history/directory data (assumes you make a /api/pi-sync route later)
    # For now, let's pretend we have a list of filenames to download:
    # This logic will fetch the audio file and save it locally.
    
    filename = "5551234_1710000000.webm" # Example
    phone_number = "5551234"
    
    print(f"Downloading audio for {phone_number}...")
    response = requests.get(f"{API_URL}/api/audio/{filename}")
    
    if response.status_code == 200:
        # Save it locally on the Pi using the phone number as the file name
        # so the rotary dial script knows exactly what file to play (e.g. 5551234.webm)
        ext = filename.split('.')[-1]
        local_path = os.path.join(DOWNLOAD_DIR, f"{phone_number}.{ext}")
        
        with open(local_path, "wb") as f:
            f.write(response.content)
        print("Success!")
    else:
        print("Failed to download or unauthorized.")

if __name__ == "__main__":
    if not os.path.exists(DOWNLOAD_DIR):
        os.makedirs(DOWNLOAD_DIR)
    sync_rotary_audio()
```

### Audio Playback on the Pi
The backend stores files as either `.webm` (from Android/Chrome) or `.m4a`/`.mp4` (from iOS/Safari). 
When writing the playback script on the Raspberry Pi, ensure you use a media player that supports both formats natively (such as `vlc`, `mpv`, or `ffplay`).
