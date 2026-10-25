# qa-rw-express

Minimal Express API used by MIOSA QA to check Railway-style backend hosting.
Reads `PORT` from the environment; no Dockerfile.

Routes: `/`, `/health`, `/fail`, `/db`, `/env?name=NAME`, `/call?target=http://<service>.internal/`.
