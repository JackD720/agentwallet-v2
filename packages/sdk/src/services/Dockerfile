FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY kalshi_client.py agent_wallet_kalshi.py agent_wallet_api.py ./

# Create startup script that decodes the key
RUN echo '#!/bin/bash\n\
if [ -n "$KALSHI_PRIVATE_KEY_B64" ]; then\n\
  echo "$KALSHI_PRIVATE_KEY_B64" | base64 -d > /tmp/private_key.pem\n\
  export KALSHI_PRIVATE_KEY_PATH=/tmp/private_key.pem\n\
fi\n\
exec uvicorn agent_wallet_api:app --host 0.0.0.0 --port ${PORT:-8080}' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"]
