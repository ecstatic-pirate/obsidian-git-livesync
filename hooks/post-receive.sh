#!/bin/bash
#
# Git post-receive hook for obsidian-git-livesync
#
# Install this hook in your bare git repo to auto-sync markdown files
# to CouchDB whenever a push is received.
#
# Installation:
#   cp hooks/post-receive.sh /path/to/repo.git/hooks/post-receive
#   chmod +x /path/to/repo.git/hooks/post-receive
#
# Required: obsidian-git-livesync must be installed globally or available via npx.
# Configure via environment variables or .obsidian-git-livesync.json in the repo root.

# Configure file extensions to sync (space-separated glob patterns)
EXTENSIONS="*.md"
# To sync additional types, add patterns: EXTENSIONS="*.md *.canvas *.txt"

while read oldrev newrev refname; do
  # Only process pushes to main/master
  branch=$(echo "$refname" | sed 's|refs/heads/||')
  if [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
    continue
  fi

  # Count changed files matching EXTENSIONS (null-delimited for safety)
  if [ "$oldrev" = "0000000000000000000000000000000000000000" ]; then
    # Initial push — sync all matching files in the new commit
    file_count=$(git diff-tree --no-commit-id -r -z --name-only "$newrev" -- $EXTENSIONS | tr -cd '\0' | wc -c | tr -d ' ')
  else
    file_count=$(git diff -z --name-only "$oldrev" "$newrev" -- $EXTENSIONS | tr -cd '\0' | wc -c | tr -d ' ')
  fi

  if [ "$file_count" -gt 0 ]; then
    echo "[obsidian-git-livesync] Syncing ${file_count} changed files..."
    if [ "$oldrev" = "0000000000000000000000000000000000000000" ]; then
      git diff-tree --no-commit-id -r -z --name-only "$newrev" -- $EXTENSIONS \
        | xargs -0 npx obsidian-git-livesync sync --
    else
      git diff -z --name-only "$oldrev" "$newrev" -- $EXTENSIONS \
        | xargs -0 npx obsidian-git-livesync sync --
    fi
  fi
done
