FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (need devDeps for build)
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Remove devDependencies to slim down
RUN npm prune --production

# Expose the port
EXPOSE 5000

# Start the production server
ENV NODE_ENV=production
CMD ["node", "dist/index.cjs"]
