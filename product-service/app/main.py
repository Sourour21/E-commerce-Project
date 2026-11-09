import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, status

from app.database import get_connection, init_db
from app.schemas import ProductCreate, ProductUpdate, ProductResponse
from app.security import require_admin


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("product-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("PRODUCT_SERVICE_STARTED")
    yield


app = FastAPI(
    title="E-Commerce Product Service",
    description="Product catalog management service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "product-service"}


@app.get("/products", response_model=list[ProductResponse])
def get_products():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, description, price, stock, created_at
            FROM products
            ORDER BY id
            """
        ).fetchall()

    return [
        {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "price": row[3],
            "stock": row[4],
            "created_at": row[5],
        }
        for row in rows
    ]


@app.get("/products/{product_id}", response_model=ProductResponse)
def get_product(product_id: int):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, name, description, price, stock, created_at
            FROM products
            WHERE id = %s
            """,
            (product_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")

    return {
        "id": row[0],
        "name": row[1],
        "description": row[2],
        "price": row[3],
        "stock": row[4],
        "created_at": row[5],
    }


@app.post(
    "/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    product: ProductCreate,
    admin: dict = Depends(require_admin),
):
    with get_connection() as connection:
        row = connection.execute(
            """
            INSERT INTO products (name, description, price, stock)
            VALUES (%s, %s, %s, %s)
            RETURNING id, name, description, price, stock, created_at
            """,
            (
                product.name.strip(),
                product.description,
                product.price,
                product.stock,
            ),
        ).fetchone()

    logger.info("PRODUCT_CREATED id=%s admin=%s", row[0], admin["id"])

    return {
        "id": row[0],
        "name": row[1],
        "description": row[2],
        "price": row[3],
        "stock": row[4],
        "created_at": row[5],
    }


@app.put("/products/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product: ProductUpdate,
    admin: dict = Depends(require_admin),
):
    changes = product.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    if any(value is None for value in changes.values()):
        raise HTTPException(status_code=400, detail="Fields cannot be null")

    if "name" in changes:
        changes["name"] = changes["name"].strip()
        if not changes["name"]:
            raise HTTPException(status_code=400, detail="Product name cannot be empty")

    allowed_fields = {"name", "description", "price", "stock"}
    if not set(changes).issubset(allowed_fields):
        raise HTTPException(status_code=400, detail="Invalid fields")

    assignments = ", ".join(f"{field} = %s" for field in changes)
    values = list(changes.values()) + [product_id]

    with get_connection() as connection:
        row = connection.execute(
            f"""
            UPDATE products
            SET {assignments}
            WHERE id = %s
            RETURNING id, name, description, price, stock, created_at
            """,
            values,
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")

    logger.info("PRODUCT_UPDATED id=%s admin=%s", product_id, admin["id"])

    return {
        "id": row[0],
        "name": row[1],
        "description": row[2],
        "price": row[3],
        "stock": row[4],
        "created_at": row[5],
    }


@app.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    admin: dict = Depends(require_admin),
):
    with get_connection() as connection:
        row = connection.execute(
            """
            DELETE FROM products
            WHERE id = %s
            RETURNING id
            """,
            (product_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")

    logger.info("PRODUCT_DELETED id=%s admin=%s", product_id, admin["id"])

    return {"message": "Product deleted successfully", "id": row[0]}
