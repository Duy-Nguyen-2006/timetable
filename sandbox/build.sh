#!/bin/bash
# Build the sandbox Docker image manually

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="timetable-sandbox:latest"

echo "Building secure sandbox image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR"

echo ""
echo "✓ Image built successfully."
echo "You can now run the agent with sandbox enabled (USE_SANDBOX=True in agent.py)."