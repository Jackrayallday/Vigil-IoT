"""
-------------------------------------------------------
Quick test script to debug network detection and ARP table parsing.
-------------------------------------------------------
"""
import platform
from windows_adapter import WindowsAdapter
import subprocess
import time

print("=" * 60)
print("VIGIL - Network Detection Test")
print("=" * 60)

start_time = time.time()

# Create adapter
adapter = WindowsAdapter()

# -------------------------------
# Test 1: Network Interfaces
# -------------------------------
print("\n1. Testing Network Interface Detection:")
print("-" * 60)

try:
    interfaces = adapter.get_local_network_interfaces()
    print(f"\nFound {len(interfaces)} interface(s):")

    for iface in interfaces:
        print(f"  - {iface['interface']}: {iface['ip']} -> Network: {iface['network']}")

except Exception as e:
    print(f"ERROR in interface detection: {e}")
    interfaces = []

# -------------------------------
# Test 2: ARP Table
# -------------------------------
print("\n\n2. Testing ARP Table Reading:")
print("-" * 60)

try:
    result = subprocess.run(['arp', '-a'], capture_output=True, text=True, shell=True, timeout=5)

    print(f"ARP command return code: {result.returncode}")
    print(f"ARP output length: {len(result.stdout)} characters")

    print("\nFirst 10 lines of ARP output:")
    for i, line in enumerate(result.stdout.split('\n')[:10]):
        print(f"  {i+1:2d}: {line}")

except Exception as e:
    print(f"ERROR running ARP: {e}")

# -------------------------------
# Test 3: Network Scan
# -------------------------------
print("\n\n3. Testing Network Scan:")
print("-" * 60)

total_devices = 0

if interfaces:
    try:
        test_network = interfaces[0]['network']
        print(f"Scanning network: {test_network}")

        devices = adapter.scan_network(test_network, timeout=2)

        total_devices = len(devices)

        print(f"\nFound {total_devices} device(s):")
        for device in devices:
            print(f"  - {device.ip_address} | {device.mac_address} | {device.hostname or 'No hostname'}")

    except Exception as e:
        print(f"ERROR during network scan: {e}")
else:
    print("No interfaces found, skipping scan.")

# -------------------------------
# Final Summary
# -------------------------------
end_time = time.time()

print("\n" + "=" * 60)
print("Test Summary")
print("=" * 60)
print(f"Interfaces detected: {len(interfaces)}")
print(f"Devices found: {total_devices}")
print(f"Test duration: {end_time - start_time:.2f} seconds")
print("=" * 60)