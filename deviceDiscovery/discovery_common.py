"""
programmer: Richie Delgado
-------------------------------------------------------
Shared discovery logic used by Windows and Linux adapters.
SSDP (UDP M-SEARCH) discovery is OS-agnostic.
"""
import socket
import time
from typing import List, Dict, Optional
from urllib.parse import urlparse

from base import Device


def parse_ssdp_response(response_text: str, ip_address: str) -> Optional[Dict[str, str]]:
    """Parse SSDP response headers. Used by both Windows and Linux adapters."""
    info = {}
    lines = response_text.split("\r\n")

    for line in lines:
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()

            if key == "server":
                info["server"] = value
            elif key in ("st", "nt"):
                info["st"] = value
            elif key == "usn":
                info["usn"] = value
            elif key == "location":
                try:
                    parsed = urlparse(value)
                    info["location"] = value
                    info["location_hostname"] = parsed.hostname or ip_address
                except Exception:
                    info["location"] = value
            elif key == "cache-control":
                info["cache_control"] = value

    return info if info else None


def discover_ssdp(
    timeout: int = 3,
    store: Optional[object] = None,
    verbose: bool = True,
) -> List[Device]:
    """
    Discover devices using SSDP M-SEARCH broadcast (UPnP/DLNA).
    Same logic on Windows and Linux. If store is provided, devices are upserted.
    """
    devices: List[Device] = []
    ssdp_multicast = "239.255.255.250"
    ssdp_port = 1900

    msearch_message = (
        "M-SEARCH * HTTP/1.1\r\n"
        "HOST: 239.255.255.250:1900\r\n"
        "MAN: \"ssdp:discover\"\r\n"
        "ST: ssdp:all\r\n"
        "MX: 3\r\n"
        "\r\n"
    ).encode("utf-8")

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.settimeout(timeout)

        if verbose:
            print(f"  Sending SSDP M-SEARCH broadcast to {ssdp_multicast}:{ssdp_port}")
        sock.sendto(msearch_message, (ssdp_multicast, ssdp_port))

        responses: Dict[str, Dict] = {}
        start_time = time.time()

        try:
            while (time.time() - start_time) < timeout:
                try:
                    sock.settimeout(max(0.5, timeout - (time.time() - start_time)))
                    data, addr = sock.recvfrom(4096)
                    ip_address = addr[0]
                    response_text = data.decode("utf-8", errors="ignore")
                    device_info = parse_ssdp_response(response_text, ip_address)

                    if device_info:
                        if ip_address not in responses:
                            responses[ip_address] = device_info
                            if verbose and device_info.get("server"):
                                print(f"    Found SSDP device: {ip_address} - {device_info.get('server')}")
                        else:
                            existing = responses[ip_address]
                            if device_info.get("server") and (
                                not existing.get("server")
                                or len(device_info.get("server", "")) > len(existing.get("server", ""))
                            ):
                                existing["server"] = device_info["server"]
                            if device_info.get("st") and device_info.get("st") != existing.get("st"):
                                if "st_list" not in existing:
                                    existing["st_list"] = [existing["st"]] if existing.get("st") else []
                                if device_info["st"] not in existing["st_list"]:
                                    existing["st_list"].append(device_info["st"])
                except socket.timeout:
                    break
                except Exception:
                    if (time.time() - start_time) < timeout:
                        continue
                    break
        finally:
            sock.close()

        device_info_by_ip: Dict[str, Dict] = {}
        for ip, info in responses.items():
            if ip not in device_info_by_ip:
                device_info_by_ip[ip] = {
                    "services": set(),
                    "hostname": info.get("server") or info.get("location_hostname"),
                    "vendor": info.get("server"),
                }
            if info.get("st"):
                device_info_by_ip[ip]["services"].add(f"SSDP:{info['st']}")
            if info.get("st_list"):
                for st in info["st_list"]:
                    device_info_by_ip[ip]["services"].add(f"SSDP:{st}")
            if info.get("usn"):
                device_info_by_ip[ip]["services"].add(f"USN:{info['usn']}")
            if info.get("server") and (
                not device_info_by_ip[ip]["hostname"]
                or len(info.get("server", "")) > len(device_info_by_ip[ip]["hostname"] or "")
            ):
                device_info_by_ip[ip]["hostname"] = info["server"]
                device_info_by_ip[ip]["vendor"] = info["server"]

        for ip, dinfo in device_info_by_ip.items():
            services_list = list(dinfo["services"]) if dinfo["services"] else None
            device = Device(
                ip_address=ip,
                hostname=dinfo["hostname"],
                vendor=dinfo["vendor"],
                services=services_list,
            )
            devices.append(device)
            if store is not None:
                store.upsert_device(
                    ip=ip,
                    hostname=dinfo["hostname"],
                    vendor=dinfo["vendor"],
                    services=services_list,
                    discovered_via=["SSDP"],
                )

    except Exception as e:
        if verbose:
            print(f"  Error during SSDP discovery: {e}")
        raise

    return devices
