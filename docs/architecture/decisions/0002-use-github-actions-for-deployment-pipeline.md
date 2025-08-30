# 2. Use Github Actions for deployment pipelines
Date: 2025-08-29

## Status

Accepted

## Context

Currently the code requires a manual deploy from a user's machine to deploy the code to AWS lambda. We want to move our deployments to a repeatable reliable process that will maintain 3 environments in the cloud.  This will allow us to deploy code to the different environments using a documented and agreed upon workflow. 

## Decision

We evaluated 3 tools as part of this ADR. 
- Github Actions
- Circle CI
- Jenkins

We are going to use Github Actions for our CI/CD pipeline.

## Consequences

This allows our codebase and deployment pipeline to reside in the same location.  It also gives us a secure way to store the secrets needed to deploy as well as access to a wide array of pre-built and re-usable actions. This also allows anyone with GitHub access to see status and logs, enabling better collaboration and faster issue diagnosis. Github Actions also has built in security tools such as SAST and DAST scans that can run automatically. Finally it gives us the tightest possible integration with deployment steps, the triggers can react to pull requests, merges etc. 