#!/usr/bin/env bash
#
# create_superadmin.sh — Manual Super Admin creation for HRMS
#
# Interactive wrapper around Django's `create_superadmin` management command.
# Run it from anywhere in the repo; it talks to the running hrms-service container.
#
# Usage:
#   ./scripts/create_superadmin.sh
#   ./scripts/create_superadmin.sh rahat.ait "rahat.ait@iak.ngo" "Rahat Ali Sheikh"
#
# Env overrides (for non-interactive/CI use):
#   SA_USERNAME, SA_EMAIL, SA_FULL_NAME, SA_PASSWORD
#
set -euo pipefail

# ---------------------------------------------------------------- helpers
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!!]${NC} $1"; }
fail(){ echo -e "${RED}[FAIL]${NC} $1" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_SERVICE="hrms-service"

cd "$REPO_ROOT"

# ---------------------------------------------------------------- ensure stack up
if ! docker compose ps --status running --services | grep -qx "$COMPOSE_SERVICE"; then
  warn "Docker container '$COMPOSE_SERVICE' is not running. Starting stack..."
  docker compose up -d
  # wait for API to come alive (max ~90s)
  for i in $(seq 1 30); do
    if curl -fsS http://localhost/health/ >/dev/null 2>&1; then break; fi
    sleep 3
  done
  curl -fsS http://localhost/health/ >/dev/null 2>&1 \
    || fail "Backend did not become healthy. Run: docker compose ps && docker compose logs hrms-service"
fi
ok "Connected to $COMPOSE_SERVICE container."

# ---------------------------------------------------------------- collect inputs
SA_USERNAME="${SA_USERNAME:-}"
SA_EMAIL="${SA_EMAIL:-}"
SA_FULL_NAME="${SA_FULL_NAME:-}"
SA_PASSWORD="${SA_PASSWORD:-}"

# username
while [ -z "$SA_USERNAME" ]; do
  read -rp "Username / Code (e.g. rahat.ait): " SA_USERNAME
done
SA_USERNAME="$(echo "$SA_USERNAME" | tr '[:upper:]' '[:lower:]' | xargs)"

# email
while [ -z "$SA_EMAIL" ]; do
  read -rp "Email: " SA_EMAIL
done
SA_EMAIL="$(echo "$SA_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"

# full name (defaults to username)
if [ -z "$SA_FULL_NAME" ]; then
  read -rp "Full Name (Enter = use '$SA_USERNAME'): " SA_FULL_NAME
fi
[ -z "$SA_FULL_NAME" ] && SA_FULL_NAME="$SA_USERNAME"

# password (with policy check)
while [ -z "$SA_PASSWORD" ]; do
  read -rsp "Password (min 8, incl. uppercase, lowercase, digit, special): " P1; echo
  read -rsp "Confirm password: " P2; echo
  [ "$P1" = "$P2" ] || { warn "Passwords do not match, try again."; continue; }
  SA_PASSWORD="$P1"
done

pw_ok=1
[ ${#SA_PASSWORD} -ge 8 ]   || pw_ok=0
echo "$SA_PASSWORD" | grep -qE '[A-Z]' || pw_ok=0
echo "$SA_PASSWORD" | grep -qE '[a-z]' || pw_ok=0
echo "$SA_PASSWORD" | grep -qE '[0-9]' || pw_ok=0
echo "$SA_PASSWORD" | grep -qE '[^A-Za-z0-9]' || pw_ok=0
[ "$pw_ok" = 1 ] || fail "Password does not meet the policy (min 8 + upper + lower + digit + special)."

# ---------------------------------------------------------------- confirm
echo
echo "-----------------------------"
echo " Creating Super Admin:"
echo "  Username: $SA_USERNAME"
echo "  Code    : ${SA_USERNAME^^}"
echo "  Email   : $SA_EMAIL"
echo "  FullName: $SA_FULL_NAME"
echo "-----------------------------"
read -rp "Proceed? [y/N] " CONFIRM
[ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ] || fail "Aborted."

# ---------------------------------------------------------------- run
docker compose exec -T "$COMPOSE_SERVICE" python manage.py create_superadmin \
  --username "$SA_USERNAME" \
  --email "$SA_EMAIL" \
  --password "$SA_PASSWORD" \
  --full-name "$SA_FULL_NAME"

echo
ok "Super Admin '${SA_USERNAME^^}' created. Login at http://localhost/ with code '${SA_USERNAME^^}' or the email, and the password you set."
warn "Django admin is at http://localhost/auth-admin/ (same username/password applies)."