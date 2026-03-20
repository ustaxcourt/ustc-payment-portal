# How to setup custom domains for USTC Payment Portal

Custom domains for the Payment Portal are subdomains of ustaxcourt.gov. You will never need to manage the ustaxcourt.gov domain directly — ISD controls it and adds NS delegation records pointing to our Route53 hosted zones, giving us authoritative control over each subdomain (e.g. dev-payments.ustaxcourt.gov).

## Requirements

- Access to USTC Payment Portal AWS Accounts and ability to sign in via SSO. Profiles for the Payment Portal accounts should be saved to your `aws configure` if you are already a part of the internal Payment Portal Team.

### Terraform Changes Needed (if not already present)

These are in our Terraform architecture at time of writing, but if for any reason they get removed, here's what's needed:

#### Resources required for dev, stg, and prod

- A **route53 hosted zone** for each of our 3 environments, **dev, stg, and prod**.
- `aws_acm_certificate`, DNS-validated certificate for the subdomain.
- `aws_acm_certificate_validation`, waits for DNS propagation before unblocking Terraform apply.
- `aws_route53_record` for certificate validation, it's the CNAME record ACM requires to prove domain ownership.

#### API Gateway Module Changes

- Register the custom domain via `aws_api_gateway_domain_name`
- Connect the API with the custom subdomain via `aws_api_gateway_base_path_mapping`
- **Alias A record** pointing the subdomain at API Gateway's region endpoint via `aws_route53_record`.

#### IAM (deployer role permissions)

- Route53 permissions scoped to hosted zone ARN
  - `route53:ChangeResourceRecordSets`
  - `route53:ListResourceRecordSets`
  - `route53:GetHostedZone`
  - `route53:CreateHostedZone`
  - `route53:DeleteHostedZone`
  - `route53:ListTagsForResource`
  - `route53:ChangeTagsForResource`
- `route53:ListHostedZones` allowed on **\***
- `route53:GetChange` allowed on `arn:aws:route53:::change/*`
- ACM Permissions scoped to `arn:aws:acm:<region>:<account>:certificate/\*`

### Setting up NS Delegation Records

Once terraform apply has run successfully in each environment, coordinate with your Tech Lead or ISD contact to provide them with the nameservers and intended subdomains for this project:

| Environment | Domain                        |
| ----------- | ----------------------------- |
| dev         | `dev-payments.ustaxcourt.gov` |
| stg         | `stg-payments.ustaxcourt.gov` |
| prod        | `payments.ustaxcourt.gov`     |

#### How to retrieve the name servers

You will need to log into each environment separately via the AWS CLI to retrieve the name servers.

1. Navigate to `terraform/environments/dev` in terminal.
2. Log into AWS with your ustc-payment-portal dev profile. If you don't know the profile name, run `aws configure list-profiles` first.
   ```bash
   aws sso login --profile <profile-name>
   export AWS_PROFILE=<profile-name>
   ```
3. Run `terraform init -backend-config=backend.hcl`
4. Run `terraform output hosted_zone_nameservers`. Copy the result to a text file.
5. Repeat steps 1–4, navigating to the **stg** and **prod** folder respectively, logging into the AWS profile for each. (There's a separate stg and prod profile for these.)

Send the name servers from the output, the subdomains above to your Tech Lead or ISD contact, and ask for them to create NS Delegation records to point at the nameservers.

### Testing

At this point, the subdomains should be fully hooked up and accessible via the web browser. Check `dev-payments.ustaxcourt.gov`, `stg-payments.ustaxcourt.gov`, and `payments.ustaxcourt.gov` to make sure they are hosted.

> **Note:** `stg-payments.ustaxcourt.gov` and `payments.ustaxcourt.gov` may not work until the promotion pipeline is complete. `dev-payments.ustaxcourt.gov` is expected to work.
#### Expected Response
```json
HTTP/2 403
{"message":"Forbidden"}
```
- DNS resolved correctly
- The ACM certificate is valid (no SSL error)
- API Gateway received and rejected the request as expected (request isn't sigv4 signed)
#### What will I see if the domain isn't live?

- An SSL/TLS handshake error — cert not yet validated
- Could not resolve host — DNS not propagated yet
- A timeout — NS delegation not in place yet

> **Important:** ACM certificate validation can take up to 30 minutes after ISD adds the NS delegation records. If a domain isn't reachable immediately, wait and check again before assuming something is misconfigured.
