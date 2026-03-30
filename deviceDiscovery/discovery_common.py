"""
programmer: Richie Delgado
-------------------------------------------------------
Shared discovery logic used by Windows and Linux adapters.
SSDP (UDP M-SEARCH) discovery is OS-agnostic.
"""
import socket
import time
from typing import List, Dict, Optional, Any
from urllib.parse import urlparse

from base import Device


def ipv4_strings_from_zeroconf_addresses(addresses: Any) -> List[str]:
    """
    python-zeroconf often exposes IPv4 as 4 raw bytes; str(bytes) is not a dotted quad.
    Normalize to IPv4 dotted strings for merging with ARP/SSDP results.
    """
    if not addresses:
        return []
    out: List[str] = []
    for addr in addresses:
        if isinstance(addr, bytes) and len(addr) == 4:
            out.append(socket.inet_ntoa(addr))
        elif isinstance(addr, bytes) and len(addr) == 16:
            # IPv6 — skip for IPv4-focused discovery
            continue
        else:
            s = str(addr)
            if s and not s.startswith("b'"):
                out.append(s)
    return out


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


def _merge_ssdp_probe_result(merged: Dict[str, Dict], ip_address: str, device_info: Dict) -> None:
    """Merge one SSDP response into aggregated dict (same rules as single-socket recv loop)."""
    if ip_address not in merged:
        merged[ip_address] = device_info
        return
    existing = merged[ip_address]
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
    if device_info.get("st_list"):
        existing.setdefault("st_list", list(existing.get("st_list") or []))
        if existing.get("st") and existing["st"] not in existing["st_list"]:
            existing["st_list"].append(existing["st"])
        for st in device_info["st_list"]:
            if st not in existing["st_list"]:
                existing["st_list"].append(st)


def _ssdp_collect_responses(
    timeout: float,
    verbose: bool,
    bind_ipv4: Optional[str],
) -> Dict[str, Dict]:
    """Send one M-SEARCH and collect SSDP responses. bind_ipv4 sets multicast egress on Linux multi-homed hosts."""
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

    responses: Dict[str, Dict] = {}
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        if bind_ipv4:
            try:
                sock.bind((bind_ipv4, 0))
            except OSError:
                if verbose:
                    print(f"  SSDP: could not bind to {bind_ipv4}, will try IP_MULTICAST_IF only")
            try:
                sock.setsockopt(
                    socket.IPPROTO_IP,
                    socket.IP_MULTICAST_IF,
                    socket.inet_aton(bind_ipv4),
                )
            except OSError:
                if verbose:
                    print(f"  SSDP: could not set multicast interface for {bind_ipv4}")

        if verbose:
            iface_note = f" (via {bind_ipv4})" if bind_ipv4 else ""
            print(f"  Sending SSDP M-SEARCH to {ssdp_multicast}:{ssdp_port}{iface_note}")
        sock.sendto(msearch_message, (ssdp_multicast, ssdp_port))

        start_time = time.time()
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
                        _merge_ssdp_probe_result(responses, ip_address, device_info)
            except socket.timeout:
                break
            except Exception:
                if (time.time() - start_time) < timeout:
                    continue
                break
    finally:
        sock.close()

    return responses


def discover_ssdp(
    timeout: int = 3,
    store: Optional[object] = None,
    verbose: bool = True,
    multicast_iface_ips: Optional[List[str]] = None,
) -> List[Device]:
    """
    Discover devices using SSDP M-SEARCH broadcast (UPnP/DLNA).
    Same logic on Windows and Linux. If store is provided, devices are upserted.
    On Linux with multiple interfaces, pass multicast_iface_ips (local IPv4s) so M-SEARCH
    egresses each subnet; otherwise multicast may only use the default route.
    """
    devices: List[Device] = []

    try:
        merged: Dict[str, Dict] = {}
        if multicast_iface_ips:
            per = max(1.0, float(timeout) / len(multicast_iface_ips))
            for lip in multicast_iface_ips:
                part = _ssdp_collect_responses(per, verbose, bind_ipv4=lip)
                for ip, info in part.items():
                    _merge_ssdp_probe_result(merged, ip, info)
        else:
            merged = _ssdp_collect_responses(float(timeout), verbose, bind_ipv4=None)

        responses = merged

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
