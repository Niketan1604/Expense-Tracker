# FlowMint — Serverless Expense Tracker

FlowMint is a full-stack, serverless personal finance and expense tracking application built on AWS. It uses a modern architecture with a Next.js frontend, a Node.js serverless backend, and infrastructure defined as code using AWS CDK and SAM.

---

## 🌟 Features
- **User Authentication:** Secure sign-up, login, and email verification powered by Amazon Cognito.
- **Expense Management:** Track, categorize, and manage daily expenses.
- **Budgeting:** Set monthly budgets per category and monitor your spending.
- **Analytics & Summaries:** View monthly summaries, totals, and spending trends.
- **Responsive UI:** A modern, fast, and responsive user interface built with Next.js and Tailwind CSS.
- **Fully Serverless:** Highly scalable and cost-effective backend powered by AWS Lambda and DynamoDB.

---

## 🏗️ Architecture & Tech Stack

This project uses a monorepo structure containing three main environments:

### 1. Frontend (`/frontend`)
- **Framework:** Next.js (React)
- **Styling:** Tailwind CSS
- **Authentication:** AWS Amplify Auth
- **Deployment:** Static HTML export hosted on Amazon S3 and distributed globally via Amazon CloudFront.

### 2. Backend (`/backend`)
- **Framework:** AWS SAM (Serverless Application Model)
- **Runtime:** Node.js 24.x (TypeScript), ARM64 architecture
- **Database:** Amazon DynamoDB (Single Table Design)
- **API:** Amazon API Gateway with Cognito JWT Authorizer
- **Utilities:** AWS Lambda Powertools for logging, `esbuild` for fast compilation.

### 3. Infrastructure as Code (`/iac`)
- **Framework:** AWS CDK (TypeScript)
- **Resources Managed:** IAM Roles, DynamoDB Table, S3 Buckets, CloudFront Edge Distribution, Cognito User Pool.

---

## 📂 Folder Structure

### Frontend (`/frontend`)
```
frontend/
├── app/                  # Next.js App Router root
│   ├── auth/             # AWS Amplify Auth configuration
│   ├── login/            # Login page view
│   ├── signup/           # Signup page view
│   ├── dashboard/        # Main overview dashboard
│   ├── transactions/     # View and manage transactions
│   ├── categories/       # Manage spending categories
│   ├── budgets/          # Set and view monthly budgets
│   └── profile/          # User profile settings
├── components/           # Reusable React components
│   ├── AppShell.tsx      # Main application layout wrapper
│   ├── Sidebar.tsx       # Desktop sidebar navigation
│   ├── BottomNav.tsx     # Mobile bottom navigation
│   ├── ThemeProvider.tsx # Dark/Light theme provider
│   └── AmplifyProvider.tsx # AWS Amplify context provider
└── globals.css           # Global Tailwind and base styles
```

### Backend (`/backend`)
```
backend/
├── template.yaml         # AWS SAM Template defining all APIs and Lambdas
└── src/
    ├── shared/           # Code shared across all Lambda functions
    │   ├── db.ts         # DynamoDB docClient initialization
    │   ├── auth.ts       # Extracts userId/email from Cognito JWT claims
    │   ├── constants.ts  # HTTP status codes, response/error helpers
    │   ├── logger.ts     # Lambda Powertools logger setup
    │   └── validation.ts # Zod validation schemas and parsers
    ├── user/             # User profile endpoints
    ├── transaction/      # CRUD for transactions (income/expenses)
    ├── category/         # CRUD for custom categories
    ├── budget/           # CRUD for monthly budgets
    ├── summary/          # Read-only endpoints for analytics
    └── health/           # Public health check endpoint
```

### IAC (`/iac`)
```
iac/
├── bin/                  # CDK app entry point
└── lib/
    ├── flowmint-iam-stack.ts       # IAM roles for Jenkins deployments
    ├── flowmint-database-stack.ts  # DynamoDB Single-Table setup
    ├── flowmint-frontend-stack.ts  # S3 buckets for UI hosting
    ├── flowmint-edge-stack.ts      # CloudFront distribution
    └── flowmint-cognito-stack.ts   # User Pools and App Clients
```

---

## 🔌 API Documentation

All endpoints (except `/health`) require an `Authorization` header containing a valid Cognito JWT Access Token. All responses are wrapped in a standard JSON envelope:
```json
{ "status": 200, "data": { ... }, "message": null }
```

### Health & User
- **`GET /health`** (Public)  
  *Returns backend operational status.*
- **`GET /user/profile`**  
  *Returns the current authenticated user's profile.*
- **`PUT /user/profile`**  
  *Updates the user profile.*
  - **Payload:** `{ "name": "String", "currency": "String" }`

### Transactions
- **`GET /transactions`**  
  *Returns a paginated list of transactions. Supports `limit` and `cursor` query parameters. Response data format is `{ items: [...], nextCursor: "base64-string" }`.*
