# Manager Jarvis API

FastAPI backend for Docker management (containers/images/logs/compose/tasks/audit).

## Run

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API Prefix

- `/api/v1`

## Notes

- Kubernetes features are intentionally not implemented in this version.
- Docker and Compose commands execute against host Docker daemon.
