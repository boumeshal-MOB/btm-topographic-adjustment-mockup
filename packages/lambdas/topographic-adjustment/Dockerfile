FROM public.ecr.aws/lambda/python:3.12

COPY --from=ghcr.io/astral-sh/uv:0.9.25 /uv /bin/uv
COPY packages /app/packages

WORKDIR /app/packages/lambdas/topographic-adjustment
RUN uv sync --frozen --no-dev --no-install-project --no-editable

COPY packages/lambdas/topographic-adjustment/handler.py ${LAMBDA_TASK_ROOT}/handler.py
ENV PYTHONPATH="/app/packages/lambdas/topographic-adjustment/.venv/lib/python3.12/site-packages"

CMD ["handler.lambda_handler"]
