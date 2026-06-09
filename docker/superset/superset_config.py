import os


SECRET_KEY = os.getenv("SUPERSET_SECRET_KEY", "internal-lakehouse-demo")
SQLALCHEMY_DATABASE_URI = os.getenv("SUPERSET_NATIVE_DATABASE_URI", "sqlite:////app/superset/superset.db")

# Keep the local demo simple and allow the UI to be embedded inside DataWizz.
TALISMAN_ENABLED = False
FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
}

# Ensure localhost embedding is not blocked by strict default frame headers.
HTTP_HEADERS = {
    "X-Frame-Options": "ALLOWALL",
}
