# FlowMint — Serverless Expense Tracker & Splitwise Monorepo

FlowMint is a full-stack personal finance and expense tracking application built on AWS. It uses a modern monorepo architecture combining a serverless Next.js frontend, a Node.js serverless backend for personal finance, and a Java Spring Boot backend for group expense splitting (Splitwise clone) running on ECS Fargate. Infrastructure is defined as code using AWS CDK and SAM.

---

## 🌟 Features
- **User Authentication:** Secure sign-up, login, and email verification powered by Amazon Cognito.
- **Expense Management:** Track, categorize, and manage daily personal expenses.
- **Budgeting:** Set monthly budgets per category and monitor your spending.
- **Analytics & Summaries:** View monthly summaries, totals, and spending trends.
- **Group Expense Splitting (Splitwise):** Create groups, add shared expenses with multiple split types (Equal, Exact, Shares), handle penny rounding, and track group balances.
- **Responsive UI:** A modern, fast, and responsive user interface built with Next.js and Tailwind CSS.
- **Cost-Efficient Hybrid Backend:** Combining AWS Lambda (for serverless on-demand scale) and ECS Fargate (for containerized Java business logic) with zero idle load-balancer costs.

---

## 🏗️ Architecture & Tech Stack

This project uses a monorepo structure containing four main codebases:

### 1. Frontend (`/frontend`)
- **Framework:** Next.js (React)
- **Styling:** Tailwind CSS
- **Authentication:** AWS Amplify Auth
- **Deployment:** Static HTML export hosted on Amazon S3 and distributed globally via Amazon CloudFront.

### 2. Personal Finance Backend (`/backend`)
- **Framework:** AWS SAM (Serverless Application Model)
- **Runtime:** Node.js 24.x (TypeScript), ARM64 architecture
- **Database:** Amazon DynamoDB (Single Table Design)
- **API:** Amazon API Gateway with Cognito JWT Authorizer
- **Utilities:** AWS Lambda Powertools for logging, `esbuild` for fast compilation.

### 3. Splitwise Backend (`/splitwise`)
- **Framework:** Spring Boot (Java 21, Maven)
- **Database:** Amazon RDS (PostgreSQL)
- **Containerization:** Docker (multi-stage build)
- **Deployment:** AWS ECS Fargate running in a public subnet with auto-assigned public IP (allowing direct outbound calls to ECR, Secrets Manager, and CloudWatch).
- **Service Discovery:** Registered in AWS Cloud Map (`backend.splitwise.local:8080`).
- **Load-Balancer-Free Security:** To avoid the high cost of an ALB/NLB, the ECS tasks reject all direct internet traffic and accept incoming calls on port 8080 **only** from the API Gateway VPC Link.

### 4. Infrastructure as Code (`/iac`)
- **Framework:** AWS CDK (TypeScript)
- **Resources Managed:** VPC networks, RDS PostgreSQL, DynamoDB Table, S3 Buckets, CloudFront Edge Distribution, Cognito User Pool, ECS Cluster & Service, and Jenkins IAM roles.

---

## 📂 Folder Structure

### Monorepo Structure
```
Expense-Tracker/
├── frontend/             # Next.js Frontend
├── backend/              # Node.js Serverless Backend (SAM)
├── splitwise/            # Java Spring Boot Backend (ECS)
├── iac/                  # AWS CDK Infrastructure Stacks
└── readme.md             # Project documentation
```

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

### Personal Finance Backend (`/backend`)
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

### Splitwise Backend (`/splitwise`)
```
splitwise/
├── src/
│   ├── main/
│   │   ├── java/com/flowmint/splitwise/
│   │   │   ├── config/          # Spring Security configuration (Cognito JWT)
│   │   │   ├── controller/      # API REST Controllers (/api/expenses, /api/groups)
│   │   │   ├── dto/             # Data Transfer Objects (Requests/Responses)
│   │   │   ├── entity/          # JPA Entities (User, Group, Expense, Share)
│   │   │   ├── repository/      # Spring Data JPA repositories (PostgreSQL)
│   │   │   └── service/         # Group/Expense business logic
│   │   └── resources/           # application.properties (dynamic config)
│   └── test/                    # Unit and Mockito service tests
├── Dockerfile                   # Multi-stage Docker build config
├── pom.xml                      # Maven dependencies and build configuration
└── Jenkinsfile                  # CI/CD pipeline script for Splitwise
```

### Infrastructure as Code (`/iac`)
```
iac/
├── bin/                  # CDK app entry point
│   └── flowmint-iac.ts   # Entry point synthesizing all stacks
└── lib/
    ├── auth/
    │   └── flowmint-cognito-stack.ts   # Cognito User Pool & Clients
    ├── compute/
    │   ├── splitwise-cluster-stack.ts  # ECS Fargate Cluster & Namespace
    │   ├── splitwise-ecr-stack.ts      # ECR Docker Image repository
    │   └── splitwise-task-stack.ts     # Fargate Task & Service definition
    ├── data/
    │   ├── flowmint-database-stack.ts  # DynamoDB Single Table
    │   └── splitwise-data-stack.ts     # RDS PostgreSQL database & credentials
    ├── edge/
    │   ├── flowmint-edge-stack.ts      # CloudFront CDN
    │   └── flowmint-frontend-stack.ts  # S3 frontend hosting bucket
    ├── iam/
    │   ├── flowmint-iam-stack.ts       # Base IAM roles (Jenkins deploy roles)
    │   └── splitwise-ecs-roles-stack.ts # ECS Task & Execution roles
    ├── network/
    │   └── splitwise-network-stack.ts  # VPC network & security groups
    └── utils/
        └── parameter-utils.ts          # CDK SSM Parameter helpers
```


---

## 🔌 API Documentation

All endpoints (except `/health`) require an `Authorization` header containing a valid Cognito JWT Access Token. 

### Serverless Backend Endpoints (JSON enveloped: `{ "status": 200, "data": { ... } }`)
- **`GET /health`** (Public) — *Returns serverless backend operational status.*
- **`GET /user/profile`** — *Returns current authenticated user's profile.*
- **`PUT /user/profile`** — *Updates the user profile.*
- **`GET /transactions`** — *Returns a paginated list of transactions.*
- **`POST /transactions`** — *Creates a new transaction. Idempotent.*
- **`GET /transactions/{txnId}`** — *Retrieves details for a specific transaction.*
- **`PUT /transactions/{txnId}`** — *Updates a transaction.*
- **`DELETE /transactions/{txnId}`** — *Deletes a transaction.*
- **`GET /categories`** — *Returns custom categories.*
- **`POST /categories`** — *Creates a custom category.*
- **`GET /budgets`** — *Returns all budgets.*
- **`POST /budgets`** — *Creates/updates a category budget.*
- **`GET /summary`** / **`/summary/breakdown`** / **`/summary/trend`** — *Analytics endpoints.*

### Splitwise ECS Backend Endpoints
These endpoints are routed from API Gateway via VPC Link directly to the ECS service using the `/api/` prefix:
- **`POST /api/groups`** — *Creates a new expense splitting group.*
  - **Payload:** `{ "name": "String", "memberEmails": ["String"] }`
- **`PUT /api/groups/{groupId}`** — *Updates group metadata or membership.*
- **`POST /api/expenses`** — *Adds a shared group expense with specific split rules.*
  - **Payload:**
    ```json
    {
      "groupId": "UUID",
      "paidByUserId": "UUID",
      "totalAmount": 100.00,
      "currency": "USD",
      "splitType": "EQUAL" | "EXACT" | "SHARES",
      "splits": [
        { "userId": "UUID", "value": 33.33 },
        { "userId": "UUID", "value": 33.33 },
        { "userId": "UUID", "value": 33.34 }
      ]
    }
    ```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Java Development Kit (JDK 21)](https://adoptium.net/temurin/releases/?version=21)
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

#### 2. Personal Finance Backend (SAM)
```bash
cd backend
npm install
npm run build
```

#### 3. Splitwise Backend (Spring Boot)
```bash
cd splitwise
# Run tests
./mvnw test
# Start locally (requires local PostgreSQL)
./mvnw spring-boot:run
```

---

## ☁️ Deployment & CI/CD

The project utilizes **Jenkins** hosted on an AWS EC2 instance (`ap-south-1`) for continuous integration and continuous deployment (CI/CD). 

### Jenkins Pipelines
There are six Multibranch Pipeline jobs mapped to the repository:
1. `flowmint-iac` → `iac/Jenkinsfile`
2. `flowmint-backend` → `backend/Jenkinsfile`
3. `flowmint-frontend` → `frontend/Jenkinsfile`
4. `flowmint-splitwise` → `splitwise/Jenkinsfile`
5. `flowmint-runtime-start` → `iac/Jenkinsfile.runtime.start`
6. `flowmint-runtime-stop` → `iac/Jenkinsfile.runtime.stop`

### Load-Balancer-Free Service Discovery (AWS Cloud Map)
To eliminate load balancer overhead ($20-$30/month for ALB), we deploy the ECS Fargate tasks with a public IP in the public subnets.
- The tasks register with **AWS Cloud Map** under `backend.splitwise.local:8080`.
- API Gateway HTTP API accesses this service privately via a **VPC Link**.
- Incoming traffic to the ECS tasks is locked down via security groups to accept connections **only** from the VPC Link security group.
- AWS SAM Backend (`backend/template.yaml`) defines the VPC Link, HTTP Integration targeting the Cloud Map service ARN, and routes `/api/{proxy+}` to route requests to ECS.

---

## 🗄️ Database Design (DynamoDB)

FlowMint utilizes a highly optimized **Single-Table Design** (`flowmint-dev-table`) for its serverless features.

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

