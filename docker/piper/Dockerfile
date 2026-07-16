# syntax=docker/dockerfile:1
# Official Piper HTTP server (python3 -m piper.http_server, from
# OHF-Voice/piper1-gpl) — deliberately NOT rhasspy/wyoming-piper, which
# speaks the binary Wyoming protocol rather than plain HTTP and can't be
# addressed by a base_url the way this project's provider clients expect
# (PLAN §7.1: "Piper... addressed via base_url exactly like Ollama").
FROM python:3.14-slim@sha256:d3400aa122fa42cf0af0dbe8ec3091b047eac5c8f7e3539f7135e86d855dc015

# Pinned deliberately, not left floating: the *released* HTTP server's
# routes differ from piper1-gpl's docs/unreleased main branch (verified by
# actually running 1.4.2 — synthesis is POST / with no /synthesize or /info
# route, unlike what the current docs describe). packages/providers'
# createPiperClient targets this exact version's contract. Re-verify against
# the new release before bumping.
RUN pip install --no-cache-dir "piper-tts[http]==1.4.2"
RUN addgroup --system app && adduser --system --ingroup app app
WORKDIR /data
RUN mkdir -p /data/voices && chown -R app:app /data
USER app

# Overridable at deploy time; must be a valid piper-voices model id
# (https://rhasspy.github.io/piper-samples/), e.g. "en_US-lessac-medium".
ENV PIPER_VOICE=en_US-lessac-medium

EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/voices')"

# Downloads the configured voice into the mounted volume on first boot
# (idempotent — download_voices skips it if already present), then starts
# the HTTP server, mirroring piper1-gpl's own documented CLI flow.
CMD python3 -m piper.download_voices "$PIPER_VOICE" --data-dir /data/voices && \
    python3 -m piper.http_server -m "$PIPER_VOICE" --data-dir /data/voices --host 0.0.0.0 --port 5000
