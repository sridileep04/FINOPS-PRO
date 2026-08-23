# AI Layer — Integration Steps

Copy the `backend/app/ai/`, `backend/app/models/ai_knowledge_chunk.py`,
`backend/app/api/v1/endpoints/ai_copilot.py`, and
`backend/alembic/versions/0006_ai_vector_layer.py` files into your repo at
the matching paths. Then do the following 3 manual edits:

## 1. Register the new router

In `backend/app/api/v1/router.py`, add `ai_copilot` to the import and include it:

```python
from app.api.v1.endpoints import (..., copilot, agent, sync, ai_copilot)
...
api_router.include_router(ai_copilot.router)
```

## 2. Add dependencies to `backend/requirements.txt`

```
langgraph==0.2.60
openai>=1.40.0
pgvector==0.3.6
fastembed==0.4.2      # only needed if EMBEDDING_PROVIDER=local (the default)
```

`pgvector` here is the *Python* package (gives you `pgvector.sqlalchemy.Vector`)
— separate from the Postgres *extension* of the same name, which the
migration enables with `CREATE EXTENSION vector`.

## 3. Add env vars to `backend/.env` (see `.env.example` additions below)

```
LLM_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-120b

# Only needed if you switch LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=meta-llama/llama-3.1-70b-instruct

# Embeddings: local runs on CPU, no external API key
EMBEDDING_PROVIDER=local
EMBEDDING_DIM=768
```

## 4. Run the migration

Your Postgres server needs the `pgvector` extension available (it ships in
the `pgvector/pgvector:pg16` Docker image, and is `CREATE EXTENSION`-able on
recent RDS/Aurora Postgres versions). Then:

```bash
cd backend
alembic upgrade head
```

## 5. Populate the vector store, then query it

Nothing will be in `ai_knowledge_chunks` until you ingest something. For a
first end-to-end test:

```bash
curl -X POST http://localhost:8000/api/v1/ai/knowledge-base/sync \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:8000/api/v1/ai/query \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"message": "What is my biggest waste right now and how much could I save?"}'
```

## How the pieces fit together

```
POST /api/v1/ai/query
        |
        v
app/ai/service.py  (run_finops_query)
        |
        v
app/ai/graph/graph.py  (builds + compiles the LangGraph StateGraph)
        |
        v
parse_intent -> [clarify | retrieve_structured -> retrieve_semantic] -> generate_recommendation
        |                        |                       |
   LLM (llm_client.py)    SQL via bff_helpers      pgvector via vector_store.py
                          (existing code reused)   (embeddings.py generates the query vector)
```

- **Structured retrieval** never goes through the LLM — it calls the same
  `bff_helpers` functions your existing REST endpoints use, so dollar
  figures the agent states are exactly what's in `daily_costs`/`findings`,
  not something the model computed or guessed.
- **Semantic retrieval** is for the fuzzy part: past finding write-ups,
  anomaly notes, policy text — anything better matched by meaning than by
  an exact `WHERE` clause.
- The **LLM only sees already-retrieved context** in the final synthesis
  step; it's not given raw database access, which keeps answers grounded
  and avoids letting user input reach a SQL-generation step.

## Known constraints worth knowing before you build on this

- **Embedding dimension is fixed at migration time.** If you switch
  embedding models to one with a different output size, you can't `ALTER`
  the `vector` column's dimension — you'd write a new migration that
  recreates the column and re-embeds everything.
- **Groq/OpenRouter don't do embeddings.** That's why `embeddings.py` is a
  separate module from `llm_client.py` with its own provider setting.
- **No conversation memory yet.** Each `/ai/query` call is a fresh graph
  run. If you want multi-turn context, look at
  `langgraph.checkpoint.postgres.AsyncPostgresSaver` — it persists graph
  state in Postgres between calls, which pairs naturally with a stack
  that's already on Postgres.
- **Multi-tenancy**: every retrieval path is scoped by `customer_id`
  (and the vector search additionally supports `aws_account_id`) — don't
  remove those filters when you extend nodes, or one customer's semantic
  search could surface another's data.