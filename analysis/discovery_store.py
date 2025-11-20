import json
from datetime import datetime

class DiscoveryStore:
    def __init__(self):
        self.records = {}

    def add(self, ip, data):
        if ip not in self.records:
            self.records[ip] = {"ip": ip, "details": []}
        self.records[ip]["details"].append({
            "timestamp": datetime.now().isoformat(),
            **data
        })

    def get_all(self):
        return list(self.records.values())

    def save(self, filename="scan_results.json"):
        with open(filename, "w") as f:
            json.dump(self.get_all(), f, indent=4)
