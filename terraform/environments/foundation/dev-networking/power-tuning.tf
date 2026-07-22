# AWS Lambda Power Tuning — DEV ONLY.
#
# Provisioned via the AWS Serverless Application Repository (SAR), which
# materializes a CloudFormation nested stack: a Step Functions state machine
# plus helper Lambdas (initializer, publisher, executor, cleaner, analyzer,
# optimizer) and their IAM roles. We do NOT hand-write those resources — we own
# the SAR stack and its parameters only.
#
# SECURITY / SCOPING NOTE
# -----------------------
# The tool's `lambdaResource` parameter is a single String rendered directly as
# `Resource` in the helper roles' IAM policies (see the upstream template:
# `Resource: !Ref lambdaResource`). It therefore cannot enumerate a discrete set
# of ARNs. In this account, the unsuffixed dev functions
# (`ustc-payment-processor-<fn>`) and the ephemeral PR functions
# (`ustc-payment-processor-pr-<n>-<fn>`) share the same prefix, so a bare prefix
# wildcard would let the tuner reach PR / dashboard / migration functions too.
#
# To honor the intended exact scoping we pass a permissions boundary
# (`aws_iam_policy.power_tuning_boundary`) applied to every helper Lambda role.
# The effective permission is the intersection of the wildcard `lambdaResource`
# and the boundary, which reduces the tuner's reach to EXACTLY the five dev
# functions we intend to tune (plus their version/alias qualifiers). PR,
# dashboard, and migrationRunner functions are outside the boundary and cannot
# be touched even though they match the prefix.

locals {
  power_tuning_account_id = data.aws_caller_identity.current.account_id

  # The dev (unsuffixed) functions we intend to power-tune. PR environments get a
  # `-pr-<n>` infix in this same account and are deliberately excluded; dashboard
  # and migrationRunner functions are not tuned.
  power_tuning_target_functions = [
    "initPayment",
    "processPayment",
    "getDetails",
    "testCert",
    "healthCheck",
  ]

  # Both the bare function ARN and the `:*` qualifier form (published versions and
  # the `live` alias the tuner creates/deletes during a run).
  power_tuning_target_arns = flatten([
    for fn in local.power_tuning_target_functions : [
      "arn:aws:lambda:${local.aws_region}:${local.power_tuning_account_id}:function:ustc-payment-processor-${fn}",
      "arn:aws:lambda:${local.aws_region}:${local.power_tuning_account_id}:function:ustc-payment-processor-${fn}:*",
    ]
  ])

  # DEV-ONLY power-tuning pre-processor helper Lambdas (defined in
  # environments/dev/power-tuning-preprocessors.tf). The tuner's executor invokes
  # the per-target pre-processor before each iteration, so the helper roles need
  # lambda:InvokeFunction on these. They match the broad `lambdaResource` prefix
  # wildcard, so the boundary must ALSO allow them or the intersection would deny
  # the invoke. Invoke-only — the tuner never publishes versions/aliases on them.
  power_tuning_preprocessor_functions = [
    "tuner-init-refgen",
    "tuner-token-minter",
  ]

  power_tuning_preprocessor_arns = flatten([
    for fn in local.power_tuning_preprocessor_functions : [
      "arn:aws:lambda:${local.aws_region}:${local.power_tuning_account_id}:function:ustc-payment-processor-${fn}",
      "arn:aws:lambda:${local.aws_region}:${local.power_tuning_account_id}:function:ustc-payment-processor-${fn}:*",
    ]
  ])
}

# Permissions boundary caps every power-tuning helper Lambda role to CloudWatch
# Logs plus Lambda actions on ONLY the five dev target functions. Combined with
# the broad `lambdaResource` prefix below, the effective permission set is exact.
resource "aws_iam_policy" "power_tuning_boundary" {
  name        = "ustc-payment-processor-dev-power-tuning-boundary"
  description = "Permissions boundary limiting Lambda Power Tuning helper roles to logging and the five dev target functions."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "HelperLogging"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${local.aws_region}:${local.power_tuning_account_id}:*"
      },
      {
        Sid    = "TuneDevTargetsOnly"
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:GetAlias",
          "lambda:CreateAlias",
          "lambda:UpdateAlias",
          "lambda:DeleteAlias",
          "lambda:PublishVersion",
          "lambda:UpdateFunctionConfiguration",
          "lambda:DeleteFunction",
        ]
        Resource = local.power_tuning_target_arns
      },
      {
        Sid      = "InvokePreProcessorsOnly"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = local.power_tuning_preprocessor_arns
      },
    ]
  })
}

resource "aws_serverlessapplicationrepository_cloudformation_stack" "power_tuning" {
  name             = "ustc-payment-processor-dev-power-tuning"
  application_id   = "arn:aws:serverlessrepo:us-east-1:451282441545:applications/aws-lambda-power-tuning"
  semantic_version = "4.4.0"
  capabilities     = ["CAPABILITY_IAM"]

  parameters = {
    # Single-String param -> broad dev prefix. The permissions boundary above
    # intersects it down to the five exact dev functions; this is NOT a blanket "*".
    lambdaResource = "arn:aws:lambda:${local.aws_region}:${local.power_tuning_account_id}:function:ustc-payment-processor-*"

    # Applied to every helper Lambda role — the scoping lever described above.
    permissionsBoundary = aws_iam_policy.power_tuning_boundary.arn

    # Default power values used only when a run does not supply its own.
    PowerValues = "128,256,512,768,1024,1536"

    # Deploy-time only (cannot be overridden at execution). Max headroom so large
    # sequential tuning runs (high `num`) do not hit States.Timeout.
    totalExecutionTimeout = 900
  }
}

# --- CI deployer: permission to run tuning executions (Phase 4 workflow) --------
# Scoped, dev-only, and attached to the existing deployer role by name (same
# pattern as the artifacts-bucket attachment in main.tf). Kept out of the shared
# modules/iam so stg/prod deployer roles never receive these permissions.
resource "aws_iam_policy" "power_tuning_deployer" {
  name        = "ustc-payment-processor-dev-power-tuning-deployer"
  description = "Allows the dev CI deployer role to start/inspect Lambda Power Tuning executions and pass the dev-only tuner pre-processor roles."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StartTuningExecutions"
        Effect   = "Allow"
        Action   = ["states:StartExecution"]
        Resource = aws_serverlessapplicationrepository_cloudformation_stack.power_tuning.outputs["StateMachineARN"]
      },
      {
        Sid    = "InspectTuningExecutions"
        Effect = "Allow"
        Action = [
          "states:DescribeExecution",
          "states:GetExecutionHistory",
          "states:StopExecution",
        ]
        Resource = "${replace(aws_serverlessapplicationrepository_cloudformation_stack.power_tuning.outputs["StateMachineARN"], ":stateMachine:", ":execution:")}:*"
      },
      {
        # The per-env dev stack creates dedicated execution roles for the two
        # tuner pre-processor Lambdas. The deployer can create roles matching
        # `ustc-payment-processor-*` (inline policy in modules/iam) but its
        # iam:PassRole is otherwise scoped only to the shared lambda_exec role, so
        # grant PassRole for the tuner roles here (dev-only, attach-by-name).
        Sid      = "PassPreProcessorRoles"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:aws:iam::${local.power_tuning_account_id}:role/ustc-payment-processor-tuner-*"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "lambda.amazonaws.com"
          }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "power_tuning_deployer" {
  role       = module.iam.deployer_role_name
  policy_arn = aws_iam_policy.power_tuning_deployer.arn
}
