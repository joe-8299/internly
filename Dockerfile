# PinBoard: zero dependencies, so there is no install step.
FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_FILE=/data/board.sqlite LOG_LEVEL=info
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY data/internships.json ./data/internships.json
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
# Liveness probe (no curl needed in alpine: use Node itself).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
