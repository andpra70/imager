FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci

COPY index.html tsconfig.json tsconfig.app.json vite.config.ts ./
COPY src ./src
COPY public ./public

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

ENV APP_PORT=8080
COPY --chown=nginx:nginx docker/templates/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chown=nginx:nginx --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:${APP_PORT}/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
