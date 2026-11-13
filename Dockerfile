# Node.js 26 LTS (security support until April 2029) on Alpine for a small footprint.
# The major tag tracks the latest patched 26.x release; CI rebuilds weekly to pick up fixes,
# and Dependabot opens a PR when a newer major is available.
FROM node:26-alpine

# Use production node environment by default
ENV NODE_ENV=production

# Create and set working directory
WORKDIR /usr/src/app

# Copy package configurations
COPY package*.json ./

# Install production dependencies only, patch OS packages from the base image, then
# remove npm/yarn: they are not needed at runtime and their bundled deps (e.g. undici)
# are a frequent source of CVEs in scanners
RUN npm ci --omit=dev && npm cache clean --force \
    && apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
              /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg /root/.npm

# Copy application source code
COPY ./src ./src

# Start the application
CMD ["node", "src/index.js"]
