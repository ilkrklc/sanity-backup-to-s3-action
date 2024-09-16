import { getInput, info, setFailed } from '@actions/core';
import { exec } from '@actions/exec';
import { existsSync } from 'fs';
import { basename } from 'path';

async function checkSanityDatasetExistence(
  projectId: string,
  authToken: string,
  datasetName: string,
) {
  let datasetListOutput = '';
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        datasetListOutput += data.toString();
      },
    },
  };

  await exec('npx sanity dataset list', [], {
    env: {
      SANITY_PROJECT_ID: projectId,
      SANITY_AUTH_TOKEN: authToken,
      ...process.env,
    },
    silent: true,
    ...options,
  });

  const datasets = datasetListOutput.split('\n').map((line) => line.trim());
  if (!datasets.includes(datasetName)) {
    throw new Error(
      `Dataset "${datasetName}" does not exist in the Sanity project.`,
    );
  }
}

function checkAwsCredentials(): void {
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!awsAccessKeyId || !awsSecretAccessKey) {
    throw new Error(
      'AWS credentials are not set. Ensure that AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in the environment using aws-actions/configure-aws-credentials.',
    );
  }
}

async function removeOldBackups(
  s3Bucket: string,
  datasetName: string,
  retentionDays: number,
) {
  if (!retentionDays || retentionDays <= 0) {
    info('No retention policy provided. Skipping old backup removal.');

    return;
  }

  const retentionTimestamp =
    new Date().getTime() - retentionDays * 24 * 60 * 60 * 1000;

  info(
    `Removing backups older than ${retentionDays} days from s3://${s3Bucket}/${datasetName}/`,
  );

  let awsListOutput = '';
  await exec(`aws s3 ls s3://${s3Bucket}/${datasetName}/`, [], {
    listeners: {
      stdout: (data: Buffer) => {
        awsListOutput += data.toString();
      },
    },
    silent: true,
  });

  const backupFiles = awsListOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let deletedCount = 0;
  for (const file of backupFiles) {
    const match = file.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const fileDate = new Date(match[0]).getTime();
      if (fileDate < retentionTimestamp) {
        const fileName = file.split(' ').pop();

        info(`Removing old backup: ${fileName}`);

        await exec(`aws s3 rm s3://${s3Bucket}/${datasetName}/${fileName}`);

        deletedCount += 1;
      }
    }
  }

  if (deletedCount === 0) {
    info('No backups found to delete within retention period.');
  } else {
    info(`Deleted ${deletedCount} old backups.`);
  }
}

async function run() {
  try {
    const projectId = getInput('sanity_project_id', { required: true });
    const authToken = getInput('sanity_auth_token', { required: true });
    const s3Bucket = getInput('s3_bucket', { required: true });
    const datasetName = getInput('dataset_name', { required: true });
    const retentionDays = parseInt(getInput('retention_days') || '0', 10);

    const today = new Date().toISOString().split('T')[0];
    const datasetFileName = `backups/${datasetName}-${today}.tar.gz`;

    await checkSanityDatasetExistence(projectId, authToken, datasetName);

    await exec(
      `npx sanity dataset export ${datasetName} ${datasetFileName}`,
      [],
      {
        env: {
          SANITY_PROJECT_ID: projectId,
          SANITY_AUTH_TOKEN: authToken,
          ...process.env,
        },
      },
    );
    if (!existsSync(datasetFileName)) {
      throw new Error(`Error exporting dataset "${datasetName}".`);
    }

    checkAwsCredentials();

    const s3Key = `${datasetName}/${basename(datasetFileName)}`;
    await exec(`aws s3 cp ${datasetFileName} s3://${s3Bucket}/${s3Key}`);

    info('Backup uploaded successfully to S3.');

    await removeOldBackups(s3Bucket, datasetName, retentionDays);
  } catch (error) {
    setFailed(`Action failed with error: ${error}`);
  }
}

run();
