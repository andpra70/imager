FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci

COPY index.html tsconfig.json tsconfig.app.json vite.config.ts ./
COPY src ./src
COPY public ./public

RUN npm run build

FROM nginx:1.27-alpine AS runtime

ENV KLEIN_HOST=192.168.1.127
ENV KLEIN_PORT=8000
ENV APP_PORT=8080
COPY docker/templates/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
