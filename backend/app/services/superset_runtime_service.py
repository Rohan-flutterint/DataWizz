import json
import os
import subprocess
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.core.config import ROOT_DIR, get_settings
from app.services.superset_catalog_service import superset_catalog_service


class SupersetRuntimeService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.runtime_state_path = ROOT_DIR / ".runtime" / "superset-runtime.json"
        self.native_venv_dir = ROOT_DIR / ".superset-venv"
        self.native_superset_bin = self.native_venv_dir / "bin" / "superset"
        self.superset_config_path = ROOT_DIR / "docker" / "superset" / "superset_config.py"
        self.superset_native_home = ROOT_DIR / "storage" / "temp" / "superset" / "home"
        self.superset_native_db = ROOT_DIR / "storage" / "temp" / "superset" / "superset.db"
        self.connection_name = "DataWizz Serving Catalog"

    def read_runtime_state(self) -> dict:
        if not self.runtime_state_path.exists():
            return {"mode": "unknown"}
        try:
            return json.loads(self.runtime_state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"mode": "unknown"}

    def _request_json(self, path: str, *, method: str = "GET", token: str | None = None, payload: dict | None = None) -> dict:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(f"{self.settings.superset_url.rstrip('/')}{path}", data=data, headers=headers, method=method)
        with urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8")
        return json.loads(body) if body else {}

    def _login_token(self) -> str | None:
        try:
            payload = {
                "username": self.settings.superset_username,
                "password": self.settings.superset_password,
                "provider": "db",
                "refresh": True,
            }
            response = self._request_json("/api/v1/security/login", method="POST", payload=payload)
            return response.get("access_token")
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, Exception):  # noqa: BLE001
            return None

    def list_databases(self) -> list[dict]:
        token = self._login_token()
        if not token:
            return []
        try:
            query = quote("(page:0,page_size:200)")
            payload = self._request_json(f"/api/v1/database/?q={query}", token=token)
            results = payload.get("result", [])
            return results if isinstance(results, list) else []
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, Exception):  # noqa: BLE001
            return []

    def get_connection_target(self) -> dict:
        runtime_state = self.read_runtime_state()
        serving_catalog = superset_catalog_service.get_status()
        mode = runtime_state.get("mode", "unknown")
        sqlalchemy_uri = (
            serving_catalog["container_sqlalchemy_uri"]
            if mode == "docker"
            else serving_catalog["host_sqlalchemy_uri"]
        )
        return {
            "name": self.connection_name,
            "runtime_mode": mode,
            "sqlalchemy_uri": sqlalchemy_uri,
            "database_path": serving_catalog.get("database_path"),
        }

    def get_connection_status(self) -> dict:
        target = self.get_connection_target()
        databases = self.list_databases()
        matching = next((item for item in databases if item.get("database_name") == target["name"]), None)
        return {
            "name": target["name"],
            "runtime_mode": target["runtime_mode"],
            "expected_sqlalchemy_uri": target["sqlalchemy_uri"],
            "database_path": target["database_path"],
            "provisioned": matching is not None,
            "database_id": matching.get("id") if matching else None,
            "found_sqlalchemy_uri": matching.get("sqlalchemy_uri") if matching else None,
            "backend": matching.get("backend") if matching else None,
            "expose_in_sqllab": matching.get("expose_in_sqllab") if matching else None,
        }

    def provision_serving_catalog_connection(self) -> dict:
        target = self.get_connection_target()
        mode = target["runtime_mode"]
        sqlalchemy_uri = target["sqlalchemy_uri"]

        if mode == "docker":
            command = [
                "docker",
                "compose",
                "exec",
                "-T",
                "superset",
                "superset",
                "set-database-uri",
                "-d",
                self.connection_name,
                "-u",
                sqlalchemy_uri,
            ]
            result = subprocess.run(  # noqa: S603
                command,
                cwd=ROOT_DIR,
                capture_output=True,
                text=True,
                check=False,
            )
        else:
            env = os.environ.copy()
            env["SUPERSET_CONFIG_PATH"] = str(self.superset_config_path)
            env["SUPERSET_SECRET_KEY"] = "internal-lakehouse-demo"
            env["SUPERSET_HOME"] = str(self.superset_native_home)
            env["SUPERSET_NATIVE_DATABASE_URI"] = f"sqlite:///{self.superset_native_db}"
            command = [
                str(self.native_superset_bin),
                "set-database-uri",
                "-d",
                self.connection_name,
                "-u",
                sqlalchemy_uri,
            ]
            result = subprocess.run(  # noqa: S603
                command,
                cwd=ROOT_DIR,
                capture_output=True,
                text=True,
                check=False,
                env=env,
            )

        status = self.get_connection_status()
        status["command_succeeded"] = result.returncode == 0
        status["stdout"] = result.stdout.strip()
        status["stderr"] = result.stderr.strip()
        return status


superset_runtime_service = SupersetRuntimeService()
