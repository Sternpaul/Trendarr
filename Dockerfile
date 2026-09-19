# Use the official Node.js 20 Alpine image for a small footprint
FROM node:20-alpine

# Use production node environment by default
ENV NODE_ENV production

# Create and set working directory
WORKDIR /usr/src/app

# Copy package configurations
COPY package*.json ./

# Install npm dependencies
RUN npm ci --only=production

# Copy application source code
COPY ./src ./src

# Start the application
CMD ["node", "src/index.js"]
