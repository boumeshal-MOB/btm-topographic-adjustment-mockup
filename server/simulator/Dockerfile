FROM python:3.12-alpine

RUN pip install --no-cache-dir pyftpdlib==2.1.0

WORKDIR /app
COPY simulator.py /app/simulator.py

ENV FTP_ROOT=/srv/ftp
EXPOSE 2121 30000-30009

CMD ["python", "/app/simulator.py"]
