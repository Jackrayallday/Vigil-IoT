Base URL : https://services.nvd.nist.gov/rest/json/cves/2.0

Documentation : https://nvd.nist.gov/developers/vulnerabilities

Common Platform Finder : https://nvd.nist.gov/products/cpe/search

<ins>__1 CPE__ => Common Platform Enumeration : Standardized naming string
    
    cpe:2.3:h:tp-link:archer_c7:v2:*:*:*:*:*:*:*

<ins>__2 CVSS Score__ </ins>=> Standardized framework used to measure the severity of software vulnerabilities on a scale of 0.0 to 10.0.

* For our use case we only care about "CRITICAL" or "HIGH" severity scores. Namely, vulnerabilities that allow someone to take over a device.
    
        cvssV3Severity=CRITICAL

<ins>__3 Exploit Radar__</ins> => Vulnerabilites marked as being actively used in the world.

<ins>__4 Weakness Linker__</ins> =>Understand why certain IoT devices keep getting hacked.

__Parameter list__
```
1) cpeName

2) hasKev

3) pubStartDate / pubEndDate

4) cveId
```