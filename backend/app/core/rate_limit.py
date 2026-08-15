"""
Simple Redis-backed fixed-window rate limiting, plus a login-lockout
counter. Deliberately not a general-purpose middleware -- applied
explicitly as a FastAPI dependency on the three endpoints that actually
need it (login, signup, custom SQL queries), so it's obvious from reading
the endpoint what's protected and how.
"""
from __future__ import annotations
from fastapi import HTTPException, Request, status
from redis.asyncio import Redis
from app.core.config import settings

_redis: Redis | None = None

def _get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis

async def _check_fixed_window(key: str, max_requests: int, window_seconds: int) -> None:
    redis = _get_redis()
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)
    if current > max_requests:
        ttl = await redis.ttl(key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests -- try again in {max(ttl, 1)} seconds",
        )

def _client_ip(request: Request) -> str:
    # Trust X-Forwarded-For only if you've configured a trusted reverse
    # proxy in front of this service; otherwise request.client.host is
    # the safer default (can't be spoofed by the caller).
    return request.client.host if request.client else "unknown"

async def rate_limit_login(request: Request) -> None:
    ip = _client_ip(request)
    await _check_fixed_window(f"ratelimit:login:{ip}", settings.RATE_LIMIT_LOGIN_MAX, settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS)

async def rate_limit_signup(request: Request) -> None:
    ip = _client_ip(request)
    await _check_fixed_window(f"ratelimit:signup:{ip}", settings.RATE_LIMIT_SIGNUP_MAX, settings.RATE_LIMIT_SIGNUP_WINDOW_SECONDS)

async def rate_limit_custom_query(request: Request) -> None:
    # Keyed by IP here since this dependency runs before we know which
    # user made the request; the endpoint itself is still auth-gated, so
    # this is purely an abuse/cost-control backstop on top of that.
    ip = _client_ip(request)
    await _check_fixed_window(
        f"ratelimit:custom_query:{ip}", settings.RATE_LIMIT_CUSTOM_QUERY_MAX, settings.RATE_LIMIT_CUSTOM_QUERY_WINDOW_SECONDS
    )

async def check_login_lockout(email: str) -> None:
    """Raises 423 if this email has too many consecutive failed logins
    recently. Call before verifying the password."""
    redis = _get_redis()
    key = f"login_failures:{email.lower()}"
    failures = await redis.get(key)
    if failures and int(failures) >= settings.LOGIN_LOCKOUT_THRESHOLD:
        ttl = await redis.ttl(key)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Too many failed login attempts -- try again in {max(ttl, 1)} seconds",
        )

async def record_login_failure(email: str) -> None:
    redis = _get_redis()
    key = f"login_failures:{email.lower()}"
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, settings.LOGIN_LOCKOUT_SECONDS)

async def clear_login_failures(email: str) -> None:
    redis = _get_redis()
    await redis.delete(f"login_failures:{email.lower()}")
