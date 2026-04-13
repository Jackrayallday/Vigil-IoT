class Device:
    def __init__(self, name:str):
        self.name = name
        self.vulnerabilities : list[str] = []
        self.cpe : str
        self.cvss : float
        self.expoitRadar : list[str] = []
        self.weaknessLinker : list[str] = []
        
    def setName(self,name:str):
        self.name = name
    
    def setCpe(self, cpeName:str):
        self.cpe = cpeName

    def setCvss(self, cvssScore:float):
        self.cvss = cvssScore