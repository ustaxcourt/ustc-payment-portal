# 4. IAM Authentication and Authorization for API Gateway

Date: 2025-10-02

## Status

Accepted

## Context

The Payment Portal API currently uses a simple Bearer token authentication mechanism with a shared `API_ACCESS_TOKEN` environment variable. This approach has several limitations:

1. **Single shared token**: All client applications use the same token, making it impossible to differentiate between clients or revoke access to a specific application
2. **No authorization logic**: There is no mechanism to control which client applications can process payments for specific fees (identified by `tcsAppId`)
3. **Manual secret management**: Token rotation and distribution requires manual coordination
4. **Limited auditability**: Unable to trace which client made specific API requests

The Payment Portal will be used by multiple USTC applications (DAWSON, and potentially 3-4 other applications) to initiate and process payments. Each application will utilize AWS Lambda functions make authenticated requests to the Payment Portal API. Different applications should only be authorized to process payments for specific fees based on their `tcsAppId` values.

For example:

- DAWSON might process Petition Fees (`tcsAppId`: 12345) and Admissions Fees (`tcsAppId`: 67890)
- Another application might only process Filing Fees (`tcsAppId`: 11111)

Since all client applications are AWS Lambda functions within AWS infrastructure, we have an opportunity to leverage native AWS authentication mechanisms.

**Cross-Account Considerations**: DAWSON and other client applications run in separate AWS accounts from the Payment Portal. This requires establishing cross-account IAM trust relationships to enable secure API access across account boundaries.

## Decision

We will implement **AWS IAM authentication using SigV4 request signing** with **authorization enforcement via DynamoDB-based permission mappings**.

### Authentication Approach

1. **API Gateway Methods**: Change all API Gateway methods from `authorization = "NONE"` to `authorization = "AWS_IAM"`
2. **API Gateway Resource Policy**: Configure cross-account access by adding resource policies that allow client account IAM principals to invoke the API
3. **Client IAM Roles**: Create dedicated IAM roles in each client AWS account (e.g., DAWSON account) with least-privilege policies to invoke specific Payment Portal API Gateway endpoints
4. **Request Signing**: Client Lambda functions will assume their designated IAM role and sign requests using AWS Signature Version 4 (SigV4)
5. **IAM Principal Validation**: Payment Portal Lambda functions will validate the IAM principal from `event.requestContext.identity.userArn`

### Authorization Approach

1. **DynamoDB Permissions Table**: Create a `client-permissions` DynamoDB table mapping IAM role ARNs to allowed `tcsAppId` values
2. **Runtime Validation**: Payment Portal Lambda functions will query DynamoDB to verify the calling IAM principal is authorized for the requested `tcsAppId`
3. **Centralized Permission Management**: Authorization rules can be updated in DynamoDB without code or infrastructure changes

### Data Model

**DynamoDB Table: `ustc-payment-portal-{env}-client-permissions`**

```
{
  "ClientRoleArn": "arn:aws:iam::123456789012:role/payment-portal-client-dawson",
  "ClientName": "DAWSON",
  "ClientAccountId": "123456789012",
  "AllowedTcsAppIds": ["12345", "67890"],
  "CreatedAt": "2025-10-02T10:00:00Z",
  "UpdatedAt": "2025-10-02T10:00:00Z"
}
```

### Implementation Components

1. **Terraform**:

   - Update API Gateway method resources to use IAM authentication
   - Add API Gateway resource policy allowing cross-account access from client AWS accounts
   - Create DynamoDB table for permission mappings (including `ClientAccountId` field)
   - Grant Payment Portal Lambda read access to DynamoDB
   - Document IAM role requirements for client account administrators

2. **Application Code**:

   - Update `authorizeRequest()` to read IAM principal from request context
   - Add DynamoDB query logic to validate `tcsAppId` authorization
   - Return 401 for missing authentication, 403 for unauthorized `tcsAppId`

3. **Client Integration**:
   - Client account administrators create IAM roles in their accounts with permissions to invoke the Payment Portal API Gateway
   - Client Lambda functions assume their designated IAM role
   - Use AWS SDK to automatically sign API requests with SigV4
   - Include required `tcsAppId` in request payload

## Consequences

### Positive

- **No Secret Management**: IAM credentials rotate automatically, eliminating manual token rotation
- **Zero Additional Cost**: No additional infrastructure beyond DynamoDB table (uses existing IAM)
- **Native AWS Integration**: Client Lambda functions use AWS SDK with automatic request signing
- **Fine-Grained Authorization**: Each client can be restricted to specific `tcsAppId` values
- **Strong Auditability**: AWS CloudTrail logs all IAM-authenticated API requests with principal information, including cross-account calls
- **Least Privilege**: Each client has minimal IAM permissions for only the endpoints they need
- **Scalable**: Easy to add new clients by creating new IAM role and DynamoDB entry
- **Revocable**: Can revoke client access by updating API Gateway resource policies or DynamoDB entries without API changes
- **Network Security**: Can optionally use VPC endpoints for private API access

### Negative

- **AWS-Specific**: Solution is tightly coupled to AWS (not a concern for internal Lambda-to-Lambda communication)
- **Additional DynamoDB Costs**: Minimal cost for permission lookups (~$0.25 per million reads with on-demand pricing)
- **Initial Complexity**: Requires client applications to implement SigV4 request signing (mitigated by AWS SDK support)
- **DynamoDB Dependency**: Authorization validation depends on DynamoDB availability (mitigated by caching strategy if needed)
- **Cross-Account Coordination**: Requires coordination with client account administrators to create and maintain IAM roles
- **API Gateway Resource Policy Management**: Must maintain and update resource policies as new client accounts are onboarded

### Alternatives Considered

**Lambda Authorizer with JWT**

- Requires custom Lambda function and JWT secret management
- Additional latency and cost (~$5/month)
- Unnecessary complexity for AWS-internal communication
- Still requires authorization logic similar to IAM approach

## Migration Path

1. Create DynamoDB permissions table and seed with initial client mappings (including cross-account role ARNs)
2. Add API Gateway resource policy allowing cross-account access from client AWS accounts
3. Coordinate with client account administrators (e.g., DAWSON team) to create IAM roles in their accounts with permissions to invoke Payment Portal API
4. Deploy updated API Gateway configuration (add IAM authorization)
5. Deploy updated Payment Portal Lambda code (add authorization validation)
6. Coordinate with client teams to update their Lambda functions to use SigV4 signing with their IAM roles
7. Verify cross-account authentication and authorization in lower environments
8. Remove legacy `API_ACCESS_TOKEN` environment variable after migration complete

## References

- [AWS API Gateway IAM Authentication](https://docs.aws.amazon.com/apigateway/latest/developerguide/permissions.html)
- [AWS Signature Version 4](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html)
