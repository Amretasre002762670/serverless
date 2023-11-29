const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const AdmZip = require('adm-zip');
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const mailgun = require('mailgun-js')({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN,
});

const { decode } = require("base-64");
const credentialsPath = '/tmp/google-credentials.json';
fs.writeFileSync(credentialsPath, decode(process.env.SERVICE_ACCOUNT_KEY));

const storage = new Storage({
  keyFilename: credentialsPath,
});
exports.handler = async (event) => {
  let userEmail = "";
  let assignmentName = "";
  try {

    console.log('Received SNS event:', JSON.stringify(event, null, 2));

    const snsMessage = JSON.parse(event.Records[0].Sns.Message);
    const time = event.Records[0].Sns.Timestamp;
    const { submissionUrl, submissionId, assignmentId } = snsMessage;
    userEmail = snsMessage.userEmail;
    assignmentName = snsMessage.assignmentName;
    const timestamp = new Date(time);

    console.log('Timestamp:', timestamp);
    console.log('Timestamp ISO String:', timestamp.toISOString());

    const submissionDate = timestamp.toISOString().split('T')[0];
    const submissionTime = timestamp.toISOString().split('T')[1].split('.')[0];

    console.log('Submission Date:', submissionDate);

    const response = await axios.get(submissionUrl, { responseType: 'stream' });

    const tmpFilePath = `/tmp/${submissionId}.zip`;

    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(tmpFilePath);
      response.data.pipe(writeStream)
        .on('error', reject)
        .on('finish', resolve);
    });

    const zip = new AdmZip(tmpFilePath);
      const zipEntries = zip.getEntries();
      const filteredFiles = zipEntries.filter(entry => {
        return !entry.isDirectory && !entry.entryName.startsWith('.');
      });

      const extractedSize = filteredFiles.length;

    if (extractedSize > 0) {
      const bucketName = process.env.BUCKET_NAME;
      const destinationDir = `submissions/${assignmentName}-${assignmentId}/${userEmail}`;
      const fileName = `${submissionId}`;

      const bucket = storage.bucket(bucketName);

      const [file] = await bucket.upload(tmpFilePath, {
        destination: `${destinationDir}/${fileName}`,
        metadata: {
          contentType: 'application/zip',
          cacheControl: 'no-cache',
        },
      });

      console.log('Uploaded File:', file);

      // const [url] = await file.getSignedUrl({
      //   action: 'read',
      //   expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      // });

      const bucketPath = `${bucketName}/${destinationDir}/${fileName}`;

      console.log(`Release uploaded to Google Cloud Storage: ${bucketPath}`);

      console.log('Destination Path:', destinationDir);

      fs.unlinkSync(tmpFilePath);

      await sendEmail(userEmail, assignmentName, "success", submissionTime, submissionDate, bucketPath);
      await writeToDynamoDB(submissionId, userEmail, assignmentName, "Success", "Mail successfully sent");
    } else {
      console.log("ZIP archive contains empty directory");
      await sendEmail(userEmail, assignmentName, "no-url", submissionTime, submissionDate);
      await writeToDynamoDB(submissionId, userEmail, assignmentName, "Fail", "ZIP archive contains empty directory");
    }

  } catch (error) {
    console.error('Error:', error);
    await sendEmail(userEmail, assignmentName, "error", submissionTime, submissionDate, bucketPath, error)
    return await writeToDynamoDB(submissionId, userEmail, assignmentName, "Fail", "Failed to upload submission");
  }
};

async function writeToDynamoDB(submissionId, userEmail, assignmentName, status, Message) {
  try {
    const dynamoDBParams = {
      TableName: process.env.DYNAMO_DB_TABLE_NAME,
      Item: {
        submissionId: submissionId,
        userEmail: userEmail,
        assignmentName: assignmentName,
        status: status,
        timestamp: Date.now(),
        Message: Message
      }
    }
    console.log("insert into dynamoDB: ", dynamoDBParams);
    await dynamoDB.put(dynamoDBParams).promise();
    console.log('Entry added to DynamoDB');
  } catch (error) {
    console.error('Error adding entry to DynamoDB:', error);
  }
}

async function sendEmail(userEmail, assignmentName, isSuccess = "success", submissionTime, submissionDate, bucketPath = null, error = null) {
  let successText = `Good Day, \n\nYour submission for "${assignmentName}" on ${submissionDate} at ${submissionTime} has been successfully processed. \n\nRelease uploaded to Google Cloud Storage: "${bucketPath}". \n\nRegards \n${process.env.MAILGUN_DOMAIN}`;
  let errorText = `Good Day, \n\nThere was an error processing your submission for ${assignmentName} done on on ${submissionDate} at ${submissionTime}. \n\nThe error is ${error}. \n\nPlease try again. \n\nRegards \n${process.env.MAILGUN_DOMAIN}`;
  let noUrl = `Good Day, \n\nThe ${assignmentName} submitted on ${submissionDate} at ${submissionTime}  is pointing to a empty zip file, please submit a valid URL. \n\nRegards \n${process.env.MAILGUN_DOMAIN}`;
  let invalidResponse = `Good Day, \n\nThe ${assignmentName} submitted on ${submissionDate} at ${submissionTime} is invalid git repo, please submit a valid URL. \n\nRegards \n${process.env.MAILGUN_DOMAIN}`
  let message = "";
  console.log(process.env.MAILGUN_DOMAIN, "The domain name");
  console.log("is success is: ", isSuccess);
  if (isSuccess === "success") {
    message = {
      from: `mailgun@${process.env.MAILGUN_DOMAIN}`,
      to: userEmail,
      subject: `Submission for ${assignmentName} Successful`,
      text: successText
    }

  } else if (isSuccess === "no-url") {
    message = {
      from: `mailgun@${process.env.MAILGUN_DOMAIN}`,
      to: userEmail,
      subject: `Submission URL for ${assignmentName} is empty.`,
      text: noUrl
    }
  } else if (isSuccess === "invalid-response") {
    message = {
      from: `mailgun@${process.env.MAILGUN_DOMAIN}`,
      to: userEmail,
      subject: `Submission URL for ${assignmentName} is not valid git`,
      text: invalidResponse
    }
  }
  else {
    message = {
      from: `mailgun@${process.env.MAILGUN_DOMAIN}`,
      to: userEmail,
      subject: `Submission Failed for ${assignmentName}`,
      text: errorText
    }
  }
  // writeToDynamoDB(dynamoDBParams);
  await mailgun.messages().send(message);
}