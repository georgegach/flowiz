# Containerized testing & evaluation image for the flowiz Python package.
#
# Build:
#   docker build -t flowiz-test .
#   docker build -t flowiz-test --build-arg PYTHON_VERSION=3.11 --build-arg EXTRAS=dev,torch,spring .
#
# Run the test suite (default — mirrors the CI gate: ruff + pytest + coverage):
#   docker run --rm flowiz-test
#
# Run an evaluation against the bundled samples, e.g. render demo flows to PNG
# (mount a host dir to keep the output), or score a prediction vs ground truth:
#   docker run --rm -v "$PWD/out:/app/out" flowiz-test \
#     bash -lc "flowiz convert 'demo/flo/*.flo' -o out"
#   docker run --rm flowiz-test flowiz compare pred.flo gt.flo
#
# Drop into a shell:
#   docker run --rm -it flowiz-test bash
#
# The viewer/ (TypeScript + ~110 MB of ONNX models) is intentionally excluded
# via .dockerignore — this image is the Python package only.

ARG PYTHON_VERSION=3.12
FROM python:${PYTHON_VERSION}-slim

# ffmpeg backs imageio for the video read/write tests (tests/test_video.py) and
# `flowiz video`. No aarch64 binary ships in imageio-ffmpeg, so install it here.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MPLBACKEND=Agg

WORKDIR /app

# Optional-dependency extras to install alongside the test tooling.
# Default is dev-only; pass e.g. EXTRAS=dev,torch,spring to exercise those paths.
ARG EXTRAS=dev

# Copy dependency metadata + package first so the (slow) pip layer is cached
# across edits to tests/ and demo/.
COPY pyproject.toml README.md LICENSE CITATION.cff ./
COPY flowiz ./flowiz
RUN pip install --upgrade pip \
 && pip install -e ".[${EXTRAS}]"

# Test suite and evaluation inputs.
COPY tests ./tests
COPY demo ./demo

# Default: lint + full test suite with coverage, same threshold as CI.
CMD ["bash", "-lc", "ruff check flowiz && pytest --cov=flowiz --cov-report=term-missing --cov-fail-under=85"]
