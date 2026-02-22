# Expense Tracker

A serverless, cloud-native expense tracking application built on AWS. The frontend is a Next.js static export served via CloudFront, the backend is a set of Lambda functions exposed through API Gateway (HTTP API v2), and all infrastructure is managed as code — CDK for cloud resources and SAM for the backend runtime.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Infrastructure Design](#infrastructure-design)
  - [IAM & Security](#iam--security)
  - [Database](#database)
  - [Auth](#auth)
  - [Backend](#backend)
  - [Frontend Hosting](#frontend-hosting)
  - [CDN & Edge](#cdn--edge)
- [Deploy Order & SSM Wiring](#deploy-order--ssm-wiring)
- [CI/CD Pipeline](#cicd-pipeline)
- [Local Development](#local-development)
- [Environment Setup](#environment-setup)
- [Security Model](#security-model)

---

## Architecture Overview

```
User Browser
     │
     ▼
CloudFront (edge-stack)          ← CDN, HTTPS, ACM cert (us-east-1)
     │                  │
     ▼                  ▼
S3 Static Site     API Gateway HTTP API v2 (SAM)
(frontend-stack)        │
                        │  JWT authorizer → Cognito (cognito-stack)
                        ▼
                   Lambda Functions (SAM)
                        │
                        ▼
                   DynamoDB Tables (database-stack)
```

All infrastructure values (table names, Cognito pool IDs, CloudFront domain) are shared between stacks and SAM via **SSM Parameter Store** — no hardcoded ARNs or cross-stack references.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (static export), Node 24, npm 11 |
| Backend | AWS Lambda, Node 24, TypeScript |
| API | AWS API Gateway HTTP API (v2) |
| Auth | AWS Cognito User Pool — JWT authorizer |
| Database | AWS DynamoDB |
| CDN | AWS CloudFront + ACM |
| Frontend Hosting | AWS S3 (static website) |
| Infrastructure | AWS CDK (TypeScript) |
| Backend IaC | AWS SAM (template.yaml) |
| CI/CD | Jenkins on EC2 (t3.micro) |
| Secrets/Config | AWS SSM Parameter Store |

---

## Project Structure

```
Expense-Tracker/
│
├── frontend/                          # Next.js application
│   ├── app/                           # App Router pages and layouts
│   ├── components/                    # Shared UI components
│   ├── public/                        # Static assets
│   ├── next.config.js                 # output: 'export' (static build)
│   ├── package.json                   # Node 24, npm 11
│   └── tsconfig.json
│
├── backend/                           # SAM application (Lambda + API GW)
│   ├── template.yaml                  # SAM template — HTTP API + all Lambda functions
│   ├── samconfig.toml                 # Per-environment deploy configuration
│   ├── src/
│   │   ├── expenses/                  # One folder per Lambda handler
│   │   │   ├── create.ts              # POST /expenses
│   │   │   ├── list.ts                # GET  /expenses
│   │   │   ├── update.ts              # PUT  /expenses/{id}
│   │   │   └── delete.ts              # DELETE /expenses/{id}
│   │   └── shared/                    # Shared utilities across all handlers
│   │       ├── db.ts                  # DynamoDB DocumentClient singleton
│   │       └── types.ts               # Shared TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
├── iac/                               # CDK Infrastructure
│   ├── bin/
│   │   └── expense-tracker-iac.ts     # Entry point — instantiates all stacks in order
│   │
│   ├── lib/
│   │   ├── expense-tracker-iam-stack.ts        # IAM roles, permission boundaries
│   │   ├── expense-tracker-database-stack.ts   # DynamoDB tables
│   │   ├── expense-tracker-cognito-stack.ts    # Cognito User Pool + App Client
│   │   ├── expense-tracker-frontend-stack.ts   # S3 bucket for Next.js static output
│   │   └── expense-tracker-edge-stack.ts       # CloudFront + ACM (must deploy to us-east-1)
│   │
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
│
├── jenkins/
│   ├── Jenkinsfile                    # Main pipeline — CDK → SAM → Frontend
│   └── scripts/
│       ├── deploy-iac.sh              # Runs CDK deploy for all stacks
│       ├── deploy-backend.sh          # Runs SAM build + deploy
│       └── deploy-frontend.sh         # Runs next build + S3 sync + CF invalidation
│
├── .gitignore
└── README.md
```

---

## Infrastructure Design

### IAM & Security

**File:** `iac/lib/expense-tracker-iam-stack.ts`

This is always the first stack deployed. It establishes the IAM role chain that all deployments flow through.

```
EC2 Instance Role (jenkins-ec2-role)
    └── sts:AssumeRole only
         └── Jenkins Deploy Role ({app}-{env}-jenkins-deploy-role)
              ├── SSM read ({app}/{env}/*)
              ├── S3 read/write on CDK bootstrap bucket
              ├── cloudformation:* on {app}-{env}-* stacks
              └── iam:PassRole → cfn-execution-role only
                   └── CFN Execution Role ({app}-{env}-cfn-execution-role)
                        └── Permission Boundary (hard ceiling)
                             ├── S3: {app}-{env}-* only
                             ├── DynamoDB: {app}-{env}-* only
                             ├── Lambda: {app}-{env}-* only
                             ├── API Gateway: account + region
                             ├── CloudFront: account distributions
                             ├── Cognito: account user pools
                             ├── ACM: region + us-east-1
                             ├── Logs: /aws/lambda/{app}-{env}-*
                             └── IAM PassRole: lambda + apigateway only
```

Key security decisions:
- **No static IAM user access keys** — Jenkins EC2 uses an Instance Role. AWS auto-issues temporary STS credentials (1hr TTL). Nothing stored on disk.
- **IMDSv2 enforced** on EC2 — blocks SSRF attacks against the metadata endpoint.
- **Permission boundary** on CFN execution role — even if the role is compromised, it cannot touch resources outside the app's naming convention or create unrestricted IAM roles.
- Jenkins EC2 Security Group — port 8080 restricted to known IPs only. No port 22 open; access via AWS Session Manager.

---

### Database

**File:** `iac/lib/expense-tracker-database-stack.ts`

DynamoDB tables for the application. All table names and ARNs are exported to SSM for consumption by SAM at deploy time.

SSM exports from this stack:
```
/{app}/{env}/database/expenses-table-name
/{app}/{env}/database/expenses-table-arn
```

---

### Auth

**File:** `iac/lib/expense-tracker-cognito-stack.ts`

AWS Cognito User Pool with an App Client for the frontend. The User Pool ID and Client ID are exported to SSM so that:
- SAM wires the HTTP API JWT authorizer automatically
- The Next.js frontend knows which pool to authenticate against

SSM exports from this stack:
```
/{app}/{env}/cognito/user-pool-id
/{app}/{env}/cognito/user-pool-arn
/{app}/{env}/cognito/app-client-id
/{app}/{env}/cognito/issuer-url
```

---

### Backend

**Tool:** AWS SAM (not CDK)
**File:** `backend/template.yaml`

SAM manages the full backend runtime — API Gateway HTTP API v2, all Lambda functions, and their IAM execution roles. SAM was chosen over CDK for the backend because:

- `sam local start-api` gives a full local API + Lambda runtime for development
- `sam local invoke` lets you test individual functions with mock event payloads
- SAM handles Lambda build, packaging, and layer management natively
- It keeps the backend self-contained — a backend developer doesn't need to understand CDK to work on Lambda functions

**API Gateway:** HTTP API v2 with a Cognito JWT authorizer. All routes except health check require a valid Cognito token. The JWT authorizer validates tokens natively — no custom Lambda authorizer code required.

SAM reads the following from SSM at deploy time:
```
/{app}/{env}/cognito/user-pool-id          → JWT authorizer issuer
/{app}/{env}/cognito/app-client-id         → JWT authorizer audience
/{app}/{env}/database/expenses-table-name  → Lambda env var
/{app}/{env}/database/expenses-table-arn   → Lambda IAM policy
/{app}/{env}/edge/cloudfront-domain        → Lambda CORS allow-origin
```

SAM writes the following to SSM after deploy:
```
/{app}/{env}/backend/api-endpoint          → consumed by frontend build
```

---

### Frontend Hosting

**File:** `iac/lib/expense-tracker-frontend-stack.ts`

An S3 bucket configured for static website hosting. The Next.js app is built with `output: 'export'` which produces a fully static site (HTML, CSS, JS, no server required). The Jenkins pipeline syncs the `out/` directory to this bucket after every successful build.

SSM exports from this stack:
```
/{app}/{env}/frontend/bucket-name
/{app}/{env}/frontend/bucket-arn
```

---

### CDN & Edge

**File:** `iac/lib/expense-tracker-edge-stack.ts`
**Region:** `us-east-1` (required by CloudFront for ACM certificates)

CloudFront distribution in front of the S3 bucket. Handles HTTPS termination, caching, and global edge delivery. ACM certificate is provisioned in `us-east-1` regardless of the application's primary region.

SSM exports from this stack:
```
/{app}/{env}/edge/cloudfront-domain        → consumed by SAM (CORS)
/{app}/{env}/edge/cloudfront-distribution-id → consumed by Jenkins (cache invalidation)
/{app}/{env}/edge/certificate-arn
```

---

## Deploy Order & SSM Wiring

Stacks must be deployed in this exact order. Each step writes SSM params that the next step reads.

```
1. CDK: IAM Stack
        └── writes: role ARNs

2. CDK: Database Stack
        └── writes: table names + ARNs → SSM

3. CDK: Cognito Stack
        └── writes: user pool ID + client ID + issuer URL → SSM

4. CDK: Frontend Stack (S3)
        └── writes: bucket name → SSM

5. CDK: Edge Stack (CloudFront + ACM) [us-east-1]
        └── writes: CloudFront domain + distribution ID → SSM

6. SAM: Backend Deploy
        └── reads: Cognito, DynamoDB, CloudFront values from SSM
        └── writes: API endpoint → SSM

7. Frontend Build + Deploy
        └── reads: API endpoint from SSM → bakes into Next.js build
        └── next build → s3 sync → CloudFront invalidation
```

---

## CI/CD Pipeline

**File:** `jenkins/Jenkinsfile`

Jenkins runs on an EC2 t3.micro instance. The pipeline has two tracks — infrastructure changes (CDK) and application changes (SAM + frontend) — but runs end-to-end on every push to ensure consistency.

```
Pipeline stages:
  1. Checkout          — git pull from GitHub
  2. Assume Role       — sts:AssumeRole into {env}-jenkins-deploy-role
  3. CDK Deploy        — deploy all CDK stacks in order
  4. SAM Build         — sam build (compiles TypeScript Lambda handlers)
  5. SAM Deploy        — sam deploy --config-env {env}
  6. Frontend Build    — npm run build (Next.js static export)
  7. Frontend Deploy   — aws s3 sync + CloudFront invalidation
  8. Approval Gate     — manual approval required before prod (prod branch only)
```

Branches map to environments:
- `develop` → `dev`
- `main` → `prod` (requires manual approval before deploy)

---

## Local Development

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 24.x |
| npm | 11.x |
| AWS CLI | v2 |
| AWS SAM CLI | latest |
| AWS CDK CLI | latest |

### Frontend

```bash
cd frontend
npm install
npm run dev          # Next.js dev server at localhost:3000
```

### Backend (Lambda + API locally)

```bash
cd backend
npm install
sam build
sam local start-api  # Local API at localhost:3000
                     # Reads from samconfig.toml for env vars
```

To invoke a single function with a mock event:

```bash
sam local invoke CreateExpenseFunction --event events/create-expense.json
```

### CDK

```bash
cd iac
npm install
npx cdk diff --context appName=expense-tracker --context envName=dev
npx cdk deploy --all --context appName=expense-tracker --context envName=dev
```

---

## Environment Setup

### First-time Bootstrap (run once per account/region)

```bash
# Bootstrap CDK in your primary region
npx cdk bootstrap aws://{ACCOUNT_ID}/{REGION}

# Bootstrap CDK in us-east-1 (required for edge stack ACM cert)
npx cdk bootstrap aws://{ACCOUNT_ID}/us-east-1
```

### Attach Instance Role to Jenkins EC2

After deploying the IAM stack for the first time:

```bash
# Get the instance profile name from SSM
aws ssm get-parameter \
  --name /expense-tracker/dev/iam/jenkins-instance-profile-name \
  --query Parameter.Value --output text

# Attach to EC2 via console:
# EC2 → Your Instance → Actions → Security → Modify IAM Role → Select the profile
```

### Enable IMDSv2 on Jenkins EC2

```bash
aws ec2 modify-instance-metadata-options \
  --instance-id {YOUR_INSTANCE_ID} \
  --http-tokens required \
  --http-put-response-hop-limit 1
```

---

## Security Model

| Threat | Protection |
|---|---|
| Stolen AWS credentials | No static keys — EC2 Instance Role with 1hr STS tokens |
| SSRF → metadata API | IMDSv2 enforced (PUT preflight required) |
| Lateral movement to other AWS services | EC2 role only has `sts:AssumeRole` on `{app}-*-deploy-role` |
| Privilege escalation via CFN | Permission boundary blocks creation of roles outside `{app}-{env}-*` |
| Unauthorized prod deploy | Manual approval gate in Jenkins + SG restricted to known IPs |
| Unauthenticated API access | Cognito JWT authorizer on all API routes |
| Cross-env data access | Every policy scoped to `/{app}/{env}/` prefix — dev Lambda cannot read prod DynamoDB |
| Port scanning / SSH brute force | Port 22 not open — access only via AWS Session Manager |
| Unusual API activity | CloudTrail enabled — alarm on `sts:AssumeRole` from unknown IPs and any IAM mutations |