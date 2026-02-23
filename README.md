<a id="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/Jackrayallday/Vigil-IoT">
    <img src="frontend/src/assets/logo.svg" alt="Vigil IoT Logo" width="120" height="120">
  </a>

  <h3 align="center">Vigil IoT</h3>

  <p align="center">
    Vite + React UI for exploring discovered IoT devices, their services, and associated risks.
    <br />
    <a href="https://github.com/Jackrayallday/Vigil-IoT"><strong>Explore the repo &raquo;</strong></a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributions">Contributions</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
    <li><a href="#notes">Notes</a></li>
  </ol>
</details>

## About The Project

Vigil IoT is a desktop-first security dashboard for discovering local IoT devices, viewing scan findings, and managing scan reports.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

- [React](https://react.dev/)
- [Vite](https://vite.dev/)
- [Electron](https://www.electronjs.org/)
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [MySQL](https://www.mysql.com/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Uvicorn](https://www.uvicorn.org/)
- [Docker](https://www.docker.com/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

This is how to set up Vigil IoT locally.

### Prerequisites

- Node.js >= 20.19.0 (need to check these versions)
- npm >= 10 (need to check these versions)
- Python 3.10+ (need to check these versions)
- pip
- Docker Desktop
- Npcap on Windows

### Installation

1. **Clone the repository.**
   ```bash
   git clone --branch main --single-branch https://github.com/Jackrayallday/Vigil-IoT.git
   cd vigil-iot
   ```
2. **Install Docker Desktop.**
   - Install Docker Desktop for Windows here: https://docs.docker.com/desktop/setup/install/windows-install/
   - Install Docker Desktop for Mac here: https://docs.docker.com/desktop/setup/install/mac-install/
3. **Run The Docker Desktop app (It needs to be running at the same time as the containerized backend for it to work).**
4. **Build and run the containerized server program.**
   ```bash
   cd backend
   docker compose up --build
   ```
   - For subsequent runs, you can use:
     ```bash
     docker compose up
     ```
   - To remove containers, networks, and volumes created by Compose, run the following command:
     ```bash
     docker compose down
     ```
5. **In another terminal instance, install networking dependencies needed for device discovery.**
   ```bash
   cd deviceDiscovery
   pip install scapy zeroconf psutil ifaddr requests netaddr fastapi uvicorn[standard]
   ```
6. **Install frontend dependencies and run the client program.**
   ```bash
   cd frontend
   npm install
   npm run dev:electron
   ```
   - For browser-only development, use:
     ```bash
     npm run dev
     ```
   - To stop use `control c` -> `Y` -> `Enter Key`

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

- Open the app and click Start Scan.
- Use selected discovered targets or add manual IP/CIDR entries.
- Configure scan options.
- Create a scan and review findings in Scan Results.
- Save reports to the backend (requires login).
- Open Previous Scans to load saved reports.
- Open a device row to view device details.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [ ] Update all backend routes to send a 400-level response for bad requests
- [ ] Update frontend to handle the 400-level errors sent by the backend
- [ ] Rework the frontend to have a more modern look (no new buttons, only layout and initial re-theme)
- [ ] Rework the application logo and update to use new colors
- [ ] Replace raw SQL queries with Node.js Sequelize models/objects in the backend
- [ ] Enforce minimum password strength rules in the frontend
- [ ] Add animations and smooth transitions between pages
- [ ] Obtain an API key to NIST's CVE database
- [ ] Implement retrieval of CVE data from NIST's database using that API key
- [ ] Implement Linux device discovery
- [ ] Find an alternative to rejecting unauthorized certification in email-sending functionality
- [ ] Explore machine learning algorithms for anomaly detection
- [ ] Begin work on the online web interface so users can view scan reports on devices without Vigil IoT installed
- [ ] Begin work on Raspberry Pi and explore how to collect information with it
- [ ] Expand vulnerability matching capabilities with additional data from prior updates
- [ ] Store user sessions in the database instead of Node.js MemoryStore
- [ ] Begin implementing the ML algorithm
- [ ] Deliver version 1.0 of the online web interface
- [ ] Add backend routes that deliver online web interface pages to the browser
- [ ] Add audio for selected clicks or application startup
- [ ] Obtain a TLS certificate with Let's Encrypt and store it on the server
- [ ] Change server configuration to use HTTPS instead of HTTP
- [ ] Update frontend to send `https://...` requests instead of `http://...`
- [ ] Update the online web interface theme to match the app as closely as possible
- [ ] Finish any previously assigned work that is not complete
- [ ] Implement late but necessary stakeholder suggestions
- [ ] Fix bugs discovered after additional testing

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributions

We are not accepting contributions at this time.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

No LICENSE file is currently present in this repository.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Project maintainers: Vigil IoT team

- Jack Ray - jack.ray@gmail.com
- Richie Delgado - richie.delgado@example.com
- Kevin Volkov - kevin.volkov@example.com
- Afnan Khan - afnan.khan@example.com
- Shelly Ulman - shelly.ulman@example.com

Project Link: https://github.com/Jackrayallday/Vigil-IoT

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

- [React Documentation](https://react.dev/)
- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Vite Documentation](https://vite.dev/guide/)
- [Docker Documentation](https://docs.docker.com/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Notes

- Please add your name at the top of any file you edit where a contributor list is expected.
- The "Previous scans" button appears only after you create your first scan.
- All scan data is stored locally.
- Many files in this repo come from Electron/React boilerplate, so you don't need to worry about cleaning them up right now.
- I used Vite to generate the format of this file structure.

<p align="right">(<a href="#readme-top">back to top</a>)</p>
