# Use a lightweight Node.js image
FROM node:20.17.0-slim

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the application code
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Start the application using the shell form
CMD npm start
