"""Embedding generation, kept deliberately separate from llm_client.py.

Groq and OpenRouter are chat-completion proxies -- neither currently
offers a general /embeddings endpoint the way OpenAI or Cohere do. So
this module supports two providers of its own:

- "local" (default): BAAI/bge-base-en-v1.5 running on CPU via `fastembed`
  (ONNX runtime, no torch, no external call, no API key). Good default
  for getting the pipeline working without a third API key to manage.
- "openai": OpenAI's embeddings endpoint, truncated to EMBEDDING_DIM via
  the `dimensions` parameter (supported by the text-embedding-3-* models).

Whichever you pick, EMBEDDING_DIM must match the `vector(768)` column
created in the 0006 migration -- these are not automatically kept in
sync, so if you change models, update all three places.
"""
import asyncio

from app.ai.config import ai_settings

_local_model = None  # lazy-loaded singleton; fastembed downloads the model on first use


def _get_local_model():
    global _local_model
    if _local_model is None:
        from fastembed import TextEmbedding

        _local_model = TextEmbedding(model_name=ai_settings.EMBEDDING_MODEL_LOCAL)
    return _local_model


def _embed_local_sync(texts: list[str]) -> list[list[float]]:
    model = _get_local_model()
    # fastembed returns a generator of numpy arrays; materialize to plain lists
    # so callers (and pgvector's SQLAlchemy Vector type) get plain Python floats.
    return [vec.tolist() for vec in model.embed(texts)]


async def _embed_openai(texts: list[str]) -> list[list[float]]:
    from openai import AsyncOpenAI

    if not ai_settings.OPENAI_API_KEY:
        raise RuntimeError("EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set")
    client = AsyncOpenAI(api_key=ai_settings.OPENAI_API_KEY)
    response = await client.embeddings.create(
        model=ai_settings.OPENAI_EMBEDDING_MODEL,
        input=texts,
        dimensions=ai_settings.EMBEDDING_DIM,
    )
    return [d.embedding for d in response.data]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of strings. Returns one vector per input string, in order."""
    if not texts:
        return []
    if ai_settings.EMBEDDING_PROVIDER == "local":
        # fastembed is CPU-bound and synchronous -- run it off the event loop
        # so it doesn't block other requests while it computes.
        return await asyncio.to_thread(_embed_local_sync, texts)
    elif ai_settings.EMBEDDING_PROVIDER == "openai":
        return await _embed_openai(texts)
    else:
        raise RuntimeError(f"Unknown EMBEDDING_PROVIDER: {ai_settings.EMBEDDING_PROVIDER}")


async def embed_text(text: str) -> list[float]:
    return (await embed_texts([text]))[0]