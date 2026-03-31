"""
Linux-specific device discovery adapter.
Uses ARP scanning, mDNS, and network interface detection.
"""

import socket
from typing import List, Dict, Optional
import psutil
from netaddr import IPNetwork, EUI

try:
    from scapy.all import ARP, Ether, srp
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False
    print("Warning: Scapy not available on Linux")

try:
    from zeroconf import ServiceBrowser, Zeroconf, ServiceListener
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False
    print("Warning: Zeroconf not available on Linux")

from base import DeviceDiscoveryAdapter, Device


class LinuxAdapter(DeviceDiscoveryAdapter):

    def __init__(self):
        self.zeroconf = Zeroconf() if ZEROCONF_AVAILABLE else None

    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        interfaces = []

        try:
            for name, addrs in psutil.net_if_addrs().items():
                for addr in addrs:
                    if addr.family == socket.AF_INET:
                        ip = addr.address
                        netmask = addr.netmask

                        try:
                            network = IPNetwork(f"{ip}/{netmask}")
                            interfaces.append({
                                'interface': name,
                                'ip': ip,
                                'network': f"{network.network}/{network.prefixlen}"
                            })
                        except Exception:
                            continue
        except Exception as e:
            print(f"Interface detection error: {e}")

        return interfaces

    def scan_network(self, network: str, timeout: int = 2) -> List[Device]:
        devices = []

        if not SCAPY_AVAILABLE:
            print("Scapy not available, skipping ARP scan")
            return devices

        try:
            arp = ARP(pdst=network)
            ether = Ether(dst="ff:ff:ff:ff:ff:ff")
            packet = ether / arp

            result = srp(packet, timeout=timeout, verbose=False)[0]

            for _, received in result:
                ip = received.psrc
                mac = received.hwsrc

                device = Device(
                    ip_address=ip,
                    mac_address=mac,
                    hostname=self._get_hostname(ip),
                    vendor=self._get_vendor_from_mac(mac)
                )

                devices.append(device)

        except Exception as e:
            print(f"Scan error on {network}: {e}")

        return devices

    def discover_devices(self, timeout: int = 2) -> List[Device]:
        all_devices = {}

        interfaces = self.get_local_network_interfaces()

        for iface in interfaces:
            network = iface['network']
            print(f"Scanning {network} on {iface['interface']}")

            try:
                devices = self.scan_network(network, timeout)
            except Exception as e:
                print(f"ERROR scanning {network}: {e}")
                devices = []

            for d in devices:
                all_devices[d.ip_address] = d

        # mDNS SAFE
        if self.zeroconf:
            try:
                mdns_devices = self._discover_mdns_services()

                for d in mdns_devices:
                    if d.ip_address not in all_devices:
                        all_devices[d.ip_address] = d
                    else:
                        existing = all_devices[d.ip_address]
                        existing.merge_from(d)

            except Exception as e:
                print(f"mDNS error: {e}")

        return list(all_devices.values())

    def get_device_info(self, ip_address: str) -> Optional[Device]:
        hostname = self._get_hostname(ip_address)
        mac = self._get_mac_from_arp(ip_address)

        if hostname or mac:
            return Device(
                ip_address=ip_address,
                mac_address=mac,
                hostname=hostname,
                vendor=self._get_vendor_from_mac(mac) if mac else None
            )

        return None

    def _get_hostname(self, ip: str) -> Optional[str]:
        try:
            return socket.gethostbyaddr(ip)[0]
        except Exception:
            return None

    def _get_mac_from_arp(self, ip: str) -> Optional[str]:
        try:
            with open('/proc/net/arp', 'r') as f:
                for line in f.readlines()[1:]:
                    parts = line.split()
                    if len(parts) >= 4 and parts[0] == ip:
                        return parts[3]
        except Exception:
            pass
        return None

    def _get_vendor_from_mac(self, mac: str) -> Optional[str]:
        try:
            return str(EUI(mac).oui.registration().org)
        except Exception:
            return None

    def _discover_mdns_services(self) -> List[Device]:
        devices = []

        class Listener(ServiceListener):
            def __init__(self):
                self.services = {}

            def add_service(self, zc, type_, name):
                try:
                    info = zc.get_service_info(type_, name)
                    if info and info.addresses:
                        ip = ".".join(map(str, info.addresses[0]))

                        if ip not in self.services:
                            self.services[ip] = {
                                "hostname": name.split('.')[0],
                                "services": []
                            }

                        if type_ not in self.services[ip]["services"]:
                            self.services[ip]["services"].append(type_)
                except Exception:
                    pass

            def remove_service(self, *args): pass
            def update_service(self, *args): pass

        listener = Listener()

        ServiceBrowser(self.zeroconf, "_http._tcp.local.", listener)
        ServiceBrowser(self.zeroconf, "_ssh._tcp.local.", listener)

        import time
        time.sleep(3)

        for ip, info in listener.services.items():
            devices.append(Device(
                ip_address=ip,
                hostname=info["hostname"],
                services=info["services"]
            ))

        return devices