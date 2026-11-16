FROM python:3.13-slim
WORKDIR /app
COPY uid_finder.py index.html ./
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["python3", "uid_finder.py"]
