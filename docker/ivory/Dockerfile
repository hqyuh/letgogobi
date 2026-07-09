FROM ghcr.io/veegres/ivory:latest

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*

COPY scripts/ivory_setup.py /setup/ivory_setup.py
COPY docker/ivory/entrypoint.sh /usr/local/bin/ivory-entrypoint.sh
RUN chmod +x /usr/local/bin/ivory-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/ivory-entrypoint.sh"]
