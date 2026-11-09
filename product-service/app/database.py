import os
import psycopg
from contextlib import contextmanager


def get_database_config():
    db_ssl = os.getenv("DB_SSL", "false").lower() == "true"

    return {
        "host": os.getenv("DB_HOST", "db"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "user": os.getenv("DB_USER", "ecommerce"),
        "password": os.environ["DB_PASSWORD"],
        "dbname": os.getenv("DB_NAME", "product_db"),
        "sslmode": "require" if db_ssl else "disable",
    }


@contextmanager
def get_connection():
    connection = psycopg.connect(**get_database_config())
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def init_db():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                description TEXT DEFAULT '',
                price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
                stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
