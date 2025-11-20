from scapy.all import sr1, IP, ICMP, conf

class ActiveProber:
    def __init__(self, store):
        self.store = store #store information
        conf.verb = 0 #avoid terminal cluttering

    #Sends packet to device to see if it's responding
    def ping(self, ip):
        pkt = IP(dst=ip)/ICMP()
        resp = sr1(pkt, timeout=1) #wait for respose for 1 second after sending packet
        if resp:
            self.store.add(ip, {"source": "ActiveProbe", "status": "Online"})
        else:
            self.store.add(ip, {"source": "ActiveProbe", "status": "No response"})
