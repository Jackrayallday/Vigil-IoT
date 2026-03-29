"""
programmer: Richie Delgado
-------------------------------------------------------
Linux-specific device discovery adapter.
Uses the same algorithm as Windows: enumerate local IPv4 subnets,
active ARP scan (when root/cap_net_raw) or ARP table fallback,
then SSDP (M-SEARCH) and mDNS (Zeroconf) for multicast service discovery.
"""
import platform
import subprocess
import socket
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


class LinuxAdapter(DeviceDiscoveryAdapter):
    """Linux implementation of device discovery (same algorithm as Windows)."""

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

    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        """Get all network interfaces and their IP addresses/subnets on Linux."""
        interfaces = []

        print("Detecting network interfaces...")
        for interface_name, addrs in psutil.net_if_addrs().items():
            if interface_name == "lo" or "loopback" in interface_name.lower():
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
                        prefix_len = bin(int(IPAddress(netmask))).count("1")
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
        """Scan a network: merge ARP table with active ARP (Scapy uses iface_name on multi-homed hosts)."""
        merged_by_ip: Dict[str, Device] = {}

        arp_table_devices = self._scan_network_arp_table(network, iface_name=iface_name)
        for d in arp_table_devices:
            merged_by_ip[d.ip_address] = d

        if SCAPY_AVAILABLE:
            try:
                if iface_name and conf is not None:
                    try:
                        conf.iface = iface_name
                    except Exception:
                        pass
                print(f"  Attempting active ARP scan (may require root/cap_net_raw)...")
                arp_request = ARP(pdst=network)
                broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
                arp_request_broadcast = broadcast / arp_request
                answered_list, _unanswered = srp(
                    arp_request_broadcast,
                    timeout=timeout,
                    verbose=False,
                    retry=2,
                )
                print(f"  Active scan: {len(answered_list)} devices responded")

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
                    merged_by_ip[ip] = device
                    self.store.upsert_device(
                        ip=ip,
                        hostname=hostname,
                        mac=mac,
                        vendor=vendor,
                        iface=iface_name,
                        discovered_via=["ARP"],
                    )

                if answered_list:
                    print(
                        f"  Merged ARP table + active scan: {len(merged_by_ip)} device(s) on this segment"
                    )
            except PermissionError:
                print(f"  Active scan failed: Requires root/cap_net_raw. Using ARP table only...")
            except Exception as e:
                print(f"  Active scan failed: {e}. Using ARP table only...")

        if not SCAPY_AVAILABLE:
            print(f"  Scapy not available. Using ARP table only...")

        return list(merged_by_ip.values())

    def _scan_network_arp_table(
        self,
        network: str,
        iface_name: Optional[str] = None,
    ) -> List[Device]:
        """Fallback: parse /proc/net/arp for devices in the given network."""
        devices: List[Device] = []
        try:
            print(f"  Reading ARP table for network {network}...")
            network_obj = IPNetwork(network)

            with open("/proc/net/arp", "r") as f:
                lines = f.readlines()

            for line in lines[1:]:
                parts = line.split()
                if len(parts) < 6:
                    continue
                ip = parts[0]
                flags = parts[2]
                mac = parts[3]
                if flags == "0x0" or mac == "00:00:00:00:00:00" or mac == "*":
                    continue
                if mac.startswith("ff:") or mac.startswith("01:00:5e"):
                    continue
                try:
                    if IPAddress(ip) not in network_obj:
                        continue
                except Exception:
                    continue
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
                print(f"    Found device (ARP table): {ip} ({mac})")

            print(f"  ARP table: {len(devices)} device(s) in target network")
        except Exception as e:
            print(f"  Error reading ARP table: {e}")
        return devices

    def discover_devices(self, timeout: int = 2) -> List[Device]:
        """Discover all devices: subnets -> ARP (active or table) -> SSDP -> mDNS."""
        all_devices: Dict[str, Device] = {}

        print("\n=== Starting Device Discovery (Linux) ===\n")
        interfaces = self.get_local_network_interfaces()

        if not interfaces:
            print("ERROR: No network interfaces found. Cannot discover devices.")
            return []

        for iface_info in interfaces:
            network = iface_info["network"]
            print(f"\nScanning network: {network} on interface {iface_info['interface']}")
            devices = self.scan_network(
                network,
                iface_name=iface_info["interface"],
                timeout=timeout,
            )
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
                    if device.vendor and (not existing.vendor or len(device.vendor or "") > len(existing.vendor or "")):
                        existing.vendor = device.vendor
                    if device.services:
                        if not existing.services:
                            existing.services = []
                        for s in device.services:
                            if s not in existing.services:
                                existing.services.append(s)
        except Exception as e:
            print(f"  Error during SSDP discovery: {e}")

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
                            existing.services = list(existing.services or []) + list(device.services or [])
            except Exception as e:
                print(f"  Error during mDNS discovery: {e}")

        print(f"\n=== Discovery Complete: {len(all_devices)} total device(s) ===\n")
        try:
            self.store.save_json("discovery.json")
            print("Saved structured output to discovery.json.")
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
        try:
            hostname, _, _ = socket.gethostbyaddr(ip_address)
            return hostname
        except Exception:
            return None

    def _get_mac_from_arp(self, ip_address: str) -> Optional[str]:
        try:
            with open("/proc/net/arp", "r") as f:
                for line in f.readlines()[1:]:
                    parts = line.split()
                    if len(parts) >= 4 and parts[0] == ip_address:
                        return parts[3] if parts[3] != "*" else None
        except Exception:
            pass
        return None

    def _get_vendor_from_mac(self, mac_address: str) -> Optional[str]:
        try:
            mac = EUI(mac_address)
            oui = mac.oui
            return str(oui.registration().org) if oui.registration() else None
        except Exception:
            return None

    def _discover_mdns_services(self) -> List[Device]:
        """Discover devices via mDNS (Zeroconf)."""
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
        for svc_type in ("_http._tcp.local.", "_ssh._tcp.local.", "_workstation._tcp.local."):
            ServiceBrowser(self.zeroconf, svc_type, listener)

        import time
        time.sleep(3)

        for ip, info in listener.services.items():
            dev = Device(
                ip_address=ip,
                hostname=info["hostname"],
                services=info["services"],
            )
            devices.append(dev)
            self.store.upsert_device(
                ip=ip,
                hostname=info["hostname"],
                services=info["services"],
                discovered_via=["mDNS"],
            )
        return devices
