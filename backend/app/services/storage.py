import shutil
from pathlib import Path

from fastapi import UploadFile

from app.core.config import get_settings
from app.utils.naming import slugify_identifier


class StorageService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.raw_dir = Path(self.settings.raw_storage_path)
        self.curated_dir = Path(self.settings.curated_storage_path)
        self.serving_dir = Path(self.settings.serving_storage_path)
        self.temp_dir = Path(self.settings.temp_storage_path)

    def ensure_directories(self) -> None:
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.curated_dir.mkdir(parents=True, exist_ok=True)
        self.serving_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def save_upload(self, upload: UploadFile) -> tuple[Path, int]:
        safe_stem = slugify_identifier(Path(upload.filename or "dataset").stem)
        extension = Path(upload.filename or "").suffix.lower()
        target = self.raw_dir / f"{safe_stem}{extension}"
        counter = 1
        while target.exists():
            target = self.raw_dir / f"{safe_stem}_{counter}{extension}"
            counter += 1
        with target.open("wb") as output:
            shutil.copyfileobj(upload.file, output)
        return target, target.stat().st_size

    def delete_path(self, storage_path: str) -> None:
        path = Path(storage_path)
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        elif path.exists():
            path.unlink()

    def get_storage_usage_bytes(self) -> int:
        total = 0
        for base_dir in [self.raw_dir, self.curated_dir, self.serving_dir, self.temp_dir]:
            for path in base_dir.rglob("*"):
                if path.is_file():
                    total += path.stat().st_size
        return total
