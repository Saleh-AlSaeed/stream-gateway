FROM node:20-alpine

# ffmpeg + tini (كحارس للـ PID 1)
RUN apk add --no-cache ffmpeg tini

WORKDIR /usr/src/app

# إن وُجد lockfile سيُنسخ وإلا لا مشكلة
COPY package.json package-lock.json* ./

# لو عندك lockfile استخدم ci، وإلا استخدم install
# استبدل هذا السطر إن أردت حزم سريعة بدون lock:
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY server.js .

ENV PORT=3000
ENV HLS_DIR=/data/hls

# مستخدم non-root اختياريًا
# RUN adduser -D app && chown -R app:app /usr/src/app
# USER app

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
