#!/usr/bin/env sh

set -eu

repo_dir=".repos/effect"
repo_url="https://github.com/Effect-TS/effect"

if [ -d "$repo_dir/.git" ]; then
	exit 0
fi

if [ -e "$repo_dir" ]; then
	echo "$repo_dir exists but is not a Git checkout" >&2
	exit 1
fi

mkdir -p ".repos"
git clone --branch main --single-branch "$repo_url" "$repo_dir"
