import os
import psycopg
from contextlib import contextmanager


def get_database_config():
    """Read PostgreSQL configuration from environment variables."""
    db_ssl = os.getenv("DB_SSL", "false").lower() == "true"

    return {
        "host": os.getenv("DB_HOST", "db"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "user": os.getenv("DB_USER", "ecommerce"),
        "password": os.environ["DB_PASSWORD"],
        "dbname": os.getenv("DB_NAME", "user_db"),
        "sslmode": "require" if db_ssl else "disable",
    }


@contextmanager
def get_connection():
    """Open a PostgreSQL connection and manage its transaction."""
    connection = psycopg.connect(**get_database_config())
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def init_db():
    """Create the users table if it does not already exist."""
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(150) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'client'
                    CHECK (role IN ('client', 'admin')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
