#!/usr/bin/env bash
set -euo pipefail

COUCH_USER="admin"
COUCH_PASS="password"
COUCH_URL="http://${COUCH_USER}:${COUCH_PASS}@localhost:5984"

echo "Waiting for CouchDB to be ready..."
for i in $(seq 1 30); do
  if curl -sf "$COUCH_URL/" > /dev/null 2>&1; then
    echo "CouchDB is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: CouchDB did not start within 30 seconds."
    exit 1
  fi
  sleep 1
done

# Enable single-node cluster setup
echo "Configuring single-node cluster..."
curl -sf -X POST "$COUCH_URL/_cluster_setup" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"enable_single_node\",\"username\":\"${COUCH_USER}\",\"password\":\"${COUCH_PASS}\",\"bind_address\":\"0.0.0.0\",\"port\":5984}" \
  || echo "(cluster may already be configured)"

# Create the database
echo "Creating obsidian-livesync database..."
curl -sf -X PUT "$COUCH_URL/obsidian-livesync" \
  || echo "(database may already exist)"

# Enable CORS
echo "Configuring CORS..."
curl -sf -X PUT "$COUCH_URL/_node/_local/_config/httpd/enable_cors" \
  -d '"true"'

curl -sf -X PUT "$COUCH_URL/_node/_local/_config/cors/origins" \
  -d '"app://obsidian.md,capacitor://localhost,http://localhost"'

curl -sf -X PUT "$COUCH_URL/_node/_local/_config/cors/credentials" \
  -d '"true"'

curl -sf -X PUT "$COUCH_URL/_node/_local/_config/cors/methods" \
  -d '"GET, PUT, POST, HEAD, DELETE"'

curl -sf -X PUT "$COUCH_URL/_node/_local/_config/cors/headers" \
  -d '"accept, authorization, content-type, origin, referer, x-csrf-token"'

# Set max request and document sizes
echo "Setting size limits..."
curl -sf -X PUT "$COUCH_URL/_node/_local/_config/chttpd/max_http_request_size" \
  -d '"4294967296"'

curl -sf -X PUT "$COUCH_URL/_node/_local/_config/couchdb/max_document_size" \
  -d '"50000000"'

# Require valid user
echo "Requiring valid user auth..."
curl -sf -X PUT "$COUCH_URL/_node/_local/_config/chttpd/require_valid_user" \
  -d '"true"'

echo ""
echo "CouchDB setup complete!"
echo "  URL: http://localhost:5984"
echo "  Database: obsidian-livesync"
echo "  User: ${COUCH_USER} / ${COUCH_PASS}"
