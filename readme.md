# Expense Tracker — Project Documentation
## Complete Session Summary (For Next Chat)

---

## 1. Project Overview

**Name:** Expense Tracker
**Repo:** github.com/Niketan1604/FlowMint
**Architecture:** Monorepo with 3 subdirectories — `iac/`, `backend/`, `frontend/`
**AWS Account:** Free tier
**Primary Region:** ap-south-1 (Mumbai)
**Edge Region:** us-east-1 (CloudFront requirement)

### Tech Stack
```
Infrastructure  → AWS CDK (TypeScript)
Backend         → AWS SAM + Lambda (TypeScript, Node.js 24.x, arm64)
Frontend        → Next.js (static export → S3 + CloudFront)
Database        → DynamoDB (single table design)
Auth            → Cognito (email/password, Phase 2: Google + Facebook)
CI/CD           → Jenkins on EC2 (i-024a4bc81e88635ab, ap-south-1)
```

---

## 2. Infrastructure (CDK Stacks)

### Stack Deployment Order
```
1. IAM Stack           → ap-south-1  ✅ DEPLOYED
2. Database Stack      → ap-south-1  ✅ DEPLOYED
3. Frontend Stack      → ap-south-1  ✅ DEPLOYED
4. Edge Stack          → us-east-1   ✅ DEPLOYED
5. Cognito Stack       → ap-south-1  ✅ DEPLOYED (Phase 1 - email/password only)
6. Backend Stack       → ap-south-1  🔄 IN PROGRESS (SAM deploy)
```

### Stack Details

#### IAM Stack (`flowmint-dev-iam`)
- `jenkins-deploy-role` — assumed by EC2 Jenkins to deploy all stacks
- `cfn-execution-role` — passed to CloudFormation for stack operations
- **Key permissions on jenkins-deploy-role:**
  - SSM GetParameter (CDK bootstrap params — both ap-south-1 + us-east-1)
  - iam:PassRole (cfn-exec roles — both regions)
  - S3 bootstrap buckets (both regions)
  - CloudFormation stacks (both regions)
  - SSM params for app (`/flowmint/env/*`)

#### Database Stack (`flowmint-dev-database`)
- DynamoDB single table: `flowmint-dev-table`
- GSI: `GSI1` (GSI1PK + GSI1SK)
- **SSM exports (ap-south-1):**
  ```
  /flowmint/dev/database/table-name
  /flowmint/dev/database/table-arn
  /flowmint/dev/database/gsi1-arn
  ```

#### Frontend Stack (`flowmint-dev-frontend`)
- S3 bucket for Next.js static export
- **SSM exports (ap-south-1):**
  ```
  /flowmint/dev/frontend/bucket-name
  ```

#### Edge Stack (`flowmint-dev-edge`)
- CloudFront distribution with OAC (Origin Access Control)
- S3 bucket policy set via `AwsCustomResource` (bucket is in ap-south-1, stack in us-east-1)
  - `region: 'ap-south-1'` explicitly set on all AwsCustomResource SDK calls
- No geo-restriction (removed to avoid false 403s during testing)
- **SSM exports (us-east-1):**
  ```
  /flowmint/dev/edge/cloudfront-domain
  /flowmint/dev/edge/distribution-id
  ```

#### Cognito Stack (`flowmint-dev-cognito`) — Phase 1
- User Pool: `flowmint-dev-user-pool`
  - Email-only sign-in (case-insensitive)
  - Self sign-up enabled
  - Email verification via code
  - `keepOriginal.email: true`
  - Strong password policy (8+ chars, upper, lower, digits, symbols)
  - `deletionProtection: envName === 'prod'` only
  - `removalPolicy: RETAIN` on prod, `DESTROY` on dev
  - No `advancedSecurityMode` (costs money on free tier)
- App Client: `flowmint-dev-client`
  - `generateSecret: false` (public SPA client)
  - `authFlows: { userSrp: true }` only (no plaintext password)
  - `enableTokenRevocation: true`
  - `preventUserExistenceErrors: true`
  - OAuth: authorizationCodeGrant, callbacks to CloudFront + localhost:3000
  - Token validity: access=30min, id=30min, refresh=30days, session=3min
- Hosted UI domain: `flowmint-dev.auth.ap-south-1.amazoncognito.com`
- **SSM exports (ap-south-1):**
  ```
  /flowmint/dev/cognito/user-pool-id
  /flowmint/dev/cognito/app-client-id
  /flowmint/dev/cognito/issuer-url
  /flowmint/dev/cognito/hosted-domain
  ```
- **`cloudfrontDomain` prop** — passed from `bin/flowmint-iac.ts` via CDK context:
  ```typescript
  // In bin/flowmint-iac.ts
  const cloudfrontDomain = app.node.tryGetContext('cloudfrontDomain');
  ```
  ```bash
  # In Jenkinsfile before cdk synth (Stage 4 - Read SSM Config):
  CLOUDFRONT_DOMAIN=$(aws ssm get-parameter \
    --name /flowmint/dev/edge/cloudfront-domain \
    --region us-east-1 ...)

  npx cdk synth --context cloudfrontDomain=${CLOUDFRONT_DOMAIN}
  ```

### IAC Jenkinsfile Stages
```
1.  Checkout
2.  Assume Role
3.  Install Dependencies
4.  Read SSM Config        ← reads cloudfront-domain from us-east-1
5.  CDK Synth              ← --context env=dev --context cloudfrontDomain=xxx
6.  CDK Diff               ← --app cdk.out (no re-synth)
7.  Approval Gate
8.  Deploy: IAM
9.  Deploy: Database
10. Deploy: Cognito
11. Deploy: Frontend S3
12. Deploy: Edge (CloudFront)
13. Print CloudFront URL
```

### Key CDK Patterns Used
- `--app cdk.out` — synth once, reuse for diff + deploy
- `AwsCustomResource` — S3 bucket policy cross-region (edge stack in us-east-1, bucket in ap-south-1)
- `addDependency()` — explicit ordering between stacks
- `crossRegionReferences: true` — frontend → edge stack
- SSM params written natively via `ssm.StringParameter`

---

## 3. DynamoDB Table Design (Single Table)

**Table Name:** `flowmint-dev-table`

### Access Patterns & Key Structure
```
Entity          PK                    SK
──────────────────────────────────────────────────────────────
UserProfile     USER#{userId}         PROFILE
Category        USER#{userId}         CATEGORY#{categoryId}
Budget          USER#{userId}         BUDGET#{yyyy}#{mm}#{categoryId}
Expense         USER#{userId}         EXPENSE#{yyyy-mm-dd}#{expenseId}
MonthlySummary  USER#{userId}         SUMMARY#{yyyy}#{mm}#{categoryId}
MonthlyTotal    USER#{userId}         SUMMARY#{yyyy}#{mm}#ALL
```

### GSI1 (for expense queries by category)
```
GSI1PK: USER#{userId}#CAT#{categoryId}
GSI1SK: EXPENSE#{yyyy-mm-dd}#{expenseId}
```

### Key Design Decisions
- `userId` = Cognito `sub` (NOT username) — stable, unique, works with social login
- Month always zero-padded: `'01'` not `'1'`
- Date in ISO format: `yyyy-mm-dd`
- `MonthlySummary` updated atomically via `TransactWriteItems` on every expense write
- `MonthlyTotal` (`SUMMARY#{yyyy}#{mm}#ALL`) — pre-aggregated total across all categories

---

## 4. Backend (SAM + Lambda)

### Current Status
- Foundation APIs implemented, ready to deploy

### Project Structure
```
backend/
├── template.yaml
├── package.json
├── tsconfig.json
└── src/
    ├── shared/
    │   ├── db.ts          ← DynamoDB DocumentClient + TABLE_NAME
    │   ├── auth.ts        ← getUserId(), getUserEmail() from JWT claims
    │   ├── constants.ts   ← STATUS codes, response(), error() helpers
    │   └── logger.ts      ← createLogger(service) using @aws-lambda-powertools/logger
    ├── health/
    │   └── index.ts       ← GET /health (public, no auth)
    └── user/
        ├── model.ts       ← UserProfile interface + userProfileKey()
        ├── getUserProfile/
        │   └── index.ts   ← GET /user/profile
        └── putUserProfile/
            └── index.ts   ← PUT /user/profile
```

### template.yaml Key Points
- **Runtime:** nodejs24.x, arm64, 256MB, 29s timeout
- **Build:** esbuild via SAM `Metadata.BuildMethod` (Minify: true, per function)
- **HTTP API:** JWT authorizer (Cognito) as default, `/health` is `Authorizer: NONE`
- **CORS:** Configured at API Gateway level (NOT in Lambda handlers)
- **SSM resolution:** `!Sub '{{resolve:ssm:/flowmint/${EnvName}/...}}'` at deploy time
- **Log retention:** 7 days dev, 30 days prod via `!If [IsProd, 30, 7]`
- **SSM export:** `ApiEndpointParam` resource writes `/flowmint/dev/backend/api-endpoint` automatically

