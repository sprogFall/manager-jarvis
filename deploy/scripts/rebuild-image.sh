#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_REPO="${IMAGE_REPO:-manager-jarvis}"
IMAGE_TAG="${1:-dev}"

# 镜像源（默认使用国内镜像，海外环境可设为官方源）
#   PIP_INDEX_URL=https://pypi.org/simple NPM_REGISTRY=https://registry.npmjs.org ./rebuild-image.sh
PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

echo "[build] image=${IMAGE_REPO}:${IMAGE_TAG}"
docker build \
  -f "${ROOT_DIR}/Dockerfile" \
  --build-arg PIP_INDEX_URL="${PIP_INDEX_URL}" \
  --build-arg NPM_REGISTRY="${NPM_REGISTRY}" \
  -t "${IMAGE_REPO}:${IMAGE_TAG}" \
  -t "${IMAGE_REPO}:latest" \
  "${ROOT_DIR}"

echo "[done] built ${IMAGE_REPO}:${IMAGE_TAG} and ${IMAGE_REPO}:latest"
