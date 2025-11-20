from zeroconf import Zeroconf, ServiceBrowser, BadTypeInNameException

class MDNSListener:
    def __init__(self, store, debug=False):
        self.store = store
        self.debug = debug  # only show debug logs if True
        self.zeroconf = Zeroconf()  # creates a local mDNS client

    def start(self):
        ServiceBrowser(self.zeroconf, "_services._dns-sd._udp.local.", self)

    def remove_service(self, zeroconf, type, name):
        pass

    def add_service(self, zeroconf, type, name):
        try:
            # Only attempt to process full service instance names
            if not "." in name.split("_")[-1]:  # crude check for instance
                return

            info = self.zeroconf.get_service_info(type, name)
            if info and info.addresses:
                ip = ".".join(map(str, info.addresses[0]))
                self.store.add(ip, {"source": "mDNS", "service": name})
                if self.debug:
                    print(f"[mDNS] Added device: {ip} → {name}")
        except BadTypeInNameException:
            # silently ignore placeholder/invalid services
            pass
        except Exception as e:
            if self.debug:
                print(f"[mDNS] Failed to process service {name}: {e}")

    def update_service(self, zeroconf, type, name):
        pass
