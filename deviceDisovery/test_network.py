"""
Quick test script to debug network detection and ARP table parsing.
"""
import platform
from windows_adapter import WindowsAdapter
import subprocess

print("=" * 60)
print("Network Detection Test")
print("=" * 60)

# Create adapter
adapter = WindowsAdapter()

# Test 1: Get network interfaces
print("\n1. Testing Network Interface Detection:")
print("-" * 60)
interfaces = adapter.get_local_network_interfaces()
print(f"\nFound {len(interfaces)} interface(s):")
for iface in interfaces:
    print(f"  - {iface['interface']}: {iface['ip']} -> Network: {iface['network']}")

# Test 2: Read ARP table directly
print("\n\n2. Testing ARP Table Reading:")
print("-" * 60)
try:
    result = subprocess.run(['arp', '-a'], capture_output=True, text=True, shell=True, timeout=5)
    print(f"ARP command return code: {result.returncode}")
    print(f"ARP output length: {len(result.stdout)} characters")
    print("\nFirst 20 lines of ARP output:")
    for i, line in enumerate(result.stdout.split('\n')[:20]):
        print(f"  {i+1:2d}: {line}")
except Exception as e:
    print(f"Error running ARP: {e}")

# Test 3: Try scanning one network
if interfaces:
    print("\n\n3. Testing Network Scan:")
    print("-" * 60)
    test_network = interfaces[0]['network']
    print(f"Scanning network: {test_network}")
    devices = adapter.scan_network(test_network, timeout=2)
    print(f"\nFound {len(devices)} device(s):")
    for device in devices:
        print(f"  - {device.ip_address} ({device.mac_address}) - {device.hostname or 'No hostname'}")
else:
    print("\n\n3. Cannot test network scan - no interfaces found!")

print("\n" + "=" * 60)

