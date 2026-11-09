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
        "dbname": os.getenv("DB_NAME", "order_db"),
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
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price > 0),
                total_price NUMERIC(12, 2) NOT NULL CHECK (total_price > 0),
                status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
