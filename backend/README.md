# Backend

FastAPI service for the Internal Lakehouse Platform.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Configure environment variables in `.env` if you are not using Docker.
