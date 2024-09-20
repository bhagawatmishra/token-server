# token-server
A server that can generate and assign random tokens within a pool and release them after some time.

## Table of Contents

- [API Details](#api-details)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)


## API Details

For details on the API endpoints, you can import the provided Postman collection into Postman. Follow these steps:

1. **Open Postman.**
2. **Import the Collection:**
   - Click on the "Import" button in the top-left corner of the Postman app.
   - Choose "File" and select the downloaded Postman collection file (e.g., `Token Server.postman_collection.json`).
   - Click "Import" to add the collection to your workspace.

3. **Explore the Endpoints:**
   - After importing, you will see the collection listed in your Postman workspace. 
   - Click on the collection to explore the available API endpoints and make requests.

This collection will allow you to easily interact with the various functionalities of the token server.

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
## Docker Usage
1. **Build and Run Docker Containers:**
   ```bash
   docker-compose up -d
2. **Access the Application:**
   The application will be available on the ports specified in the .env file.
## Usage
To start the application, run:
```bash
npm start