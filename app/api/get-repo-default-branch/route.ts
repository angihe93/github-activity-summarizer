import { NextRequest, NextResponse } from 'next/server';
import Exa from "exa-js";
import { ZDefaultBranchResponse } from '@/app/types/types';

const exa = new Exa(process.env.EXA_API_KEY);

const summaryOutputSchema = {
  description: "Schema describing repository information with default branch name",
  type: "object",
  properties: {
    repositoryName: {
      type: "string",
      description: "Name of the repository"
    },
    defaultBranch: {
      type: "string",
      description: "Name of the default branch in the repository"
    },
    owner: {
      type: "string",
      description: "Owner or organization of the repository"
    },
  },
  required: ["repositoryName", "defaultBranch", "owner"],
  additionalProperties: false
};

export async function POST(req: NextRequest) {
  try {
    // example url format: https://github.com/exa-labs/exa-py
    const { repoUrl } = await req.json();
    if (!repoUrl) {
      return NextResponse.json({ error: 'Github repo URL is required' }, { status: 400 });
    }
    const result = await exa.getContents([repoUrl], {
      type: "auto",
      livecrawl: "always",
      livecrawlTimeout: 10000,
      summary: {
        query: `get the default branch name of this repo`,
        schema: summaryOutputSchema
      },
    });
    const resultJson = JSON.parse(result.results?.[0]?.summary || '{}');
    const validation = ZDefaultBranchResponse.safeParse(resultJson);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid response format", details: validation.error }, { status: 500 });
    }
    return NextResponse.json({ result: resultJson });
  } catch (error) {
    return NextResponse.json({ error: `Failed to perform getContents for api/get-repo-default-branch | ${error}` }, { status: 500 });
  }
}