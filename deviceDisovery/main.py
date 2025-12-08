"""
Detects the operating system and uses the corresponding adapter.
"""
import platform
import sys
from typing import Optional
from base import DeviceDiscoveryAdapter, Device

import os


# Import OS-specific adapters
try:
    from linux_adapter import LinuxAdapter
except ImportError:
    LinuxAdapter = None

try:
    from mac_adapter import MacAdapter
except ImportError:
    MacAdapter = None

try:
    from windows_adapter import WindowsAdapter
except ImportError:
    WindowsAdapter = None

def get_adapter() -> Optional[DeviceDiscoveryAdapter]:
    """Returns: DeviceDiscoveryAdapter instance or None if OS not supported"""
    system = platform.system().lower()
    
    if system == 'linux':
        if LinuxAdapter is None:
            print("Error: Linux adapter not available")
            return None
        return LinuxAdapter()
    
    elif system == 'darwin':  # macOS
        if MacAdapter is None:
            print("Error: macOS adapter not available")
            return None
        return MacAdapter()
    
    elif system == 'windows':
        if WindowsAdapter is None:
            print("Error: Windows adapter not available")
            return None
        return WindowsAdapter()
    
    else:
        print(f"Unsupported operating system: {system}")
        return None


def print_device(device: Device):
    """Pretty print a device's information."""
    print(f"\n{'='*60}")
    print(f"IP Address:    {device.ip_address}")
    if device.hostname:
        print(f"Hostname:      {device.hostname}")
    if device.mac_address:
        print(f"MAC Address:   {device.mac_address}")
    if device.vendor:
        print(f"Vendor:        {device.vendor}")
    if device.os_type:
        print(f"OS Type:       {device.os_type}")
    if device.services:
        print(f"Services:      {', '.join(device.services)}")
    if device.response_time:
        print(f"Response Time: {device.response_time}ms")
    print(f"{'='*60}")

#Clear the contents of discovery.json befure run.
json_path = "discovery.json"
if os.path.exists(json_path):
    os.remove(json_path)



def main():
    """Main function to discover and display devices."""
    
    print("Device Discovery Tool")
    print(f"Operating System: {platform.system()} {platform.release()}")
    print("-" * 60)
    
    # Get the appropriate adapter
    adapter = get_adapter()
    if adapter is None:
        print("Failed to initialize device discovery adapter.")
        sys.exit(1)
    
    # Discover devices
    print("\nDiscovering devices on local network(s)...")
    print("This may take a few moments...\n")
    
    try:
        devices = adapter.discover_devices(timeout=2)
        
        if not devices:
            print("No devices found on the network.")
            return
        
        print(f"\nFound {len(devices)} device(s):\n")
        
        # Print all devices
        for i, device in enumerate(devices, 1):
            print(f"\nDevice {i}:")
            print_device(device)
        
        # Summary
        print(f"\n\nSummary:")
        print(f"Total devices discovered: {len(devices)}")
        print(f"Devices with hostnames: {sum(1 for d in devices if d.hostname)}")
        print(f"Devices with MAC addresses: {sum(1 for d in devices if d.mac_address)}")
        print(f"Devices with vendor info: {sum(1 for d in devices if d.vendor)}")
        
    except KeyboardInterrupt:
        print("\n\nScan interrupted by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\nError during device discovery: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()


