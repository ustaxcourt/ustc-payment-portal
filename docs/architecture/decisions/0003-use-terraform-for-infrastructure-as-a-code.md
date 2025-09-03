# 3. Use Terraform for Infrastructure as a Code

Date: 2025-09-03

## Status

Accepted

## Context

Application was originally developed to use Serverless Framework to manage its infrastructure. This became harder to maintain and deploy due to the various changes in licensing as Serverless moved to v4.
We want to change to a tool that makes it easier to manage the resources and overcome existing issues.

## Decision

We will use Terraform as Infrastructure as a Code tool to manage application resources in AWS. 

## Consequences

Terraform provides stronger control and consistency in infrastructure management. Decouples build processes from infrastructure provisioning, improving maintainability. It enables robust state and secret management. Simplifies VPC creation and management with greater transparency and verbosity. Facilitates deployment across multiple environments while preserving isolation between resources. Supports cloud-agnostic deployments, allowing flexibility to migrate or expand across providers in the future. Being open source, Terraform introduces no additional licensing costs beyond the underlying infrastructure usage.