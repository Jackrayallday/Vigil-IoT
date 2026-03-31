"""
-------------------------------------------------------
Data classes to unify the information discovered about interfaces, devices, and the device summary, exports to json for the frontend.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict, field
from typing import List, Optional, Dict, Any
import json
import time


def _norm_mac(mac: Optional[str]) -> Optional[str]:
    if not mac:
        return None
    mac = mac.strip().lower()
    return mac or None


@dataclass
class InterfaceInfo:
    name: str                       # e.g., "Wi-Fi"
    ip: str                         # e.g., "192.168.1.136"
    network: str                    # e.g., "192.168.1.0/24"


@dataclass
class DeviceInfo:
    ip: str                         # e.g., "192.168.1.180"
    hostname: Optional[str] = None  # e.g., "LivingRoom-TV"
    mac: Optional[str] = None       # e.g., "3c:6d:66:24:69:6c"
    vendor: Optional[str] = None    # e.g., "Sagemcom Broadband SAS"
    services: List[str] = field(default_factory=list)   # e.g., ["SSDP:upnp:rootdevice", "mDNS:_ssh._tcp"]
    iface: Optional[str] = None     # interface name used to find it (e.g., "Wi-Fi")
    discovered_via: List[str] = field(default_factory=list)  # e.g., ["ARP", "SSDP"]


@dataclass
class DiscoverySummary:
    total_devices: int = 0
    with_hostnames: int = 0
    with_macs: int = 0
    with_vendor: int = 0


class DiscoveryStore:
    def __init__(self):
        self.os: Optional[str] = None
        self.started_at: float = time.time()
        self.interfaces: List[InterfaceInfo] = []
        self.devices_by_ip: Dict[str, DeviceInfo] = {}   # unique by IP
        self.devices_by_mac: Dict[str, str] = {}         # mac -> canonical ip

    # --------- setters ----------
    def set_os(self, os_name: str):
        self.os = os_name

    def add_interface(self, name: str, ip: str, network: str):
        self.interfaces.append(InterfaceInfo(name=name, ip=ip, network=network))

    def _merge_device(self, target: DeviceInfo, incoming: DeviceInfo) -> DeviceInfo:
        # Fill missing simple fields
        if not target.hostname and incoming.hostname:
            target.hostname = incoming.hostname
        if not target.mac and incoming.mac:
            target.mac = incoming.mac
        if not target.vendor and incoming.vendor:
            target.vendor = incoming.vendor
        if not target.iface and incoming.iface:
            target.iface = incoming.iface

        # Merge services uniquely while keeping order
        existing_services = set(target.services)
        for service in incoming.services:
            if service not in existing_services:
                target.services.append(service)
                existing_services.add(service)

        # Merge discovered_via uniquely while keeping order
        existing_sources = set(target.discovered_via)
        for source in incoming.discovered_via:
            if source not in existing_sources:
                target.discovered_via.append(source)
                existing_sources.add(source)

        return target

    def upsert_device(
        self,
        ip: str,
        *,
        hostname: Optional[str] = None,
        mac: Optional[str] = None,
        vendor: Optional[str] = None,
        services: Optional[List[str]] = None,
        iface: Optional[str] = None,
        discovered_via: Optional[List[str]] = None,
    ):
        mac_n = _norm_mac(mac)

        # If same MAC already exists under another IP, merge instead of creating duplicate
        if mac_n and mac_n in self.devices_by_mac:
            existing_ip = self.devices_by_mac[mac_n]

            if existing_ip != ip:
                existing_dev = self.devices_by_ip.get(existing_ip, DeviceInfo(ip=existing_ip))
                incoming_dev = self.devices_by_ip.get(ip, DeviceInfo(ip=ip))

                # Apply incoming values
                if hostname:
                    incoming_dev.hostname = hostname
                if mac_n:
                    incoming_dev.mac = mac_n
                if vendor:
                    incoming_dev.vendor = vendor
                if iface:
                    incoming_dev.iface = iface
                if services:
                    incoming_dev.services = list(services)
                if discovered_via:
                    incoming_dev.discovered_via = list(discovered_via)

                merged = self._merge_device(existing_dev, incoming_dev)
                self.devices_by_ip[existing_ip] = merged

                # Remove duplicate IP entry if it exists
                if ip in self.devices_by_ip:
                    del self.devices_by_ip[ip]

                # Keep MAC pointing to canonical IP
                self.devices_by_mac[mac_n] = existing_ip
                return

        # Default IP-based upsert
        dev = self.devices_by_ip.get(ip, DeviceInfo(ip=ip))

        if hostname:
            dev.hostname = hostname
        if mac_n:
            dev.mac = mac_n
        if vendor:
            dev.vendor = vendor
        if iface:
            dev.iface = iface

        if services:
            sset = set(dev.services)
            for s in services:
                if s not in sset:
                    dev.services.append(s)
                    sset.add(s)

        if discovered_via:
            dset = set(dev.discovered_via)
            for d in discovered_via:
                if d not in dset:
                    dev.discovered_via.append(d)
                    dset.add(d)

        self.devices_by_ip[ip] = dev

        if mac_n:
            self.devices_by_mac[mac_n] = ip

    # --------- getters ----------
    def get_interfaces(self) -> List[InterfaceInfo]:
        return list(self.interfaces)

    def get_devices(self) -> List[DeviceInfo]:
        return list(self.devices_by_ip.values())

    def get_device(self, ip: str) -> Optional[DeviceInfo]:
        return self.devices_by_ip.get(ip)

    # --------- export/import ----------
    def _summary(self) -> DiscoverySummary:
        devices = self.get_devices()
        return DiscoverySummary(
            total_devices=len(devices),
            with_hostnames=sum(1 for d in devices if d.hostname),
            with_macs=sum(1 for d in devices if d.mac),
            with_vendor=sum(1 for d in devices if d.vendor),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "meta": {
                "os": self.os,
                "started_at": self.started_at,
                "finished_at": time.time(),
            },
            "interfaces": [asdict(i) for i in self.interfaces],
            "devices": [asdict(d) for d in self.get_devices()],
            "summary": asdict(self._summary()),
        }

    def save_json(self, path: str = "discovery.json"):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)

    def load_json(self, path: str = "discovery.json"):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.os = (data.get("meta") or {}).get("os")
        self.interfaces = [InterfaceInfo(**i) for i in data.get("interfaces", [])]
        self.devices_by_ip = {d["ip"]: DeviceInfo(**d) for d in data.get("devices", [])}

        # Rebuild MAC index
        self.devices_by_mac = {}
        for dev in self.devices_by_ip.values():
            mac_n = _norm_mac(dev.mac)
            if mac_n:
                self.devices_by_mac[mac_n] = dev.ip