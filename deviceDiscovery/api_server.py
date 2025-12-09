"""
programmer: Richie Delgado
-------------------------------------------------------
FastAPI server for device discovery.
Provides endpoints to run discovery and retrieve results.
"""
import os
import json
import subprocess
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from typing import Dict, Any

# Get the directory where this script is located
BASE_DIR = Path(__file__).parent
DISCOVERY_JSON_PATH = BASE_DIR / "discovery.json"
MAIN_PY_PATH = BASE_DIR / "main.py"

app = FastAPI(title="Device Discovery API")

# Enable CORS for frontend (including Electron)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative React dev server
        "http://localhost:5174",  # Alternative Vite port
        "http://127.0.0.1:5173",  # Alternative localhost format
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,  # Set to False to avoid CORS issues with wildcard-like behavior
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "running",
        "service": "Device Discovery API",
        "endpoints": {
            "POST /run-discovery": "Run device discovery script",
            "GET /discovery.json": "Get discovery results"
        }
    }


@app.post("/run-discovery")
async def run_discovery() -> Dict[str, Any]:
    """
    Run the device discovery script (main.py).
    This executes the full discovery process and generates discovery.json.
    """
    print("=" * 60)
    print("POST /run-discovery - Starting device discovery")
    print(f"Script path: {MAIN_PY_PATH}")
    
    # Check if main.py exists
    if not MAIN_PY_PATH.exists():
        error_msg = f"Python script not found at: {MAIN_PY_PATH}"
        print(f"ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)
    
    try:
        # Determine Python command based on platform
        python_cmd = "python" if sys.platform == "win32" else "python3"
        
        print(f"Using Python command: {python_cmd}")
        print(f"Script path: {MAIN_PY_PATH}")
        print(f"Working directory: {BASE_DIR}")
        print("Running discovery script...")
        
        # Run the Python script
        # Use subprocess.run with capture_output to get results
        # Pass environment variables to ensure proper execution
        env = os.environ.copy()
        env['PYTHONPATH'] = str(BASE_DIR)  # Ensure Python can find local modules
        env['PYTHONIOENCODING'] = 'utf-8'  # Force UTF-8 encoding to handle Unicode characters
        env['PYTHONLEGACYWINDOWSSTDIO'] = '0'  # Use UTF-8 on Windows
        
        result = subprocess.run(
            [python_cmd, str(MAIN_PY_PATH)],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            encoding='utf-8',  # Explicitly set UTF-8 encoding
            errors='replace',  # Replace problematic characters instead of failing
            shell=(sys.platform == "win32"),  # Use shell on Windows
            env=env  # Pass environment variables
        )
        
        # Print ALL output for debugging - this is crucial
        print("\n" + "=" * 60)
        print("PYTHON SCRIPT OUTPUT:")
        print("=" * 60)
        if result.stdout:
            print("[Python stdout]:")
           # print(result.stdout)
        else:
            print("[Python stdout]: (empty)")
        if result.stderr:
            print("[Python stderr]:")
            print(result.stderr)
        else:
            print("[Python stderr]: (empty)")
        print(f"Exit code: {result.returncode}")
        print("=" * 60 + "\n")
        
        # Note: main.py may exit with code 0 even if no devices found
        # Check the output to see what actually happened
        if result.returncode != 0:
            error_msg = f"Python script failed with exit code {result.returncode}"
            print(f"ERROR: {error_msg}")
            raise HTTPException(
                status_code=500,
                detail={
                    "message": error_msg,
                    "stderr": result.stderr,
                    "stdout": result.stdout
                }
            )
        
        # Wait a moment for file to be written
        import time
        time.sleep(2)  # Increased wait time
        
        # Check if discovery.json was created
        if DISCOVERY_JSON_PATH.exists():
            try:
                with open(DISCOVERY_JSON_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    device_count = len(data.get("devices", []))
                    print(f"Discovery complete! Found {device_count} devices")
                    print("=" * 60)
                    
                    # Include the script output in the response for debugging
                    return {
                        "success": True,
                        "message": "Discovery completed",
                        "deviceCount": device_count,
                        "stdout": result.stdout,  # Include output for debugging
                        "stderr": result.stderr if result.stderr else None
                    }
            except json.JSONDecodeError as e:
                error_msg = f"Failed to parse discovery.json: {str(e)}"
                print(f"ERROR: {error_msg}")
                raise HTTPException(status_code=500, detail=error_msg)
        else:
            # Script ran but didn't create discovery.json - check output
            warning_msg = "Script completed but discovery.json was not created"
            print(f"WARNING: {warning_msg}")
            print(f"Script output: {result.stdout}")
            print(f"Script errors: {result.stderr}")
            
            return {
                "success": False,
                "message": warning_msg,
                "deviceCount": 0,
                "stdout": result.stdout,  # Include output for debugging
                "stderr": result.stderr if result.stderr else None
            }
            
    except Exception as e:
        error_msg = f"Failed to run discovery script: {str(e)}"
        print(f"ERROR: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)


@app.get("/discovery.json")
async def get_discovery_json():
    """
    Get the discovery results as JSON.
    Returns the contents of discovery.json file.
    """
    print("GET /discovery.json - Request received")
    
    if not DISCOVERY_JSON_PATH.exists():
        print("discovery.json not found, returning empty devices array")
        return JSONResponse(
            content={"devices": []},
            headers={"Content-Type": "application/json"}
        )
    
    try:
        with open(DISCOVERY_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            device_count = len(data.get("devices", []))
            print(f"Successfully read discovery.json, found {device_count} devices")
            return JSONResponse(
                content=data,
                headers={"Content-Type": "application/json"}
            )
    except json.JSONDecodeError as e:
        error_msg = f"Failed to parse discovery.json: {str(e)}"
        print(f"ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        error_msg = f"Error reading discovery.json: {str(e)}"
        print(f"ERROR: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


if __name__ == "__main__":
    import uvicorn
    print("Starting Device Discovery API server...")
    print(f"Discovery JSON path: {DISCOVERY_JSON_PATH}")
    print(f"Main script path: {MAIN_PY_PATH}")
    print("Server will run on http://localhost:3002")
    uvicorn.run(app, host="0.0.0.0", port=3002, log_level="info")

    

