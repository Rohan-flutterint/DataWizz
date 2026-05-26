from textwrap import dedent

from app.models.pipeline import Pipeline


class AirflowDagService:
    def generate(self, pipeline: Pipeline) -> str:
        definition = pipeline.definition_json
        node_blocks = []
        dependencies = []

        for node in definition.get("nodes", []):
            task_id = node["id"]
            node_type = node["type"]
            node_blocks.append(
                dedent(
                    f"""
                    {task_id} = BashOperator(
                        task_id="{task_id}",
                        bash_command="echo Running {node_type} node: {task_id}",
                    )
                    """
                ).strip()
            )

        for edge in definition.get("edges", []):
            dependencies.append(f"{edge['source']} >> {edge['target']}")

        body = "\n\n    ".join(node_blocks + dependencies)
        return dedent(
            f"""
            from datetime import datetime

            from airflow import DAG
            from airflow.operators.bash import BashOperator

            with DAG(
                dag_id="{pipeline.name.lower().replace(' ', '_')}",
                start_date=datetime(2024, 1, 1),
                schedule={repr(pipeline.schedule_cron) if pipeline.schedule_cron else None},
                catchup=False,
                tags=["internal-lakehouse"],
            ) as dag:
                {body}
            """
        ).strip() + "\n"
