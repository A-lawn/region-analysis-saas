FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --production

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm install typescript && \
    ./node_modules/.bin/tsc && \
    npm prune --production && \
    npm uninstall typescript

EXPOSE 3000

CMD ["node", "dist/index.js"]
