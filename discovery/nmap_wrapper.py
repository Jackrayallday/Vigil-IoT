import nmap

class NmapWrapper:
    def __init__(self, store):
        self.store = store
        self.nm = nmap.PortScanner()

    def scan(self, ip):
        result = self.nm.scan(ip, arguments="-sV -Pn")
        self.store.add(ip, {"source": "Nmap", "result": result})
