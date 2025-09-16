#!/usr/bin/sh
# Script to export the current directory tree to a text file
# Usage: ./export-tree.sh

tree -a -I '.git|node_modules|dist|build|.cache|.next|.vite' -N > scripts/output/project-tree.txt