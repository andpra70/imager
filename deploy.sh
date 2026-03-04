#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

REGISTRY="${REGISTRY:-docker.io/andpra70}"
IMAGE_NAME="${IMAGE_NAME:-plotterfun-node-editor}"
TAG="${TAG:-latest}"
IMAGE_REF="${REGISTRY}/${IMAGE_NAME}:${TAG}"

docker build -t "${IMAGE_REF}" -f Dockerfile .
docker push "${IMAGE_REF}"

printf 'Built and pushed %s\n' "${IMAGE_REF}"
