import os

import jwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials


JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
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

        return {
            "id": user_id,
            "role": role,
        }

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )
