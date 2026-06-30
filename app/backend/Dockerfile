FROM node:18-alpine
WORKDIR /app

# Instalar pnpm para instalaciones rápidas y seguras
RUN npm install -g pnpm@8

COPY package.json ./
RUN pnpm install --prod

COPY . .

EXPOSE 4002
CMD ["node", "src/server.js"]