### SAM Deploy Command
```bash
sam deploy \
  --stack-name flowmint-dev-backend \
  --region ap-south-1 \
  --capabilities CAPABILITY_IAM \
  --force-upload \                    # always overrides console changes
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    AppName=flowmint \
    EnvName=dev
```

### Backend Jenkinsfile Stages
```
1.  Checkout
2.  Assume Role
3.  Install Dependencies (npm ci)
4.  Type Check (tsc --noEmit)
5.  Lint (eslint)
6.  Unit Tests (jest --passWithNoTests)
7.  Security Audit (npm audit --audit-level=high)
8.  SAM Validate (sam validate --lint)
9.  SAM Build (sam build --parallel)
10. Approval Gate (prod only)
11. SAM Deploy
12. Smoke Test (curl /health)
```

### Shared Layer Patterns

#### `shared/constants.ts`
```typescript
export const STATUS = { OK: 200, CREATED: 201, ... } as const;

export const response = <T>(data: T) => ({
  statusCode: STATUS.OK,
  body: JSON.stringify({ status: STATUS.OK, data, message: null })
});

export const error = (statusCode: number, message: string) => ({
  statusCode,
  body: JSON.stringify({ status: statusCode, data: null, message })
});
```

#### Response Envelope (ALL APIs return this shape)
```json
// Success
{ "status": 200, "data": { ... }, "message": null }

// Error
{ "status": 404, "data": null, "message": "User profile not found" }
```

#### `shared/auth.ts`
```typescript
export const getUserId = (event): string | undefined  // Cognito sub
export const getUserEmail = (event): string | undefined
```

#### `shared/logger.ts`
```typescript
// Uses @aws-lambda-powertools/logger
export const createLogger = (service: string): Logger

// Usage in each handler:
const logger = createLogger('getUserProfile');
logger.info('message', { userId });
logger.error('message', { error });
```

#### XSS Protection Pattern
```typescript
// Sanitize only event.body — NOT the entire event
// (sanitizing entire event corrupts JWT claims in requestContext)
if (event.body) {
  event = { ...event, body: xss(event.body) };
}
```

### Handler Conventions
1. No hardcoded status codes — always use `STATUS.*`
2. No `JSON.stringify` in handlers — use `response()` / `error()`
3. No CORS headers in Lambda — handled at API Gateway level
4. Strip PK/SK from all DynamoDB responses: `const { PK, SK, ...data } = item`
5. `userId` always from JWT `sub`, never from request body
6. `email` always from JWT claims, never from request body
7. Each feature folder has its own `model.ts`
8. Each handler has its own logger: `const logger = createLogger('handlerName')`

### Dependencies
```json
{
  "dependencies": {
    "@aws-lambda-powertools/logger": "^2.31.0",
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "xss": "^1.0.15"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "esbuild": "^0.27.3",
    "eslint": "^9.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## 5. Cognito Testing (How to Test)

### Get Tokens via Hosted UI
```
1. Open in browser:
https://flowmint-dev.auth.ap-south-1.amazoncognito.com/login
  ?client_id=<app-client-id>
  &response_type=code
  &scope=email+openid+profile
  &redirect_uri=http://localhost:3000

2. Sign up / sign in → get code from redirect URL

3. Exchange code for tokens (Thunder Client or curl):
POST https://flowmint-dev.auth.ap-south-1.amazoncognito.com/oauth2/token
Content-Type: application/x-www-form-urlencoded
Body (Form):
  grant_type=authorization_code
  client_id=<app-client-id>
  code=<code>
  redirect_uri=http://localhost:3000

