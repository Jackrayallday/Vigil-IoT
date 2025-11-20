import json

class DeviceTypeIdentifier:
    def infer_type(self, record):
        data = json.dumps(record).lower()

        if "esp" in data or "tuya" in data:
            return ("IoT Device", 0.9)
        elif "windows" in data or "smb" in data:
            return ("Desktop / Laptop", 0.85)
        elif "printer" in data or "_ipp._tcp" in data:
            return ("Printer", 0.95)
        elif "ipcamera" in data or "rtsp" in data:
            return ("Security Camera", 0.9)
        else:
            return ("Unknown Device", 0.3)
