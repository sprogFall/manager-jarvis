#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_DIR="${ROOT_DIR}/deploy/compose"
IMAGE_REPO="${IMAGE_REPO:-manager-jarvis}"
IMAGE_TAG="${1:-dev}"

"${ROOT_DIR}/deploy/scripts/rebuild-image.sh" "${IMAGE_TAG}"

mkdir -p "${COMPOSE_DIR}/data"
cd "${COMPOSE_DIR}"
JARVIS_IMAGE="${IMAGE_REPO}:${IMAGE_TAG}" docker compose -f docker-compose.offline.yml up -d

echo "[done] service is up with ${IMAGE_REPO}:${IMAGE_TAG}"
echo "[hint] open: http://localhost:${JARVIS_PORT:-8000}"
