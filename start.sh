#!/bin/bash
cd "$(dirname "$0")"
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron .
