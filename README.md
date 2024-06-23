# Lambda Function for Processing Submissions

This AWS Lambda function is designed to process submissions triggered by SNS (Simple Notification Service) events. It handles file downloads from a provided URL, uploads files to Google Cloud Storage, sends email notifications using Mailgun, and logs entries to DynamoDB based on the submission's status.

## Overview

The Lambda function performs the following tasks:
- Receives SNS events containing submission details.
- Downloads a ZIP file from a specified URL.
- Filters and extracts files from the ZIP archive.
- Uploads valid files to Google Cloud Storage (GCS).
- Sends email notifications to users using Mailgun.
- Logs submission details to DynamoDB.

## Functionality

### SNS Event Handling

The Lambda function is triggered by SNS events, which provide details about the submission such as:
- Submission URL
- Submission ID
- Assignment ID
- User Email
- Assignment Name
- Timestamp

### File Handling

1. **Download and Extract ZIP File**:
   - Downloads the ZIP file from the provided URL.
   - Extracts files from the ZIP archive excluding directories and hidden files.

2. **Upload to Google Cloud Storage**:
   - Uses Google Cloud Storage (GCS) to store uploaded files.
   - Constructs the destination path based on assignment details and user email.

### Email Notifications

- **Success Notification**:
  - Sent when the submission is successfully processed.
  - Includes details such as submission date, time, and the GCS storage path.

- **Error Notifications**:
  - Sent when there is an error processing the submission.
  - Includes the error message and advises the user to retry.

- **No URL Notification**:
  - Sent when the submission URL points to an empty ZIP file.

- **Invalid Response Notification**:
  - Sent when the submission URL is not a valid Git repository.

### Logging

- **DynamoDB Logging**:
  - Logs details of each submission to DynamoDB for auditing and tracking purposes.
  - Includes submission ID, user email, assignment name, status, timestamp, and message.

## Technologies Used

- **AWS Lambda**: Serverless computing service to execute the function.
- **Node.js**: Runtime environment for the Lambda function.
- **Axios**: HTTP client for downloading files.
- **Adm-Zip**: Library for handling ZIP files.
- **@google-cloud/storage**: Node.js client library for Google Cloud Storage.
- **AWS SDK**: JavaScript SDK for AWS services including SNS, DynamoDB, and IAM.
- **Mailgun-js**: Library for sending emails via Mailgun.

## Deployment

The Lambda function is deployed on AWS Lambda and integrated with SNS for event triggering. Environment variables are used to securely store sensitive information such as service account keys and Mailgun API credentials.

## Setup and Configuration

1. **Environment Variables**:
   - Ensure the following environment variables are configured in your AWS Lambda environment:
     - `MAILGUN_API_KEY`: API key for Mailgun.
     - `MAILGUN_DOMAIN`: Domain associated with your Mailgun account.
     - `SERVICE_ACCOUNT_KEY`: Base64 encoded Google Cloud service account key.
     - `BUCKET_NAME`: Name of the Google Cloud Storage bucket.

2. **Permissions**:
   - AWS IAM roles and policies should be set to allow Lambda to interact with SNS, DynamoDB, Google Cloud Storage, and Mailgun.

## Monitoring and Troubleshooting

- **CloudWatch Logs**: Monitor Lambda execution and troubleshoot errors using CloudWatch Logs.
- **AWS X-Ray**: Enable AWS X-Ray for tracing and debugging Lambda function calls and performance.

## Example Usage

```javascript
// Example SNS Message Structure
{
  "Records": [
    {
      "Sns": {
        "Message": "{\"submissionUrl\":\"https://example.com/submission.zip\",\"submissionId\":\"123\",\"assignmentId\":\"456\",\"userEmail\":\"user@example.com\",\"assignmentName\":\"Project XYZ\"}",
        "Timestamp": "2024-06-22T12:00:00.000Z"
      }
    }
  ]
}
```

## Contributing

Contributions are welcome! Please fork the repository, make your changes, and submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
