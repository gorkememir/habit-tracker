FROM node:18-slim
WORKDIR /app

# Install dependencies
RUN npm install express pg ejs

# Copy the views folder and the app.js file
COPY . . 

EXPOSE 8080
CMD ["node", "app.js"]