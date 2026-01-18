FROM node:18-slim
WORKDIR /app

# Install dependencies (including ejs)
COPY package*.json ./
RUN npm install express pg ejs

# IMPORTANT: This copies EVERYTHING (including the views folder)
COPY . . 

EXPOSE 8080
CMD ["node", "app.js"]