#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

REGISTRY="${REGISTRY:-docker.io/andpra70}"
IMAGE_NAME="${IMAGE_NAME:-plotterfun-node-editor}"
TAG="${TAG:-latest}"
CONTAINER_NAME="${CONTAINER_NAME:-plotterfun-node-editor}"
HOST_PORT="${HOST_PORT:-8080}"
CONTAINER_PORT="${CONTAINER_PORT:-80}"
IMAGE_REF="${REGISTRY}/${IMAGE_NAME}:${TAG}"

if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
  docker stop "${CONTAINER_NAME}"
  docker rm "${CONTAINER_NAME}"
fi

docker pull "${IMAGE_REF}"

docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  "${IMAGE_REF}"

printf 'Container: %s\n' "${CONTAINER_NAME}"
printf 'Image: %s\n' "${IMAGE_REF}"
printf 'URL: http://localhost:%s\n' "${HOST_PORT}"
