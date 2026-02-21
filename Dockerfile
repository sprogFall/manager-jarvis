# ── Stage 1: 前端构建 ────────────────────────────────────

FROM node:20-alpine AS web-builder

ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_BASE_URL=

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --registry ${NPM_REGISTRY}

COPY apps/web ./
RUN npm run build


# ── Stage 2: Python 依赖编译 ─────────────────────────────
#   编译工具仅存在于此阶段，不进入最终镜像

FROM python:3.11-slim AS api-builder

ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制依赖声明，利用层缓存——业务代码改动不会重新安装依赖
COPY apps/api/pyproject.toml /app/
RUN mkdir -p /app/app && touch /app/app/__init__.py \
    && python -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python -m pip install --no-cache-dir --prefer-binary .

# 再复制全部源码，仅安装应用包本体（--no-deps 跳过已安装的依赖）
COPY apps/api /app
RUN python -m pip install --no-cache-dir --no-deps .


# ── Stage 3: 运行时镜像 ──────────────────────────────────
#   不含 build-essential / cargo 等编译工具，体积更小

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_DIST_DIR=/app/web-dist

# 从官方镜像复制 docker CLI + compose 插件
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose

# 仅安装运行时系统依赖
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 从 builder 复制已编译的 Python 包和 CLI 入口
COPY --from=api-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=api-builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

WORKDIR /app
COPY --from=web-builder /web/out /app/web-dist

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
