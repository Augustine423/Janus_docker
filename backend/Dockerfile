# Use official Node.js LTS image
FROM node:21

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your backend source
COPY . .

# Expose backend port (change if needed)
EXPOSE 3000

EXPOSE 5001-5500/udp

# Start your server
CMD ["node", "server.js"]
