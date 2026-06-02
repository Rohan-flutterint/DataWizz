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
