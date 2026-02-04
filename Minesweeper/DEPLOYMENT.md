# Minesweeper Deployment Guide

This guide explains how to deploy the Minesweeper backend to AWS with one click.

## Prerequisites

1. ✅ AWS Account created
2. ✅ GitHub repository for your code

---

## Step 1: Create AWS Access Keys

1. Go to [AWS Console](https://console.aws.amazon.com)
2. Click your username (top right) → **Security credentials**
3. Scroll to **Access keys** → Click **Create access key**
4. Select **Command Line Interface (CLI)**
5. Check the confirmation box and click **Next**
6. Click **Create access key**
7. **⚠️ IMPORTANT**: Copy both values now (you won't see the secret again):
   - `Access key ID` (looks like: `AKIAIOSFODNN7EXAMPLE`)
   - `Secret access key` (looks like: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)

---

## Step 2: Add Secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** (tab at the top)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add two secrets:

   | Name | Value |
   |------|-------|
   | `AWS_ACCESS_KEY_ID` | Your access key ID from Step 1 |
   | `AWS_SECRET_ACCESS_KEY` | Your secret access key from Step 1 |

---

## Step 3: One-Click Deploy! 🚀

1. Go to your GitHub repository
2. Click the **Actions** tab
3. In the left sidebar, click **Deploy Minesweeper Backend**
4. Click the **Run workflow** dropdown (right side)
5. Select stage:
   - `dev` - For development/testing
   - `prod` - For production (when ready)
6. Click the green **Run workflow** button

---

## Step 4: Get Your API URL

After the workflow completes (1-2 minutes):

1. Click on the completed workflow run
2. Look at the **Summary** section at the bottom
3. Copy your API endpoint URL (looks like):
   ```
   https://abc123xyz.execute-api.eu-west-2.amazonaws.com/dev
   ```

---

## Step 5: Update the Game

Add your API URL to `Minesweeper.html`:

```javascript
const API_URL = 'https://abc123xyz.execute-api.eu-west-2.amazonaws.com/dev';
```

Replace the empty string at the top of the `<script>` section.

---

## Optional: Set Up Billing Alerts

Protect yourself from unexpected charges:

1. Go to [AWS Billing Console](https://console.aws.amazon.com/billing/)
2. Click **Budgets** in the left sidebar
3. Click **Create budget**
4. Choose **Cost budget - Recommended**
5. Set budget amount to `$5` or `$10`
6. Add your email for alerts
7. Click **Create budget**

---

## Workflow Details

### Manual Deployment (Recommended)
- Go to Actions → Deploy Minesweeper Backend → Run workflow
- Choose `dev` or `prod` stage
- Click Run workflow

### Auto-Deploy on Push (Optional)
To enable automatic deployment when you push code changes, edit `.github/workflows/deploy-backend.yml` and uncomment:

```yaml
push:
  branches:
    - main
    - master
  paths:
    - 'backend/**'
```

---

## Troubleshooting

### "Credentials not found" error
- Verify secret names are exactly `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- Regenerate access keys if needed

### "Access Denied" error
- Your AWS user needs permissions for Lambda, API Gateway, DynamoDB, IAM, CloudFormation
- Use the `AdministratorAccess` policy for simplicity (or create a custom policy)

### View deployment logs
- Click on the failed workflow run
- Expand the "Deploy to AWS" step to see detailed error messages

---

## Removing the Deployment

To delete all AWS resources:

```bash
cd backend
npx serverless remove --stage dev
```

Or manually delete from AWS Console:
1. CloudFormation → Delete stack `minesweeper-api-dev`
2. This removes all Lambda functions, API Gateway, and DynamoDB tables

