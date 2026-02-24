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

while read oldrev newrev refname; do
  # Only process pushes to main/master
  branch=$(echo "$refname" | sed 's|refs/heads/||')
  if [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
    continue
  fi

  # Get list of changed .md files between old and new revisions
  if [ "$oldrev" = "0000000000000000000000000000000000000000" ]; then
    # New branch — sync all files
    changed_files=$(git diff-tree --no-commit-id --name-only -r "$newrev" -- '*.md')
  else
    changed_files=$(git diff --name-only "$oldrev" "$newrev" -- '*.md')
  fi

  if [ -n "$changed_files" ]; then
    echo "[obsidian-git-livesync] Syncing $(echo "$changed_files" | wc -l | tr -d ' ') changed files..."
    echo "$changed_files" | xargs npx obsidian-git-livesync sync
  fi
done
