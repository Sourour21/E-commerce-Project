import logging
import os
from contextlib import asynccontextmanager
from decimal import Decimal

import httpx
from fastapi import FastAPI, HTTPException, Depends, status

from app.database import get_connection, init_db
from app.schemas import OrderCreate, OrderStatusUpdate, OrderResponse
from app.security import get_current_user


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("order-service")

PRODUCT_SERVICE_URL = os.getenv(
    "PRODUCT_SERVICE_URL",
    "http://product-service:3002",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("ORDER_SERVICE_STARTED")
    yield


app = FastAPI(
    title="E-Commerce Order Service",
    description="Order management service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "order-service"}


def get_product(product_id: int):
    """Retrieve product information from Product Service."""
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{PRODUCT_SERVICE_URL}/products/{product_id}"
            )

    except httpx.RequestError:
        logger.error("PRODUCT_SERVICE_UNAVAILABLE")
        raise HTTPException(
            status_code=503,
            detail="Product service temporarily unavailable",
        )

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Product not found")

    if response.status_code != 200:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve product information",
        )

    try:
        product = response.json()
        price = Decimal(str(product["price"]))
        name = product["name"]

        if price <= 0:
            raise ValueError("Invalid product price")

    except (ValueError, KeyError, TypeError):
        raise HTTPException(
            status_code=502,
            detail="Invalid product information",
        )

    return {
        "name": name,
        "price": price,
    }


@app.post(
    "/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_order(
    order: OrderCreate,
    current_user: dict = Depends(get_current_user),
):
    user_id = int(current_user["id"])

    product = get_product(order.product_id)

    unit_price = product["price"]
    total_price = unit_price * order.quantity

    with get_connection() as connection:
        row = connection.execute(
            """
            INSERT INTO orders (
                user_id,
                product_id,
                quantity,
                unit_price,
                total_price
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING
                id, user_id, product_id, quantity,
                unit_price, total_price, status, created_at
            """,
            (
                user_id,
                order.product_id,
                order.quantity,
                unit_price,
                total_price,
            ),
        ).fetchone()

    logger.info(
        "ORDER_CREATED id=%s user_id=%s",
        row[0],
        user_id,
    )

    return {
        "id": row[0],
        "user_id": row[1],
        "product_id": row[2],
        "quantity": row[3],
        "unit_price": row[4],
        "total_price": row[5],
        "status": row[6],
        "created_at": row[7],
    }


@app.get("/orders", response_model=list[OrderResponse])
def get_orders(
    current_user: dict = Depends(get_current_user),
):
    user_id = int(current_user["id"])

    with get_connection() as connection:
        if current_user["role"] == "admin":
            rows = connection.execute(
                """
                SELECT id, user_id, product_id, quantity,
                       unit_price, total_price, status, created_at
                FROM orders
                ORDER BY created_at DESC
                """
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, user_id, product_id, quantity,
                       unit_price, total_price, status, created_at
                FROM orders
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            ).fetchall()

    return [
        {
            "id": row[0],
            "user_id": row[1],
            "product_id": row[2],
            "quantity": row[3],
            "unit_price": row[4],
            "total_price": row[5],
            "status": row[6],
            "created_at": row[7],
        }
        for row in rows
    ]


@app.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    current_user: dict = Depends(get_current_user),
):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, user_id, product_id, quantity,
                   unit_price, total_price, status, created_at
            FROM orders
            WHERE id = %s
            """,
            (order_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if (
        current_user["role"] != "admin"
        and row[1] != int(current_user["id"])
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": row[0],
        "user_id": row[1],
        "product_id": row[2],
        "quantity": row[3],
        "unit_price": row[4],
        "total_price": row[5],
        "status": row[6],
        "created_at": row[7],
    }


@app.patch("/orders/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    update: OrderStatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required",
        )

    with get_connection() as connection:
        row = connection.execute(
            """
            UPDATE orders
            SET status = %s
            WHERE id = %s
            RETURNING
                id, user_id, product_id, quantity,
                unit_price, total_price, status, created_at
            """,
            (update.status, order_id),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Order not found")

    logger.info(
        "ORDER_STATUS_UPDATED id=%s status=%s admin=%s",
        order_id,
        update.status,
        current_user["id"],
    )

    return {
        "id": row[0],
        "user_id": row[1],
        "product_id": row[2],
        "quantity": row[3],
        "unit_price": row[4],
        "total_price": row[5],
        "status": row[6],
        "created_at": row[7],
    }
