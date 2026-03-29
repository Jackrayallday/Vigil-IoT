"""
programmer: Richie Delgado
-------------------------------------------------------
macOS-specific device discovery adapter.
Mirrors the Windows adapter: enumerate IPv4 subnets, active ARP (Scapy) with
per-interface conf.iface, ARP table fallback, SSDP (M-SEARCH), mDNS (Zeroconf).
Active scanning may require running with appropriate permissions for raw sockets.
"""
import platform
import subprocess
import socket
import re
import time
from typing import List, Dict, Optional

try:
    from scapy.all import ARP, Ether, srp, conf
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False
    conf = None  # type: ignore

import psutil
import netaddr
from netaddr import IPNetwork, IPAddress, EUI

try:
    from zeroconf import ServiceBrowser, Zeroconf, ServiceListener
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False

from base import DeviceDiscoveryAdapter, Device
from discovery_store import DiscoveryStore
from discovery_common import discover_ssdp, ipv4_strings_from_zeroconf_addresses


class MacAdapter(DeviceDiscoveryAdapter):
    """macOS implementation of device discovery (aligned with WindowsAdapter)."""

    def __init__(self):
        if ZEROCONF_AVAILABLE:
            self.zeroconf = Zeroconf()
        else:
            self.zeroconf = None
        self.discovered_services = {}
        self.store = DiscoveryStore()
        try:
            self.store.set_os(f"{platform.system()} {platform.release()}")
        except Exception:
            pass

        if SCAPY_AVAILABLE and conf is not None:
            try:
                for iface_name in psutil.net_if_addrs().keys():
                    if iface_name.startswith("lo"):
                        continue
                    if iface_name.startswith("en") or "Ethernet" in iface_name or "Wi-Fi" in iface_name:
                        conf.iface = iface_name
                        print(f"Scapy configured to use interface: {iface_name}")
                        break
            except Exception as e:
                print(f"Warning: Could not auto-configure Scapy interface: {e}")
                print("You may need appropriate permissions for active scanning.")

    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        """Get all network interfaces and their IP addresses/subnets on macOS."""
        interfaces = []

        print("Detecting network interfaces...")
        for interface_name, addrs in psutil.net_if_addrs().items():
            if interface_name.startswith("lo") or "loopback" in interface_name.lower():
                print(f"  Skipping loopback interface: {interface_name}")
                continue

            for addr in addrs:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                    netmask = addr.netmask

                    if ip.startswith("169.254."):
                        print(f"  Skipping link-local address on {interface_name}: {ip}")
                        continue

                    try:
                        netmask_obj = IPAddress(netmask)
                        prefix_len = bin(int(netmask_obj)).count("1")
                        network = IPNetwork(f"{ip}/{prefix_len}")
                        network_cidr = str(network.network) + "/" + str(network.prefixlen)

                        interfaces.append({
                            "interface": interface_name,
                            "ip": ip,
                            "netmask": netmask,
                            "network": network_cidr,
                        })
                        print(f"  Found interface: {interface_name} - IP: {ip}, Network: {network_cidr}")
                        self.store.add_interface(name=interface_name, ip=ip, network=network_cidr)
                    except Exception as e:
                        print(f"  Error processing interface {interface_name}: {e}")
                        continue

        if not interfaces:
            print("  WARNING: No network interfaces found!")
        else:
            print(f"  Total interfaces found: {len(interfaces)}")

        return interfaces

    def scan_network(
        self,
        network: str,
        iface_name: Optional[str] = None,
        timeout: int = 2,
    ) -> List[Device]:
        """Scan a network: active ARP (Scapy) then ARP table fallback (same order as Windows)."""
        devices: List[Device] = []

        if SCAPY_AVAILABLE:
            try:
                if iface_name and conf is not None:
                    try:
                        conf.iface = iface_name
                    except Exception:
                        pass
                print(f"  Attempting active ARP scan (may require elevated permissions)...")
                arp_request = ARP(pdst=network)
                broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
                arp_request_broadcast = broadcast / arp_request
                answered_list, unanswered_list = srp(
                    arp_request_broadcast,
                    timeout=timeout,
                    verbose=False,
                    retry=2,
                )
                print(
                    f"  Active scan: {len(answered_list)} devices responded, "
                    f"{len(unanswered_list)} did not respond"
                )

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
                        os_type=None,
                    )
                    devices.append(device)
                    self.store.upsert_device(
                        ip=ip,
                        hostname=hostname,
                        mac=mac,
                        vendor=vendor,
                        iface=iface_name,
                        discovered_via=["ARP"],
                    )

                if devices:
                    print(f"  Active ARP scan successful! Found {len(devices)} device(s)")
                    return devices
                print(f"  Active scan found no devices, falling back to ARP table...")
            except PermissionError:
                print(f"  Active scan failed: insufficient permissions. Falling back to ARP table...")
            except Exception as e:
                print(f"  Active scan failed: {e}. Falling back to ARP table...")

        if not SCAPY_AVAILABLE:
            print(f"  Scapy not available. Using ARP table method...")

        return self._scan_network_arp_table(network, iface_name=iface_name)

    def _normalize_mac_colons(self, mac: str) -> str:
        """Normalize macOS arp single-digit octets (e.g. 0:11:22:...) to aa:bb:cc:..."""
        parts = mac.split(":")
        return ":".join(p.zfill(2) for p in parts)

    def _scan_network_arp_table(self, network: str, iface_name: Optional[str] = None) -> List[Device]:
        """Parse macOS `arp -a` output for IPs in the target CIDR."""
        devices: List[Device] = []

        try:
            print(f"  Reading ARP table for network {network}...")
            result = subprocess.run(
                ["arp", "-a"],
                capture_output=True,
                text=True,
                timeout=5,
            )

            if result.returncode != 0:
                print(f"  ARP command failed with return code {result.returncode}")
                if result.stderr:
                    print(f"  Error output: {result.stderr}")
                return devices

            arp_lines = result.stdout.split("\n")
            print(f"  ARP table contains {len(arp_lines)} lines")

            network_obj = IPNetwork(network)
            print(f"  Looking for devices in network: {network_obj} (input: {network})")

            for line in result.stdout.split("\n"):
                line = line.strip()
                if not line or "incomplete" in line.lower():
                    continue

                match = re.search(
                    r"\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]+)\s+on\s+(\S+)",
                    line,
                    re.IGNORECASE,
                )
                if not match:
                    continue

                ip = match.group(1)
                mac_raw = match.group(2)
                mac = self._normalize_mac_colons(mac_raw)

                if mac == "00:00:00:00:00:00" or mac.startswith("ff:ff:ff") or mac.startswith("01:00:5e"):
                    continue

                try:
                    if IPAddress(ip) not in network_obj:
                        continue
                except Exception:
                    continue

                print(f"    Found device (ARP table): {ip} ({mac})")
                vendor = self._get_vendor_from_mac(mac)
                hostname = self._get_hostname(ip)
                device = Device(
                    ip_address=ip,
                    mac_address=mac,
                    hostname=hostname,
                    vendor=vendor,
                )
                devices.append(device)
                self.store.upsert_device(
                    ip=ip,
                    hostname=hostname,
                    mac=mac,
                    vendor=vendor,
                    iface=iface_name,
                    discovered_via=["ARP"],
                )

            print(f"  ARP table: {len(devices)} device(s) in target network")

        except Exception as e:
            print(f"  Error reading ARP table: {e}")
            import traceback
            traceback.print_exc()

        return devices

    def discover_devices(self, timeout: int = 2) -> List[Device]:
        """Discover all devices on all local networks (same flow as Windows)."""
        all_devices: Dict[str, Device] = {}

        print("\n=== Starting Device Discovery ===\n")

        interfaces = self.get_local_network_interfaces()

        if not interfaces:
            print("ERROR: No network interfaces found. Cannot discover devices.")
            return []

        for iface_info in interfaces:
            network = iface_info["network"]
            print(f"\nScanning network: {network} on interface {iface_info['interface']}")
            devices = self.scan_network(network, iface_name=iface_info["interface"], timeout=timeout)
            print(f"  Found {len(devices)} device(s) on this network")
            for device in devices:
                all_devices[device.ip_address] = device

        print("\nDiscovering SSDP services (M-SEARCH broadcast)...")
        try:
            iface_ips = [i["ip"] for i in interfaces]
            ssdp_devices = discover_ssdp(
                timeout=3,
                store=self.store,
                verbose=True,
                multicast_iface_ips=iface_ips,
            )
            print(f"  Found {len(ssdp_devices)} device(s) via SSDP")
            for device in ssdp_devices:
                if device.ip_address not in all_devices:
                    all_devices[device.ip_address] = device
                else:
                    existing = all_devices[device.ip_address]
                    if device.hostname and not existing.hostname:
                        existing.hostname = device.hostname
                    if device.vendor and (not existing.vendor or len(device.vendor) > len(existing.vendor or "")):
                        existing.vendor = device.vendor
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

        if self.zeroconf:
            print("\nDiscovering mDNS/Bonjour services...")
            try:
                mdns_devices = self._discover_mdns_services()
                print(f"  Found {len(mdns_devices)} device(s) via mDNS")
                for device in mdns_devices:
                    if device.ip_address not in all_devices:
                        all_devices[device.ip_address] = device
                    else:
                        existing = all_devices[device.ip_address]
                        if device.hostname and not existing.hostname:
                            existing.hostname = device.hostname
                        if device.services:
                            existing.services.extend(device.services)
            except Exception as e:
                print(f"  Error during mDNS discovery: {e}")
                import traceback
                traceback.print_exc()

        print(f"\n=== Discovery Complete: {len(all_devices)} total device(s) ===\n")

        try:
            self.store.save_json("discovery.json")
            print("Saves structured output to discovery.json.")
        except Exception as e:
            print(f"WARNING: could not save discovery.json: {e}")

        return list(all_devices.values())

    def get_device_info(self, ip_address: str) -> Optional[Device]:
        """Get detailed information about a specific device."""
        hostname = self._get_hostname(ip_address)
        mac = self._get_mac_from_arp(ip_address)
        vendor = self._get_vendor_from_mac(mac) if mac else None

        if hostname or mac:
            return Device(
                ip_address=ip_address,
                mac_address=mac,
                hostname=hostname,
                vendor=vendor,
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
                ["arp", "-n", ip_address],
                capture_output=True,
                text=True,
                timeout=2,
            )

            if result.returncode == 0:
                match = re.search(r"([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})", result.stdout, re.IGNORECASE)
                if match:
                    return match.group(0).replace("-", ":")
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
        """Discover devices via mDNS (same service types as Windows adapter)."""
        if not self.zeroconf:
            return []

        devices: List[Device] = []

        class DeviceListener(ServiceListener):
            def __init__(self):
                self.services: Dict[str, Dict] = {}

            def add_service(self, zeroconf, service_type, name):
                info = zeroconf.get_service_info(service_type, name)
                if not info or not info.addresses:
                    return
                for ip in ipv4_strings_from_zeroconf_addresses(info.addresses):
                    if ip not in self.services:
                        self.services[ip] = {"hostname": name.split(".")[0], "services": []}
                    if service_type not in self.services[ip]["services"]:
                        self.services[ip]["services"].append(service_type)

            def remove_service(self, zeroconf, service_type, name):
                pass

            def update_service(self, zeroconf, service_type, name):
                pass

        listener = DeviceListener()
        _browsers = [
            ServiceBrowser(self.zeroconf, "_http._tcp.local.", listener),
            ServiceBrowser(self.zeroconf, "_ssh._tcp.local.", listener),
            ServiceBrowser(self.zeroconf, "_workstation._tcp.local.", listener),
        ]
        time.sleep(3)

        for ip, info in listener.services.items():
            devices.append(
                Device(
                    ip_address=ip,
                    hostname=info["hostname"],
                    services=info["services"],
                )
            )
            self.store.upsert_device(
                ip=ip,
                hostname=info["hostname"],
                services=info["services"],
                discovered_via=["mDNS"],
            )

        return devices
