"""
Windows-specific device discovery adapter.
Uses ARP scanning, SSDP (M-SEARCH), mDNS, and network interface detection.
Note: Windows requires Npcap to be installed for Scapy to work.
"""
import platform
from discovery_store import DiscoveryStore


import subprocess
import socket
import re
import struct
from typing import List, Dict, Optional
from urllib.parse import urlparse
try:
    from scapy.all import ARP, Ether, srp, conf
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False
    print("Warning: Scapy not available. Install Npcap for full functionality.")
import psutil
import netaddr
from netaddr import IPNetwork, IPAddress, EUI
try:
    from zeroconf import ServiceBrowser, Zeroconf, ServiceListener
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False
from base import DeviceDiscoveryAdapter, Device


class WindowsAdapter(DeviceDiscoveryAdapter):
    """Windows implementation of device discovery."""
    
    def __init__(self):
        """Scapy and ZeroConf configuration."""
        if ZEROCONF_AVAILABLE:
            self.zeroconf = Zeroconf()
        else:
            self.zeroconf = None
        self.discovered_services = {}
        self.store = DiscoveryStore()
        try:
            self.store.set_os(f"{platform.system()}) {platform.release()}")
        except Exception:
            pass
        
        # Configure Scapy for Windows
        if SCAPY_AVAILABLE:
            # Try to set the interface automatically
            try:
                # Get default gateway interface
                interfaces = psutil.net_if_addrs()
                for iface_name in interfaces.keys():
                    if 'Ethernet' in iface_name or 'Wi-Fi' in iface_name or 'Wireless' in iface_name:
                        conf.iface = iface_name
                        print(f"Scapy configured to use interface: {iface_name}")
                        break
            except Exception as e:
                print(f"Warning: Could not auto-configure Scapy interface: {e}")
                print("You may need to run as administrator for active scanning to work.")
    
    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        """Get all network interfaces and their IP addresses/subnets on Windows."""
        interfaces = []
        
        print("Detecting network interfaces...")
        for interface_name, addrs in psutil.net_if_addrs().items():
            # Skip only loopback interfaces (keep virtual interfaces like VirtualBox, they might have real networks)
            if 'Loopback' in interface_name:
                print(f"  Skipping loopback interface: {interface_name}")
                continue
                
            for addr in addrs:
                if addr.family == socket.AF_INET:  # IPv4
                    ip = addr.address
                    netmask = addr.netmask
                    
                    # Skip link-local addresses
                    if ip.startswith('169.254.'):
                        print(f"  Skipping link-local address on {interface_name}: {ip}")
                        continue
                    
                    try:
                        # Calculate network CIDR from IP and netmask
                        # Convert netmask to prefix length
                        netmask_obj = IPAddress(netmask)
                        # Count the number of 1 bits in the netmask to get prefix length
                        prefix_len = bin(int(netmask_obj)).count('1')
                        
                        # Create network object using IP and prefix length
                        network = IPNetwork(f"{ip}/{prefix_len}")
                        network_cidr = str(network.network) + '/' + str(network.prefixlen)
                        
                        interfaces.append({
                            'interface': interface_name,
                            'ip': ip,
                            'netmask': netmask,
                            'network': network_cidr
                        })
                        print(f"  Found interface: {interface_name} - IP: {ip}, Network: {network_cidr}")

                        self.store.add_interface(name=interface_name, ip = ip, network = network_cidr)
                    except Exception as e:
                        print(f"  Error processing interface {interface_name}: {e}")
                        import traceback
                        traceback.print_exc()
                        continue
        
        if not interfaces:
            print("  WARNING: No network interfaces found!")
        else:
            print(f"  Total interfaces found: {len(interfaces)}")
        
        return interfaces
    
    def scan_network(self, network: str, iface_name: Optional[str] = None, timeout: int = 2) -> List[Device]:
        """Scan a network using active ARP requests on Windows."""
        devices = []
        
        # Try active ARP scanning with Scapy first (requires Npcap and admin privileges)
        if SCAPY_AVAILABLE:
            try:
                print(f"  Attempting active ARP scan (requires admin privileges)...")
                # Create ARP request packet for the entire network
                arp_request = ARP(pdst=network)
                broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
                arp_request_broadcast = broadcast / arp_request
                
                # Send ARP requests and receive responses
                # srp sends packets and waits for responses
                answered_list, unanswered_list = srp(
                    arp_request_broadcast, 
                    timeout=timeout, 
                    verbose=False,
                    retry=2
                )
                
                print(f"  Active scan: {len(answered_list)} devices responded, {len(unanswered_list)} did not respond")
                
                for element in answered_list:
                    ip = element[1].psrc
                    mac = element[1].hwsrc
                    
                    # Get vendor from MAC address OUI
                    vendor = self._get_vendor_from_mac(mac)
                    
                    # Try to get hostname
                    hostname = self._get_hostname(ip)
                    
                    device = Device(
                        ip_address=ip,
                        mac_address=mac,
                        hostname=hostname,
                        vendor=vendor,
                        os_type=None
                    )
                    devices.append(device)
                    
                    self.store.upsert_device(
                         ip=ip,
                         hostname=hostname,
                         mac=mac,
                         vendor=vendor,
                         iface=iface_name,
                         discovered_via=["ARP"]
                     )
                
                # If we found devices with active scanning, return them
                if devices:
                    print(f"  Active ARP scan successful! Found {len(devices)} device(s)")
                    return devices
                else:
                    print(f"  Active scan found no devices, falling back to ARP table...")
            
            except PermissionError:
                print(f"  Active scan failed: Requires administrator privileges. Falling back to ARP table...")
            except Exception as e:
                print(f"  Active scan failed: {e}. Falling back to ARP table...")
        
        # Fallback to ARP table method if Scapy not available or failed
        if not SCAPY_AVAILABLE:
            print(f"  Scapy not available (Npcap not installed). Using ARP table method...")
        
        return self._scan_network_arp_table(network, iface_name=iface_name)
    
    def _scan_network_arp_table(self, network: str, iface_name: Optional[str] = None) -> List[Device]:
        """Fallback method using Windows ARP table."""
        devices = []
        
        try:
            print(f"  Reading ARP table for network {network}...")
            # Get ARP table
            result = subprocess.run(
                ['arp', '-a'],
                capture_output=True,
                text=True,
                timeout=5,
                shell=True  # Windows needs shell=True
            )
            
            if result.returncode != 0:
                print(f"  ARP command failed with return code {result.returncode}")
                print(f"  Error output: {result.stderr}")
                return devices
            
            # Debug: Show raw ARP output (first few lines)
            arp_lines = result.stdout.split('\n')
            print(f"  ARP table contains {len(arp_lines)} lines")
            if len(arp_lines) > 0 and len(arp_lines) <= 10:
                print("  ARP table preview:")
                for i, line in enumerate(arp_lines[:5]):
                    print(f"    {i+1}: {line}")
            elif len(arp_lines) > 10:
                print("  ARP table preview (first 5 lines):")
                for i, line in enumerate(arp_lines[:5]):
                    print(f"    {i+1}: {line}")
            
            # Parse ARP table output
            # Windows format examples:
            # "  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic"
            # "  192.168.1.1           aa-bb-cc-dd-ee-ff     static"
            network_obj = IPNetwork(network)
            print(f"  Looking for devices in network: {network_obj} (input: {network})")
            print(f"  Network range: {network_obj.network} to {network_obj.broadcast}")
            
            lines_processed = 0
            matches_found = 0
            for line in result.stdout.split('\n'):
                lines_processed += 1
                original_line = line
                line = line.strip()
                
                # Skip empty lines
                if not line:
                    continue
                
                # Skip interface headers
                if line.startswith('Interface:'):
                    print(f"    Found interface section: {line}")
                    continue
                
                # Skip column headers
                if 'Internet Address' in line and 'Physical Address' in line:
                    continue
                
                # Skip invalid or incomplete entries
                if 'incomplete' in line.lower() or 'invalid' in line.lower():
                    continue
                
                # Match IP address and MAC address (Windows uses dashes)
                # Pattern: IP address, then whitespace (variable), then MAC with dashes, then optional type
                # Example: "  192.168.1.1           44-d4-53-85-6c-a2     dynamic"
                # More flexible pattern to handle variable spacing - use \s+ for multiple spaces
                # The pattern should match: IP, whitespace, MAC (with dashes or colons), whitespace, type (dynamic/static)
                match = re.match(r'^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2})\s+(\w+)', line, re.IGNORECASE)
                if match:
                    matches_found += 1
                    ip = match.group(1)
                    mac_raw = match.group(2)
                    entry_type = match.group(3).lower() if match.group(3) else None
                    mac = mac_raw.replace('-', ':')  # Normalize to colons
                    
                    # Debug: show all matched IPs
                    print(f"    Processing matched entry: {ip} ({mac}) [Type: {entry_type}]")
                    
                    # IMPORTANT: Process both dynamic AND static entries
                    # Dynamic entries are actual devices that have communicated recently
                    # Static entries are usually multicast/broadcast, but we filter those by IP/MAC
                    
                    # Skip broadcast and multicast addresses (regardless of type)
                    ##if mac == '00:00:00:00:00:00' or mac.startswith('ff:ff:ff') or mac.startswith('01:00:5e'):
                    ##    print(f"    Skipping broadcast/multicast MAC: {ip} ({mac})")
                    ##    continue
                    ##
                    ### Skip multicast/broadcast IPs (regardless of type)
                    ##if ip.startswith('224.') or ip.startswith('239.') or ip.startswith('255.'):
                    ##    print(f"    Skipping multicast/broadcast IP: {ip}")
                    ##    continue
                    
                    # Check if IP is in the target network
                    try:
                        # Convert IP string to IPAddress object for proper network membership check
                        ip_addr = IPAddress(ip)
                        if ip_addr in network_obj:
                            # Include both dynamic and static entries that are in the network
                            print(f"    ✓ Found device: {ip} ({mac}) [Type: {entry_type}]")
                            vendor = self._get_vendor_from_mac(mac)
                            hostname = self._get_hostname(ip)
                            
                            device = Device(
                                ip_address=ip,
                                mac_address=mac,
                                hostname=hostname,
                                vendor=vendor
                            )
                            devices.append(device)
                            # Structured output (Option 1)
                            self.store.upsert_device(
                                ip=ip,
                                hostname=hostname,
                                mac=mac,
                                vendor=vendor,
                                iface=iface_name,
                                discovered_via=["ARP"]
                            )
                        else:
                            print(f"    Device {ip} is not in target network {network} (network is {network_obj})")
                    except Exception as e:
                        print(f"    Error processing device {ip}: {e}")
                        import traceback
                        traceback.print_exc()
                        continue
                else:
                    # Try a more lenient pattern if the first one didn't match
                    # Some ARP table entries might have different formatting
                    lenient_match = re.search(r'(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2})', line, re.IGNORECASE)
                    if lenient_match and 'Interface:' not in line and 'Internet Address' not in line:
                        print(f"    Line matched with lenient pattern: '{line}'")
                        # Process it with lenient match
                        ip = lenient_match.group(1)
                        mac_raw = lenient_match.group(2)
                        mac = mac_raw.replace('-', ':')
                        
                        # Check if it's a valid device (not broadcast/multicast)
                        if not (mac.startswith('ff:ff:ff') or mac.startswith('01:00:5e') or 
                                ip.startswith('224.') or ip.startswith('239.') or ip.startswith('255.')):
                            try:
                                ip_addr = IPAddress(ip)
                                if ip_addr in network_obj:
                                    print(f"    ✓ Found device (lenient match): {ip} ({mac})")
                                    vendor = self._get_vendor_from_mac(mac)
                                    hostname = self._get_hostname(ip)
                                    
                                    device = Device(
                                        ip_address=ip,
                                        mac_address=mac,
                                        hostname=hostname,
                                        vendor=vendor
                                    )
                                    devices.append(device)
                            except Exception:
                                pass
                    else:
                        # Debug: show lines that don't match either pattern
                        if line and not line.startswith('Interface:') and 'Internet Address' not in line:
                            print(f"    Line did not match pattern: '{line}'")
            
            print(f"  Processed {lines_processed} ARP table lines, {matches_found} matches found, {len(devices)} valid devices in target network")
        
        except Exception as e:
            print(f"  Error reading ARP table: {e}")
            import traceback
            traceback.print_exc()
        
        return devices
    
    def discover_devices(self, timeout: int = 2) -> List[Device]:
        """Discover all devices on all local networks."""
        all_devices = {}
        
        print("\n=== Starting Device Discovery ===\n")
        
        # Get all network interfaces
        interfaces = self.get_local_network_interfaces()
        
        if not interfaces:
            print("ERROR: No network interfaces found. Cannot discover devices.")
            return []
        
        # Scan each network
        for iface_info in interfaces:
            network = iface_info['network']
            print(f"\nScanning network: {network} on interface {iface_info['interface']}")
            
            # Method will be determined in scan_network (active scan or ARP table)
            
            devices = self.scan_network(network, iface_name=iface_info['interface'], timeout=timeout)
            print(f"  Found {len(devices)} device(s) on this network")
            
            # Use IP as key to avoid duplicates
            for device in devices:
                all_devices[device.ip_address] = device
        
        # Discover SSDP devices (UPnP/DLNA devices)
        print("\nDiscovering SSDP services (M-SEARCH broadcast)...")
        try:
            ssdp_devices = self._discover_ssdp_services(timeout=3)
            print(f"  Found {len(ssdp_devices)} device(s) via SSDP")
            for device in ssdp_devices:
                if device.ip_address not in all_devices:
                    all_devices[device.ip_address] = device
                else:
                    # Merge SSDP information into existing device
                    existing = all_devices[device.ip_address]
                    # Merge hostname
                    if device.hostname and not existing.hostname:
                        existing.hostname = device.hostname
                    # Merge vendor info (SSDP server field often has better vendor info)
                    if device.vendor and (not existing.vendor or len(device.vendor) > len(existing.vendor)):
                        existing.vendor = device.vendor
                    # Merge services (avoid duplicates)
                    if device.services:
                        if not existing.services:
                            existing.services = []
                        for service in device.services:
                            if service not in existing.services:
                                existing.services.append(service)
        except Exception as e:
            print(f"  Error during SSDP discovery: {e}")
            import traceback
            traceback.print_exc()
        
        # Discover mDNS services if available
        if self.zeroconf:
            print("\nDiscovering mDNS/Bonjour services...")
            try:
                mDNS_devices = self._discover_mdns_services()
                print(f"  Found {len(mDNS_devices)} device(s) via mDNS")
                for device in mDNS_devices:
                    if device.ip_address not in all_devices:
                        all_devices[device.ip_address] = device
                    else:
                        # Merge service information
                        existing = all_devices[device.ip_address]
                        if device.hostname and not existing.hostname:
                            existing.hostname = device.hostname
                        if device.services:
                            existing.services.extend(device.services)
            except Exception as e:
                print(f"  Error during mDNS discovery: {e}")
        
        print(f"\n=== Discovery Complete: {len(all_devices)} total device(s) ===\n")

        #Generate a JSON file for react to gather data from
        try:
            self.store.save_json("discovery.json")
            print('Saves structured output to discovery.json.')
        except Exception as e:
            print(f"WARNING: could not save discovery.json: {e}")

        return list(all_devices.values())
    
    def get_device_info(self, ip_address: str) -> Optional[Device]:
        """Get detailed information about a specific device."""
        # Try to get hostname
        hostname = self._get_hostname(ip_address)
        
        # Try ARP lookup for MAC address
        mac = self._get_mac_from_arp(ip_address)
        
        vendor = None
        if mac:
            vendor = self._get_vendor_from_mac(mac)
        
        if hostname or mac:
            return Device(
                ip_address=ip_address,
                mac_address=mac,
                hostname=hostname,
                vendor=vendor
            )
        
        return None
    
    def _get_hostname(self, ip_address: str) -> Optional[str]:
        """Get hostname from IP address using reverse DNS."""
        try:
            hostname, _, _ = socket.gethostbyaddr(ip_address)
            return hostname
        except Exception:
            return None
    
    def _get_mac_from_arp(self, ip_address: str) -> Optional[str]:
        """Get MAC address from ARP table using arp command."""
        try:
            result = subprocess.run(
                ['arp', '-a', ip_address],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode == 0:
                # Parse output: "  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic"
                match = re.search(r'([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})', result.stdout, re.IGNORECASE)
                if match:
                    return match.group(0).replace('-', ':')
        except Exception:
            pass
        
        return None
    
    def _get_vendor_from_mac(self, mac_address: str) -> Optional[str]:
        """Get vendor name from MAC address OUI."""
        try:
            mac = EUI(mac_address)
            oui = mac.oui
            return str(oui.registration().org) if oui.registration() else None
        except Exception:
            return None
    
    def _discover_ssdp_services(self, timeout: int = 3) -> List[Device]:
        """
        Discover devices using SSDP M-SEARCH broadcast.
        SSDP (Simple Service Discovery Protocol) is used by UPnP/DLNA devices.
        """
        devices = []
        ssdp_multicast = "239.255.255.250"
        ssdp_port = 1900
        
        # M-SEARCH request message
        msearch_message = (
            "M-SEARCH * HTTP/1.1\r\n"
            "HOST: 239.255.255.250:1900\r\n"
            "MAN: \"ssdp:discover\"\r\n"
            "ST: ssdp:all\r\n"
            "MX: 3\r\n"
            "\r\n"
        ).encode('utf-8')
        
        try:
            # Create UDP socket for SSDP
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
            sock.settimeout(timeout)
            
            # Send M-SEARCH broadcast
            print(f"  Sending SSDP M-SEARCH broadcast to {ssdp_multicast}:{ssdp_port}")
            sock.sendto(msearch_message, (ssdp_multicast, ssdp_port))
            
            # Collect responses
            responses = {}
            import time
            start_time = time.time()
            
            try:
                while (time.time() - start_time) < timeout:
                    try:
                        sock.settimeout(timeout - (time.time() - start_time))
                        data, addr = sock.recvfrom(4096)
                        ip_address = addr[0]
                        
                        # Parse SSDP response
                        response_text = data.decode('utf-8', errors='ignore')
                        device_info = self._parse_ssdp_response(response_text, ip_address)
                        
                        if device_info:
                            # Use IP as key to avoid duplicates
                            # If we already have this IP, merge the device info
                            if ip_address not in responses:
                                responses[ip_address] = device_info
                                server_info = device_info.get('server', 'Unknown')
                                print(f"    Found SSDP device: {ip_address} - {server_info}")
                            else:
                                # Merge additional info from this response
                                existing_info = responses[ip_address]
                                # Update with better server info if available
                                if device_info.get('server') and (not existing_info.get('server') or len(device_info.get('server', '')) > len(existing_info.get('server', ''))):
                                    existing_info['server'] = device_info.get('server')
                                # Merge ST (service type) if different
                                if device_info.get('st') and device_info.get('st') != existing_info.get('st'):
                                    # Store multiple STs if needed
                                    if 'st_list' not in existing_info:
                                        existing_info['st_list'] = [existing_info.get('st')] if existing_info.get('st') else []
                                    if device_info.get('st') not in existing_info['st_list']:
                                        existing_info['st_list'].append(device_info.get('st'))
                    except socket.timeout:
                        break
                    except Exception as e:
                        # Continue listening for more responses
                        if (time.time() - start_time) < timeout:
                            continue
                        else:
                            break
            finally:
                sock.close()
            
            # Convert responses to Device objects
            # Group by IP to handle multiple SSDP responses from same device
            device_info_by_ip = {}
            for ip, info in responses.items():
                if ip not in device_info_by_ip:
                    device_info_by_ip[ip] = {
                        'services': set(),  # Use set to avoid duplicate services
                        'hostname': info.get('server') or info.get('location_hostname'),
                        'vendor': info.get('server')
                    }
                
                # Add services from this response
                if info.get('st'):
                    device_info_by_ip[ip]['services'].add(f"SSDP:{info['st']}")
                # Also check for st_list if multiple service types were found
                if info.get('st_list'):
                    for st in info['st_list']:
                        device_info_by_ip[ip]['services'].add(f"SSDP:{st}")
                if info.get('usn'):
                    device_info_by_ip[ip]['services'].add(f"USN:{info['usn']}")
                
                # Update hostname/vendor if we have better info
                if info.get('server') and (not device_info_by_ip[ip]['hostname'] or len(info.get('server', '')) > len(device_info_by_ip[ip]['hostname'] or '')):
                    device_info_by_ip[ip]['hostname'] = info.get('server')
                    device_info_by_ip[ip]['vendor'] = info.get('server')
            
            # Create Device objects (one per IP)
            for ip, device_info in device_info_by_ip.items():
                services_list = list(device_info['services']) if device_info['services'] else None
                device = Device(
                    ip_address=ip,
                    hostname=device_info['hostname'],
                    vendor=device_info['vendor'],
                    services=services_list
                )
                devices.append(device)
                self.store.upsert_device(
                    ip=ip,
                    hostname=device_info['hostname'],
                    vendor=device_info['vendor'],
                    services=services_list,
                    discovered_via=["SSDP"]
                )
        
        except Exception as e:
            print(f"  Error during SSDP discovery: {e}")
            import traceback
            traceback.print_exc()
        
        return devices
    
    def _parse_ssdp_response(self, response_text: str, ip_address: str) -> Optional[Dict[str, str]]:
        """Parse SSDP response headers."""
        info = {}
        lines = response_text.split('\r\n')
        
        for line in lines:
            if ':' in line:
                key, value = line.split(':', 1)
                key = key.strip().lower()
                value = value.strip()
                
                if key == 'server':
                    info['server'] = value
                elif key == 'st' or key == 'nt':  # Search Target or Notification Type
                    info['st'] = value
                elif key == 'usn':  # Unique Service Name
                    info['usn'] = value
                elif key == 'location':
                    # Parse location URL to extract hostname
                    try:
                        parsed = urlparse(value)
                        info['location'] = value
                        info['location_hostname'] = parsed.hostname or ip_address
                    except Exception:
                        info['location'] = value
                elif key == 'cache-control':
                    info['cache_control'] = value
        
        return info if info else None
    
    def _discover_mdns_services(self) -> List[Device]:
        """Discover devices via mDNS."""
        if not self.zeroconf:
            return []
        
        devices = []
        
        class DeviceListener(ServiceListener):
            def __init__(self):
                self.services = {}
            
            def add_service(self, zeroconf, service_type, name):
                info = zeroconf.get_service_info(service_type, name)
                if info:
                    addresses = [str(addr) for addr in info.addresses]
                    if addresses:
                        ip = addresses[0]
                        if ip not in self.services:
                            self.services[ip] = {
                                'hostname': name.split('.')[0],
                                'services': []
                            }
                        self.services[ip]['services'].append(service_type)
            
            def remove_service(self, zeroconf, service_type, name):
                pass
            
            def update_service(self, zeroconf, service_type, name):
                pass
        
        listener = DeviceListener()
        
        # Browse common service types
        browsers = [
            ServiceBrowser(self.zeroconf, "_http._tcp.local.", listener),
            ServiceBrowser(self.zeroconf, "_ssh._tcp.local.", listener),
            ServiceBrowser(self.zeroconf, "_workstation._tcp.local.", listener)
        ]
        
        import time
        time.sleep(3)  # Give services time to respond
        
        for ip, info in listener.services.items():
            devices.append(Device(
                ip_address=ip,
                hostname=info['hostname'],
                services=info['services']
            ))

            self.store.upsert_device(
                ip=ip,
                hostname=info['hostname'],
                services=info['services'],
                discovered_via=['mDNS']
            )
        
        return devices

