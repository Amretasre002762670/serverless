const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
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
// const domain = process.env.MAILGUN_DOMAIN;
let userEmail = "";
exports.handler = async (event) => {
  try {
    console.log('Received SNS event:', JSON.stringify(event, null, 2));

    const snsMessage = JSON.parse(event.Records[0].Sns.Message);
    const time = event.Records[0].Sns.Timestamp;
    const { submissionUrl, submissionId, assignmentId, assignmentName } = snsMessage;
    userEmail = snsMessage.userEmail;
    const timestamp = new Date(time);

    console.log('Timestamp:', timestamp);
    console.log('Timestamp ISO String:', timestamp.toISOString());

    const submissionDate = timestamp.toISOString().split('T')[0];
    const submissionTime = timestamp.toISOString().split('T')[1].split('.')[0];

    console.log('Submission Date:', submissionDate);
    console.log('Submission Time:', submissionTime);

    const response = await axios.get(submissionUrl, { responseType: 'stream' });

    if (!response.data || response.data.byteLength === 0) {
      sendEmail(userEmail, assignmentName, "no-url", submissionTime, submissionDate)
      throw new Error('The release does not exist or the payload is empty.');
    }

    const tmpFilePath = `/tmp/${submissionId}.zip`;

    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(tmpFilePath);
      response.data.pipe(writeStream)
        .on('error', reject)
        .on('finish', resolve);
    });

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

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    
    const bucketPath = `${bucketName}/${destinationDir}/${fileName}`;

    console.log(`Release uploaded to Google Cloud Storage: ${bucketPath}`);

    console.log('Destination Path:', destinationDir);

    await sendEmail(userEmail, assignmentName, "success", url, submissionTime, submissionDate, bucketPath);

    fs.unlinkSync(tmpFilePath);

    return {
      statusCode: 200,
      body: JSON.stringify('Release downloaded and uploaded successfully.'),
    };
  } catch (error) {
    console.error('Error:', error);

    sendEmail(userEmail, assignmentName, "error", submissionTime, submissionDate, bucketPath, error)

    return {
      statusCode: 500,
      body: JSON.stringify('Error processing the SNS message.'),
    };
  }
};

// async function getSignedUrl(bucketName, fileName) {
//   const [url] = await storage.bucket(bucketName).file(fileName).getSignedUrl({
//     action: 'read',
//     expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
//   });
//   return url;
// }

async function sendEmail(userEmail, assignmentName, isSuccess = "success", downloadUrl = null, submissionTime, submissionDate, bucketPath = null, error = null) {
  const formattedDate = new Date(submissionDate).toLocaleDateString('en-US');
  const formattedTime = new Date(submissionTime).toLocaleTimeString('en-US');

  let successText = `Your submission for "${assignmentName}" on ${submissionDate} at ${submissionTime} has been successfully processed. \n\nRelease uploaded to Google Cloud Storage: "${bucketPath}". \n\nYou can download it from: ${(downloadUrl)}. \n\nRegards \n${process.env.MAILGUN_DOMAIN}`;
  let errorText = `There was an error processing your submission for ${assignmentName} done on on ${submissionDate} at ${submissionTime}. \nThe error is ${error}. \nPlease try again. \nRegards \n${process.env.MAILGUN_DOMAIN}`;
  let noUrl = `The ${assignmentName} submitted on ${submissionDate} at ${submissionTime}  is not pointing to a zip file, please submit a valid URL. \nRegards \n${process.env.MAILGUN_DOMAIN}`
  let message = "";
  console.log(process.env.MAILGUN_DOMAIN, "The domain name");
  console.log("is success is: ", isSuccess);
  if (isSuccess === "success") {
    message = {
      from: `mailgun@${process.env.MAILGUN_DOMAIN}`,
      to: userEmail,
      subject: 'Submission Successful',
      text: successText
    }
  } else if (isSuccess === "no-url") {
    message = {
      from: `mailgun@${process.env.MAILGUN_DOMAIN}`,
      to: userEmail,
      subject: 'Submission URL is not valid',
      text: noUrl
    }
  } else {
    message = {
      from: `mailgun@${process.env.MAILGUN_DOMAIN}`,
      to: userEmail,
      subject: 'Submission Failed',
      text: errorText
    }
  }
  await mailgun.messages().send(message);
}