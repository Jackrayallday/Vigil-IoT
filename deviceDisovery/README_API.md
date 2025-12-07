# Device Discovery API Server

FastAPI server for running device discovery and serving results.

## Setup

1. Install dependencies:
```bash
pip install fastapi uvicorn[standard]
```

Or install all requirements:
```bash
pip install -r toolRequirements.txt
```

## Running the Server

Start the FastAPI server:
```bash
python api_server.py
```

Or using uvicorn directly:
```bash
uvicorn api_server:app --host 0.0.0.0 --port 3002 --reload
```

The server will run on `http://localhost:3002`

## API Endpoints

### GET /
Health check endpoint.

### POST /run-discovery
Runs the device discovery script (main.py) and generates discovery.json.

**Response:**
```json
{
  "success": true,
  "message": "Discovery completed",
  "deviceCount": 5
}
```

### GET /discovery.json
Returns the discovery results as JSON.

**Response:**
```json
{
  "meta": {...},
  "interfaces": [...],
  "devices": [...],
  "summary": {...}
}
```

## Integration

The frontend (React app) calls:
- `POST http://localhost:3002/run-discovery` when "Start Scan" is clicked
- `GET http://localhost:3002/discovery.json` to load discovered IP addresses

## Notes

- The server runs on port 3002 (separate from the Node.js backend on port 3001)
- CORS is enabled for all origins (adjust for production)
- The discovery script has a 2-minute timeout
- Results are written to `discovery.json` in the same directory

