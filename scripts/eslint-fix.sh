#!/bin/sh
ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint --fix "$@"
