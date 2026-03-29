import requests
import time
import os

# --- CONFIGURATION ---
BASE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
API_KEY = os.getenv("NIST_KEY") #Look for the NIST API key that is stored on local system.
if not API_KEY:
    print("Error: No API Key found in environment variables!")

headers = {
    "apiKey": API_KEY
}

def fetch_nvd_data(params):
    """Sends the request to NIST and handles the response."""
    try:
        response = requests.get(BASE_URL, headers=headers, params=params)
        
        # Check if the request was successful
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 403:
            print("Error 403: Check your API Key or Rate Limits.")
        else:
            print(f"Error {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"An error occurred: {e}")
    return None

# --- IMPLEMENTING THE 4 USE CASES ---

# 1. Device Scanner (Search by CPE)
params_device = {
    "cpeName": "cpe:2.3:o:tp-link:archer_c7_firmware:v2:*:*:*:*:*:*:*",
    "resultsPerPage": 5
}

# 2. Severity Filter (Critical only)
params_severity = {
    "cvssV3Severity": "CRITICAL",
    "resultsPerPage": 5
}

# 3. Exploit Radar (Known Exploited Vulnerabilities)
params_active = {
    "hasKev": "", # NIST just needs the parameter to exist
    "resultsPerPage": 5
}

# 4. New Threats (Last 30 days)
# Note: Dates must be in ISO 8601 format
params_recent = {
    "pubStartDate": "2024-01-01T00:00:00.000", 
    "pubEndDate": "2024-01-31T23:59:59.999",
    "resultsPerPage": 5
}

# --- TEST RUN ---
print("Fetching Critical IoT Vulnerabilities...")
data = fetch_nvd_data(params_severity)

if data and "vulnerabilities" in data:
    for item in data["vulnerabilities"]:
        cve_id = item["cve"]["id"]
        description = item["cve"]["descriptions"][0]["value"]
        print(f"\n[{cve_id}]\nDescription: {description[:150]}...")
