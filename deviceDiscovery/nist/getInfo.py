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

