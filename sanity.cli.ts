import { defineCliConfig } from 'sanity/cli';

const projectId = process.env.SANITY_PROJECT_ID;

export default defineCliConfig({ api: { projectId } });
