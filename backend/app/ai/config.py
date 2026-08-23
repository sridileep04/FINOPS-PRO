from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class AiSettings(BaseSettings):
    """Settings for the AI/RAG layer, kept separate from app.core.config.Settings
    on purpose -- it reads the same `.env` file, so you don't have to touch the
    existing (already-large) Settings class. Merge them later if you'd rather
    have one source of truth.
    """

    # --- LLM (chat) provider ---
    # Both providers expose an OpenAI-compatible /chat/completions endpoint,
    # so a single client class (see llm_client.py) handles both -- only the
    # base_url, api_key, and model id change.
    LLM_PROVIDER: Literal["groq", "openrouter"] = "groq"

    GROQ_API_KEY: str | None = None
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    # llama-3.3-70b-versatile / llama-3.1-8b-instant were deprecated by Groq
    # in mid-2026. openai/gpt-oss-120b is their current recommended
    # general-purpose replacement -- check console.groq.com/docs/models for
    # what's current before you ship.
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "meta-llama/llama-3.1-70b-instruct"
    # OpenRouter asks you to identify your app via these two optional
    # headers (used for their leaderboards / rate-limit attribution).
    OPENROUTER_SITE_URL: str = "https://github.com/your-org/finops-pro"
    OPENROUTER_APP_NAME: str = "FinOps-Pro"

    LLM_TEMPERATURE: float = 0.2
    LLM_MAX_TOKENS: int = 1024

    # --- Embeddings ---
    # IMPORTANT: neither Groq nor OpenRouter currently exposes a general
    # embeddings endpoint the way OpenAI/Cohere do -- they're chat-completion
    # proxies. So embeddings are handled by a separate, swappable provider:
    #   - "local": runs a small model on your own CPU via fastembed, no
    #     external API key or per-call cost, slightly slower on first call
    #     (model download) and adds ~300MB to the image.
    #   - "openai": calls OpenAI's embeddings endpoint directly (needs its
    #     own OPENAI_API_KEY, separate from your Groq/OpenRouter chat key).
    EMBEDDING_PROVIDER: Literal["local", "openai"] = "local"
    EMBEDDING_DIM: int = 768  # must match the migration + model column

    EMBEDDING_MODEL_LOCAL: str = "BAAI/bge-base-en-v1.5"  # 768-dim, fastembed

    OPENAI_API_KEY: str | None = None
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # --- Retrieval tuning ---
    SEMANTIC_TOP_K: int = 6

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


ai_settings = AiSettings()