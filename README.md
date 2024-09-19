# token-server
A server that can generate and assign random tokens within a pool and release them after some time.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [API Details](#api-details)

## Prerequisites

- Node.js (v20.17.0 or higher)
- Redis (running on localhost:6379)

## Installation

1. **Clone the Repository:**
   Clone the repository to your local machine:
   ```bash
   git clone https://github.com/your-username/token-server.git
2. **Navigate to the Repository:**
   Change directory to the cloned repository:
   ```bash
   cd token-server
3. **Install Dependencies:**
   Install the required Node.js dependencies:
   ```bash
   npm install
4. **Start Redis Server:**
   Ensure that you have Redis installed and running. You can start the Redis server with:
   ```bash
   redis-server
## Usage
To start the application, run:
```bash
npm start