import { getInput, info, setFailed } from '@actions/core';
import { exec } from '@actions/exec';
import { existsSync } from 'fs';
import { basename } from 'path';

async function checkSanityDatasetExistence(
  projectId: string,
  authToken: string,
  datasetName: string,
  verbose: boolean,
) {
  let datasetListOutput = '';

  if (verbose) {
    info(
      `Checking if the dataset "${datasetName}" exists in the Sanity project...`,
    );
  }

  await exec('npx sanity dataset list', [], {
    env: {
      SANITY_PROJECT_ID: projectId,
      SANITY_AUTH_TOKEN: authToken,
      ...process.env,
    },
    silent: !verbose,
    listeners: {
      stdout: (data: Buffer) => {
        datasetListOutput += data.toString();
      },
    },
  });

  const datasets = datasetListOutput.split('\n').map((line) => line.trim());

  if (verbose) {
    info(`Found ${datasets.length} datasets in the Sanity project.`);
  }

  if (!datasets.includes(datasetName)) {
    throw new Error(
      `Dataset "${datasetName}" does not exist in the Sanity project.`,
    );
  }

  if (verbose) {
    info(`Dataset "${datasetName}" exists.`);
  }
}

function checkAwsCredentials(verbose: boolean): void {
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (verbose) {
    info('Checking AWS credentials...');
  }

  if (!awsAccessKeyId || !awsSecretAccessKey) {
    throw new Error(
      'AWS credentials are not set. Ensure that AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in the environment using aws-actions/configure-aws-credentials.',
    );
  }

  if (verbose) {
    info('AWS credentials are set.');
  }
}

async function removeOldBackups(
  s3Bucket: string,
  datasetName: string,
  retentionDays: number,
  verbose: boolean,
) {
  if (!retentionDays || retentionDays <= 0) {
    info('No retention policy provided. Skipping old backup removal.');

    return;
  }

  const retentionTimestamp =
    new Date().getTime() - retentionDays * 24 * 60 * 60 * 1000;

  info('Checking for old backups...');

  let awsListOutput = '';
  await exec(`aws s3 ls s3://${s3Bucket}/${datasetName}/`, [], {
    listeners: {
      stdout: (data: Buffer) => {
        awsListOutput += data.toString();
      },
    },
    silent: !verbose,
  });

  const backupFiles = awsListOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  info(
    `Found ${backupFiles.length} backup files. Checking against retention policy...`,
  );

  let deletedCount = 0;
  for (const file of backupFiles) {
    const match = file.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const fileDate = new Date(match[0]).getTime();
      const fileName = file.split(' ').pop();

      if (verbose) {
        info(`Processing file: ${fileName}, Date: ${match[0]}`);
      }

      if (fileDate < retentionTimestamp) {
        info(`Removing old backup: ${fileName}`);

        await exec(
          `aws s3 rm s3://${s3Bucket}/${datasetName}/${fileName}`,
          [],
          { silent: !verbose },
        );

        deletedCount += 1;
      } else {
        info(`Skipping file: ${fileName}, as it is within retention period.`);
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
    const verbose = getInput('verbose') === 'true';

    info('Starting Sanity dataset backup process...');

    await checkSanityDatasetExistence(
      projectId,
      authToken,
      datasetName,
      verbose,
    );

    info('Exporting dataset...');

    const now = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
    const datasetFileName = `backups/${datasetName}-${now}.tar.gz`;

    await exec(
      `npx sanity dataset export ${datasetName} ${datasetFileName}`,
      [],
      {
        env: {
          SANITY_PROJECT_ID: projectId,
          SANITY_AUTH_TOKEN: authToken,
          ...process.env,
        },
        silent: !verbose,
      },
    );
    if (!existsSync(datasetFileName)) {
      throw new Error(`Error exporting dataset "${datasetName}".`);
    }

    checkAwsCredentials(verbose);

    const s3Key = `${datasetName}/${basename(datasetFileName)}`;

    if (verbose) {
      info('Uploading backup to S3 bucket...');
    }

    await exec(`aws s3 cp ${datasetFileName} s3://${s3Bucket}/${s3Key}`, [], {
      silent: !verbose,
    });

    info('Backup uploaded successfully to S3.');

    await removeOldBackups(s3Bucket, datasetName, retentionDays, verbose);
  } catch (error) {
    setFailed(`Action failed with error: ${error}`);
  }
}

run();
