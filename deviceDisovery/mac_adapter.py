"""
programmer: Richie Delgado
-------------------------------------------------------
macOS-specific device discovery adapter.
Uses ARP scanning, mDNS/Bonjour, and network interface detection.
NEEDS MORE RESEARCH INTO OS SPECIFIC NETWORKING
"""
import subprocess
import socket
import re
from typing import List, Dict, Optional
from scapy.all import ARP, Ether, srp
import psutil
import netaddr
from netaddr import IPNetwork, EUI
from zeroconf import ServiceBrowser, Zeroconf, ServiceListener
from base import DeviceDiscoveryAdapter, Device


class MacAdapter(DeviceDiscoveryAdapter):
    """macOS implementation of device discovery."""
    
    def __init__(self):
        self.zeroconf = Zeroconf()
        self.discovered_services = {}
    
    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        """Get all network interfaces and their IP addresses/subnets on macOS."""
        interfaces = []
        
        for interface_name, addrs in psutil.net_if_addrs().items():
            # Skip loopback and link-local interfaces
            if interface_name.startswith('lo') or 'bridge' in interface_name:
                continue
                
            for addr in addrs:
                if addr.family == socket.AF_INET:  # IPv4
                    ip = addr.address
                    netmask = addr.netmask
                    
                    # Skip link-local addresses
                    if ip.startswith('169.254.'):
                        continue
                    
                    try:
                        # Calculate network CIDR
                        network = IPNetwork(f"{ip}/{netmask}", flags=netaddr.ZEROFILL)
                        interfaces.append({
                            'interface': interface_name,
                            'ip': ip,
                            'netmask': netmask,
                            'network': str(network.network) + '/' + str(network.prefixlen)
                        })
                    except Exception:
                        continue
        
        return interfaces
    
    def scan_network(self, network: str, timeout: int = 2) -> List[Device]:
        """Scan a network using ARP requests on macOS."""
        devices = []
        
        try:
            # Create ARP request packet
            arp_request = ARP(pdst=network)
            broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
            arp_request_broadcast = broadcast / arp_request
            
            # Send ARP requests and receive responses
            answered_list = srp(arp_request_broadcast, timeout=timeout, verbose=False)[0]
            
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
        
        except Exception as e:
            print(f"Error scanning network {network}: {e}")
        
        return devices
    
    def discover_devices(self, timeout: int = 2) -> List[Device]:
        """Discover all devices on all local networks."""
        all_devices = {}
        
        # Get all network interfaces
        interfaces = self.get_local_network_interfaces()
        
        # Scan each network
        for iface_info in interfaces:
            network = iface_info['network']
            print(f"Scanning network: {network} on interface {iface_info['interface']}")
            devices = self.scan_network(network, timeout)
            
            # Use IP as key to avoid duplicates
            for device in devices:
                all_devices[device.ip_address] = device
        
        # Discover mDNS/Bonjour services (macOS has excellent Bonjour support)
        mDNS_devices = self._discover_mdns_services()
        for device in mDNS_devices:
            if device.ip_address not in all_devices:
                all_devices[device.ip_address] = device
            else:
                # Merge service information
                existing = all_devices[device.ip_address]
                if device.hostname and not existing.hostname:
                    existing.hostname = device.hostname
                existing.services.extend(device.services)
        
        return list(all_devices.values())
    
    def get_device_info(self, ip_address: str) -> Optional[Device]:
        """Get detailed information about a specific device."""
        # Try to get hostname
        hostname = self._get_hostname(ip_address)
        
        # Try ARP lookup for MAC address using arp command
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
                ['arp', '-n', ip_address],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode == 0:
                # Parse output: e.g., "192.168.1.1 (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0"
                match = re.search(r'([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})', result.stdout)
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
    
    def _discover_mdns_services(self) -> List[Device]:
        """Discover devices via mDNS/Bonjour (macOS has excellent support)."""
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
        browser = ServiceBrowser(self.zeroconf, "_http._tcp.local.", listener)
        browser2 = ServiceBrowser(self.zeroconf, "_ssh._tcp.local.", listener)
        browser3 = ServiceBrowser(self.zeroconf, "_workstation._tcp.local.", listener)
        browser4 = ServiceBrowser(self.zeroconf, "_airplay._tcp.local.", listener)
        browser5 = ServiceBrowser(self.zeroconf, "_raop._tcp.local.", listener)
        
        import time
        time.sleep(3)  # Give services time to respond
        
        for ip, info in listener.services.items():
            devices.append(Device(
                ip_address=ip,
                hostname=info['hostname'],
                services=info['services']
            ))
        
        return devices

