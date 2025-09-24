FROM node:18-slim

# ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install --production

COPY server.js ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
