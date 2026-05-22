# 8. Choosing a Linting and Formatting Solution

Date: 2026-05-22

## Status

Proposed

## Context

We currently use a barebones **TSLint** setup for linting and no formatter for Payment Portal. TSLint has been officially depreciated and abandoned since 2019 and needs to be replaced. This is also indicative of a larger problem, we do very little to enforce a code styling guide for Payment Portal. This wasn't a problem when we were a proof of concept, but now with our increased activity we are starting to see more PRs with multiple 'format only' changes. These typically appear either from using Prettier without it being officially configured in the project, or if you are using an AI Agent it will sometimes make 'prettier' styling changes 
