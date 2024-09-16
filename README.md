# Sanity Dataset Backup to S3 GitHub Action

This GitHub Action allows you to backup a specific Sanity dataset to an AWS S3 bucket. The action exports a dataset from a Sanity project and uploads it to a specified S3 bucket. It also offers an optional feature to remove old backups based on a user-defined retention period.

## Inputs

| Name                | Description                                                                                            | Required |
| ------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| `sanity_project_id` | The Sanity project ID to export the dataset from.                                                      | true     |
| `sanity_auth_token` | The Sanity authentication token for accessing the project.                                             | true     |
| `s3_bucket`         | The AWS S3 bucket where the dataset backup will be uploaded.                                           | true     |
| `dataset_name`      | The name of the Sanity dataset to be exported (e.g., `development`).                                   | true     |
| `retention_days`    | Number of days to retain backups. Backups older than this will be deleted. Default is 0 (no deletion). | false    |

## Usage

Here’s an example workflow that uses this action to back up a Sanity dataset and upload it to an S3 bucket.

In this example, the action:

- Authenticates to AWS using the `aws-actions/configure-aws-credentials@v4` action.
- Exports the specified Sanity dataset and uploads it to the S3 bucket.
- Deletes backups older than 30 days from the S3 bucket.

```yaml
name: Backup Sanity Dataset to S3

on:
  schedule:
    - cron: '0 0 * * *' # You can set the cron expression to run the backup periodically
  workflow_dispatch: # You can also run the backup manually

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1

      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run Backup Action
        uses: ilkrklc/sanity-backup-to-s3-action@v1.0.0
        with:
          sanity_project_id: ${{ secrets.SANITY_PROJECT_ID }}
          sanity_auth_token: ${{ secrets.SANITY_AUTH_TOKEN }}
          s3_bucket: ${{ secrets.S3_BUCKET }}
          dataset_name: ${{ secrets.SANITY_DATASET_NAME }}
          retention_days: '30' # Retain backups for 30 days
```

## How It Works

1. **Sanity Dataset Export**: The action uses the Sanity CLI to export the specified dataset from the provided Sanity project.
2. **AWS S3 Upload**: Once the dataset is successfully exported, it is uploaded to the specified S3 bucket.
3. **Retention Policy (Optional)**: If the `retention_days` input is provided, the action will list all backups in the specified S3 bucket and remove backups older than the specified number of days. If `retention_days` is set to 0 or not provided, no backups will be deleted.

## Notes

- **Sanity CLI**: This action uses `sanity` command to interact with your Sanity project, so ensure that the Sanity CLI is available in the environment.
- **AWS Credentials**: The action requires AWS credentials to upload the backup to S3. You can use `aws-actions/configure-aws-credentials@v4` for authentication.
- **Retention**: Be cautious when using the `retention_days` feature as it will permanently delete backups older than the specified number of days.

## License

sanity-backup-to-s3-action is [MIT licensed](./LICENSE).