4. Get back: access_token, id_token, refresh_token
```

### Token Notes
- `id_token` — contains email, email_verified, sub (decode at jwt.io)
- `access_token` — contains username, scope (used by API Gateway JWT authorizer)
- `refresh_token` — opaque (not a JWT, cannot be decoded — this is correct)
- Code expires in ~60 seconds — exchange immediately

---

## 6. Jenkins Setup

**EC2:** i-024a4bc81e88635ab, ap-south-1
**Jenkins URL:** http://<ec2-ip>:8080

### Multibranch Pipeline Jobs
```
flowmint-iac      → iac/Jenkinsfile
flowmint-backend  → backend/Jenkinsfile
flowmint-frontend → frontend/Jenkinsfile
```

### Branch → Environment Mapping
```
main   → prod
*      → dev (all other branches including develop)
```

### Pipeline Config (all 3 jobs)
- **Branch Source:** GitHub (HTTPS) with fine-grained PAT
- **Credentials:** `github-pat` (Username with password)
- **Behaviour:** Discover branches — "Exclude branches filed as PRs"
- **Build Strategy:** Accept build by included regions (`iac/**`, `backend/**`, `frontend/**`)
- **Periodic scan:** Disabled (webhook handles triggers)

### Credentials Stored in Jenkins
```
github-ssh-key   — SSH key for git checkout
github-pat       — Fine-grained PAT for GitHub branch source
aws-account-id   — AWS account ID (secret text)
```

---

## 7. Current Status & Next Steps

### ✅ Completed
- Jenkins webhook auto-trigger
- IAM stack
- Database stack
- Frontend S3 stack
- Edge stack (CloudFront + OAC + bucket policy)
- Cognito stack (Phase 1 — email/password)
- Cognito testing verified (tokens working)
- Backend shared layer (db, auth, constants, logger)
- Foundation API handlers (health, getUserProfile, putUserProfile)
- Backend template.yaml with esbuild
- Backend Jenkinsfile

### 🔄 Next Steps (In Order)
```
1. Deploy foundation APIs
   └── Commit + push → backend pipeline triggers
   └── Test /health, GET /user/profile, PUT /user/profile

2. Categories APIs
   └── GET    /categories
   └── POST   /categories
   └── PUT    /categories/{categoryId}
   └── DELETE /categories/{categoryId}

3. Budgets APIs
   └── GET    /budgets
   └── POST   /budgets
   └── PUT    /budgets/{categoryId}/{month}
   └── DELETE /budgets/{categoryId}/{month}

4. Expenses APIs (uses TransactWriteItems)
   └── GET    /expenses
   └── POST   /expenses
   └── GET    /expenses/{expenseId}
   └── PUT    /expenses/{expenseId}
   └── DELETE /expenses/{expenseId}

5. Summary APIs (read-only, pre-computed)
   └── GET /summary?month=
   └── GET /summary/trend?months=

6. Account API
   └── DELETE /user/account

7. Frontend (Next.js UI)
   └── Needs API endpoint + Cognito client ID from SSM

8. Social Login Phase 2
   └── Google OAuth app → Secrets Manager
   └── Facebook OAuth app → Secrets Manager
   └── Add providers to Cognito stack
```

---

## 8. Important Decisions & Why

| Decision | Why |
|---|---|
| Single table DynamoDB | Cost + performance for access patterns |
| `sub` as userId (not username) | Stable, unique, works across identity providers |
| SAM for backend (not CDK) | Separate pipeline, SAM esbuild integration |
| `--force-upload` in sam deploy | Pipeline always wins over console changes |
| CORS at API Gateway level | Avoids duplicate headers (API GW + Lambda) |
| XSS only on `event.body` | Sanitizing entire event corrupts JWT claims |
| `@aws-lambda-powertools/logger` | Async, structured JSON, X-Ray integration |
| No `advancedSecurityMode` | Costs extra on free AWS account |
| `response()` / `error()` helpers | Consistent envelope shape across all APIs |
| esbuild with `Minify: true` | Smaller Lambda packages, faster cold starts |
| `{{resolve:ssm:...}}` in template | Zero latency at runtime, no SDK calls |
| `AwsCustomResource` for S3 policy | CDK `addToResourcePolicy()` is no-op on imported buckets |
| `--app cdk.out` in CDK pipeline | Synth once — diff and deploy use same templates |

---

## 9. SSM Parameter Map

All parameters in ap-south-1 unless noted:

```
/flowmint/dev/database/table-name
/flowmint/dev/database/table-arn
/flowmint/dev/database/gsi1-arn
/flowmint/dev/cognito/user-pool-id
/flowmint/dev/cognito/app-client-id
/flowmint/dev/cognito/issuer-url
/flowmint/dev/cognito/hosted-domain
/flowmint/dev/edge/cloudfront-domain    ← us-east-1
/flowmint/dev/edge/distribution-id      ← us-east-1
/flowmint/dev/backend/api-endpoint      ← written by SAM deploy
```

---

## 10. Known Issues / Parked

- Jenkins Stage View shows 2 commits for same SHA — cosmetic issue, not causing duplicate builds. Root cause: webhook + scan both fire for same push. Parked for now.
