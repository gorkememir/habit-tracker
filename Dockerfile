FROM node:18-slim
WORKDIR /app

# Build arguments for version info
ARG COMMIT_SHA=unknown
ARG COMMIT_MESSAGE=unknown
ENV COMMIT_SHA=${COMMIT_SHA}
ENV COMMIT_MESSAGE=${COMMIT_MESSAGE}

# Copy package files first for better caching
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy application code
COPY . . 

EXPOSE 8080
CMD ["node", "app.js"]