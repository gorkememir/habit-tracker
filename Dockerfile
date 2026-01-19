FROM node:18-slim
WORKDIR /app

# Build arguments for version info
ARG COMMIT_SHA=unknown
ARG COMMIT_MESSAGE=unknown
ENV COMMIT_SHA=${COMMIT_SHA}
ENV COMMIT_MESSAGE=${COMMIT_MESSAGE}

# Install dependencies (including ejs)
COPY package*.json ./
RUN npm install express pg ejs

# IMPORTANT: This copies EVERYTHING (including the views folder)
COPY . . 

EXPOSE 8080
CMD ["node", "app.js"]