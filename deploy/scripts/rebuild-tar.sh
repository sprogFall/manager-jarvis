#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_REPO="${IMAGE_REPO:-manager-jarvis}"
IMAGE_TAG="${1:-dev}"
OUT_DIR="${ROOT_DIR}/dist"
TAR_PATH="${2:-${OUT_DIR}/${IMAGE_REPO}-${IMAGE_TAG}.tar}"

mkdir -p "$(dirname "${TAR_PATH}")"

"${ROOT_DIR}/deploy/scripts/rebuild-image.sh" "${IMAGE_TAG}"

docker save -o "${TAR_PATH}" "${IMAGE_REPO}:${IMAGE_TAG}"

echo "[done] tar exported: ${TAR_PATH}"
echo "[hint] load: docker load -i ${TAR_PATH}"
