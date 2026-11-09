import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from psycopg.errors import UniqueViolation

from app.database import get_connection, init_db
from app.schemas import UserRegister, UserLogin, UserResponse, LoginResponse
from app.security import hash_password, verify_password, create_access_token


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("user-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("USER_SERVICE_STARTED")
    yield


app = FastAPI(
    title="E-Commerce User Service",
    description="User registration and authentication service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "user-service"}


@app.post(
    "/users/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(user: UserRegister, request: Request):
    email = str(user.email).lower()
    if not user.full_name.strip():
        raise HTTPException(status_code=400, detail="Full name cannot be empty")
    ip = request.client.host if request.client else "unknown"

    try:
        with get_connection() as connection:
            row = connection.execute(
                """
                INSERT INTO users (full_name, email, password_hash, role)
                VALUES (%s, %s, %s, 'client')
                RETURNING id, full_name, email, role
                """,
                (user.full_name.strip(), email, hash_password(user.password)),
            ).fetchone()

    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    logger.info("USER_REGISTERED user=%s ip=%s", email, ip)

    return {
        "id": row[0],
        "full_name": row[1],
        "email": row[2],
        "role": row[3],
    }


@app.post("/users/login", response_model=LoginResponse)
def login(credentials: UserLogin, request: Request):
    email = str(credentials.email).lower()
    ip = request.client.host if request.client else "unknown"

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, full_name, email, password_hash, role
            FROM users
            WHERE email = %s
            """,
            (email,),
        ).fetchone()

    if row is None or not verify_password(credentials.password, row[3]):
        logger.warning("LOGIN_FAILED user=%s ip=%s", email, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user_id=row[0], role=row[4])

    logger.info("LOGIN_SUCCESS user=%s ip=%s", email, ip)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": row[0],
            "full_name": row[1],
            "email": row[2],
            "role": row[4],
        },
    }


