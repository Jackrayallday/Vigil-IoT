"""
programmer: Richie Delgado
-------------------------------------------------------
Linux-specific device discovery adapter.
Uses ARP scanning, mDNS, and network interface detection.
NEEDS MORE RESEARCH INTO OS SPECIFIC NETWORKING

"""
import subprocess
import socket
import platform
from typing import List, Dict, Optional
from scapy.all import ARP, Ether, srp, get_if_list, get_if_addr
from zeroconf import ServiceBrowser, Zeroconf, ServiceListener
import psutil
import netaddr
from netaddr import IPNetwork, EUI
from base import DeviceDiscoveryAdapter, Device


class LinuxAdapter(DeviceDiscoveryAdapter):
    """Linux implementation of device discovery."""
    
    def __init__(self):
        self.zeroconf = Zeroconf()
        self.discovered_services = {}
    
    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        """Get all network interfaces and their IP addresses/subnets on Linux."""
        interfaces = []
        
        for interface_name, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == socket.AF_INET:  # IPv4
                    ip = addr.address
                    netmask = addr.netmask
                    
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
        """Scan a network using ARP requests on Linux."""
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
                    os_type=None  # Can be enhanced with OS detection
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
        
        # Discover mDNS/Bonjour services
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
        """Get MAC address from ARP table."""
        try:
            with open('/proc/net/arp', 'r') as f:
                for line in f.readlines()[1:]:  # Skip header
                    parts = line.split()
                    if len(parts) >= 4 and parts[0] == ip_address:
                        return parts[3]
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
        """Discover devices via mDNS/Bonjour."""
        devices = []
        
        class DeviceListener(ServiceListener):
            def __init__(self):
                self.services = {}
            
            def add_service(self, zeroconf, service_type, name):
                info = zeroconf.get_service_info(service_type, name)
                if info:
                    addresses = [str(addr) for addr in info.addresses]
                    if addresses:
                        self.services[addresses[0]] = {
                            'hostname': name.split('.')[0],
                            'services': [service_type]
                        }
        
        listener = DeviceListener()
        
        # Browse common service types
        browser = ServiceBrowser(self.zeroconf, "_http._tcp.local.", listener)
        browser2 = ServiceBrowser(self.zeroconf, "_ssh._tcp.local.", listener)
        browser3 = ServiceBrowser(self.zeroconf, "_workstation._tcp.local.", listener)
        
        import time
        time.sleep(3)  # Give services time to respond
        
        for ip, info in listener.services.items():
            devices.append(Device(
                ip_address=ip,
                hostname=info['hostname'],
                services=info['services']
            ))
        
        return devices