- **`POST /transactions`**  
  *Creates a new transaction. Idempotent.*
  - **Payload:** 
    ```json
    {
      "transactionId": "UUID" (optional - send this to guarantee idempotency on retries),
      "type": "CREDIT" | "DEBIT",
      "amount": number (integer in paise/cents),
      "categoryId": "String",
      "date": "yyyy-mm-dd",
      "description": "String" (optional)
    }
    ```
- **`GET /transactions/{txnId}`**  
  *Retrieves details for a specific transaction.*
- **`PUT /transactions/{txnId}`**  
  *Updates an existing transaction. Payload is same as POST but all fields are optional.*
- **`DELETE /transactions/{txnId}`**  
  *Deletes a transaction.*

### Categories
- **`GET /categories`**  
  *Returns all custom categories created by the user.*
- **`POST /categories`**  
  *Creates a new category.*
  - **Payload:** `{ "name": "String", "icon": "String" (optional), "color": "String (Hex)" (optional) }`
- **`PUT /categories/{categoryId}`**  
  *Updates an existing category. Payload is same as POST but all fields are optional.*
- **`DELETE /categories/{categoryId}`**  
  *Deletes a category.*

### Budgets
- **`GET /budgets`**  
  *Returns all budgets for the user.*
- **`POST /budgets`**  
  *Creates or updates a budget for a specific category and month.*
  - **Payload:** `{ "categoryId": "String", "month": "yyyy-mm", "amount": number (integer in paise/cents) }`
- **`DELETE /budgets/{categoryId}`**  
  *Deletes a budget.*

### Analytics & Summary
- **`GET /summary`**  
  *Returns a summarized total for a given month.*
- **`GET /summary/breakdown`**  
  *Returns spending breakdown by category for a given month.*
- **`GET /summary/top-categories`**  
  *Returns the most active spending categories.*
- **`GET /summary/trend`**  
  *Returns spending trends over previous months.*

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [AWS CLI](https://aws.amazon.com/cli/) configured with your credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [AWS CDK CLI](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)

### Local Development Setup

#### 1. Frontend
```bash
cd frontend
npm install
npm run dev
```
*Open [http://localhost:3000](http://localhost:3000) to view the app. Ensure you have a `.env.local` configured with your AWS resource endpoints.*

#### 2. Backend
```bash
cd backend
npm install
npm run build
npm run test
```

#### 3. Infrastructure
```bash
cd iac
npm install
npm run build
```

---

## ☁️ Deployment & CI/CD

The project utilizes **Jenkins** hosted on an AWS EC2 instance (`ap-south-1`) for continuous integration and continuous deployment (CI/CD). 

### Jenkins Pipelines
There are three Multibranch Pipeline jobs mapped to the repository:
1. `flowmint-iac` → `iac/Jenkinsfile`
2. `flowmint-backend` → `backend/Jenkinsfile`
3. `flowmint-frontend` → `frontend/Jenkinsfile`

**Branch Strategy:**
- `main` branch deploys to the **Production** environment.
- Any other branch (e.g., `develop`) deploys to the **Development** (`dev`) environment.

### AWS Parameter Store (SSM) Integration
Configuration values are shared between stacks using AWS Systems Manager Parameter Store.
- CDK writes infrastructure outputs (Database ARNs, Cognito Client IDs, S3 Bucket names) to SSM.
- SAM Backend and CDK Edge stacks read from these SSM parameters at deployment time.

---

## 🗄️ Database Design (DynamoDB)

FlowMint utilizes a highly optimized **Single-Table Design** (`flowmint-dev-table`).

- **Partition Key (PK):** `USER#{userId}` (Cognito `sub` ID for stability across identity providers)
- **Sort Key (SK):** Varies by entity.

### Access Patterns
| Entity | Partition Key (PK) | Sort Key (SK) |
|---|---|---|
| UserProfile | `USER#{userId}` | `PROFILE` |
| Category | `USER#{userId}` | `CATEGORY#{categoryId}` |
| Budget | `USER#{userId}` | `BUDGET#{yyyy}#{mm}#{categoryId}` |
| Transaction | `USER#{userId}` | `TXN#{yyyy-mm-dd}#{transactionId}` |
| MonthlySummary | `USER#{userId}` | `SUMMARY#{yyyy}#{mm}#{categoryId}` |
| MonthlyTotal | `USER#{userId}` | `SUMMARY#{yyyy}#{mm}#ALL` |

*Note: A Global Secondary Index (GSI1) is used for querying transactions by category.*

---

## 🛠️ Developer Guidelines & Key Decisions

- **API Responses:** All APIs return a consistent JSON envelope shape using shared helper functions (`response()` and `error()`).
- **Logging:** Use `@aws-lambda-powertools/logger` for structured, async JSON logging in Lambda handlers.
- **Security:** 
  - Cross-Origin Resource Sharing (CORS) is configured at the API Gateway level, not inside Lambda.
  - The `userId` is strictly extracted from the Cognito JWT `sub` claim, never from the request body.

- **State Management:** DynamoDB transactions (`TransactWriteItems`) are used to atomically update Monthly Summaries alongside Transaction creations/deletions.

