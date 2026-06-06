from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_runtime_schema(db_engine: Engine) -> None:
    inspector = inspect(db_engine)
    if "notebooks" not in inspector.get_table_names():
        return

    notebook_columns = {column["name"] for column in inspector.get_columns("notebooks")}
    if "latest_cell_results_json" not in notebook_columns:
        with db_engine.begin() as connection:
            connection.execute(text("ALTER TABLE notebooks ADD COLUMN latest_cell_results_json JSON"))

    if "notebook_snippets" not in inspector.get_table_names():
        with db_engine.begin() as connection:
            connection.execute(
                text(
                    """
                    CREATE TABLE notebook_snippets (
                        id VARCHAR(36) PRIMARY KEY,
                        created_at DATETIME,
                        updated_at DATETIME,
                        name VARCHAR(255) NOT NULL UNIQUE,
                        description TEXT,
                        category VARCHAR(64) NOT NULL DEFAULT 'general',
                        engine_scope VARCHAR(64) NOT NULL DEFAULT 'all',
                        cell_kind VARCHAR(32) NOT NULL DEFAULT 'code',
                        code TEXT NOT NULL,
                        is_template BOOLEAN NOT NULL DEFAULT 0
                    )
                    """
                )
            )
