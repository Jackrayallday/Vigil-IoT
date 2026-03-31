"""
macOS-specific device discovery adapter.
Uses ARP scanning, mDNS/Bonjour, and network interface detection.
"""
import subprocess
import socket
import re
from typing import List, Dict, Optional

try:
    from scapy.all import ARP, Ether, srp
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False
    print("Warning: Scapy not available on macOS")

import psutil
import netaddr
from netaddr import IPNetwork, EUI

try:
    from zeroconf import ServiceBrowser, Zeroconf, ServiceListener
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False
    print("Warning: Zeroconf not available on macOS")

from base import DeviceDiscoveryAdapter, Device


class MacAdapter(DeviceDiscoveryAdapter):
    """macOS implementation of device discovery."""

    def __init__(self):
        self.zeroconf = Zeroconf() if ZEROCONF_AVAILABLE else None
        self.discovered_services = {}

    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        """Get all network interfaces and their IP addresses/subnets on macOS."""
        interfaces = []

        try:
            for interface_name, addrs in psutil.net_if_addrs().items():
                # Skip loopback and bridge interfaces
                if interface_name.startswith('lo') or 'bridge' in interface_name:
                    continue

                for addr in addrs:
                    if addr.family == socket.AF_INET:
                        ip = addr.address
                        netmask = addr.netmask

                        # Skip link-local addresses
                        if ip.startswith('169.254.'):
                            continue

                        try:
                            network = IPNetwork(f"{ip}/{netmask}", flags=netaddr.ZEROFILL)
                            interfaces.append({
                                'interface': interface_name,
                                'ip': ip,
                                'netmask': netmask,
                                'network': str(network.network) + '/' + str(network.prefixlen)
                            })
                        except Exception:
                            continue
        except Exception as e:
            print(f"Interface detection error: {e}")

        return interfaces

    def scan_network(self, network: str, timeout: int = 2) -> List[Device]:
        """Scan a network using ARP requests on macOS."""
        devices = []

        if not SCAPY_AVAILABLE:
            print("Scapy not available, skipping ARP scan")
            return devices

        try:
            arp_request = ARP(pdst=network)
            broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
            arp_request_broadcast = broadcast / arp_request

            answered_list = srp(arp_request_broadcast, timeout=timeout, verbose=False)[0]

            for element in answered_list:
                ip = element[1].psrc
                mac = element[1].hwsrc

                vendor = self._get_vendor_from_mac(mac)
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

        interfaces = self.get_local_network_interfaces()

        for iface_info in interfaces:
            network = iface_info['network']
            print(f"Scanning network: {network} on interface {iface_info['interface']}")

            try:
                devices = self.scan_network(network, timeout)
            except Exception as e:
                print(f"ERROR scanning network {network}: {e}")
                devices = []

            for device in devices:
                all_devices[device.ip_address] = device

        # Discover mDNS/Bonjour services
        if self.zeroconf:
            try:
                mdns_devices = self._discover_mdns_services()
                for device in mdns_devices:
                    if device.ip_address not in all_devices:
                        all_devices[device.ip_address] = device
                    else:
                        existing = all_devices[device.ip_address]
                        existing.merge_from(device)
            except Exception as e:
                print(f"mDNS error: {e}")

        return list(all_devices.values())

    def get_device_info(self, ip_address: str) -> Optional[Device]:
        """Get detailed information about a specific device."""
        hostname = self._get_hostname(ip_address)
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

        if not self.zeroconf:
            return devices

        class DeviceListener(ServiceListener):
            def __init__(self):
                self.services = {}

            def add_service(self, zeroconf, service_type, name):
                try:
                    info = zeroconf.get_service_info(service_type, name)
                    if info and info.addresses:
                        ip = ".".join(map(str, info.addresses[0]))

                        if ip not in self.services:
                            self.services[ip] = {
                                'hostname': name.split('.')[0],
                                'services': []
                            }

                        if service_type not in self.services[ip]['services']:
                            self.services[ip]['services'].append(service_type)
                except Exception:
                    pass

            def remove_service(self, zeroconf, service_type, name):
                pass

            def update_service(self, zeroconf, service_type, name):
                pass

        listener = DeviceListener()

        ServiceBrowser(self.zeroconf, "_http._tcp.local.", listener)
        ServiceBrowser(self.zeroconf, "_ssh._tcp.local.", listener)
        ServiceBrowser(self.zeroconf, "_workstation._tcp.local.", listener)
        ServiceBrowser(self.zeroconf, "_airplay._tcp.local.", listener)
        ServiceBrowser(self.zeroconf, "_raop._tcp.local.", listener)

        import time
        time.sleep(3)

        for ip, info in listener.services.items():
            devices.append(Device(
                ip_address=ip,
                hostname=info['hostname'],
                services=info['services']
            ))

        return devices