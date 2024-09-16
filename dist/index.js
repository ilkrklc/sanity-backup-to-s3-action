"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
const exec_1 = require("@actions/exec");
const fs_1 = require("fs");
const path_1 = require("path");
async function checkSanityDatasetExistence(projectId, authToken, datasetName) {
    let datasetListOutput = '';
    const options = {
        listeners: {
            stdout: (data) => {
                datasetListOutput += data.toString();
            },
        },
    };
    await (0, exec_1.exec)('npx sanity dataset list', [], {
        env: {
            SANITY_PROJECT_ID: projectId,
            SANITY_AUTH_TOKEN: authToken,
        },
        ...options,
    });
    const datasets = datasetListOutput.split('\n').map((line) => line.trim());
    if (!datasets.includes(datasetName)) {
        throw new Error(`Dataset "${datasetName}" does not exist in the Sanity project.`);
    }
}
function checkAwsCredentials() {
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!awsAccessKeyId || !awsSecretAccessKey) {
        throw new Error('AWS credentials are not set. Ensure that AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in the environment using aws-actions/configure-aws-credentials.');
    }
}
async function run() {
    try {
        const projectId = (0, core_1.getInput)('sanity_project_id', { required: true });
        const authToken = (0, core_1.getInput)('sanity_auth_token', { required: true });
        const s3Bucket = (0, core_1.getInput)('s3_bucket', { required: true });
        const datasetName = (0, core_1.getInput)('dataset_name', { required: true });
        const today = new Date().toISOString().split('T')[0];
        const datasetFileName = `backups/${datasetName}-${today}.tar.gz`;
        await checkSanityDatasetExistence(projectId, authToken, datasetName);
        await (0, exec_1.exec)(`npx sanity dataset export ${datasetName} ${datasetFileName}`, [], {
            env: {
                SANITY_PROJECT_ID: projectId,
                SANITY_AUTH_TOKEN: authToken,
            },
        });
        if (!(0, fs_1.existsSync)(datasetFileName)) {
            throw new Error(`Error exporting dataset "${datasetName}".`);
        }
        checkAwsCredentials();
        const s3Key = `${datasetName}/${(0, path_1.basename)(datasetFileName)}`;
        await (0, exec_1.exec)(`aws s3 cp ${datasetFileName} s3://${s3Bucket}/${s3Key}`);
        (0, core_1.info)('Backup uploaded successfully to S3.');
    }
    catch (error) {
        (0, core_1.setFailed)(`Action failed with error: ${error}`);
    }
}
run();
