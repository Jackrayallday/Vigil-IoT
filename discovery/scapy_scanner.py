
#It finds all devices connected to the local network
from scapy.all import ARP, Ether, srp

class ScapyScanner:
    def __init__(self, store):
        self.store = store

    def scan(self, ip_range="192.168.1.0/24"):
        arp = ARP(pdst=ip_range)
        ether = Ether(dst="ff:ff:ff:ff:ff:ff")
        packet = ether / arp

        devices = [] #stor discovered devices temporarily 
        result = srp(packet, timeout=3, verbose=0)[0] #return the list of responses from devices

        for sent, received in result:
            self.store.add(received.psrc, {"mac": received.hwsrc, "source": "Scapy"}) #.psrc for IP add, .hwsrc for MAC add
            devices.append({"ip": received.psrc, "mac": received.hwsrc})
        return devices #return list of all discovered devices
