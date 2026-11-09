import logging
import os
from contextlib import asynccontextmanager

import httpx
import jwt
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import Response


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api-gateway")


JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"

SERVICES = {
    "users": os.getenv("USER_SERVICE_URL", "http://user-service:3001"),
    "products": os.getenv("PRODUCT_SERVICE_URL", "http://product-service:3002"),
    "orders": os.getenv("ORDER_SERVICE_URL", "http://order-service:3003"),
}

HEALTH_ROUTES = {
    "/users/health",
    "/products/health",
    "/orders/health",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(timeout=15.0)
    logger.info("API_GATEWAY_STARTED")
    yield
    await app.state.http_client.aclose()


app = FastAPI(
    title="E-Commerce API Gateway",
    description="Central entry point for the e-commerce microservices",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "api-gateway"}


def get_current_user(request: Request):
    authorization = request.headers.get("Authorization", "")

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    token = authorization[7:].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub", "iat", "role"]},
        )

        user_id = payload.get("sub")
        role = payload.get("role")

        if not user_id or role not in ("client", "admin"):
            raise HTTPException(
                status_code=401,
                detail="Invalid token",
            )

        return {"id": user_id, "role": role}

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )


def is_public_route(method: str, path: str) -> bool:
    if method == "GET" and path in HEALTH_ROUTES:
        return True

    if method == "POST" and path in (
        "/users/register",
        "/users/login",
    ):
        return True

    if method == "GET" and (
        path == "/products" or path.startswith("/products/")
    ):
        return True

    return False


def get_service(path: str):
    for prefix, service_url in SERVICES.items():
        if path == f"/{prefix}" or path.startswith(f"/{prefix}/"):
            return service_url

    return None


@app.api_route(
    "/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def proxy_request(full_path: str, request: Request):
    path = request.url.path
    method = request.method

    service_url = get_service(path)

    if service_url is None:
        raise HTTPException(status_code=404, detail="Route not found")

    if not is_public_route(method, path):
        try:
            current_user = get_current_user(request)
        except HTTPException:
            logger.warning(
                "ACCESS_DENIED method=%s path=%s",
                method,
                path,
            )
            raise

        if (
            path.startswith("/products")
            and method in ("POST", "PUT", "PATCH", "DELETE")
            and current_user["role"] != "admin"
        ):
            logger.warning(
                "ACCESS_DENIED user=%s method=%s path=%s",
                current_user["id"],
                method,
                path,
            )
            raise HTTPException(
                status_code=403,
                detail="Administrator access required",
            )

    # Les health checks sont transmis à /health à la racine du service.
    target_path = "/health" if (
        method == "GET" and path in HEALTH_ROUTES
    ) else path

    target_url = f"{service_url}{target_path}"

    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in (
            "host",
            "content-length",
            "connection",
        )
    }

    body = await request.body()

    try:
        response = await request.app.state.http_client.request(
            method=method,
            url=target_url,
            params=request.query_params,
            content=body,
            headers=headers,
        )

    except httpx.RequestError:
        logger.error("SERVICE_UNAVAILABLE path=%s", path)
        raise HTTPException(
            status_code=502,
            detail="Requested service is temporarily unavailable",
        )

    response_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in (
            "content-length",
            "content-encoding",
            "transfer-encoding",
            "connection",
        )
    }

    logger.info(
        "REQUEST_FORWARDED method=%s path=%s status=%s",
        method,
        path,
        response.status_code,
    )

    return Response(
        content=response.content,
        status_code=response.status_code,
        headers=response_headers,
    )
