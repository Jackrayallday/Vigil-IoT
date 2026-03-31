from discovery_store import DiscoveryStore

store = DiscoveryStore()

# First discovery
store.upsert_device(
    "192.168.1.10",
    hostname="device1",
    mac="AA:BB:CC:DD:EE:FF",
    vendor="TestVendor",
    services=["SSDP"],
    discovered_via=["ARP"]
)

# Second discovery of SAME device but different IP
store.upsert_device(
    "192.168.1.11",
    hostname="device1",
    mac="aa:bb:cc:dd:ee:ff",
    services=["mDNS"],
    discovered_via=["mDNS"]
)

devices = store.get_devices()

print("Devices discovered:", len(devices))
for d in devices:
    print(d)