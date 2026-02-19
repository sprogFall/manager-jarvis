#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_REPO="${IMAGE_REPO:-manager-jarvis}"
IMAGE_TAG="${1:-dev}"

echo "[build] image=${IMAGE_REPO}:${IMAGE_TAG}"
docker build \
  -f "${ROOT_DIR}/Dockerfile" \
  -t "${IMAGE_REPO}:${IMAGE_TAG}" \
  -t "${IMAGE_REPO}:latest" \
  "${ROOT_DIR}"

echo "[done] built ${IMAGE_REPO}:${IMAGE_TAG} and ${IMAGE_REPO}:latest"
