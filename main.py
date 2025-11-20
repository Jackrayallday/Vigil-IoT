from discovery.mdns_listener import MDNSListener
from discovery.ssdp_handler import SSDPHandler
from discovery.active_prober import ActiveProber
from discovery.nmap_wrapper import NmapWrapper
from discovery.scapy_scanner import ScapyScanner
from analysis.discovery_store import DiscoveryStore
from analysis.device_type_identifier import DeviceTypeIdentifier
from utils.logger import log
from utils.config import OUTPUT_FILE
import time

# ANSI color codes for VS Code terminal
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

class VigilScanner:
    def __init__(self):
        self.store = DiscoveryStore()
        self.mdns = MDNSListener(self.store, debug=False)
        self.ssdp = SSDPHandler(self.store)
        self.prober = ActiveProber(self.store)

        # Nmap wrapper safe init
        try:
            self.nmap = NmapWrapper(self.store)
            self.nmap_available = True
        except Exception:
            log("[Warning] Nmap not available, skipping Nmap scans")
            self.nmap_available = False

        self.scapy = ScapyScanner(self.store)
        self.identifier = DeviceTypeIdentifier()

    def run(self):
        log("[VIGIL] Starting VIGIL IoT device scan...")

        # Passive scans
        log("[VIGIL] Running mDNS listener...")
        self.mdns.start()
        log("[SSDP] Sending discovery packets...")
        self.ssdp.discover()

        # Wait a short time to collect devices
        time.sleep(3)

        # Collect all discovered IPs
        devices = list(self.store.records.keys())
        log(f"[VIGIL] Discovered {len(devices)} devices.")

        # Active scans
        for ip in devices:
            log(f"[VIGIL] Pinging {ip}...")
            self.prober.ping(ip)

            if self.nmap_available:
                log(f"[VIGIL] Nmap scanning {ip}...")
                try:
                    self.nmap.scan(ip)
                except Exception as e:
                    log(f"[Warning] Nmap scan failed for {ip}: {e}")

            log(f"[VIGIL] ARP scanning {ip}...")
            self.scapy.scan(ip + "/32")

        # Classify devices and print detailed results
        log("[VIGIL] Classifying devices...")
        print(f"\n{Colors.BOLD}=== VIGIL IoT Scan Results ==={Colors.ENDC}\n")

        for record in self.store.get_all():
            dtype, conf = self.identifier.infer_type(record)
            record["device_type"] = dtype
            record["confidence"] = conf

            ip = record.get("ip", "Unknown")
            mac = record.get("mac", "N/A")
            status = record.get("status", "Unknown")
            source = record.get("source", "Unknown")

            # Color coding
            status_color = Colors.OKGREEN if status.lower() == "online" else Colors.FAIL
            type_color = Colors.OKCYAN
            source_color = Colors.OKBLUE

            print(f"IP: {ip}")
            print(f"MAC: {mac}")
            print(f"Source: {source_color}{source}{Colors.ENDC}")
            print(f"Status: {status_color}{status}{Colors.ENDC}")
            print(f"Device Type: {type_color}{dtype}{Colors.ENDC}")
            print(f"Confidence: {conf*100:.1f}%")
            print("---------------------------")

        # Save results
        self.store.save(OUTPUT_FILE)
        log(f"[VIGIL] Scan complete. Results saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    scanner = VigilScanner()
    scanner.run()
