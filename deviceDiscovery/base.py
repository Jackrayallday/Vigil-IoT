"""
programmer: Richie Delgado
-------------------------------------------------------
Base class for device discovery across different operating systems.
Defines the common interface that all OS-specific adapters must implement.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class Device:
    """Represents a discovered device on the network."""
    ip_address: str
    mac_address: Optional[str] = None
    hostname: Optional[str] = None
    vendor: Optional[str] = None
    os_type: Optional[str] = None
    services: List[str] = None
    response_time: Optional[float] = None
    
    def __post_init__(self):
        if self.services is None:
            self.services = []


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

