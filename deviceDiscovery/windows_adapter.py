"""
Windows-specific device discovery adapter.
Uses ARP scanning, SSDP (M-SEARCH), mDNS, and network interface detection.
"""
import platform
from discovery_store import DiscoveryStore

import subprocess
import socket
import re
from typing import List, Dict, Optional
from urllib.parse import urlparse

try:
    from scapy.all import ARP, Ether, srp, conf
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False
    print("Warning: Scapy not available. Install Npcap for full functionality.")

import psutil
from netaddr import IPNetwork, IPAddress, EUI

try:
    from zeroconf import ServiceBrowser, Zeroconf, ServiceListener
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False

from base import DeviceDiscoveryAdapter, Device


class WindowsAdapter(DeviceDiscoveryAdapter):

    def __init__(self):
        if ZEROCONF_AVAILABLE:
            self.zeroconf = Zeroconf()
        else:
            self.zeroconf = None

        self.store = DiscoveryStore()
        self.store.set_os(f"{platform.system()} {platform.release()}")

        if SCAPY_AVAILABLE:
            try:
                interfaces = psutil.net_if_addrs()
                for iface_name in interfaces.keys():
                    if 'Ethernet' in iface_name or 'Wi-Fi' in iface_name:
                        conf.iface = iface_name
                        print(f"Scapy using interface: {iface_name}")
                        break
            except Exception as e:
                print(f"Scapy config warning: {e}")

    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        interfaces = []

        for name, addrs in psutil.net_if_addrs().items():
            if 'Loopback' in name:
                continue

            for addr in addrs:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                    netmask = addr.netmask

                    if ip.startswith('169.254.'):
                        continue

                    try:
                        prefix = bin(int(IPAddress(netmask))).count('1')
                        network = IPNetwork(f"{ip}/{prefix}")

                        interfaces.append({
                            'interface': name,
                            'ip': ip,
                            'network': str(network)
                        })

                        self.store.add_interface(name=name, ip=ip, network=str(network))

                    except Exception:
                        continue

        return interfaces

    def scan_network(self, network: str, iface_name: Optional[str] = None, timeout: int = 2) -> List[Device]:
        devices = []

        if SCAPY_AVAILABLE:
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

                    self.store.upsert_device(
                        ip=ip,
                        mac=mac,
                        hostname=device.hostname,
                        vendor=device.vendor,
                        iface=iface_name,
                        discovered_via=["ARP"]
                    )

                if devices:
                    return devices

            except Exception as e:
                print(f"ARP scan failed: {e}")

        return self._scan_network_arp_table(network, iface_name)

    def _scan_network_arp_table(self, network: str, iface_name: Optional[str] = None) -> List[Device]:
        devices = []

        try:
            result = subprocess.run(['arp', '-a'], capture_output=True, text=True)

            for line in result.stdout.split('\n'):
                match = re.search(r'(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{17})', line)
                if match:
                    ip = match.group(1)
                    mac = match.group(2).replace('-', ':')

                    device = Device(
                        ip_address=ip,
                        mac_address=mac,
                        hostname=self._get_hostname(ip),
                        vendor=self._get_vendor_from_mac(mac)
                    )

                    devices.append(device)

                    self.store.upsert_device(
                        ip=ip,
                        mac=mac,
                        hostname=device.hostname,
                        vendor=device.vendor,
                        iface=iface_name,
                        discovered_via=["ARP"]
                    )

        except Exception as e:
            print(f"ARP table error: {e}")

        return devices

    def discover_devices(self, timeout: int = 2) -> List[Device]:
        all_devices = {}

        interfaces = self.get_local_network_interfaces()

        for iface in interfaces:
            network = iface['network']

            try:
                devices = self.scan_network(network, iface_name=iface['interface'], timeout=timeout)
            except Exception as e:
                print(f"ERROR scanning {network}: {e}")
                devices = []

            for d in devices:
                all_devices[d.ip_address] = d

        try:
            ssdp_devices = self._discover_ssdp_services()
        except Exception as e:
            print(f"SSDP error: {e}")
            ssdp_devices = []

        for d in ssdp_devices:
            all_devices[d.ip_address] = d

        if self.zeroconf:
            try:
                mdns_devices = self._discover_mdns_services()
                for d in mdns_devices:
                    all_devices[d.ip_address] = d
            except Exception as e:
                print(f"mDNS error: {e}")

        try:
            self.store.save_json("discovery.json")
            print("Saved discovery.json")
        except Exception as e:
            print(f"JSON save error: {e}")

        return list(all_devices.values())

    def get_device_info(self, ip_address: str) -> Optional[Device]:
        """Get detailed information about a specific device."""
        hostname = self._get_hostname(ip_address)

        mac = None
        try:
            result = subprocess.run(['arp', '-a'], capture_output=True, text=True)
            for line in result.stdout.split('\n'):
                if ip_address in line:
                    match = re.search(r'([0-9a-fA-F:-]{17})', line)
                    if match:
                        mac = match.group(1).replace('-', ':')
                        break
        except Exception:
            pass

        vendor = self._get_vendor_from_mac(mac) if mac else None

        if hostname or mac:
            return Device(
                ip_address=ip_address,
                mac_address=mac,
                hostname=hostname,
                vendor=vendor
            )

        return None

    def _get_hostname(self, ip: str) -> Optional[str]:
        try:
            return socket.gethostbyaddr(ip)[0]
        except Exception:
            return None

    def _get_vendor_from_mac(self, mac: str) -> Optional[str]:
        try:
            return str(EUI(mac).oui.registration().org)
        except Exception:
            return None

    def _discover_ssdp_services(self) -> List[Device]:
        devices = []

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(2)

        message = (
            "M-SEARCH * HTTP/1.1\r\n"
            "HOST: 239.255.255.250:1900\r\n"
            "MAN: \"ssdp:discover\"\r\n"
            "ST: ssdp:all\r\n"
            "MX: 1\r\n\r\n"
        )

        try:
            sock.sendto(message.encode(), ("239.255.255.250", 1900))

            while True:
                data, addr = sock.recvfrom(1024)
                ip = addr[0]

                devices.append(Device(ip_address=ip))

        except socket.timeout:
            pass

        sock.close()
        return devices

    def _discover_mdns_services(self) -> List[Device]:
        return []