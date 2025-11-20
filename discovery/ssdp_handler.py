# Used to find smart TVs, routers, or security cameras.
import socket

class SSDPHandler:
    def __init__(self, store):
        self.store = store

    def discover(self):
        log_msg = "[SSDP] Sending discovery packets..." #Prints a log message that the scan has started
        print(log_msg)
        msg = "\r\n".join([
            'M-SEARCH * HTTP/1.1',
            'HOST: 239.255.255.250:1900',
            'MAN: "ssdp:discover"',
            'MX: 3',
            'ST: ssdp:all',
            '', ''
        ])

        devices = []
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.settimeout(3) #3-second timeout for responses
        sock.sendto(msg.encode('utf-8'), ('239.255.255.250', 1900))

        try:
            while True:
                try:
                    data, addr = sock.recvfrom(1024)
                    devices.append({"ip": addr[0], "data": data.decode(errors='ignore')})
                    self.store.add(addr[0], {"source": "SSDP", "data": data.decode(errors='ignore')})
                except socket.timeout:
                    break
        finally:
            sock.close()
        return devices
