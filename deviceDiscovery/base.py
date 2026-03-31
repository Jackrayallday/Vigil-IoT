"""
Base class for device discovery across different operating systems.
Defines the common interface that all OS-specific adapters must implement.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from dataclasses import dataclass, field, asdict


@dataclass
class Device:
    """Represents a discovered device on the network."""
    ip_address: str
    mac_address: Optional[str] = None
    hostname: Optional[str] = None
    vendor: Optional[str] = None
    os_type: Optional[str] = None
    services: List[str] = field(default_factory=list)
    response_time: Optional[float] = None

    def __post_init__(self):
        # Remove duplicate services while keeping order
        if self.services:
            seen = set()
            cleaned = []
            for service in self.services:
                if service and service not in seen:
                    cleaned.append(service)
                    seen.add(service)
            self.services = cleaned
        else:
            self.services = []

    @property
    def device_id(self) -> str:
        """Return a stable identifier for the device."""
        if self.mac_address:
            return self.mac_address.lower()
        return self.ip_address

    def merge_from(self, other: "Device") -> None:
        """Merge missing or new information from another Device object."""
        if not self.mac_address and other.mac_address:
            self.mac_address = other.mac_address

        if not self.hostname and other.hostname:
            self.hostname = other.hostname

        if not self.vendor and other.vendor:
            self.vendor = other.vendor

        if not self.os_type and other.os_type:
            self.os_type = other.os_type

        if other.response_time is not None:
            if self.response_time is None or other.response_time < self.response_time:
                self.response_time = other.response_time

        if other.services:
            existing = set(self.services)
            for service in other.services:
                if service and service not in existing:
                    self.services.append(service)
                    existing.add(service)

    def to_dict(self) -> Dict:
        """Convert Device object to dictionary."""
        return asdict(self)


class DeviceDiscoveryAdapter(ABC):
    """
    Abstract base class for device discovery.
    Each OS-specific adapter must implement these methods.
    """

    @abstractmethod
    def get_local_network_interfaces(self) -> List[Dict[str, str]]:
        """
        Get all network interfaces and their IP addresses/subnets.
        Returns: List of dicts with 'interface', 'ip', 'netmask', 'network'
        """
        pass

    @abstractmethod
    def scan_network(self, network: str, timeout: int = 2) -> List[Device]:
        """
        Scan a network for active devices.
        Args:
            network: Network CIDR notation (e.g., '192.168.1.0/24')
            timeout: Timeout in seconds for each scan
        Returns: List of discovered Device objects
        """
        pass

    @abstractmethod
    def discover_devices(self, timeout: int = 2) -> List[Device]:
        """
        Discover all devices on all local networks.
        Args:
            timeout: Timeout in seconds for each network scan
        Returns: List of all discovered Device objects
        """
        pass

    @abstractmethod
    def get_device_info(self, ip_address: str) -> Optional[Device]:
        """
        Get detailed information about a specific device.
        Args:
            ip_address: IP address of the device
        Returns: Device object with information, or None if not found
        """
        pass