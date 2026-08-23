"""Chat-completion client for the FinOps agent.

Both Groq and OpenRouter speak the same OpenAI-compatible chat API, so
we use the official `openai` Python SDK for both -- just pointed at a
different `base_url` and `api_key` depending on AI_SETTINGS.LLM_PROVIDER.
This is the standard trick for using any "OpenAI-compatible" provider:
you are not calling OpenAI, you're calling their server with OpenAI's
wire format.
"""
from openai import AsyncOpenAI

from app.ai.config import ai_settings

_client: AsyncOpenAI | None = None


def get_llm_client() -> AsyncOpenAI:
    """Returns a cached AsyncOpenAI client configured for whichever
    provider is selected via LLM_PROVIDER. Call get_chat_model() alongside
    this to get the model id to pass in `model=`.
    """
    global _client
    if _client is not None:
        return _client

    if ai_settings.LLM_PROVIDER == "groq":
        if not ai_settings.GROQ_API_KEY:
            raise RuntimeError("LLM_PROVIDER=groq but GROQ_API_KEY is not set")
        _client = AsyncOpenAI(api_key=ai_settings.GROQ_API_KEY, base_url=ai_settings.GROQ_BASE_URL)

    elif ai_settings.LLM_PROVIDER == "openrouter":
        if not ai_settings.OPENROUTER_API_KEY:
            raise RuntimeError("LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set")
        _client = AsyncOpenAI(
            api_key=ai_settings.OPENROUTER_API_KEY,
            base_url=ai_settings.OPENROUTER_BASE_URL,
            default_headers={
                "HTTP-Referer": ai_settings.OPENROUTER_SITE_URL,
                "X-Title": ai_settings.OPENROUTER_APP_NAME,
            },
        )
    else:
        raise RuntimeError(f"Unknown LLM_PROVIDER: {ai_settings.LLM_PROVIDER}")

    return _client


def get_chat_model() -> str:
    return ai_settings.GROQ_MODEL if ai_settings.LLM_PROVIDER == "groq" else ai_settings.OPENROUTER_MODEL


async def chat_completion(messages: list[dict], *, json_mode: bool = False) -> str:
    """Thin wrapper so every node in the graph calls the LLM the same way.
    `messages` is the standard OpenAI chat format:
        [{"role": "system", "content": ...}, {"role": "user", "content": ...}]
    """
    client = get_llm_client()
    response = await client.chat.completions.create(
        model=get_chat_model(),
        messages=messages,
        temperature=ai_settings.LLM_TEMPERATURE,
        max_tokens=ai_settings.LLM_MAX_TOKENS,
        response_format={"type": "json_object"} if json_mode else None,
    )
    return response.choices[0].message.content or ""