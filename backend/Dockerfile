FROM node:lts-alpine3.22

WORKDIR /app

COPY package*.json ./

RUN npm install --include=dev # "dev" dependencies for development

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]   # or "npm start" for production